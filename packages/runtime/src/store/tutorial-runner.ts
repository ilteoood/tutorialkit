import type { CommandsSchema, Files } from '@tutorialkit/types';
import type { Nodepod, NodepodProcess } from '@r1ck404/nodepod';
import picomatch from 'picomatch/posix.js';
import { newTask, type Task, type TaskCancelled } from '../tasks.js';
import { clearTerminal, type ITerminal } from '../utils/terminal.js';
import { MultiCounter } from '../utils/multi-counter.js';
import { Command, Commands } from '../webcontainer/command.js';
import { StepsController } from '../webcontainer/steps.js';
import { fromRuntimePath, toRuntimePath, writeFiles, remove } from '../webcontainer/utils/files.js';
import type { EditorStore } from './editor.js';
import type { RuntimeProcess, TerminalStore } from './terminal.js';

interface LoadFilesOptions {
  /**
   * The list of files to load.
   */
  files: Files | Promise<Files>;

  /**
   * The template to load.
   */
  template?: Files | Promise<Files>;

  /**
   * If true, all files will be removed (except for `node_modules`).
   *
   * @default false
   */
  removeAllFiles?: boolean;

  /**
   * Abort the previous load files operation.
   *
   * @default true
   */
  abortPreviousLoad?: boolean;

  /**
   * A signal to abort this operation.
   */
  signal?: AbortSignal;
}

interface RunCommandsOptions {
  /**
   * Abort the previous run commands operation.
   *
   * @default true
   */
  abortPreviousRun?: boolean;
}

/**
 * Manages the state of the Nodepod runtime and exposes an interface that
 * makes sense to every component of TutorialKit.
 *
 * There should be only a single instance of this class.
 */
export class TutorialRunner {
  private _currentLoadTask: Task<void | TaskCancelled> | undefined = undefined;
  private _currentProcessTask: Task<void | TaskCancelled> | undefined = undefined;
  private _currentCommandProcess: NodepodProcess | undefined = undefined;
  private _currentTemplate: Files | undefined = undefined;
  private _currentFiles: Files | undefined = undefined;
  private _currentRunCommands: Commands | undefined = undefined;

  private _ignoreFileEvents = new MultiCounter();
  private _watcher: { close(): void } | undefined;
  private _watchContentFromWebContainer: string[] | boolean = false;
  private _readyToWatch = false;

  private _packageJsonDirty = false;
  private _commandsChanged = false;

  // this strongly assumes that there's a single package json which might not be true
  private _packageJsonContent = '';
  private _packageJsonPath = '';

  constructor(
    private _nodepod: Promise<Nodepod>,
    private _terminalStore: TerminalStore,
    private _editorStore: EditorStore,
    private _stepController: StepsController,
  ) {}

  setWatchFromWebContainer(value: boolean | string[]) {
    this._watchContentFromWebContainer = value;

    if (this._readyToWatch && this._watchContentFromWebContainer) {
      this._nodepod.then((nodepod) => this._setupWatcher(nodepod));
    } else if (!this._watchContentFromWebContainer) {
      this._stopWatcher();
    }
  }

  /**
   * Set the commands to run. This updates the reported `steps` if any have changed.
   *
   * This function is safe to call server side.
   *
   * To actually run them in Nodepod see `runCommands`.
   *
   * @param commands The commands schema.
   */
  setCommands(commands: CommandsSchema) {
    const newCommands = new Commands(commands);
    const anyChange = this._changeDetection(commands);

    if (anyChange) {
      this._stepController.setFromCommands([...newCommands]);
      this._currentRunCommands = newCommands;
      this._commandsChanged = true;
    }
  }

  onTerminalResize(cols: number, rows: number) {
    if (cols && rows && this._currentCommandProcess) {
      // NodepodProcess has no resize; the shell terminal handles its own
      // dimensions. We keep the call for back-compat with `onTerminalResize`.
    }
  }

  createFolder(folderPath: string): void {
    const previousLoadPromise = this._currentLoadTask?.promise;

    this._currentLoadTask = newTask(
      async (signal) => {
        await previousLoadPromise;

        const nodepod = await this._nodepod;

        signal.throwIfAborted();

        this._ignoreFileEvents.increment(folderPath);

        await nodepod.fs.mkdir(toRuntimePath(folderPath), { recursive: true });
      },
      { ignoreCancel: true },
    );
  }

  /**
   * Update the content of a single file in Nodepod.
   *
   * @param filePath path of the file
   * @param content new content of the file
   */
  updateFile(filePath: string, content: string): void {
    const previousLoadPromise = this._currentLoadTask?.promise;

    this._currentLoadTask = newTask(
      async (signal) => {
        await previousLoadPromise;

        const nodepod = await this._nodepod;

        signal.throwIfAborted();

        this._ignoreFileEvents.increment(filePath);

        await nodepod.fs.writeFile(toRuntimePath(filePath), content);

        this._updateCurrentFiles({ [filePath]: content });
      },
      { ignoreCancel: true },
    );
  }

  /**
   * Update the provided files in Nodepod.
   *
   * @param files Files to update.
   */
  updateFiles(files: Files): void {
    const previousLoadPromise = this._currentLoadTask?.promise;

    this._currentLoadTask = newTask(
      async (signal) => {
        await previousLoadPromise;

        const nodepod = await this._nodepod;

        signal.throwIfAborted();

        this._ignoreFileEvents.increment(Object.keys(files));

        await writeFiles(nodepod.fs, files);

        this._updateCurrentFiles(files);
      },
      { ignoreCancel: true },
    );
  }

  async fileExists(filepath: string) {
    return this._fsExists(filepath, 'file');
  }

  async folderExists(folderPath: string) {
    return this._fsExists(folderPath, 'folder');
  }

  private async _fsExists(filepath: string, type: 'file' | 'folder') {
    if (this._currentFiles?.[filepath] || this._currentTemplate?.[filepath]) {
      return true;
    }

    const previousLoadPromise = this._currentLoadTask?.promise;

    return new Promise<boolean>((resolve) => {
      this._currentLoadTask = newTask(
        async () => {
          await previousLoadPromise;

          const nodepod = await this._nodepod;

          try {
            if (type === 'file') {
              await nodepod.fs.readFile(toRuntimePath(filepath));
            } else {
              await nodepod.fs.readdir(toRuntimePath(filepath));
            }

            resolve(true);
          } catch {
            resolve(false);
          }
        },
        { ignoreCancel: true },
      );
    });
  }

  /**
   * Load the provided files into Nodepod and remove any other files that had been loaded previously.
   */
  prepareFiles({ files, template, signal, abortPreviousLoad = true }: LoadFilesOptions): Promise<void | TaskCancelled> {
    const previousLoadPromise = this._currentLoadTask?.promise;

    if (abortPreviousLoad) {
      this._currentLoadTask?.cancel();
    }

    this._currentLoadTask = newTask(
      async (signal) => {
        await previousLoadPromise;

        this._readyToWatch = false;

        this._stopWatcher();

        const nodepod = await this._nodepod;

        signal.throwIfAborted();

        [template, files] = await Promise.all([template, files]);

        signal.throwIfAborted();

        await writeFiles(nodepod.fs, { ...template, ...files });

        this._currentTemplate = { ...template };
        this._currentFiles = { ...files };

        this._updateDirtyState({ ...template, ...files });
      },
      { ignoreCancel: true, signal },
    );

    return this._currentLoadTask.promise;
  }

  /**
   * Runs the list of commands set with `setCommands`.
   */
  runCommands({ abortPreviousRun = true }: RunCommandsOptions = {}): void {
    const previousTask = this._currentProcessTask;
    const loadPromise = this._currentLoadTask?.promise;
    const newCommands = this._currentRunCommands;
    const commandsChanged = this._commandsChanged;

    if (!newCommands) {
      throw new Error('setCommands should be called before runCommands');
    }

    this._currentProcessTask = newTask(
      async (signal) => {
        await loadPromise;

        if (signal.aborted && abortPreviousRun) {
          previousTask?.cancel();
        }

        signal.throwIfAborted();

        const anyChange = this._packageJsonDirty || commandsChanged;

        if (!anyChange) {
          if (previousTask) {
            const abortListener = () => previousTask.cancel();
            signal.addEventListener('abort', abortListener, { once: true });

            return previousTask.promise;
          }

          return undefined;
        }

        this._commandsChanged = false;

        if (abortPreviousRun) {
          previousTask?.cancel();
        }

        await previousTask?.promise;

        const nodepod = await this._nodepod;

        signal.throwIfAborted();

        return this._runCommands(nodepod, newCommands, signal);
      },
      { ignoreCancel: true },
    );
  }

  /**
   * Restart the last run commands that were submitted.
   */
  restartLastRunCommands() {
    if (!this._currentRunCommands || !this._currentProcessTask) {
      return;
    }

    const previousRunCommands = this._currentRunCommands;
    const previousProcessPromise = this._currentProcessTask.promise;
    const loadPromise = this._currentLoadTask?.promise;

    this._currentProcessTask.cancel();

    this._currentProcessTask = newTask(
      async (signal) => {
        await Promise.all([previousProcessPromise, loadPromise]);

        const nodepod = await this._nodepod;

        signal.throwIfAborted();

        return this._runCommands(nodepod, previousRunCommands, signal);
      },
      { ignoreCancel: true },
    );
  }

  /**
   * Get snapshot of runner's current files.
   */
  takeSnapshot() {
    const files: Record<string, string> = {};

    for (const [filePath, value] of Object.entries(this._currentTemplate || {})) {
      if (typeof value === 'string') {
        files[filePath.slice(1)] = value;
      }
    }

    for (const [filePath, value] of Object.entries(this._currentFiles || {})) {
      if (typeof value === 'string') {
        files[filePath.slice(1)] = value;
      }
    }

    if (this._packageJsonContent) {
      let packageJson;

      try {
        packageJson = JSON.parse(this._packageJsonContent);
      } catch {
        // A malformed package.json means we have nothing to merge into.
      }

      if (packageJson && !packageJson.stackblitz?.startCommand) {
        const mainCommand = this._currentRunCommands?.mainCommand?.shellCommand;
        const prepareCommands = (this._currentRunCommands?.prepareCommands || []).map((c) => c.shellCommand);
        const startCommand = [...prepareCommands, mainCommand].filter(Boolean).join(' && ');

        files[this._packageJsonPath.slice(1)] = JSON.stringify(
          { ...packageJson, stackblitz: { startCommand } },
          null,
          2,
        );
      }
    }

    return { files };
  }

  private async _runCommands(nodepod: Nodepod, commands: Commands, signal: AbortSignal) {
    const output = this._terminalStore.getOutputPanel();

    clearTerminal(output);

    const abortListener = () => this._currentCommandProcess?.kill();
    signal.addEventListener('abort', abortListener, { once: true });

    let shouldClearDirtyFlag = true;

    try {
      const commandList = [...commands];

      this._stepController.setFromCommands(commandList);

      let runnableCommands = 0;

      for (const [index, command] of commandList.entries()) {
        const isMainCommand = index === commandList.length - 1 && !!commands.mainCommand;

        if (!command.isRunnable()) {
          this._stepController.updateStep(index, {
            title: command.title,
            status: 'skipped',
          });

          continue;
        }

        this._stepController.updateStep(index, {
          title: command.title,
          status: 'running',
        });

        if (runnableCommands > 0) {
          output?.write('\n');
        }

        runnableCommands++;

        this._currentCommandProcess = await this._newProcess(nodepod, command.shellCommand);

        try {
          signal.throwIfAborted();
        } catch (error) {
          this._stepController.skipRemaining(index);
          throw error;
        }

        if (isMainCommand) {
          shouldClearDirtyFlag = false;

          this._setupWatcher(nodepod);
          this._clearDirtyState();
        }

        const { exitCode } = await this._currentCommandProcess.completion;

        if (exitCode !== 0) {
          this._stepController.updateStep(index, {
            title: command.title,
            status: 'failed',
          });

          this._stepController.skipRemaining(index + 1);

          shouldClearDirtyFlag = false;

          break;
        } else {
          this._stepController.updateStep(index, {
            title: command.title,
            status: 'completed',
          });
        }

        try {
          signal.throwIfAborted();
        } catch (error) {
          this._stepController.skipRemaining(index + 1);
          throw error;
        }
      }

      if (shouldClearDirtyFlag) {
        this._clearDirtyState();
      }

      this._setupWatcher(nodepod);
    } finally {
      signal.removeEventListener('abort', abortListener);
    }
  }

  private async _newProcess(nodepod: Nodepod, shellCommand: string) {
    const [command, ...args] = shellCommand.split(' ');

    return nodepod.spawn(command, args, {
      cwd: '/home/tutorial',
    });
  }

  private _updateDirtyState(files: Files) {
    for (const filePath in files) {
      if (filePath.endsWith('/package.json') && files[filePath] != this._packageJsonContent) {
        this._packageJsonContent = files[filePath] as string;
        this._packageJsonPath = filePath;
        this._packageJsonDirty = true;

        return;
      }
    }
  }

  private _updateCurrentFiles(files: Files) {
    if (this._currentFiles) {
      for (const filePath in files) {
        this._currentFiles[filePath] = files[filePath];
      }
    } else {
      this._currentFiles = { ...files };
    }

    this._updateDirtyState(files);
  }

  private _stopWatcher(): void {
    if (this._watcher) {
      this._watcher.close();
      this._watcher = undefined;
    }
  }

  private _setupWatcher(nodepod: Nodepod) {
    this._readyToWatch = true;

    if (this._watcher || !this._watchContentFromWebContainer) {
      return;
    }

    const filesToRead = new Map<string, 'utf-8' | null>();

    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const readFiles = () => {
      const files = [...filesToRead.entries()];

      filesToRead.clear();

      Promise.all(
        files.map(async ([filePath, encoding]) => {
          const contents = await nodepod.fs.readFile(toRuntimePath(filePath), encoding as 'utf-8');
          return [filePath, contents] as const;
        }),
      ).then((fileContents) => {
        for (const [filePath, content] of fileContents) {
          this._editorStore.updateFile(filePath, content);
        }
      });
    };

    const scheduleReadFor = (filePath: string, encoding: 'utf-8' | null) => {
      filesToRead.set(filePath, encoding);

      clearTimeout(timeoutId);
      timeoutId = setTimeout(readFiles, 100);
    };

    this._watcher = nodepod.fs.watch('/home/tutorial', { recursive: true }, (eventType: string, filename: string | null) => {
      const editorPath = filename ? fromRuntimePath('/' + filename) : null;

      if (!editorPath) {
        return;
      }

      if (!this._ignoreFileEvents.decrement(editorPath)) {
        return;
      }

      if (
        Array.isArray(this._watchContentFromWebContainer) &&
        !this._watchContentFromWebContainer.some((pattern) => picomatch.isMatch(editorPath, pattern))
      ) {
        return;
      }

      if (eventType === 'change') {
        const file = this._editorStore.documents.get()[editorPath];

        if (!file) {
          return;
        }

        scheduleReadFor(editorPath, typeof file.value === 'string' ? 'utf-8' : null);
      } else if (eventType === 'rename' && Array.isArray(this._watchContentFromWebContainer)) {
        const file = this._editorStore.documents.get()[editorPath];

        if (file) {
          this._editorStore.deleteFile(editorPath);
        } else {
          const segments = editorPath.split('/');
          segments.forEach((_, index) => {
            if (index == segments.length - 1) {
              return;
            }

            const folderPath = segments.slice(0, index + 1).join('/');

            if (!this._editorStore.documents.get()[folderPath]) {
              this._editorStore.addFileOrFolder({ path: folderPath, type: 'folder' });
            }
          });

          if (!this._editorStore.documents.get()[editorPath]) {
            this._editorStore.addFileOrFolder({ path: editorPath, type: 'file' });
          }

          this._updateCurrentFiles({ [editorPath]: '' });
          scheduleReadFor(editorPath, 'utf-8');
        }
      }
    });
  }

  private _clearDirtyState() {
    this._packageJsonDirty = false;
  }

  private _changeDetection(newCommands: CommandsSchema) {
    if (this._packageJsonDirty) {
      return true;
    }

    if (!this._currentRunCommands) {
      return true;
    }

    const prevCommandList = commandsToList(this._currentRunCommands);
    const newCommandList = commandsToList(newCommands);

    if (prevCommandList.length !== newCommandList.length) {
      return true;
    }

    for (let i = 0; i < prevCommandList.length; ++i) {
      if (!Command.equals(prevCommandList[i], newCommandList[i])) {
        return true;
      }
    }

    return false;
  }
}

function commandsToList(commands: Commands | CommandsSchema) {
  if (commands instanceof Commands) {
    return [...commands].filter((command) => command.isRunnable());
  }

  return commandsToList(new Commands(commands));
}
// `commandsToList` is the only helper used outside the class above -- the
// earlier local `updateFiles` and `diffFiles` copies were dropped in
// favour of the versions exported from `webcontainer/utils/files.ts`.
export type { RuntimeProcess };
