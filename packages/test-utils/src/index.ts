import type { SpawnOptions } from '@r1ck404/nodepod';
import { vi } from 'vitest';

type Listener = (...args: never[]) => void;

interface FakeFs {
  readdir: ReturnType<typeof vi.fn>;
  readFile: ReturnType<typeof vi.fn>;
  writeFile: ReturnType<typeof vi.fn>;
  mkdir: ReturnType<typeof vi.fn>;
  rm: ReturnType<typeof vi.fn>;
  rename: ReturnType<typeof vi.fn>;
  watch: ReturnType<typeof vi.fn>;
}

interface FakeProcess {
  pid: number;

  command: string;
  args: string[];
  options?: SpawnOptions;

  completion: Promise<{ exitCode: number }>;
  on(event: 'output' | 'error', handler: (chunk: string) => void): FakeProcess;
  on(event: 'exit', handler: (code: number) => void): FakeProcess;
  on(event: string, handler: Listener): FakeProcess;
  kill(): void;
  resize(cols: number, rows: number): void;
}

export interface MockedPod {
  _fakeFiles: Map<string, string>;
  _fakeDirs: Set<string>;
  _fakeProcesses: FakeProcess[];
  fs: FakeFs;
  proxy: { on(event: string, listener: Listener): void };
  createTerminal: ReturnType<typeof vi.fn>;
  teardown: ReturnType<typeof vi.fn>;
  cwd: string;
  spawn: ReturnType<typeof vi.fn>;
}

export type FakeProcessFactory = (
  command: string,
  args: string[],
  options?: SpawnOptions,
) => { completion: Promise<{ exitCode: number }> };

const defaultProcessFactory: FakeProcessFactory = () => {
  return {
    completion: Promise.resolve({ exitCode: 0 }),
  };
};

let fakeProcessFactory = defaultProcessFactory;

export function setProcessFactory(factory: FakeProcessFactory) {
  fakeProcessFactory = factory;
}

export function resetProcessFactory() {
  fakeProcessFactory = defaultProcessFactory;
}

vi.mock('@r1ck404/nodepod', () => {
  function buildProcess(command: string, args: string[], options?: SpawnOptions): FakeProcess {
    const handlers: Record<string, Listener[]> = {};
    const baseProcess: FakeProcess = {
      pid: 0,
      command,
      args,
      options,
      completion: Promise.resolve({ exitCode: 0 }),
      on(event: string, handler: Listener) {
        (handlers[event] ||= []).push(handler);
        return baseProcess;
      },
      kill() {
        handlers.output = [];
        handlers.error = [];
      },
      resize() {
        // noop
      },
    };

    Object.defineProperties(baseProcess, {
      pid: { enumerable: false, configurable: true },
      completion: { enumerable: false, configurable: true },
      on: { enumerable: false, configurable: true },
      kill: { enumerable: false, configurable: true },
      resize: { enumerable: false, configurable: true },
    });

    const external = fakeProcessFactory(command, args, options);

    if (external.completion) {
      baseProcess.completion = external.completion;
    }

    return baseProcess;
  }

  class FakePod implements MockedPod {
    _fakeFiles = new Map<string, string>();
    _fakeDirs = new Set<string>(['/']);
    _fakeProcesses: FakeProcess[] = [];
    fs: FakeFs;
    proxy = {
      on(_event: string, _listener: Listener) {
        /* noop */
      },
    };
    createTerminal = vi.fn();
    teardown = vi.fn(async () => undefined);
    cwd = '/home/project';

    constructor() {
      this.fs = {
        readdir: vi.fn(async (filePath: string) => {
          const target = filePath === '/' ? '/' : `${filePath}/`;
          const entries = new Set<string>();

          for (const file of this._fakeFiles.keys()) {
            if (file.startsWith(target)) {
              const rest = file.slice(target.length);
              const slash = rest.indexOf('/');

              if (slash === -1) {
                entries.add(rest);
              } else {
                entries.add(rest.slice(0, slash));
              }
            }
          }

          for (const dir of this._fakeDirs) {
            if (dir === filePath) {
              continue;
            }

            if (!dir.startsWith(target)) {
              continue;
            }

            const rest = dir.slice(target.length);
            const slash = rest.indexOf('/');

            if (slash === -1) {
              entries.add(rest);
            } else {
              entries.add(rest.slice(0, slash));
            }
          }

          return [...entries].filter(Boolean).sort();
        }),
        readFile: vi.fn(async (filePath: string, encoding?: 'utf-8' | 'utf8') => {
          const contents = this._fakeFiles.get(filePath);

          if (contents === undefined) {
            throw new Error(`ENOENT: no such file or directory, open '${filePath}'`);
          }

          return encoding === 'utf-8' || encoding === 'utf8' ? contents : '';
        }),
        writeFile: vi.fn(async (filePath: string, contents: string) => {
          const segments = filePath.split('/').filter(Boolean);
          let parent = '';

          for (let i = 0; i < segments.length - 1; i++) {
            parent += `/${segments[i]}`;
            this._fakeDirs.add(parent);
          }

          this._fakeFiles.set(filePath, contents);
        }),
        mkdir: vi.fn(async (filePath: string, opts?: { recursive?: boolean }) => {
          if (opts?.recursive) {
            const segments = filePath.split('/').filter(Boolean);
            let parent = '';

            for (const segment of segments) {
              parent += `/${segment}`;
              this._fakeDirs.add(parent);
            }
          } else {
            this._fakeDirs.add(filePath);
          }
        }),
        rm: vi.fn(async (filePath: string, opts?: { recursive?: boolean; force?: boolean }) => {
          if (this._fakeFiles.has(filePath)) {
            this._fakeFiles.delete(filePath);
            return;
          }

          if (!this._fakeDirs.has(filePath)) {
            if (opts?.force) {
              return;
            }

            throw new Error(`ENOENT: no such file or directory, rm '${filePath}'`);
          }

          if (!opts?.recursive) {
            this._fakeDirs.delete(filePath);
            return;
          }

          const prefix = filePath === '/' ? '/' : `${filePath}/`;

          for (const dir of [...this._fakeDirs]) {
            if (dir === filePath || dir.startsWith(prefix)) {
              this._fakeDirs.delete(dir);
            }
          }

          for (const file of [...this._fakeFiles.keys()]) {
            if (file === filePath || file.startsWith(prefix)) {
              this._fakeFiles.delete(file);
            }
          }
        }),
        rename: vi.fn(async (from: string, to: string) => {
          if (this._fakeFiles.has(from)) {
            this._fakeFiles.set(to, this._fakeFiles.get(from)!);
            this._fakeFiles.delete(from);

            return;
          }

          if (this._fakeDirs.has(from)) {
            const prefix = from === '/' ? '/' : `${from}/`;

            for (const file of [...this._fakeFiles.keys()]) {
              if (file === from || file.startsWith(prefix)) {
                this._fakeFiles.set(to + file.slice(from.length), this._fakeFiles.get(file)!);
                this._fakeFiles.delete(file);
              }
            }

            for (const dir of [...this._fakeDirs]) {
              if (dir === from || dir.startsWith(prefix)) {
                this._fakeDirs.add(to + dir.slice(from.length));
                this._fakeDirs.delete(dir);
              }
            }
          }
        }),
        watch: vi.fn(() => ({
          close: vi.fn(),
        })),
      };
    }

    spawn = vi.fn(async (command: string, args: string[], options?: SpawnOptions) => {
      const fake: FakeProcess = Object.assign(buildProcess(command, args, options), {
        pid: this._fakeProcesses.length,
      });

      this._fakeProcesses.push(fake);

      return fake;
    });
  }

  /**
   * SAFETY: vi.fn returns a Mocked callable; we add the static `.boot` to it
   * because the real `Nodepod` is a class with both a constructor and `.boot`.
   * The viewer sees a `MockedPod` either way.
   */
  /* eslint-disable-next-line @typescript-eslint/naming-convention -- `Nodepod` matches the upstream named export; lint naming rule is bypassed because the mock surface must use that exact identifier. */
  const Nodepod = Object.assign(
    vi.fn(() => new FakePod()),
    {
      boot: vi.fn(async () => new FakePod()),
    },
  );

  return { Nodepod };
});
