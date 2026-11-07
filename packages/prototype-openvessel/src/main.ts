import { openVesselProvider } from './runtime-openvessel.js';

const PROJECT_DIR = '/home/user/app';

const DEMO_FILES: Record<string, string> = {
  'package.json': JSON.stringify(
    {
      name: 'preview-demo',
      private: true,
      dependencies: {
        picocolors: '^1.0.0',
      },
    },
    null,
    2,
  ),
  'server.js': [
    "const http = require('node:http');",
    "const pc = require('picocolors');",
    'const html = [',
    '  \'<!doctype html><html><body style="font-family:system-ui;padding:3rem">\',',
    "  '<h1>' + pc.green('OpenVessel preview works') + '</h1>',",
    "  '<p>Served by Node ' + process.version + ' running inside the browser.</p>',",
    "  '</body></html>',",
    "].join('');",
    'http.createServer((req, res) => {',
    "  res.writeHead(200, { 'Content-Type': 'text/html' });",
    '  res.end(html);',
    '}).listen(3000, () => console.log("preview server listening on 3000"));',
  ].join('\n'),
};

function pick<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);

  if (!element) {
    throw new Error(`missing element ${selector}`);
  }

  return element;
}

function append(target: HTMLElement, text: string): void {
  target.textContent += text;
}

async function pump(stream: ReadableStream<string>, target: HTMLElement): Promise<void> {
  const reader = stream.getReader();

  const read = async (): Promise<void> => {
    const { done, value } = await reader.read();

    if (done) {
      return;
    }

    append(target, value);
    await read();
  };

  await read();
}

async function main(): Promise<void> {
  const status = pick<HTMLElement>('#status');
  const log = pick<HTMLElement>('#log');
  const terminal = pick<HTMLElement>('#terminal');
  const preview = pick<HTMLElement>('#preview');

  status.textContent = `crossOriginIsolated: ${String(crossOriginIsolated)}`;

  const runtime = await openVesselProvider.boot({
    runtimeUrl: new URL('/ov/runtime/', window.location.href).href,
    previewUrl: new URL('/ov/preview/', window.location.href).href,
    network: {
      mode: 'allowlist',
      presets: ['npm', 'fonts', 'icons', 'cdn'],
    },
  });

  append(log, 'booted\n');

  await runtime.mount(DEMO_FILES, { path: PROJECT_DIR });
  append(log, `mounted ${Object.keys(DEMO_FILES).length} files into ${PROJECT_DIR}\n`);

  const install = await runtime.exec('npm install', { cwd: PROJECT_DIR });
  append(log, `npm install → exit ${install.code}\n${install.output}\n`);

  const shell = await runtime.spawn('sh', [], { cwd: PROJECT_DIR, terminal: { cols: 100, rows: 24 } });
  void pump(shell.output, terminal);
  await shell.write('echo "shell is $0" && ls && node --version\n');

  const serverReady = new Promise<number>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error('server-ready never arrived'));
    }, 30_000);
    runtime.onServerReady((event) => {
      window.clearTimeout(timer);
      resolve(event.port);
    });
  });

  const server = await runtime.spawn('node', ['server.js'], { cwd: PROJECT_DIR });
  void pump(server.output, log);

  const port = await serverReady;
  const frame = await runtime.createPreview(port, { container: preview });

  append(log, `preview iframe: ${frame.src}\n`);
  status.textContent = `crossOriginIsolated: ${String(crossOriginIsolated)} — preview on port ${port}`;
}

main().catch((error: unknown) => {
  const status = pick<HTMLElement>('#status');
  status.textContent = `failed: ${error instanceof Error ? error.message : String(error)}`;
  append(pick<HTMLElement>('#log'), `\n${String(error)}\n`);
});
