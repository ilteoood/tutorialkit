export interface RuntimeBootOptions {
  runtimeUrl: string;
  previewUrl?: string;
  network?: {
    mode: 'ask' | 'allowlist' | 'allow-all';
    presets?: Array<'npm' | 'fonts' | 'icons' | 'cdn' | 'github'>;
    allow?: string[];
    deny?: string[];
  };
}

export interface RuntimeSpawnOptions {
  cwd?: string;
  env?: Record<string, string>;
  terminal?: { cols: number; rows: number };
}

export interface RuntimeProcess {
  readonly output: ReadableStream<string>;
  readonly exit: Promise<number>;
  write(data: string): Promise<unknown>;
  end(): Promise<unknown>;
  resize(cols: number, rows: number): Promise<unknown>;
  kill(signal?: string): Promise<unknown>;
}

export interface RuntimeServerReady {
  port: number;
  pid: number;
  url: string | null;
}

export interface RuntimePreviewOptions {
  path?: string;
  container?: HTMLElement;
}

export interface Runtime {
  mount(files: Record<string, string>, options?: { path?: string }): Promise<void>;
  spawn(command: string, args?: string[], options?: RuntimeSpawnOptions): Promise<RuntimeProcess>;
  exec(commandLine: string, options?: RuntimeSpawnOptions): Promise<{ code: number; output: string }>;
  onServerReady(handler: (event: RuntimeServerReady) => void): () => void;
  createPreview(port: number, options?: RuntimePreviewOptions): Promise<HTMLIFrameElement>;
  teardown(): void;
}

export interface RuntimeProvider {
  readonly name: string;
  boot(options: RuntimeBootOptions): Promise<Runtime>;
}
