import type { Files } from '@tutorialkit/types';
import { atom, type ReadableAtom } from 'nanostores';
import { OpenVessel, type NetworkPolicy, type Process, type SpawnOptions } from 'openvessel';
import { withResolvers } from '../utils/promises.js';
import { watchTree } from './watch.js';

/**
 * The directory the lesson's files are mounted in and every command runs from.
 */
export const lessonRoot = '/home/user/app';

export type BootStatus = 'unknown' | 'blocked' | 'booting' | 'booted';

export interface LessonRuntimeOptions {
  /**
   * Base URL the runtime files are served from.
   */
  runtimeUrl: string;

  /**
   * Base URL the preview files are served from. Defaults to the runtime's own origin.
   */
  previewUrl?: string;

  /**
   * Which hosts processes and previews may reach.
   */
  network?: Partial<NetworkPolicy>;
}

const DEFAULT_NETWORK: NetworkPolicy = {
  mode: 'allowlist',
  presets: ['npm', 'fonts', 'icons', 'cdn'],
  allow: [],
  deny: [],
};

export interface ServerEvent {
  port: number;
  type: 'open' | 'closed';
}

/**
 * The lesson runtime: the sandbox a lesson's files and commands run in.
 *
 * Every member awaits the boot on its own, so callers never handle the boot directly.
 * On iOS the boot starts `'blocked'` until `unblockBoot()` is called.
 */
export class LessonRuntime {
  private readonly _bootStatus = atom<BootStatus>('unknown');
  private readonly _blocking = withResolvers<void>();
  private _vessel: Promise<OpenVessel> | undefined;

  constructor(private readonly _options: LessonRuntimeOptions) {}

  /** Status of the runtime's booting. */
  get bootStatus(): ReadableAtom<BootStatus> {
    return this._bootStatus;
  }

  /** Resolves once the runtime is booted. */
  get ready(): Promise<void> {
    return this._getVessel().then(() => undefined);
  }

  /** Unlocks the boot process if it was in `'blocked'` state. */
  unblockBoot() {
    if (this._bootStatus.get() === 'blocked') {
      this._blocking.resolve();
    }
  }

  /** Writes many files at once into the lesson root. */
  async mount(files: Files) {
    const vessel = await this._getVessel();

    await vessel.mount(relativeFiles(files), { path: lessonRoot });
  }

  async readFile(path: string, encoding?: 'utf8') {
    return (await this._getVessel()).fs.readFile(resolveLessonPath(path), encoding);
  }

  async writeFile(path: string, data: string | Uint8Array) {
    await (await this._getVessel()).fs.writeFile(resolveLessonPath(path), data);
  }

  async mkdir(path: string, options?: { recursive?: boolean }) {
    await (await this._getVessel()).fs.mkdir(resolveLessonPath(path), options);
  }

  async readdir(path: string, options?: { withFileTypes?: boolean }) {
    return (await this._getVessel()).fs.readdir(resolveLessonPath(path), options);
  }

  async rm(path: string, options?: { recursive?: boolean; force?: boolean }) {
    await (await this._getVessel()).fs.rm(resolveLessonPath(path), options);
  }

  async exists(path: string) {
    return (await this._getVessel()).fs.exists(resolveLessonPath(path));
  }

  /** Every file in the lesson root, keyed by its path relative to the root. */
  async export(options: { exclude?: string[] } = {}) {
    return (await this._getVessel()).export(lessonRoot, options);
  }

  /** Runs a command line through the shell, from the lesson root. */
  async exec(commandLine: string) {
    return (await this._getVessel()).exec(commandLine, { cwd: lessonRoot });
  }

  /** Starts a process from the lesson root. */
  async spawn(command: string, args: string[] = [], options?: SpawnOptions): Promise<Process> {
    return (await this._getVessel()).spawn(command, args, { cwd: lessonRoot, ...options });
  }

  /**
   * Watches every directory in the lesson root.
   *
   * @param listener called with paths relative to the lesson root, with a leading slash.
   */
  async watch(listener: (eventType: 'change' | 'rename', filePath: string) => void) {
    const vessel = await this._getVessel();

    return watchTree(vessel, lessonRoot, listener);
  }

  /** Listens to the servers that open and close. */
  onServer(listener: (event: ServerEvent) => void): () => void {
    let unwatch: (() => void) | undefined;
    let stopped = false;

    this._getVessel()
      .then(async (vessel) => {
        if (stopped) {
          return;
        }

        unwatch = combine(
          vessel.on('server-ready', (event: { port: number }) => listener({ port: event.port, type: 'open' })),
          vessel.on('port-closed', (event: { port: number }) => listener({ port: event.port, type: 'closed' })),
        );

        // servers that were already up when we started listening
        for (const { port } of await vessel.ports()) {
          listener({ port, type: 'open' });
        }
      })
      .catch(() => {
        // the boot failure is reported where the boot is awaited
      });

    return () => {
      stopped = true;
      unwatch?.();
    };
  }

  /** Resolves with the URL that shows a port, from the preview origin. */
  async previewUrl(port: number, path?: string) {
    return (await this._getVessel()).previewUrl(port, path);
  }

  private _getVessel(): Promise<OpenVessel> {
    this._vessel ??= this._boot();

    return this._vessel;
  }

  private async _boot(): Promise<OpenVessel> {
    if (isRestricted()) {
      this._bootStatus.set('blocked');

      await this._blocking.promise;
    }

    this._bootStatus.set('booting');

    const vessel = await OpenVessel.boot({
      runtimeUrl: this._options.runtimeUrl,
      previewUrl: this._options.previewUrl,
      network: { ...DEFAULT_NETWORK, ...this._options.network },
    });

    this._bootStatus.set('booted');

    return vessel;
  }
}

function resolveLessonPath(path: string) {
  const relative = path.startsWith('/') ? path.slice(1) : path;

  return relative ? `${lessonRoot}/${relative}` : lessonRoot;
}

function relativeFiles(files: Files) {
  const relative: Record<string, string | Uint8Array> = {};

  for (const [path, content] of Object.entries(files)) {
    relative[path.startsWith('/') ? path.slice(1) : path] = content;
  }

  return relative;
}

function combine(...unsubscribes: (() => void)[]) {
  return () => {
    for (const unsubscribe of unsubscribes) {
      unsubscribe();
    }
  };
}

/**
 * Booting on iOS can get the tab killed, so there the visitor decides when to start it.
 */
function isRestricted() {
  const { userAgent, maxTouchPoints, platform } = navigator;

  const iOS = /iPhone/.test(userAgent) || platform === 'iPhone';
  const iPadOS = (platform === 'MacIntel' && maxTouchPoints > 1) || platform === 'iPad';

  return iOS || iPadOS;
}
