import type { Nodepod, NodepodProcess } from '@r1ck404/nodepod';
import type { CommandsSchema, Files } from '@tutorialkit/types';
import picomatch from 'picomatch/posix.js';
import { newTask, type Task, type TaskCancelled } from '../tasks.js';
import { MultiCounter } from '../utils/multi-counter.js';
import { clearTerminal, escapeCodes, type ITerminal } from '../utils/terminal.js';
import { Command, Commands } from '../webcontainer/command.js';
import { StepsController } from '../webcontainer/steps.js';
import { diffFiles, writeFilesToPod } from '../webcontainer/utils/files.js';
import type { EditorStore } from './editor.js';
import type { TerminalStore } from './terminal.js';

interface LoadFilesOptions {
  files: Files | Promise<Files>;
  template?: Files | Promise<Files>;
  removeAllFiles?: boolean;
  abortPreviousLoad?: boolean;
  signal?: AbortSignal;
}

interface RunCommandsOptions {
  abortPreviousRun?: boolean;
}

export class TutorialRunner {
  private _currentLoadTask: Task<void | TaskCancelled> | undefined = undefined;
  private _currentProcessTask: Task<void | TaskCancelled> | undefined = undefined;
  private _currentCommandProcess: NodepodProcess | undefined = undefined;
  private _currentTemplate: Files | undefined = undefined;
  private _currentFiles: Files | undefined = undefined;
  private _currentRunCommands: Commands | undefined = undefined;

  private _ignoreFileEvents = new MultiCounter();
  private _watcher: { close(): void } | undefined;
  private _watchContentFromPod: string[] | boolean = false;
  private _readyToWatch = false;

  private _packageJsonDirty = false;
  private _commandsChanged = false;

  private _packageJsonContent = '';
  private _packageJsonPath = '';

  constructor(
    private _pod: Promise<Nodepod>,
    private _terminalStore: TerminalStore,
    private _editorStore: EditorStore,
    private _stepController: StepsController,
  ) {}

  setWatchFromPod(value: boolean | string[]) {
    this._watchContentFromPod = value;

    if (this._readyToWatch && this._watchContentFromPod) {
      this._pod.then((pod) => this._setupWatcher(pod));
    } else if (!this._watchContentFromPod) {
      this._stopWatcher();
    }
  }

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
    this._currentCommandProcess?.resize(cols, rows);
  }

  createFolder(folderPath: string): void {
    const previousLoadPromise = this._currentLoadTask?.promise;

    this._currentLoadTask = newTask(
      async (signal) => {
        await previousLoadPromise;

        const pod = await this._pod;

        signal.throwIfAborted();

        this._ignoreFileEvents.increment(folderPath);

        await pod.fs.mkdir(folderPath, { recursive: true });
      },
      { ignoreCancel: true },
    );
  }

  updateFile(filePath: string, content: string): void {
    const previousLoadPromise = this._currentLoadTask?.promise;

    this._currentLoadTask = newTask(
      async (signal) => {
        await previousLoadPromise;

        const pod = await this._pod;

        signal.throwIfAborted();

        this._ignoreFileEvents.increment(filePath);

        await pod.fs.writeFile(filePath, content);

        this._updateCurrentFiles({ [filePath]: content });
      },
      { ignoreCancel: true },
    );
  }

  updateFiles(files: Files): void {
    const previousLoadPromise = this._currentLoadTask?.promise;

    this._currentLoadTask = newTask(
      async (signal) => {
        await previousLoadPromise;

        const pod = await this._pod;

        signal.throwIfAborted();

        this._ignoreFileEvents.increment(Object.keys(files));

        await writeFilesToPod(pod, files);

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

          const pod = await this._pod;

          try {
            if (type === 'file') {
              await pod.fs.readFile(filepath);
            } else {
              await pod.fs.readdir(filepath);
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

        const pod = await this._pod;

        signal.throwIfAborted();

        [template, files] = await Promise.all([template, files]);

        signal.throwIfAborted();

        if (this._currentFiles || this._currentTemplate) {
          await updateFiles(pod, { ...this._currentTemplate, ...this._currentFiles }, { ...template, ...files });
        } else {
          await writeFilesToPod(pod, { ...template, ...files });
        }

        this._currentTemplate = { ...template };
        this._currentFiles = { ...files };

        this._updateDirtyState({ ...template, ...files });
      },
      { ignoreCancel: true, signal },
    );

    return this._currentLoadTask.promise;
  }

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

        const pod = await this._pod;

        signal.throwIfAborted();

        return this._runCommands(pod, newCommands, signal);
      },
      { ignoreCancel: true },
    );
  }

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

        const pod = await this._pod;

        signal.throwIfAborted();

        return this._runCommands(pod, previousRunCommands, signal);
      },
      { ignoreCancel: true },
    );
  }

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
        packageJson = undefined;
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

  private async _runCommands(pod: Nodepod, commands: Commands, signal: AbortSignal) {
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

        this._currentCommandProcess = await this._newProcess(pod, output, command.shellCommand);

        try {
          signal.throwIfAborted();
        } catch (error) {
          this._stepController.skipRemaining(index);
          throw error;
        }

        if (isMainCommand) {
          shouldClearDirtyFlag = false;

          this._setupWatcher(pod);
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

      this._setupWatcher(pod);
    } finally {
      signal.removeEventListener('abort', abortListener);
    }
  }

  private async _newProcess(pod: Nodepod, output: ITerminal | undefined, shellCommand: string) {
    const [command, ...args] = shellCommand.split(' ');

    output?.write(`${escapeCodes.magenta('❯')} ${escapeCodes.green(command)} ${args.join(' ')}\n`);

    const process = await pod.spawn(command, args, {
      cwd: pod.cwd,
    });

    process.on('output', (chunk: string) => output?.write(chunk));
    process.on('error', (chunk: string) => output?.write(chunk));

    return process;
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

  private _setupWatcher(pod: Nodepod) {
    this._readyToWatch = true;

    if (this._watcher || !this._watchContentFromPod) {
      return;
    }

    const filesToRead = new Map<string, 'utf-8' | null>();

    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const readFiles = () => {
      const files = [...filesToRead.entries()];

      filesToRead.clear();

      Promise.all(
        files.map(async ([filePath, encoding]) => {
          const content = (await pod.fs.readFile(filePath, encoding as 'utf-8')) as string;

          return [filePath, content] as const;
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

    this._watcher = pod.fs.watch('.', { recursive: true }, (eventType: string, filename: string | null) => {
      const filePath = `/${filename}`;

      if (!this._ignoreFileEvents.decrement(filePath)) {
        return;
      }

      if (
        Array.isArray(this._watchContentFromPod) &&
        !this._watchContentFromPod.some((pattern) => picomatch.isMatch(filePath, pattern))
      ) {
        return;
      }

      if (eventType === 'change') {
        const file = this._editorStore.documents.get()[filePath];

        if (!file) {
          return;
        }

        scheduleReadFor(filePath, typeof file.value === 'string' ? 'utf-8' : null);
      } else if (eventType === 'rename' && Array.isArray(this._watchContentFromPod)) {
        const file = this._editorStore.documents.get()[filePath];

        if (file) {
          this._editorStore.deleteFile(filePath);
        } else {
          const segments = filePath.split('/');
          segments.forEach((_, index) => {
            if (index == segments.length - 1) {
              return;
            }

            const folderPath = segments.slice(0, index + 1).join('/');

            if (!this._editorStore.documents.get()[folderPath]) {
              this._editorStore.addFileOrFolder({ path: folderPath, type: 'folder' });
            }
          });

          if (!this._editorStore.documents.get()[filePath]) {
            this._editorStore.addFileOrFolder({ path: filePath, type: 'file' });
          }

          this._updateCurrentFiles({ [filePath]: '' });
          scheduleReadFor(filePath, 'utf-8');
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

async function updateFiles(pod: Nodepod, previousFiles: Files, newFiles: Files) {
  const { removed, addedOrModified } = diffFiles(previousFiles, newFiles);

  for (const filePath of removed) {
    await pod.fs.rm(filePath, { force: true });
  }

  await writeFilesToPod(pod, addedOrModified);
}
