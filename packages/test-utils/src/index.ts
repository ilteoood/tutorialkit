export interface FakeSpawnOptions {
  cwd?: string;
  env?: Record<string, string>;
  terminal?: { cols: number; rows: number };
}

export interface FakeProcess {
  command: string;
  args: string[];
  options?: FakeSpawnOptions;
}

export interface FakeSpawnedProcess {
  pid: number;
  output: ReadableStream<string>;
  exit: Promise<number>;
  write(data: string): void;
  end(): void;
  kill(signal?: string): Promise<void>;
  resize(cols: number, rows: number): Promise<void>;
}

export type FakeProcessFactory = (
  command: string,
  args: string[],
  options?: FakeSpawnOptions,
) => { exit?: Promise<number>; output?: ReadableStream<string> };

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
 * A lesson runtime backed by an in-memory filesystem, for tests that never boot a real runtime.
 */
export interface FakeRuntime {
  readonly files: Record<string, string | Uint8Array>;
  readonly processes: FakeProcess[];

  mount(files: Record<string, string | Uint8Array>, options?: { path?: string }): Promise<void>;
  readFile(path: string, encoding?: 'utf8'): Promise<string | Uint8Array>;
  writeFile(path: string, data: string | Uint8Array): Promise<void>;
  mkdir(path: string): Promise<void>;
  readdir(path: string, options?: { withFileTypes?: boolean }): Promise<string[]>;
  rm(path: string, options?: { recursive?: boolean; force?: boolean }): Promise<void>;
  exists(path: string): Promise<boolean>;
  spawn(command: string, args?: string[], options?: FakeSpawnOptions): Promise<FakeSpawnedProcess>;
  watch(listener: (eventType: 'change' | 'rename', filePath: string) => void): Promise<() => void>;
}

export function createFakeRuntime(root = '/home/user/app'): FakeRuntime {
  const files: Record<string, string | Uint8Array> = {};
  const processes: FakeProcess[] = [];

  function resolve(path: string) {
    return path.startsWith('/') ? path : `${root}/${path}`;
  }

  function childrenOf(directory: string) {
    const prefix = `${resolve(directory)}/`;
    const names = new Set<string>();

    for (const path of Object.keys(files)) {
      if (path.startsWith(prefix)) {
        names.add(path.slice(prefix.length).split('/')[0]);
      }
    }

    return [...names].sort((a, b) => a.localeCompare(b));
  }

  function createProcess(spawned: { exit?: Promise<number>; output?: ReadableStream<string> }): FakeSpawnedProcess {
    const written: string[] = [];

    return {
      pid: processes.length,
      output: spawned.output ?? new ReadableStream<string>(),
      exit: spawned.exit ?? Promise.resolve(0),
      write(data) {
        written.push(typeof data === 'string' ? data : new TextDecoder().decode(data));
      },
      end() {
        written.length = 0;
      },
      async kill() {
        written.length = 0;
      },
      async resize() {
        written.length = 0;
      },
    };
  }

  return {
    files,
    processes,

    async mount(newFiles, options) {
      const base = options?.path ?? root;

      for (const [path, content] of Object.entries(newFiles)) {
        files[`${base}/${path.startsWith('/') ? path.slice(1) : path}`] = content;
      }
    },

    async readFile(path, encoding) {
      const content = files[resolve(path)];

      if (content === undefined) {
        throw new Error(`No file found at ${path}`);
      }

      return encoding === 'utf8' ? content.toString() : content;
    },

    async writeFile(path, data) {
      files[resolve(path)] = data;
    },

    async mkdir(path) {
      files[`${resolve(path)}/`] ??= '';
    },

    async readdir(path) {
      return childrenOf(path);
    },

    async rm(path) {
      const target = resolve(path);
      const prefix = `${target}/`;

      for (const filePath of Object.keys(files)) {
        if (filePath === target || filePath.startsWith(prefix)) {
          delete files[filePath];
        }
      }
    },

    async exists(path) {
      const target = resolve(path);

      return target in files || childrenOf(target).length > 0;
    },

    async spawn(command, args = [], options) {
      processes.push({ command, args, options });

      return createProcess(fakeProcessFactory(command, args, options));
    },

    async watch() {
      return () => undefined;
    },
  };
}
