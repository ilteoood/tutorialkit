import fs from 'node:fs';
import type { ServerResponse } from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { Connect, Plugin } from 'vite';
import { defineConfig } from 'vite';

const require = createRequire(import.meta.url);

const openvesselDist = path.resolve(path.dirname(require.resolve('openvessel')), '..');

const ASSET_ROOTS: Record<string, string> = {
  '/ov/runtime': path.join(openvesselDist, 'runtime'),
  '/ov/preview': path.join(openvesselDist, 'preview'),
};

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.map': 'application/json',
  '.tgz': 'application/gzip',
  '.txt': 'text/plain; charset=utf-8',
};

const RUNTIME_CSP_ENTRIES = ['runtime.html', 'kernel.js', 'process.js', 'node-process.js'];

function runtimeCsp(origin: string): string {
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval' blob: data:",
    "connect-src 'self' data: blob:",
    "worker-src 'self' blob:",
    "img-src 'self' data: blob:",
    "style-src 'self' 'unsafe-inline'",
    `frame-ancestors ${origin}`,
  ].join('; ');
}

function requestPath(url: string | undefined): string {
  return decodeURIComponent((url ?? '/').split('?')[0]);
}

function requestOrigin(req: Connect.IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-proto'];
  const protocol =
    typeof forwarded === 'string' ? forwarded : (req.socket as { encrypted?: boolean }).encrypted ? 'https' : 'http';

  return `${protocol}://${req.headers.host ?? 'localhost'}`;
}

function applyHeaders(res: ServerResponse, urlPath: string, origin: string): void {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');

  if (urlPath === '/ov/preview/__ov-sw.js') {
    res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  } else {
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  }

  if (RUNTIME_CSP_ENTRIES.some((entry) => urlPath === `/ov/runtime/${entry}`)) {
    res.setHeader('Content-Security-Policy', runtimeCsp(origin));
  }
}

function serveAssets(roots: Record<string, string>): Connect.NextHandleFunction {
  return (req, res, next) => {
    const urlPath = requestPath(req.url);

    for (const [prefix, root] of Object.entries(roots)) {
      if (!urlPath.startsWith(`${prefix}/`)) {
        continue;
      }

      const filePath = path.join(root, urlPath.slice(prefix.length + 1));

      if (!filePath.startsWith(root) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        next();
        return;
      }

      res.setHeader('Content-Type', MIME_TYPES[path.extname(filePath)] ?? 'application/octet-stream');
      res.setHeader('Cache-Control', urlPath.includes('/chunks/') ? 'public, max-age=31536000, immutable' : 'no-cache');
      fs.createReadStream(filePath).pipe(res);

      return;
    }

    next();
  };
}

function openvesselAssets(): Plugin {
  let outDir = '';

  return {
    name: 'openvessel-assets',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        applyHeaders(res, requestPath(req.url), requestOrigin(req));
        next();
      });
      server.middlewares.use(serveAssets(ASSET_ROOTS));
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        applyHeaders(res, requestPath(req.url), `http://${req.headers.host ?? 'localhost'}`);
        next();
      });
    },
    closeBundle() {
      for (const [prefix, root] of Object.entries(ASSET_ROOTS)) {
        fs.cpSync(root, path.join(outDir, prefix.slice(1)), { recursive: true });
      }
    },
  };
}

export default defineConfig({
  plugins: [openvesselAssets()],
  build: {
    target: 'esnext',
  },
});
