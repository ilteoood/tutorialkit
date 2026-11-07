# OpenVessel boot prototype

Answers ticket #3 of the wayfinder map: **can OpenVessel boot inside a TutorialKit-shaped host page, and what does that cost?**

The prototype is a Vite app that does exactly what a TutorialKit site would do: one origin serves the host page, the OpenVessel runtime and the OpenVessel preview, the host page boots the runtime, and a lesson preview renders in an iframe.

```
```text
├── index.html               host page
├── src/runtime.ts           the runtime seam: Runtime, RuntimeProvider, RuntimeProcess
├── src/runtime-openvessel.ts the OpenVessel implementation of the seam
├── src/main.ts              boot → mount → npm install → shell → dev server → preview
└── vite.config.ts           asset serving + the required per-path headers
```

## Running it

```bash
pnpm install
pnpm --filter prototype.tutorialkit.openvessel dev      # http://localhost:5199
pnpm --filter prototype.tutorialkit.openvessel build    # copies the runtime into dist/ov
pnpm --filter prototype.tutorialkit.openvessel preview  # serves the production build
```

Verified in Chromium 153 and Firefox 157 (Playwright), in dev and in the production build: the runtime boots, files mount, `npm install` succeeds through the network allowlist, `sh` runs, `node --version` prints `v26.13.0`, and the preview iframe renders the lesson server.

## The four answers

### 1. The `boot()` options that work

```ts
const runtime = await OpenVessel.boot({
  runtimeUrl: new URL('/ov/runtime/', location.href).href,
  previewUrl: new URL('/ov/preview/', location.href).href,
  network: { mode: 'allowlist', presets: ['npm', 'fonts', 'icons', 'cdn'] },
});
```

- `runtimeUrl` is required; a trailing slash is optional (a last path segment without an extension is treated as a directory), but keep the slash for clarity.
- `previewUrl` is optional. Without it the preview is served from the runtime origin and `server-ready` events carry `url: null`.
- `network.mode: 'allowlist'` is what makes `npm install` work without a prompt. The default is `'ask'`, which turns every registry request into a permission dialog.
- `timeout` defaults to 30s and `locale` to `'en'`.
- The host page must be cross-origin isolated or `boot()` rejects with `OpenVessel: the host page must be cross-origin isolated (COOP: same-origin, COEP: require-corp or credentialless).`

The runtime is a hidden iframe (`/ov/runtime/runtime.html`) that registers a service worker at scope `./` and boots a module worker (`__ov/k/<kid>/kernel.js`) inside it. The host page and the runtime talk over `postMessage` + `MessageChannel`.

### 2. Required headers and service-worker scopes

| Path | COOP | COEP | Other |
| --- | --- | --- | --- |
| host page | `same-origin` | `require-corp` | |
| `/ov/runtime/**` | `same-origin` | `require-corp` | CSP on `runtime.html`, `kernel.js`, `process.js`, `node-process.js` |
| `/ov/runtime/sw.js` | `same-origin` | `require-corp` | no CSP |
| `/ov/preview/**` | `same-origin` | `require-corp` | |
| `/ov/preview/__ov-sw.js` | `same-origin` | `credentialless` | |

Two rules are easy to get wrong:

- **Never emit both COEP values on one response.** `require-corp, credentialless` fails open to `unsafe-none` and `boot()` rejects. The preview service worker only *adds missing* headers, so `/ov/preview/__ov-sw.js` must be served with `credentialless` and nothing else.
- **The runtime CSP is a fixed list of four files.** `sw.js` must not carry it, and it must not be applied to the whole `/ov/runtime/` directory.

Service-worker scopes: the runtime registers `/ov/runtime/sw.js` with scope `/ov/runtime/`; the preview registers `/ov/preview/__ov-sw.js` with scope `/ov/preview/`. Both are same-origin, so neither conflicts with a site-level service worker at `/`.

### 3. What breaks

- **One origin means one trust boundary.** OpenVessel logs `OpenVessel: the runtime should be served from its own origin` and, in `SECURITY.md`, calls a one-origin deployment demo-only: the preview can read the host page's DOM, cookies and storage. The runtime itself is still a separate *document*, but it is not a separate origin.
- **Safari is not supported.** OpenVessel documents Chromium and Firefox only; nothing in the runtime or the docs mentions Safari.
- **Firefox caveats** (both cosmetic): the runtime asks for the `cross-origin-isolated` permissions-policy feature and Firefox logs `Skipping unsupported feature name "cross-origin-isolated"`; and the preview service worker logs `A ServiceWorker intercepted the request and encountered an unexpected error` once during the first preview load — the preview still renders.
- **A missing `charset` in the preview response** makes Firefox log `The character encoding of a framed document was not declared`. Lesson servers should send `Content-Type: text/html; charset=utf-8`.
- **The preview iframe is sandboxed with `allow-scripts allow-same-origin`**, which Chromium warns can escape the sandbox. That is OpenVessel's own design (`createPreview`), not something the host page can change.
- **The host page needs a favicon** or the browser logs a 404 — unrelated to OpenVessel.

### 4. The assets every site must ship

| Asset | Size | Notes |
| --- | --- | --- |
| `dist/runtime/` | 31 MB | as shipped, including source maps |
| `dist/runtime/` without `.map` | 22 MB | source maps are 9.2 MB and useless in production |
| `dist/runtime/` without `.map` and without `compat/` | 15 MB | `compat/` (6.7 MB) holds optional native-addon tarballs |
| `dist/preview/` | 92 KB | |
| `dist/host/index.js` | 76 KB | the part TutorialKit imports |

The two heavy files are `nodelib.js` (6.6 MB) and `amaro.js` (3.8 MB, TypeScript stripping); both compress to ~1.4 MB with gzip. A site that ships the runtime uncompressed transfers ~22 MB on a cold cache — budget for that, or serve it from a separate origin with long-lived immutable caching on `chunks/`.

Because the site owns the files it serves, the deployment can also rewrite `runtime.html` to pin `<meta name="openvessel-allowed-hosts" content="*">` to the host origin instead of `*`.

## The runtime seam

`src/runtime.ts` defines what a tutorial needs from a runtime — mount files, spawn a process, run a command line, learn when a server is ready, open a preview, tear down — without mentioning OpenVessel. `src/runtime-openvessel.ts` implements it in ~30 lines.

Exchanging runtimes means writing one more `RuntimeProvider` and changing the import in `src/main.ts`; no call site changes. The seam deliberately does **not** model OpenVessel's `ask`/`allowlist`/`allow-all` network modes, the `permission-request` event or `fs.watch`: those are OpenVessel-specific, and a second runtime would have to map them onto its own model.
