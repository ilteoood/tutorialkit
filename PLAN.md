# Plan: Migrate tutorialkit from WebContainers to Nodepod

Target: replace every WebContainer touchpoint in this repository with [`@r1ck404/nodepod`](https://github.com/R1ck404/Nodepod).

## Decisions

| Area | Choice |
| --- | --- |
| Auth / enterprise flow | Drop entirely. No `auth.*` calls, no `__ENTERPRISE__` / `__WC_CONFIG__` defines, no LoginButton, no auth-store. |
| Interactive shell | Use Nodepod `createTerminal()`. No `/bin/jsh` spawning; `webcontainer/shell.ts` is deleted. |
| Open in StackBlitz | Remove the link. Delete `OpenInStackblitzLink.tsx`, drop `@stackblitz/sdk`, drop the `openInStackBlitz` schema field. |

These three are coherent: they collapse every StackBlitz-specific surface (auth, jsh, export to StackBlitz) and let Nodepod own the runtime. After them, only the orthogonal pieces remain: filesystem, process lifecycle, preview events, and snapshot export (ZIP). All have direct Nodepod equivalents.

## API mapping

| WebContainer (`@webcontainer/api`) | Nodepod (`@r1ck404/nodepod`) | Notes |
| --- | --- | --- |
| `WebContainer.boot({ workdirName })` | `Nodepod.boot({ workdir })` | `workdir` value becomes `/home/project` |
| `webcontainer.fs.{readFile,writeFile,mkdir,readdir,rm}` | `pod.fs.{readFile,writeFile,mkdir,readdir,rm}` | Identical names |
| `webcontainer.fs.watch(path, { recursive }, cb)` | `pod.fs.watch(path, { recursive }, cb)` | Returns `{ close() }` — same shape |
| `webcontainer.fs.mount(FileSystemTree)` | `pod.fs.mount(files)` (flat `Record<path, content>` likely) | Exact shape verified on first edit |
| `webcontainer.spawn(cmd, args, opts)` → `WebContainerProcess` | `pod.spawn(cmd, args, opts)` → `NodepodProcess` | `exit` → `completion.exitCode`; `kill()` same |
| `webcontainer.on('port', cb)` | `pod.proxy.onServerReady` / RequestProxy hook | Different mechanism — exact hook verified on first edit |
| `webcontainer.spawn('/bin/jsh', …)` | `pod.createTerminal()` → xterm-compatible `Terminal` | Ports directly to `TerminalPanel` |
| `process.resize({ cols, rows })` | `process.resize(cols, rows)` or `terminal.resize()` | Same call shape |
| `auth.*` | none | Removed |
| `reloadPreview(iframe)` from `@webcontainer/api/utils` | none — `iframe.src = iframe.src` | Throw-away helper |

## Packages affected

- `@tutorialkit/runtime` — heaviest surface change
- `@tutorialkit/astro` — boot glue + auth + OpenInStackBlitz
- `@tutorialkit/react` — drop `reloadPreview`, drop StackBlitz if no other use
- `@tutorialkit/types` — schema description strings
- `@tutorialkit/test-utils` — replace the `@webcontainer/api` mock
- `packages/cli` — `eject` required-dependency list
- `docs/tutorialkit.dev` — interactive examples (low priority, follow-up PR is fine)

## Phases

### Phase 0 — Branch

- `git-flow-branch-creator` skill to name the branch (suggested: `feature/nodepod-runtime`).
- Single branch covers phases 1–4 since they are interdependent; phase 6 may ship as a follow-up.

### Phase 1 — `@tutorialkit/runtime` (the heart)

Edit:

- `src/webcontainer/on-demand-boot.ts` → call `Nodepod.boot({ workdir })`. iOS heuristic stays; user-facing messaging updates.
- `src/webcontainer/utils/files.ts` → keep `toFileTree / diffFiles / areFilesEqual` if `mount` accepts `FileSystemTree`; drop `toFileTree` if `mount` takes a flat `Files` map and adapt callers.
- `src/webcontainer/terminal-config.ts` → swap `WebContainerProcess` for the Nodepod terminal process type.
- `src/store/terminal.ts` → drop `auth.loggedIn()`; create the panel terminal via `pod.createTerminal()`.
- `src/store/previews.ts` → replace `container.on('port', …)` with the Nodepod `RequestProxy` hook.
- `src/store/tutorial-runner.ts` → swap `webcontainer.fs.*`, `webcontainer.spawn`, `webcontainer.fs.watch`. Map `process.exit` → `process.completion`. Adapt `resize` signature.
- `src/store/index.ts`, `src/index.ts` → re-export surface unchanged: `Promise<Pod>` fills the role of `Promise<WebContainer>`.
- `src/utils/support.ts` → retarget detection for COOP/COEP availability (rename to `pod/support.ts`).
- `src/store/*.spec.ts` → update to the new mock shape.

Delete:

- `src/webcontainer/shell.ts` (OSC 654 readiness dance — Nodepod handles it natively).

Optional rename:

- `src/webcontainer/` → `src/pod/`. Purely cosmetic; reduces StackBlitz vocabulary in the code.

### Phase 2 — `@tutorialkit/astro`

Edit:

- `src/default/components/webcontainer.ts` → `src/default/components/pod.ts`. Boot `Nodepod`; no auth wiring; drop `login()` / `logout()` exports.
- `src/vite-plugins/core.ts` → re-export the new `pod.ts` virtual module.
- `src/vite-plugins/store.ts` → drop `__ENTERPRISE__` / `__WC_CONFIG__` defines.
- `types.d.ts` → `Promise<Nodepod>` instead of `Promise<WebContainer>`.
- `package.json` → drop `@webcontainer/api` and `@stackblitz/sdk`, add `@r1ck404/nodepod`.

Delete:

- `src/default/components/setup.ts` (auth boot glue).
- `src/default/components/LoginButton.tsx`.
- `src/default/stores/auth-store.ts`.
- `src/default/components/OpenInStackblitzLink.tsx`.

Patch:

- `src/default/components/TopBar.astro` — remove `LoginButton` / `OpenInStackblitzLink` references.
- `src/default/utils/content/squash.spec.ts` — remove the auth-store mock.

### Phase 3 — `@tutorialkit/react`

Edit:

- `src/Panels/PreviewPanel.tsx` → drop the `reloadPreview` import; use `iframe.src = iframe.src` directly (the imperative handle already does this in the parent).
- `package.json` → drop `@webcontainer/api`; drop `@stackblitz/sdk` only if no other reference remains after phase 2.

Phase 3 is the smallest phase. `BootScreen.tsx` and other panels stay as-is — they only depend on `tutorialStore` types.

### Phase 4 — `@tutorialkit/types` and `@tutorialkit/test-utils`

Edit:

- `src/schemas/common.ts`, `i18n.ts`, `tutorial.ts`, `default-localization.ts` → replace user-facing "WebContainer" wording with "runtime" / "pod" in description strings and default i18n values.
- `test-utils/src/index.ts` → rewrite the `vi.mock('@webcontainer/api', …)` block to mock `Nodepod.boot()` returning a `Nodepod`-shaped object with `fs`, `spawn`, `teardown`, `createTerminal`, `proxy`. Keep the `setProcessFactory` / `resetProcessFactory` shape.

### Phase 5 — `packages/cli`

Edit:

- `src/commands/eject/index.ts` → replace `@webcontainer/api` with `@r1ck404/nodepod` in `REQUIRED_DEPENDENCIES`; drop `@stackblitz/sdk`.

### Phase 6 — Docs interactive examples (deferrable)

Edit if still relevant:

- `docs/tutorialkit.dev/src/components/react-examples/hooks/useWebcontainer.ts` → `useNodepod.ts`. Calls `Nodepod.boot({ workdir })`.
- `docs/tutorialkit.dev/src/components/react-examples/ExampleSimpleEditor.tsx` → use `Nodepod` API; replace `container.on('server-ready')` with Nodepod's equivalent hook.
- `docs/tutorialkit.dev/src/components/react-examples/ExampleTerminal.tsx` → same.

If these demo pages are not blocking the migration, defer to a follow-up PR.

### Phase 7 — Browser config

- Add COOP/COEP headers to Astro dev server for `SharedArrayBuffer`: `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp`. Nodepod requires it; tutorialkit currently does not enforce it.
- Update provider templates in `packages/cli` (Cloudflare `_headers`, Vercel `vercel.json`, Netlify `_headers`) so production deployments get the headers automatically.
- Document the requirement for users deploying to custom hosts.

### Phase 8 — Verify

- `pnpm run lint` (eslint).
- `pnpm run test` (vitest per package).
- `pnpm run test:e2e` (Playwright e2e).
- Manual smoke test in a browser: confirm files mount, `npm install` runs, dev server boots, preview iframe shows content, interactive terminal accepts input, file edits propagate via the watcher.

## Self-review, commit, and PR

Per `AGENTS.md`:

- `thermos` then `ponytail:ponytail-review` before each commit.
- `git-commit` skill for the conventional commit message.
- Open a single PR using the project's template; one commit per phase is fine if the diffs stay small.
- Fill the PR template's sections (summary, changes, why, test plan, linked issue). If no issue is open yet, file one first.

## Risks

- **Browser support tightens**: Nodepod needs cross-origin isolation (COOP/COEP). tutorialkit currently runs on Safari 16.4+ without that — adding the headers is a prerequisite on some hosts and a no-op on others.
- **Open-in-StackBlitz removal is one-way**: tutorial authors using `openInStackBlitz: true` lose that link silently. Add a deprecation warning to the schema before removal; document the change in the PR description.
- **Provider templates need headers**: Cloudflare / Vercel / Netlify templates in the CLI must ship the COOP/COEP headers or deployments break. `_headers` and `vercel.json` are easy; custom-host users must be told.
- **API drift**: `Nodepod.mount()` exact signature and `RequestProxy` preview-ready hook are verified on the first edit, not from documentation alone. If either diverges from this plan, adapt phase 1 in place rather than blocking the whole PR.

## Skipped from this plan

- I did not run the migration; this file is the plan to run.
- I did not verify the exact `Nodepod.mount()` signature — check on first edit of `packages/runtime/src/webcontainer/utils/files.ts` against the installed `@r1ck404/nodepod` types.
- I did not verify the exact preview-ready hook in `RequestProxy` — check on first edit of `packages/runtime/src/store/previews.ts`.
- The two `docs/tutorialkit.dev/examples` files were the only remaining WebContainer holdouts I saw; a fresh grep is worth running before phase 6.
