# OpenVessel parity gaps against what TutorialKit actually uses

**Ticket:** [#7 — OpenVessel parity gaps against what TutorialKit actually uses](https://github.com/ilteoood/tutorialkit/issues/7)
**Date:** 2026-11-07
**Status:** research only — no code changed.

## Scope and sources

Two repositories were read directly; no secondary write-ups were used.

* **This repo** (`ilteoood/tutorialkit`, branch `main` @ `80cb118`), in particular:
  * `packages/runtime/src/webcontainer/{index,on-demand-boot,shell,terminal-config,command,steps,editor-config,preview-info,port-info}.ts`
  * `packages/runtime/src/webcontainer/utils/files.ts`
  * `packages/runtime/src/store/{index,terminal,tutorial-runner,previews,editor}.ts`
  * `packages/astro/src/default/components/{webcontainer,setup}.ts`, `packages/astro/src/default/stores/auth-store.ts`
  * `packages/astro/src/vite-plugins/core.ts`, `packages/react/src/Panels/PreviewPanel.tsx`, `packages/test-utils/src/index.ts`
  * `packages/template/src/content/tutorial/meta.md`, `packages/template/src/templates/vite-app/package.json`, `packages/cli/overwrites/src/content/tutorial/meta.md`
* **WebContainer API**: `@webcontainer/api` **1.6.1** (the version TutorialKit depends on), unpacked with `npm pack @webcontainer/api`; typings `dist/index.d.ts`, `dist/entities.d.ts`, `dist/utils/reload-preview.d.ts` and the compiled `dist/utils/reload-preview.js`. The prose reference at <https://webcontainers.io/api> and the guides at <https://webcontainers.io/guides/browser-support> were used as the vendor's own documentation.
* **OpenVessel** `kobesoft-labs/openvessel` at tag **v2.0.1** (commit `38ec479`, "Release 2.0.1"), cloned to `/tmp/ov-parity-research`: `src/host/index.ts`, `src/kernel/index.ts` (watch matching), `src/kernel/vfs.ts`, `docs/reference/{host-api,filesystem,processes,shell,preview,network-policy,deployment,package-managers,native-modules}.md`, `docs/compatibility.md`, `package.json`.

**Doc-vs-source disagreements found (source wins):**

1. `docs/reference/host-api.md` says `fs.readFile(path, 'utf8')` returns a string; `src/host/index.ts` decodes whenever the `encoding` argument is *truthy*, so `'utf-8'` also returns a string. TutorialKit's `'utf-8'` calls therefore work — but only by accident of the implementation, not by contract.
2. `docs/reference/host-api.md` describes `fs.watch` as a plain prefix match; `src/kernel/index.ts:421` confirms exactly that: `if (ev.path === base || ev.path.startsWith(base.endsWith('/') ? base : base + '/'))`, with `base` used **verbatim** (not normalised). This is the load-bearing detail for gap 3.
3. `docs/reference/deployment.md` says the host only *warns* when the runtime is served from the host origin; `src/host/index.ts` does warn (`OpenVessel: the runtime should be served from its own origin`) but does not refuse to boot.
4. `docs/reference/host-api.md` documents kernel errors as plain errno text (`no such file or directory`), not Node's `ENOENT: no such file or directory, open 'x'`. This matters because TutorialKit matches on message text in places.

---

## Summary table

| # | Concern | Severity | Fix location |
|---|---|---|---|
| 1 | Outbound network: unrestricted vs policy + permission flow | behavioural (high) | fork (config) + upstream (policy tuning) |
| 2 | Identity: `auth.*` has no OpenVessel equivalent | behavioural (high) | impossible in OpenVessel; upstream or fork |
| 3 | Preview origin, URL shape, and the 3-origin deployment | behavioural (high) | fork (mostly) |
| 4 | Boot: `safeBoot` "blocked" state vs `boot()` throwing | behavioural (high) | fork |
| 5 | `/bin/jsh` + OSC handshake + `--allow-commands` vs POSIX `sh` | behavioural (high) | fork |
| 6 | Native modules, no `git`/`python`, fake `npm` | behavioural (medium-high) | upstream (mostly impossible) |
| 7 | Mount input shape (`FileSystemTree` vs flat map) | behavioural (medium) | fork |
| 8 | Mount point / `cwd` mismatch (`/home/user/app` vs `/home/user`) | behavioural (medium) | fork (cheap) |
| 9 | `fs.watch`: recursive + `(event, filename)` + `close()` vs prefix + `{type, path}` + unsubscribe fn | behavioural (medium) | fork |
| 10 | Port events: `on('port')` vs `on('server-ready')` / `on('port-closed')` | behavioural (medium) | fork |
| 11 | `rm` / `mkdir` / missing-path error semantics | behavioural (low-medium) | fork |
| 12 | Process `resize` / `input` / `env` shapes | behavioural (low) | fork |
| 13 | `reloadPreview` helper | behavioural (low) | fork |
| 14 | `createPreview` iframe | cosmetic | fork |
| 15 | Node version (26.13.0) | cosmetic | n/a |

---

## 1. Outbound network access

| Field | Detail |
|---|---|
| **Concern** | WebContainer processes reach the network without restriction; OpenVessel puts every outbound request through a policy and, by default, a permission prompt. |
| **WebContainer** | No network-policy API exists on the `WebContainer` class or `FileSystemAPI` (`@webcontainer/api@1.6.1` `dist/index.d.ts`); `spawn()` takes only `{ cwd, env, output, terminal }` (`dist/index.d.ts`, `SpawnOptions`). The vendor documents nothing about egress control. |
| **OpenVessel** | `vessel.network.setPolicy(policy)`, `getPolicy()`, `clearSession()`; `NetworkPolicy = { mode: 'ask' \| 'allowlist' \| 'allow-all'; presets: ('npm'\|'fonts'\|'icons'\|'cdn'\|'github')[]; allow: string[]; deny: string[] }`. Defaults: `mode: 'ask'`, presets `['npm','fonts','icons','cdn']` (`docs/reference/network-policy.md`). Preset hosts include `registry.npmjs.org` (npm), `fonts.googleapis.com`, `unpkg.com`, `cdn.jsdelivr.net` (cdn). The kernel emits `permission-request` `{id,url,host,initiator,source}`; the host answers `'once' \| 'session' \| 'deny' \| 'deny-session'`; **unanswered requests are denied after 5 minutes** (`docs/reference/network-policy.md`). Denied `fetch` surfaces as `TypeError: fetch failed` with `cause.code === 'EACCES'`; denied npm traffic surfaces as `Error code 'EACCES'`; a preview page requesting a blocked origin gets HTTP 403 `Blocked by OpenVessel network policy`. |
| **Impact on TutorialKit** | `packages/template/src/content/tutorial/meta.md` and `packages/cli/overwrites/src/content/tutorial/meta.md` both declare `prepareCommands: [['npm install', 'Installing dependencies']]` and `mainCommand: ['npm start' \| 'npm run dev', ...]`; that install hits `registry.npmjs.org`, which is allowed by the `npm` preset but, in the default `ask` mode, raises a **permission prompt on every lesson**. Any lesson that loads a Google Font, an icon set, or a CDN bundle in the preview is subject to the same prompt, and an unlisted host is hard-blocked with 403. `packages/astro/src/default/components/webcontainer.ts` has no place today to answer a permission request. |
| **Fix location** | **Fork** — TutorialKit must pass `network: { mode: 'allowlist', presets: [...] }` (or `allow-all`) and implement `onPermissionRequest` when calling `OpenVessel.boot()`, otherwise every lesson stalls on a prompt. Optionally **upstream** for a "tutorial preset". |
| **Severity** | behavioural (highest work of all gaps: it changes every lesson's runtime behaviour, not just one call site) |

## 2. Identity / authentication

| Field | Detail |
|---|---|
| **Concern** | TutorialKit has an enterprise auth flow built on `@webcontainer/api`'s `auth` export. OpenVessel has no authentication module at all. |
| **WebContainer** | `export declare const auth: AuthAPI` (`dist/index.d.ts`): `init(options)` → `{ status: 'need-auth' \| 'authorized' } \| AuthFailedError`, `startAuthFlow({ popup? })`, `loggedIn(): Promise<void>`, `logout({ ignoreRevokeError? })`, `on('logged-out')`, `on('auth-failed', { error, description })`. |
| **OpenVessel** | No `auth` export, no auth event, nothing analogous anywhere in `src/host/index.ts` or `docs/reference/host-api.md`. The host API surface is `boot`, `fs`, `mount`, `spawn`, `exec`, `ps`, `ports`, `on`, `createPreview`, `previewUrl`, `network`, `export`, `teardown`. |
| **Impact on TutorialKit** | `packages/astro/src/default/components/setup.ts` calls `authStore.set(auth.init(authConfig))` and registers `auth.on('auth-failed', …)` / `auth.on('logged-out', …)`; `packages/astro/src/default/components/webcontainer.ts` calls `auth.loggedIn()` before booting and `auth.startAuthFlow({ popup: true })` / `auth.logout({ ignoreRevokeError: true })` in `login()` / `logout()`; `packages/astro/src/default/stores/auth-store.ts` types its atom as `ReturnType<AuthAPI['init']> \| { status: 'no-auth' }` — i.e. the *type* comes from `@webcontainer/api`. `packages/runtime/src/store/terminal.ts` also awaits `auth.loggedIn()` before booting the terminal. All of this has no OpenVessel counterpart. |
| **Fix location** | **Impossible in OpenVessel as it stands.** Two options: (a) **upstream** — ask kobesoft-labs to add an `auth` module to the host API (a real feature request, not a bug); or (b) **fork** — TutorialKit implements its own auth (its own OAuth/PKCE flow + a licence check) and drops the `auth` dependency, keeping the `authStore` shape. The fork also needs to replace the `AuthAPI` type import in `packages/astro/src/default/stores/auth-store.ts`. |
| **Severity** | behavioural (blocks the whole enterprise/private-tutorial feature) |

## 3. Preview origin, URL shape, and deployment

| Field | Detail |
|---|---|
| **Concern** | TutorialKit builds preview URLs by joining a path onto an origin. OpenVessel's preview URLs are a query-shaped URL on a *separate preview origin*. |
| **WebContainer** | The `port` event hands the origin to the client: `PortListener = (port: number, type: 'open' \| 'close', url: string) => void` (`dist/index.d.ts`). TutorialKit stores it as `PortInfo.origin` (`packages/runtime/src/webcontainer/port-info.ts`) and `PreviewInfo.url` is `new URL(this.pathname ?? '/', this.baseUrl).toString()` with `baseUrl = portInfo.origin` (`packages/runtime/src/webcontainer/preview-info.ts`). |
| **OpenVessel** | `vessel.previewUrl(port, path = '/')` returns `` `${previewBase}__ov/open?port=${port}&path=${encodeURIComponent(path)}` `` (`src/host/index.ts`, `previewUrlFor`). `createPreview(port, { path, container })` returns a ready-made `<iframe>` with `sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads allow-pointer-lock"` (no `allow-top-navigation`), `allow="clipboard-write; fullscreen"`, `referrerPolicy="no-referrer"`. The preview origin is a **third origin** served by its own service worker (`docs/reference/deployment.md`, `dist/preview/`). |
| **Impact on TutorialKit** | `packages/runtime/src/store/previews.ts` builds `PreviewInfo` objects from the schema (`previews: [8080]` in `packages/template/src/content/tutorial/meta.md`) and `packages/react/src/Panels/PreviewPanel.tsx` sets `iframe.ref.src = preview.url`. With OpenVessel, `preview.url` must become `__ov/open?port=…&path=…` — the path must be **query-encoded**, not path-appended, so `PreviewInfo.url` (and its `baseUrl`/`origin` model) has to change. `packages/astro/src/default/stores/auth-store.ts` is unaffected, but `packages/astro/src/default/components/webcontainer.ts` must now be given a `previewUrl` at boot, and the deployment must serve a preview origin with `COOP: same-origin` + `COEP: require-corp` (and `credentialless` on `__ov-sw.js`) (`docs/reference/deployment.md`). |
| **Fix location** | **Fork** — rework `PreviewInfo`/`PortInfo` and `PreviewPanel`; the deployment split (host/runtime/preview origins) is TutorialKit's own hosting decision. Upstream could offer a `PreviewInfo`-shaped helper, but the URL shape is OpenVessel's contract. |
| **Severity** | behavioural |

## 4. Boot, cross-origin isolation, and the "blocked" boot state

| Field | Detail |
|---|---|
| **Concern** | TutorialKit has a three-value boot status with a user-gated "blocked" state for unsupported browsers; OpenVessel has a throwing boot with no intermediate states. |
| **WebContainer** | `static boot(options?: BootOptions): Promise<WebContainer>` (`dist/index.d.ts`). Boot options are `{ coep, workdirName, forwardPreviewErrors }`. There is **no `on('boot')` event** — boot is a static promise. Cross-origin isolation is required for `SharedArrayBuffer` (<https://webcontainers.io/guides/browser-support>). |
| **OpenVessel** | `static async boot(opts)` throws when not isolated: `OpenVessel: the host page must be cross-origin isolated (COOP: same-origin, COEP: require-corp or credentialless).` (`src/host/index.ts`, `_boot()`); the runtime iframe additionally fails with `the runtime must be embedded directly by the host page` or `origin <origin> is not allowed to use this runtime`; boot timeout (default 30 000 ms) rejects with `OpenVessel: runtime did not start in time` (`docs/reference/host-api.md`, `docs/reference/deployment.md`). |
| **Impact on TutorialKit** | `packages/runtime/src/webcontainer/on-demand-boot.ts` defines `BootStatus = 'unknown' \| 'blocked' \| 'booting' \| 'booted'`; `safeBoot()` sets `'blocked'` when `isRestricted()` (iPhone/iPad UA, or iPadOS masquerading as MacIntel) and only then waits for `unblockBoot()`; `packages/astro/src/default/components/webcontainer.ts` calls `safeBoot({ workdirName: 'tutorial' })`; `packages/runtime/src/store/index.ts` exposes `bootStatus` and `unblockBoot()` to the UI. Under OpenVessel there is no "blocked" state to enter and no `unblockBoot()` counterpart — the boot either succeeds or the promise rejects. The atoms `bootStatus`/`unblockBoot` therefore lose their meaning, and the "open this tutorial in a desktop browser" UX (`packages/runtime/src/store/terminal.ts` writes *"Looks like your browser's configuration is blocking WebContainers."*) has to be re-authored around a **rejection** rather than a **gate**. The iOS workaround also becomes pointless in the other direction: OpenVessel's hard requirement (`crossOriginIsolated`) is checked by the browser, not by a UA sniff. |
| **Fix location** | **Fork** — introduce an explicit `BootError`/`BootBlocked` distinction in `on-demand-boot.ts` and map OpenVessel's rejection reasons onto TutorialKit's status atoms. Nothing to fix upstream: the behaviour is by design. |
| **Severity** | behavioural |

## 5. `/bin/jsh`, the OSC handshake, and `--allow-commands`

| Field | Detail |
|---|---|
| **Concern** | TutorialKit's terminal is not a plain shell: it is StackBlitz's `jsh` with OSC 654 readiness signalling and an allow-list of permitted commands. OpenVessel ships a real POSIX-ish `sh` and no OSC protocol. |
| **WebContainer** | `/bin/jsh` accepts `--osc`, `--no-redirects`, `--allow-commands <list>`; with `--osc` it emits `ESC ] 654 ; interactive BEL` once it is ready for input. TutorialKit depends on exactly this: `packages/runtime/src/webcontainer/shell.ts` spawns `webcontainer.spawn('/bin/jsh', ['--osc', …], { terminal: { cols, rows } })` and resolves its `jshReady` promise when the OSC payload equals `'interactive'` (regex `/\x1b\]654;([^\x07]+)\x07/`), only then wiring `terminal.onData` to the process input. `--no-redirects` is added when `!options.allowRedirects`, and `--allow-commands` receives the lesson's `allowCommands` list. |
| **OpenVessel** | No `jsh` and no OSC anywhere in `src/` (grep for `jsh`/`osc` finds only unrelated base64 blobs). What exists is a kernel program: `/bin/sh`, `/bin/bash`, `/bin/dash` are the same program (`src/kernel/sh/*`, `docs/reference/shell.md`). It is a POSIX-subset shell with a line editor; `vessel.spawn('sh', [], { terminal: { cols, rows } })` gives it a TTY on fds 0–2 (`docs/reference/processes.md`, "The terminal (TTY)"), and an interactive shell writes its prompt to **stderr** (`docs/reference/shell.md`, "Interactive mode"). There is no `--no-redirects` and no `--allow-commands` equivalent: every coreutils program is reachable. |
| **Impact on TutorialKit** | `packages/runtime/src/webcontainer/shell.ts` needs a new readiness signal (first prompt byte on stderr, or a fixed delay), a new spawn target (`sh` instead of `/bin/jsh`), and a re-implementation of the "allow-commands" restriction — which is a *security* feature of TutorialKit lessons (`allowCommands` in the lesson front-matter) and cannot be emulated by an OpenVessel option. `--no-redirects` semantics (no output redirection in the user's shell) also disappear, because OpenVessel's `sh` supports full redirection. |
| **Fix location** | **Fork** for the shell swap and the readiness detection; **impossible in OpenVessel** for `--allow-commands` unless upstream adds a command allow-list to `spawn` (a reasonable upstream feature request: "spawn with a permitted-program list"). |
| **Severity** | behavioural |

## 6. Runtime fidelity: native modules, missing programs, fake `npm`

| Field | Detail |
|---|---|
| **Concern** | OpenVessel is a Node re-implementation, not real Node, and it runs a browser-safe subset of the ecosystem. |
| **WebContainer** | Full Node.js runtime in the browser with the usual npm ecosystem; the vendor markets "Native Node.js inside the browser" (<https://webcontainers.io/guides/introduction>). |
| **OpenVessel** | `docs/compatibility.md`: **no native addons** (`.node` files cannot load; `esbuild` → `esbuild-wasm`, `rollup` ≥ 4 → `@rollup/wasm-node`, `lightningcss` → `lightningcss-wasm`, `sharp` → its WASM build; only `pagefind`, `cn-font-split` and `resvg-js` ship as compat packages — `docs/reference/native-modules.md`); **dependency install scripts are not run** (the project's own `prepare`/`postinstall` are); `workerd` cannot run (Cloudflare adapter builds fail); no headless browsers; **programs other than `node`, shell built-ins, coreutils and package managers are not available — no `git`, no `python`**; WebSocket clients to external hosts return 501; HTTP/2 unimplemented. `npm` is not real npm but a kernel client (`npm` front end reports `10.9.3`) that reads lockfiles as version hints only and writes `node_modules/.package-lock.json` (`docs/reference/package-managers.md`). Node version pinned to **26.13.0** (`package.json` → `"openvessel": { "node": "26.13.0" }`). |
| **Impact on TutorialKit** | The default lesson template is Vite 5 (`packages/template/src/templates/vite-app/package.json` → `"vite": "^5.2.0"`), whose `mainCommand` is `npm start` → `vite`. Rollup 4 is substituted by `@rollup/wasm-node` and esbuild by `esbuild-wasm`, so Vite itself survives, but every lesson that teaches `git`, uses a package with a native binary (e.g. `sharp`, `canvas`), or relies on `postinstall` breaks. `packages/template/src/content/tutorial/meta.md` also lists `['node --version', 'Print Node.js version']` as a prepare command — under OpenVessel this prints `v26.13.0`. `npm install` in OpenVessel is a different installer: it ignores `package-lock.json` exactness and does not run install scripts. |
| **Fix location** | **Mostly impossible** — the missing-programs and native-addon limits are intrinsic to the browser runtime. **Upstream** can widen the compat-package list (each new package is a native→WASM port). Fork-side, TutorialKit must document/curate which lessons are OpenVessel-compatible. |
| **Severity** | behavioural (medium-high: it does not break the framework, it breaks lesson content) |

## 7. Mount input shape

| Field | Detail |
|---|---|
| **Concern** | The two runtimes take completely different mount payloads. |
| **WebContainer** | `mount(tree: FileSystemTree \| Uint8Array \| ArrayBuffer, options?: { mountPoint?: string })` (`dist/index.d.ts`); `FileSystemTree` is a **nested** tree of `DirectoryNode { directory: FileSystemTree }` / `FileNode { file: { contents: string \| Uint8Array } }` / `SymlinkNode { file: { symlink: string } }` (`dist/entities.d.ts`). |
| **OpenVessel** | `mount(files: Record<string, string \| Uint8Array \| null \| { symlink: string }>, opts: { path?: string } = {})` — a **flat path→content map**; `null` means "directory"; `opts.path` defaults to `/home/user/app` (`src/host/index.ts`, `docs/reference/host-api.md`). |
| **Impact on TutorialKit** | `packages/runtime/src/webcontainer/utils/files.ts` → `toFileTree(files: Files): FileSystemTree` builds the nested tree that `packages/runtime/src/store/tutorial-runner.ts` passes to `webcontainer.mount(...)` at lines 185, 274 and 754. With OpenVessel that helper must emit a flat map instead, and the `Files` type (a flat map already, see `packages/runtime/src/lesson-files.ts`) can be passed through unchanged. `docs/tutorialkit.dev/src/components/react-examples/ExampleSimpleEditor.tsx` also calls `webcontainer.mount(toFileTree(FILES))` and would need updating. |
| **Fix location** | **Fork** — rewrite `toFileTree()` (or add a sibling `toMountMap()`) in `packages/runtime/src/webcontainer/utils/files.ts`. |
| **Severity** | behavioural (mechanical) |

## 8. Mount point vs process `cwd`

| Field | Detail |
|---|---|
| **Concern** | Even with the payload fixed, the two runtimes disagree about *where* the project lives and *where* commands run. |
| **WebContainer** | `BootOptions.workdirName` "Sets the folder name for the working directory of your WebContainer instance. If not provided, it will be auto-generated. This is mostly a 'cosmetic' option." (<https://webcontainers.io/api>). TutorialKit boots with `workdirName: 'tutorial'` (`packages/astro/src/default/components/webcontainer.ts:19`) and spawns without `cwd`, so commands run in the project root where the mounted files live. |
| **OpenVessel** | `spawn()`'s default `cwd` is `/home/user`; `mount()`'s default path is `/home/user/app` (`docs/reference/shell.md`, default-environment table; `docs/reference/host-api.md`). The two defaults differ. |
| **Impact on TutorialKit** | `packages/runtime/src/store/tutorial-runner.ts` spawns lesson commands without a `cwd` (`webcontainer.spawn(command, args, { terminal: … })`). Under OpenVessel, `npm install` / `npm start` would execute in `/home/user` and find no `package.json` → the default template's lesson breaks immediately. The fix is small (mount at `/home/user`, or pass `cwd` on every spawn) but it must be applied in *every* spawn site: `tutorial-runner.ts`, `shell.ts`, and the docs examples. |
| **Fix location** | **Fork** (cheap: pass `cwd` explicitly, or `mount(..., { path: '/home/user' })`). **Upstream** could align the two defaults, but that would break OpenVessel's own conventions. |
| **Severity** | behavioural |

## 9. `fs.watch`

| Field | Detail |
|---|---|
| **Concern** | The two watchers have different addressing, different payloads, different lifetimes, and different recursion semantics. |
| **WebContainer** | `watch(filename, options?: FSWatchOptions, listener?: FSWatchCallback): IFSWatcher` with `FSWatchOptions = { encoding?, persistent?, recursive? }` and `FSWatchCallback = (event: 'rename' \| 'change', filename: string \| Uint8Array) => void`; the returned `IFSWatcher` has `close(): void` (`dist/index.d.ts`). `recursive` "Indicates whether all subdirectories should be watched, or only the current directory" (<https://webcontainers.io/api>). The filename passed to the callback is **relative to the watched path**. |
| **OpenVessel** | `fs.watch(path, fn)`; the callback receives `{ type: 'rename' \| 'change', path: string }` — an **absolute kernel path**; the watcher is a plain prefix match on the path as given, with **no recursion flag**: `if (ev.path === base \|\| ev.path.startsWith(base.endsWith('/') ? base : base + '/'))` (`src/kernel/index.ts:421`); `base` is used verbatim, so `watch('.')` never matches `/home/user/...`; the returned value is an **async unsubscribe function**, not an object with `close()` (`src/host/index.ts`; `docs/reference/host-api.md`). |
| **Impact on TutorialKit** | `packages/runtime/src/store/tutorial-runner.ts:650` does `webcontainer.fs.watch('.', { recursive: true }, (eventType, filename) => { const filePath = \`/${filename}\`; … })` and `_stopWatcher()` calls `this._watcher.close()`. Under OpenVessel this watcher never fires (the base `'.'` matches nothing) and the unsubscribe shape is wrong, so live sync from the terminal back into the editor is dead. The fork must (a) watch the absolute project root, (b) map the absolute `path` back to TutorialKit's editor-rooted `/…` paths, (c) call the returned function instead of `close()`. The `'change'` vs `'rename'` split that `_setupWatcher` relies on is preserved by OpenVessel, so the event-branch logic itself survives. |
| **Fix location** | **Fork** (`packages/runtime/src/store/tutorial-runner.ts`). Upstream could add a `recursive` option and a `close()`-shaped handle for API parity, but the prefix model is OpenVessel's design. |
| **Severity** | behavioural |

## 10. Port / server events

| Field | Detail |
|---|---|
| **Concern** | TutorialKit tracks preview readiness off a single `port` event; OpenVessel splits it into `server-ready` and `port-closed` and does not report a URL unless a preview origin is configured. |
| **WebContainer** | `on(event: 'port', listener: PortListener)` with `PortListener = (port: number, type: 'open' \| 'close', url: string) => void`; also `on('server-ready', ServerReadyListener)` where `ServerReadyListener = (port: number, url: string) => void` (`dist/index.d.ts`). |
| **OpenVessel** | `on('server-ready', { port, pid, url })` — `url` is **null unless `previewUrl` was configured** — and `on('port-closed', { port })`; there is **no `port` event** (`src/host/index.ts`; `docs/reference/host-api.md`). |
| **Impact on TutorialKit** | `packages/runtime/src/store/previews.ts` does `webcontainer.on('port', (port, type, url) => { … portInfo.ready = type === 'open'; portInfo.origin = url; … })`; `PortInfo` (`packages/runtime/src/webcontainer/port-info.ts`) stores `origin` and `ready`, and `PreviewInfo`/`PreviewInfo.url` are derived from them. Under OpenVessel the whole `PortInfo.origin` field disappears (the URL must be synthesised as `__ov/open?port=…`), and `ready` must be derived from `server-ready` instead of `type === 'open'`. `docs/tutorialkit.dev/src/components/react-examples/ExampleSimpleEditor.tsx` already uses `webcontainer.on('server-ready', (_port, url) => …)`, so that example's shape is closer to OpenVessel's than the framework's is. |
| **Fix location** | **Fork** (`packages/runtime/src/store/previews.ts`, `packages/runtime/src/webcontainer/port-info.ts`). Upstream could add a `port` event for parity, but the `server-ready`/`port-closed` split is OpenVessel's model. |
| **Severity** | behavioural |

## 11. `rm`, `mkdir`, and missing-path error semantics

| Field | Detail |
|---|---|
| **Concern** | The two file systems differ on what a missing path does, and on the defaults of `mkdir`/`rm`. |
| **WebContainer** | `mkdir(path, { recursive?: false })` → `Promise<void>`; `mkdir(path, { recursive: true })` → `Promise<string>` (the first created directory). `rm(path, { force?: boolean; recursive?: boolean })`. `readFile(path)` without encoding returns `Uint8Array`; with an encoding it returns `string` (`dist/index.d.ts`). |
| **OpenVessel** | `mkdir(path, { recursive? })` — **`recursive` defaults to `true`**; `rm(path, { recursive?, force? })` — "recursive true → `rm -rf`; a missing path resolves when `force` is true or omitted, rejects `ENOENT` when `force: false`; **without `recursive`, a missing path always rejects `ENOENT` and `force` is ignored**; a non-empty directory rejects `ENOTEMPTY`". `writeFile` creates missing parent directories. Errors are plain errno text (`no such file or directory`), not Node-style `ENOENT: no such file or directory, open 'x'` (`docs/reference/host-api.md`). |
| **Impact on TutorialKit** | `packages/runtime/src/store/tutorial-runner.ts:751` calls `webcontainer.fs.rm(filePath, { force: true })` — under OpenVessel that rejects with `ENOENT` if the file is already gone (no `recursive`), so a "delete this file" flow can throw. `packages/runtime/src/store/tutorial-runner.ts:134` calls `fs.mkdir(folderPath)` with no options — fine under OpenVessel (recursive by default), but it now creates parents silently where WebContainer would have thrown `EEXIST`. Existence probing at lines 217–219 is done by `try { await fs.readFile(filepath) } catch { await fs.readdir(filepath) }` — that pattern survives, but any code that branches on the *message* would not; OpenVessel also offers `fs.exists()` / `fs.stat()`, which the fork should use instead (`packages/runtime/src/store/tutorial-runner.ts`). The e2e helper `e2e/src/components/ButtonDeleteFile.tsx` calls `fs.rm(filePath)` with no options at all → under OpenVessel that rejects on a missing path. |
| **Fix location** | **Fork** — pass `{ recursive: true, force: true }` everywhere, and switch existence probes to `fs.exists()`/`fs.stat()`. |
| **Severity** | behavioural (low-medium) |

## 12. Process API shapes: `resize`, `input`, `env`

| Field | Detail |
|---|---|
| **Concern** | The process objects differ in three small but pervasive ways. |
| **WebContainer** | `WebContainerProcess { exit: Promise<number>; input: WritableStream<string>; output: ReadableStream<string>; kill(): void; resize(dimensions: { cols: number; rows: number }): void }` — `resize` takes an **object**; input is a **WritableStream** (`dist/index.d.ts`). `SpawnOptions.env?: Record<string, string \| number \| boolean>` and `output?: boolean` also exist. |
| **OpenVessel** | `Process { output: ReadableStream<string>; exit: Promise<number>; pid: number; write(data): Promise<boolean>; end(): Promise<boolean>; resize(cols: number, rows: number): Promise<null>; kill(signal='SIGTERM'): Promise<null> }` — `resize` is **positional**, there is **no `input` WritableStream** (use `write()`/`end()`), and `SpawnOptions = { cwd?, env?: Record<string,string>, terminal?: {cols,rows} }` has no `output` flag and only string env values (`src/host/index.ts`; `docs/reference/host-api.md`). `resize` sends `SIGWINCH` to the process group (`docs/reference/processes.md`). |
| **Impact on TutorialKit** | `packages/runtime/src/webcontainer/terminal-config.ts` (`attachProcess`, `attachTerminal`) and `packages/runtime/src/store/terminal.ts` (`onTerminalResize`) and `packages/runtime/src/store/tutorial-runner.ts` all call `process.resize({ cols, rows })` — every one of them must become `process.resize(cols, rows)`. `packages/runtime/src/webcontainer/shell.ts` writes to `process.input.getWriter()` — that becomes `process.write()`. `packages/test-utils/src/index.ts` already models `resize(cols, rows)` positionally (`FakeProcess`), so the test double and the production code disagree today; the fork should align them on one shape. `process.exit`/`process.output`/`process.kill` are compatible, so `tutorial-runner.ts`'s `await this._currentCommandProcess.exit` and `process.output.pipeTo(…)` survive unchanged. |
| **Fix location** | **Fork** — mechanical, but it touches every terminal code path. |
| **Severity** | behavioural (low) |

## 13. `reloadPreview`

| Field | Detail |
|---|---|
| **Concern** | The preview refresh button relies on a WebContainer-specific helper that OpenVessel does not provide. |
| **WebContainer** | `reloadPreview(preview: HTMLIFrameElement, hardRefreshTimeout?: number): Promise<void>` (`dist/utils/reload-preview.d.ts`); the implementation posts `{ type: 'LOCALSERVICE_RELOAD_WINDOW', callback: port1 }` to the preview iframe and waits for `LOCALSERVICE_WINDOW_RELOADED`, falling back to `preview.src = preview.src` after 200 ms (`dist/utils/reload-preview.js`). |
| **OpenVessel** | No equivalent export, and no reload message channel in the host API (`docs/reference/host-api.md`). The preview service worker answers `__ov/open?port=…&path=…`; a reload is a plain navigation (`docs/reference/preview.md`). |
| **Impact on TutorialKit** | `packages/react/src/Panels/PreviewPanel.tsx` imports `{ reloadPreview } from '@webcontainer/api/utils'` and calls `reloadPreview(iframe.ref)` for the per-preview and "reload all" buttons. Under OpenVessel this must become a re-assignment of `iframe.src` to the `__ov/open` URL — the page fully reloads (scroll position and in-page state are lost) instead of a soft reload. `packages/test-utils/src/index.ts` does not mock `@webcontainer/api/utils`, so the React test setup also needs the import removed. |
| **Fix location** | **Fork** (one call site). **Upstream** could ship a `reloadPreview` helper for parity; it would be a small addition to the host API. |
| **Severity** | behavioural (low) |

## 14. `createPreview` and the preview iframe

| Field | Detail |
|---|---|
| **Concern** | OpenVessel can hand TutorialKit a ready-made preview iframe; TutorialKit builds its own today. |
| **WebContainer** | `WebContainer.setPreviewScript(scriptSrc, options?)` exists (`dist/index.d.ts`) but there is **no iframe factory** — the host creates the `<iframe>` and points it at the port URL. |
| **OpenVessel** | `createPreview(port, { path?, container? }): Promise<HTMLIFrameElement>` builds the iframe with the sandbox/allow/referrer attributes listed in gap 3 and appends it to `container` if given (`src/host/index.ts`; `docs/reference/host-api.md`). |
| **Impact on TutorialKit** | `packages/react/src/Panels/PreviewPanel.tsx` creates its own `<iframe>` elements in `#previews-container`, with no `sandbox` attribute and an `allow` value derived from `document.featurePolicy`. Adopting OpenVessel's iframe would *add* a sandbox (`allow-scripts allow-same-origin allow-forms …`) and `referrerPolicy="no-referrer"` — stricter than today, and `allow-top-navigation` is deliberately absent, so a preview that navigates the top frame (rare in lessons) would break. The `container` option maps neatly onto TutorialKit's `#previews-container`. |
| **Fix location** | **Fork** — optional; the current hand-rolled iframe keeps working as long as the `src` is a valid `__ov/open` URL. |
| **Severity** | cosmetic |

## 15. Node version

| Field | Detail |
|---|---|
| **Concern** | The two runtimes ship very different Node versions. |
| **WebContainer** | The Node.js version shipped inside a WebContainer is **not part of the public API surface**: neither `@webcontainer/api@1.6.1`'s typings nor <https://webcontainers.io/api> states it, and the vendor does not document a runtime Node version. The only in-repo observation point is the lesson command `['node --version', 'Print Node.js version']` in `packages/template/src/content/tutorial/meta.md`. |
| **OpenVessel** | Node **26.13.0**, pinned in `package.json` (`"openvessel": { "node": "26.13.0" }`) and confirmed in `docs/compatibility.md` (Node's own test suite: 1516/1516 targets pass). `docs/reference/native-modules.md` notes that Node 26 imports addons by default (`--experimental-addon-modules`) — relevant only because OpenVessel never loads a `.node` file. |
| **Impact on TutorialKit** | The lesson that prints the Node version shows a different number (cosmetic). The behavioural consequence of the *newer* Node is the opposite direction of the other gaps: APIs removed or changed in Node 26 may break lesson code written for the older WebContainer Node, and OpenVessel's Node is still a re-implementation with browser limits (gap 6). Nothing in `packages/template` pins an `engines.node` field, so no install will fail on the version. |
| **Fix location** | n/a — cosmetic, no code change needed. |
| **Severity** | cosmetic |

---

## Appendix A — every `webcontainer.*` usage in the repo, classified

| Usage | Where | OpenVessel equivalent | Verdict |
|---|---|---|---|
| `WebContainer.boot(options)` | `packages/runtime/src/webcontainer/on-demand-boot.ts` | `OpenVessel.boot({ runtimeUrl, previewUrl, network, onPermissionRequest })` | different shape — gap 4 |
| `webcontainer.mount(tree)` | `packages/runtime/src/store/tutorial-runner.ts:185,274,754`; `docs/.../ExampleSimpleEditor.tsx:104` | `vessel.mount(flatMap, { path })` | different shape — gap 7 |
| `webcontainer.fs.mkdir(path)` | `packages/runtime/src/store/tutorial-runner.ts:134`; `e2e/.../ButtonWriteToFile.tsx` (`{recursive:true}`) | `vessel.fs.mkdir(path, { recursive })` (default `true`) | compatible, different default — gap 11 |
| `webcontainer.fs.writeFile(path, content)` | `packages/runtime/src/store/tutorial-runner.ts:159`; `docs/.../ExampleSimpleEditor.tsx` | `vessel.fs.writeFile(path, data)` | compatible |
| `webcontainer.fs.readFile(path[, encoding])` | `packages/runtime/src/store/tutorial-runner.ts:217,624` | `vessel.fs.readFile(path[, encoding])` | compatible, encoding is truthy-based — gap 11 |
| `webcontainer.fs.readdir(path)` | `packages/runtime/src/store/tutorial-runner.ts:219` | `vessel.fs.readdir(path)` | compatible |
| `webcontainer.fs.rm(path, { force: true })` | `packages/runtime/src/store/tutorial-runner.ts:751`; `e2e/.../ButtonDeleteFile.tsx` | `vessel.fs.rm(path, { recursive, force })` | different semantics — gap 11 |
| `webcontainer.fs.watch('.', { recursive: true }, cb)` | `packages/runtime/src/store/tutorial-runner.ts:650` | `vessel.fs.watch(path, cb)` | incompatible — gap 9 |
| `watcher.close()` | `packages/runtime/src/store/tutorial-runner.ts:598` | unsubscribe function | incompatible — gap 9 |
| `webcontainer.spawn(cmd, args, { terminal })` | `packages/runtime/src/webcontainer/shell.ts:35`; `packages/runtime/src/store/tutorial-runner.ts` | `vessel.spawn(cmd, args, { terminal, cwd, env })` | compatible in shape; target program differs — gaps 5, 8 |
| `webcontainer.spawn('jsh', ['--osc'])` | `docs/.../ExampleSimpleEditor.tsx:117`, `ExampleSimpleTerminal.tsx:41` | none (`sh` instead) | incompatible — gap 5 |
| `process.input.getWriter().write()` | `packages/runtime/src/webcontainer/shell.ts` | `process.write()` | incompatible — gap 12 |
| `process.output` (ReadableStream) | `packages/runtime/src/store/tutorial-runner.ts` | `process.output` (ReadableStream) | compatible |
| `process.exit` (Promise\<number\>) | `packages/runtime/src/store/tutorial-runner.ts` | `process.exit` (Promise\<number\>) | compatible |
| `process.resize({ cols, rows })` | `packages/runtime/src/webcontainer/terminal-config.ts`; `packages/runtime/src/store/terminal.ts`; `packages/runtime/src/store/tutorial-runner.ts` | `process.resize(cols, rows)` | incompatible — gap 12 |
| `webcontainer.on('port', cb)` | `packages/runtime/src/store/previews.ts` | `on('server-ready')` + `on('port-closed')` | incompatible — gap 10 |
| `webcontainer.on('server-ready', cb)` | `docs/.../ExampleSimpleEditor.tsx` | same event, different payload | payload differs — gap 10 |
| `auth.init / startAuthFlow / loggedIn / logout / on(...)` | `packages/astro/src/default/components/{setup,webcontainer}.ts`; `packages/runtime/src/store/terminal.ts` | **none** | impossible — gap 2 |
| `reloadPreview(iframe)` | `packages/react/src/Panels/PreviewPanel.tsx` | none | gap 13 |
| `webcontainer.path` / `workdir` | not used in this repo (only implied by `workdirName: 'tutorial'`) | `vessel` has no path/workdir accessor | gap 8 (informational) |
| `webcontainer.export()` | not used in this repo | `vessel.export(path, { exclude })` (flat map) | n/a |
| `webcontainer.teardown()` | not used in this repo | `vessel.teardown()` | n/a |

## Appendix B — behavioural gaps ranked by the work they create

1. **Network policy / permission flow** — every lesson runs `npm install`; the default `ask` mode turns each lesson into a prompt, and unlisted CDNs/fonts get 403'd in previews. *Work:* design a TutorialKit network preset + `onPermissionRequest` handler, and decide what a lesson author must declare.
2. **Identity** — the `auth` module has no counterpart; the enterprise tier cannot simply be ported. *Work:* design TutorialKit-owned auth (or an upstream feature request) and re-shape `packages/astro/src/default/stores/auth-store.ts`.
3. **Preview + deployment** — a third origin, a different URL shape, and a changed `PreviewInfo` model. *Work:* rework `PreviewInfo`/`PortInfo`/`PreviewPanel`, and change TutorialKit's hosting (or ship the preview origin).
4. **Boot semantics** — `safeBoot`'s `blocked` state has no counterpart; the whole "your browser blocks WebContainers" UX has to be re-authored around a rejected promise. *Work:* new boot-status model in `packages/runtime/src/webcontainer/on-demand-boot.ts`.
5. **`/bin/jsh` + OSC + `allowCommands`** — the terminal needs a new readiness signal and a new program; `allowCommands` has no equivalent at all. *Work:* rewrite `packages/runtime/src/webcontainer/shell.ts`; security semantics must be re-implemented or requested upstream.
6. **Runtime fidelity** — no `git`, no native addons, no install scripts, a fake `npm`. *Work:* mostly upstream; fork-side it is content curation and documentation.
7. **Mount shape + `cwd`** — mechanical, but must be applied at every spawn/mount site. *Work:* half a day.
8. **`fs.watch`** — one call site, but it silently stops syncing if the path mapping is wrong. *Work:* small, with careful path translation.
9. **Port events** — one call site plus the `PortInfo` model. *Work:* small.
10. **`rm`/`mkdir`/error text** — small but easy to miss; `rm` without `recursive` rejects on missing paths. *Work:* small.
11. **Process API shapes (`resize`, `input`)** — mechanical, three to four call sites. *Work:* small.
12. **`reloadPreview`** — one call site; degrade to `src = src`. *Work:* minutes.

Cosmetic only: the preview iframe factory (gap 14) and the Node version (gap 15).
