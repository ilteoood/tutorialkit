import path from 'node:path';
import { vi, type Mocked } from 'vitest';
import type { Nodepod, NodepodProcess, SpawnOptions } from '@r1ck404/nodepod';

export interface FakeProcess {
  pid: number;

  command: string;
  args: string[];

  exit: Promise<number>;
  output: ReadableStream<string>;
  input: WritableStream<string>;
  kill(): void;
  resize(cols: number, rows: number): void;
  completion: Promise<{ stdout: string; stderr: string; exitCode: number }>;
}

type Directory = Record<string, FakeNode>;

export type MockedNodepod = Mocked<Pick<Nodepod, 'fs' | 'spawn' | 'port' | 'teardown' | 'request'>> & {
  _fakeFs: Directory;
  _fakeProcesses: FakeProcess[];
};

type FakeNode =
  | { file: { contents: string } }
  | { directory: Directory };

export type FakeProcessFactory = (
  command: string,
  args: string[],
  options?: SpawnOptions,
) => { exit: Promise<number>; output?: ReadableStream<string>; input?: WritableStream<string> };

const defaultProcessFactory: FakeProcessFactory = () => {
  return {
    exit: Promise.resolve(0),
  };
};

let fakeProcessFactory = defaultProcessFactory;

export function setProcessFactory(factory: FakeProcessFactory) {
  fakeProcessFactory = factory;
}

export function resetProcessFactory() {
  fakeProcessFactory = defaultProcessFactory;
}

/**
 * Returns a vitest mock factory that replaces `@r1ck404/nodepod` with an
 * in-memory fake filesystem and process recorder. Use it from a spec file:
 *
 * ```ts
 * vi.mock('@r1ck404/nodepod', () => mockNodepod());
 * ```
 *
 * Returning the factory (rather than calling `vi.mock` here) lets the spec
 * file own the mock, which Vitest's transformer requires to hoist properly.
 */
export function mockNodepod() {
  // SAFETY: vitest's `vi.fn()` types don't include a `new`-callable shape, but
  // the test helpers below construct one. The double `unknown` widens the type
  // enough for `new (Nodepod as unknown as new () => MockedNodepod)()`.
  const Nodepod = vi.fn(function (this: MockedNodepod) {
    this.fs = {
      readdir: vi.fn(async () => []),
      readFile: vi.fn(async (filePath: string) => {
        const fileNode = getFileNode(this._fakeFs, filePath);

        if (!fileNode) {
          throw new Error(`No file found at ${filePath}`);
        }

        if ('file' in fileNode) {
          return fileNode.file.contents as never;
        }

        throw new Error(`Not a file: ${filePath}`);
      }),
      writeFile: vi.fn(async (filePath: string, contents: string) => {
        ensureDir(this._fakeFs, path.dirname(filePath));
        storeFile(this._fakeFs, filePath, contents);
      }),
      mkdir: vi.fn(async (filePath: string, opts?: { recursive?: boolean }) => {
        if (opts?.recursive) {
          const segments = filePath.split('/').filter(Boolean);
          let current: Directory = this._fakeFs;

          for (const segment of segments) {
            const existing: FakeNode | undefined = current[segment];

            if (!existing || !('directory' in existing)) {
              current[segment] = { directory: {} };
            }

            current = (current[segment] as { directory: Directory }).directory;
          }
          return;
        }

        const parentFolder = path.dirname(filePath);
        const folderNode = getDirNode(this._fakeFs, parentFolder);

        if (!folderNode) {
          throw new Error(`No folder found at ${parentFolder}`);
        }

        folderNode.directory[path.basename(filePath)] = { directory: {} };
      }),
      rm: vi.fn(async (filePath: string, { recursive }: { recursive?: boolean } = {}) => {
        const parentFolder = path.dirname(filePath);
        const folderNode = getDirNode(this._fakeFs, parentFolder);

        if (!folderNode) {
          throw new Error(`No folder found at ${parentFolder}`);
        }

        const fileName = path.basename(filePath);
        const existing: FakeNode | undefined = folderNode.directory[fileName];

        if (!recursive && existing && 'directory' in existing) {
          throw new Error(`Cannot recursively delete folder ${filePath}`);
        }

        delete folderNode.directory[fileName];
      }),
      rename: vi.fn(async () => {
        // noop
      }),
      watch: vi.fn(() => ({
        close: vi.fn(),
      })),
    };

    this._fakeFs = {};
    this._fakeProcesses = [];

    this.port = vi.fn(() => null);
    this.request = vi.fn(async () => ({ statusCode: 200, headers: {}, body: new Uint8Array() }));
    this.teardown = vi.fn(async () => undefined);

    return this;
  }) as unknown as unknown as { new (): MockedNodepod } & { boot: () => Promise<MockedNodepod> };

  Nodepod.boot = vi.fn(async () => {
    return new Nodepod();
  });

  Nodepod.prototype.spawn = vi.fn(async function (
    this: MockedNodepod,
    command: string,
    args: string[],
    _options?: SpawnOptions,
  ) {
    const {
      exit,
      output = new ReadableStream<string>({
        start(controller) {
          controller.close();
        },
      }),
      input = new WritableStream<string>({
        write() {
          // noop
        },
      }),
    } = fakeProcessFactory(command, args, _options);

    const fakeProcess: FakeProcess = {
      pid: this._fakeProcesses.length,
      command,
      args,
      exit,
      output,
      input,
      kill: () => {
        output.cancel();
        input.close();
        this._fakeProcesses = this._fakeProcesses.filter((p) => p !== fakeProcess);
      },
      resize() {
        // noop
      },
      completion: (async () => {
        const exitCode = await exit;
        return { stdout: '', stderr: '', exitCode };
      })(),
    };

    Object.defineProperties(fakeProcess, {
      pid: { enumerable: false },
      exit: { enumerable: false },
      output: { enumerable: false },
      input: { enumerable: false },
      kill: { enumerable: false },
      resize: { enumerable: false },
      completion: { enumerable: false },
    });

    this._fakeProcesses.push(fakeProcess);

    return fakeProcess as unknown as NodepodProcess;
  }) as never;

  return { Nodepod };
}

function getFileNode(tree: Directory, filePath: string): FakeNode | undefined {
  const node: FakeNode | undefined = getNode(tree, filePath);

  if (node && 'file' in node) {
    return node;
  }

  return undefined;
}

function getDirNode(tree: Directory, filePath: string): { directory: Directory } | undefined {
  const node: FakeNode | undefined = getNode(tree, filePath);

  if (node && 'directory' in node) {
    return node;
  }

  return undefined;
}

function getNode(tree: Directory, filePath: string): FakeNode | undefined {
  const segments = filePath.split('/');

  let current: Directory | undefined = tree;

  for (let i = 0; i < segments.length; ++i) {
    const segment = segments[i];

    if (segment.length === 0) {
      continue;
    }

    if (!current) {
      return undefined;
    }

    const node: FakeNode | undefined = current[segment];

    if (!node) {
      return undefined;
    }

    if (i === segments.length - 1) {
      return node;
    }

    if ('directory' in node) {
      current = node.directory;
      continue;
    }

    return undefined;
  }

  return undefined;
}

function ensureDir(tree: Directory, folderPath: string) {
  if (folderPath === '/' || folderPath === '' || folderPath === '.') {
    return;
  }

  const segments = folderPath.split('/').filter(Boolean);
  let current: Directory = tree;

  for (const segment of segments) {
    const existing: FakeNode | undefined = current[segment];

    if (!existing) {
      const next: { directory: Directory } = { directory: {} };
      current[segment] = next;
      current = next.directory;
      continue;
    }

    if ('directory' in existing) {
      current = existing.directory;
    }
  }
}

function storeFile(tree: Directory, filePath: string, contents: string) {
  const segments = filePath.split('/').filter(Boolean);

  if (segments.length === 0) {
    return;
  }

  let current: Directory = tree;

  for (let i = 0; i < segments.length - 1; ++i) {
    const segment = segments[i];
    const next = (current[segment] as { directory: Directory } | undefined)?.directory;
    if (!next) {
      return;
    }
    current = next;
  }

  const fileName = segments[segments.length - 1];
  current[fileName] = { file: { contents } };
}
