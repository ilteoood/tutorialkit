# Migrating to TutorialKit 2.0

TutorialKit 2.0 replaces the WebContainer API with the [OpenVessel runtime](https://github.com/kobesoft-labs/openvessel). The lesson runtime, the preview and the terminal all run on it, served from your own origin instead of a third-party iframe.

This guide lists everything that can break when you upgrade.

## The runtime is served by your site

`@tutorialkit/astro` now emits the runtime and the preview assets under `/ov/runtime/` and `/ov/preview/` and serves them with the headers the runtime needs, so you no longer have to configure them by hand on your host. If you serve the built site through a proxy or a CDN, keep those paths on the same origin as the tutorial pages: the runtime refuses to start otherwise.

Cross-origin isolation is still mandatory on the page itself. The integration sets it for `astro dev`, but on production you still configure it:

```yaml
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Opener-Policy: same-origin
```

`http://localhost` is exempt from the isolation requirement, but a LAN address such as `http://192.168.1.10` is not: use HTTPS or the `--unsafely-treat-insecure-origin-as-secure` flag.

If you terminate TLS in front of Astro, forward the `x-forwarded-proto` header so the runtime can allow your page to frame it.

## `tutorialkit:core` exposes the lesson runtime

The `webcontainer` export is gone, replaced by `runtime`:

```diff
-import { webcontainer } from 'tutorialkit:core';
+import { runtime } from 'tutorialkit:core';

-const instance = await webcontainer;
-const process = await instance.spawn('node', ['./check-lesson.mjs']);
+const process = await runtime.spawn('node', ['./check-lesson.mjs']);
```

There is no compatibility alias. Paths are relative to the lesson root, `/home/user/app`, so `/home/tutorial` no longer means anything.

| Before (`WebContainer`) | Now (`LessonRuntime`) |
| --- | --- |
| `instance.fs.readFile(path, 'utf8')` | `runtime.readFile(path, 'utf8')` |
| `instance.fs.writeFile(path, data)` | `runtime.writeFile(path, data)` |
| `instance.fs.mkdir(path, { recursive: true })` | `runtime.mkdir(path, { recursive: true })` |
| `instance.fs.readdir(path, { withFileTypes: true })` | `runtime.readdir(path, { withFileTypes: true })` |
| `instance.fs.rm(path, { recursive: true })` | `runtime.rm(path, { recursive: true })` |
| `instance.mount(tree)` | `runtime.mount(files)` |
| `instance.spawn('jsh', { terminal })` | `runtime.spawn('/bin/sh', [], { terminal })` |
| `instance.on('server-ready', (port, url) => …)` | `runtime.onServer(({ port }) => …)` + `runtime.previewUrl(port)` |

`mount` takes a flat map of paths to `string` or `Uint8Array` contents instead of a nested `FileSystemTree`, and `spawn` returns a `Process` whose output is a `ReadableStream<string>` you read with `pipeTo` and write to with `write`, not `input.getWriter()`.

The shell is a real `/bin/sh` managed by the runtime, so the `jsh` OSC handshake (`--osc`, `\x1b]654;interactive\x07`) is gone: write your command as soon as the process exists.

## Configuration changes

- `webcontainer.allowRedirects` and `webcontainer.allowCommands` are removed. Configs still containing them fail validation with `Unrecognized key(s) in object: 'allowCommands'`; delete those keys.
- The integration option `enterprise` is replaced by `network`, which describes which hosts the runtime and the processes it runs may reach:

```diff
-tutorialkit({
-  enterprise: { editorOrigin: '…', clientId: '…', scope: '…' },
-})
+tutorialkit({
+  network: { mode: 'allowlist', presets: ['npm', 'fonts', 'icons', 'cdn'] },
+})
```

`network.mode: 'allowlist'` is what allows `npm install` to reach the registry. The default policy already allows the npm registry, fonts, icons and public CDNs.

## Authentication is removed

The enterprise login flow, its login button and the `authStore` are gone. If you relied on them, gate access to your lessons at the hosting level instead.

## Renamed i18n keys

| Before | Now |
| --- | --- |
| `webcontainerLinkText` | `runtimeLinkText` |
| `startWebContainerText` | `startRuntimeText` |

The lesson config key `webcontainer` keeps its name, so existing lessons keep working.

## Terminal API

`WebContainerProcess` is now `TerminalProcess`:

```ts
interface TerminalProcess {
  resize(cols: number, rows: number): Promise<unknown>;
  kill(signal?: string): Promise<unknown>;
}
```

`TerminalPanel.processOptions` is gone. Resizing sends `resize(cols, rows)` to the process instead of the WebContainer-specific `allowRedirects`/`allowCommands` options.

## Downloads

`WebContainer.export()` returned a zip; `LessonRuntime.export()` returns the files as a `Record<string, Uint8Array>`, with `{ exclude }` instead of `{ format, excludes }`. The built-in download button zips them itself with `fflate`; a custom one has to do the same.

## Package versions

Every `@tutorialkit/*` package moves to 2.0.0, together with `tutorialkit` (the CLI). Nothing is published yet: the versions are set so the release after this change is a major one. Update every `@tutorialkit/*` dependency in your project at once; mixing 1.x and 2.x packages fails at runtime because the runtime bundle and the `tutorialkit:core` export no longer match.
