import type { IncomingMessage, ServerResponse } from 'node:http';
import { describe, expect, it } from 'vitest';
import { vesselAssets, type VitePlugin } from './vessel-assets.js';

type Middleware = (request: IncomingMessage, response: ServerResponse, next: () => void) => void;

interface CapturedResponse {
  statusCode: number | undefined;
  headers: Record<string, string>;
  body?: Buffer;
}

describe('vesselAssets', () => {
  it('serves the runtime entry point with the runtime CSP', async () => {
    const response = await request('/ov/runtime/runtime.html');

    expect(response.statusCode).toBe(200);
    expect(response.body?.byteLength).toBeGreaterThan(0);
    expect(response.headers['content-security-policy']).toContain('frame-ancestors http://localhost:4321');
    expect(response.headers['cross-origin-embedder-policy']).toBe('require-corp');
  });

  it('sends the preview service worker a credentialless embedder policy', async () => {
    const response = await request('/ov/preview/__ov-sw.js');

    expect(response.statusCode).toBe(200);
    expect(response.headers['cross-origin-embedder-policy']).toBe('credentialless');
  });

  it('leaves the runtime service worker without a CSP', async () => {
    const response = await request('/ov/runtime/sw.js');

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-security-policy']).toBeUndefined();
  });

  it('refuses to serve a path outside the asset root', async () => {
    const response = await request('/ov/runtime/../../package.json');

    expect(response.statusCode).toBeUndefined();
    expect(response.headers['content-type']).toBeUndefined();
  });
});

function request(url: string): Promise<CapturedResponse> {
  const middleware = middlewareOf();

  return new Promise((resolve) => {
    let settled = false;
    const settle = () => {
      if (!settled) {
        settled = true;
        resolve(response);
      }
    };

    const response: CapturedResponse = { statusCode: undefined, headers: {} };
    const serverResponse = {
      statusCode: 200,
      setHeader(name: string, value: string) {
        response.headers[name.toLowerCase()] = value;
      },
      end(body?: Buffer) {
        response.statusCode = serverResponse.statusCode;
        response.body = body;
        settle();
      },
    };

    middleware(
      { url, headers: { host: 'localhost:4321' }, socket: {} } as IncomingMessage,
      serverResponse as unknown as ServerResponse,
      settle,
    );
  });
}

function middlewareOf(): Middleware {
  let middleware: Middleware | undefined;

  const hook = vesselAssets.configureServer;
  const configureServer = typeof hook === 'function' ? hook : hook?.handler;

  if (!configureServer) {
    throw new Error('The plugin does not configure the dev server');
  }

  configureServer({
    middlewares: {
      use(handler: Middleware) {
        middleware = handler;
      },
    },
  } as Parameters<Exclude<VitePlugin['configureServer'], undefined | { handler: unknown }>>[0]);

  if (!middleware) {
    throw new Error('The plugin registered no middleware');
  }

  return middleware;
}
