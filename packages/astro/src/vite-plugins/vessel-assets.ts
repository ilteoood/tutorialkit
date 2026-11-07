import fs from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { VitePlugin } from '../types.js';

const require = createRequire(import.meta.url);

const vesselDist = path.resolve(path.dirname(require.resolve('openvessel')), '..');

const ASSET_ROOTS: Record<string, string> = {
  'ov/runtime': path.join(vesselDist, 'runtime'),
  'ov/preview': path.join(vesselDist, 'preview'),
};

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.tgz': 'application/gzip',
  '.wasm': 'application/wasm',
};

const CORS_ISOLATED_FILES = new Set(['kernel.js', 'process.js', 'node-process.js', 'runtime.html']);

let outDir = 'dist';

/**
 * Serves the OpenVessel runtime and preview assets and copies them into the build output, so a single
 * origin can host the page, the runtime and the preview.
 */
export const vesselAssets: VitePlugin = {
  name: 'tutorialkit-vessel-assets',

  configResolved(config) {
    outDir = config.build.outDir;
  },

  configureServer(server) {
    server.middlewares.use((request, response, next) => {
      const asset = resolveAssetPath(request.url);

      if (!asset) {
        next();

        return;
      }

      fs.readFile(asset.file, (error, content) => {
        if (error) {
          next();

          return;
        }

        response.statusCode = 200;
        response.setHeader('Content-Type', MIME_TYPES[path.extname(asset.file)] ?? 'application/octet-stream');
        applyIsolationHeaders(response, asset.relative, requestOrigin(request));

        response.end(content);
      });
    });
  },

  closeBundle() {
    for (const [urlPath, source] of Object.entries(ASSET_ROOTS)) {
      fs.cpSync(source, path.join(outDir, urlPath), { recursive: true });
    }
  },
};

function resolveAssetPath(url: string | undefined) {
  const urlPath = decodeURIComponent((url ?? '/').split('?')[0]);

  for (const [prefix, root] of Object.entries(ASSET_ROOTS)) {
    if (!urlPath.startsWith(`/${prefix}/`)) {
      continue;
    }

    const relative = urlPath.slice(prefix.length + 2);
    const file = path.resolve(root, relative);

    if (!file.startsWith(root + path.sep)) {
      return undefined;
    }

    return { file, relative };
  }

  return undefined;
}

function applyIsolationHeaders(response: ServerResponse, relative: string, origin: string) {
  response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');

  const embedderPolicy = relative === 'preview/__ov-sw.js' ? 'credentialless' : 'require-corp';
  response.setHeader('Cross-Origin-Embedder-Policy', embedderPolicy);

  if (CORS_ISOLATED_FILES.has(path.posix.basename(relative))) {
    response.setHeader('Content-Security-Policy', runtimeCsp(origin));
  }
}

function runtimeCsp(origin: string) {
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

function requestOrigin(request: IncomingMessage) {
  const forwarded = request.headers['x-forwarded-proto'];
  const secure = forwarded === 'https' || (request.socket as { encrypted?: boolean }).encrypted;

  return `${secure ? 'https' : 'http'}://${request.headers.host ?? 'localhost'}`;
}
