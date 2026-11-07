# Cross-origin isolation and asset delivery on every host TutorialKit supports

**Ticket:** [#4 — Cross-origin isolation and asset delivery on every host TutorialKit supports](https://github.com/ilteoood/tutorialkit/issues/4)
**Date:** 2026-11-07
**Status:** research only — no code changed.

## Scope and sources

The question: with the decided one-origin topology (host page, `dist/runtime/` and `dist/preview/` all served from the site's own origin, under paths such as `/ov/runtime/` and `/ov/preview/`), can every host TutorialKit supports serve the OpenVessel runtime and preview, and what does each one need for cross-origin isolation?

Read directly, no secondary write-ups:

* **This repo** (`ilteoood/tutorialkit`, `main` @ `80cb118`): `docs/tutorialkit.dev/src/content/docs/guides/deployment.mdx`, `docs/tutorialkit.dev/astro.config.ts`, `docs/tutorialkit.dev/_headers`, `packages/astro/src/index.ts`, `packages/cli/src/commands/create/generate-hosting-config.ts`, `packages/cli/src/commands/create/hosting-config/*`, `.github/workflows/publish-docs.yaml`.
* **OpenVessel** `kobesoft-labs/openvessel` at tag **v2.0.1** (clone in `/tmp/ov-deployment-research`): `docs/reference/deployment.md` (the API contract for deployment), `docs/SECURITY.md`, `docs/compatibility.md`, `src/host/index.ts`, `src/runtime/{runtime,sw}.ts`, `src/preview/{relay,sw}.ts`, `scripts/build.mjs`. Note: the path `docs/reference/compatibility.md` does not exist in v2.0.1; the compatibility document is `docs/compatibility.md`.
* **OpenVessel demo** `kobesoft-labs/openvessel-demo` (clone in `/tmp/ov-demo`): `public/coi-sw.js`, `public/index.html`, `build.mjs`, `deploy.mjs`.
* **Provider documentation** (official): Cloudflare Pages [headers](https://developers.cloudflare.com/pages/configuration/headers/), [serving pages](https://developers.cloudflare.com/pages/configuration/serving-pages/), [redirects](https://developers.cloudflare.com/pages/configuration/redirects/), [limits](https://developers.cloudflare.com/pages/platform/limits/); Netlify [headers](https://docs.netlify.com/routing/headers/), [redirects/rewrites/proxies](https://docs.netlify.com/manage/routing/redirects/rewrites-proxies/); Vercel [`vercel.json`](https://vercel.com/docs/project-configuration/vercel-json) and [headers](https://vercel.com/docs/headers); GitHub Pages ([creating a site](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site), [publishing source](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)).
* **Specifications**: [Service Workers](https://www.w3.org/TR/service-workers/) (§2.3, §5.3, §6.5, §6.6, "Match Service Worker Registration", `claim()`), [HTML Standard](https://html.spec.whatwg.org/multipage/origin.html) §7.1.4 "Cross-origin embedder policies", §7.1.4.2 "Embedder policy checks", §7.1.7 "Policy containers".

Not verified here (see §6): per-extension MIME tables of the three static hosts, file-size limits of Netlify/Vercel, and the header-override semantics when two matching header rules set the same header.

---

## Summary

| Question | Answer |
|---|---|
| Can every host TutorialKit supports serve runtime + preview under the site's own origin? | **Yes for all three documented targets** (Cloudflare Pages, Netlify, Vercel): all three are static hosts that serve arbitrary sub-paths of the published directory with the correct MIME types and register service workers at the `/ov/runtime/` and `/ov/preview/` scopes without any extra header. |
| Does TutorialKit's existing site-wide COOP/COEP already cover `/ov/runtime/**` and `/ov/preview/**`? | **Yes for isolation** — every one of the three configurations uses a catch-all pattern (`/*`, `/*`, `/(.*)`), so the same-origin runtime and preview responses already carry `COOP: same-origin` + `COEP: require-corp`. |
| Are per-path headers still needed? | **Two, and they are not optional:** (1) `/ov/preview/__ov-sw.js` must be served with `COEP: credentialless`; (2) `/ov/runtime/**` needs the runtime CSP, but `sw.js` must **not** get it. Both need a path-specific rule, and the rule must not be produced by *overriding* a catch-all (see §3.3 and §5.2). |
| Is `coi-sw.js` (the header-less fallback) viable inside a TutorialKit site? | **Technically yes, with caveats:** it needs one extra page reload, it collides with any other site-root service worker (SW spec §2.3 — the second registration replaces the first), it cannot supply the runtime CSP or `frame-ancestors`, and it does not restore the origin separation OpenVessel's `SECURITY.md` relies on. Use it as a fallback, not as the default. |
| Main residual risk of the one-origin topology | The preview is same-origin with the host page, so the preview's code can read the host's DOM, cookies and storage. OpenVessel documents this as a demo-only trade-off. |

---

## 1. The deployment targets TutorialKit supports

`docs/tutorialkit.dev/src/content/docs/guides/deployment.mdx` is the only deployment page in the docs site. It names exactly **three** targets, each with a catch-all isolation rule:

| Target | Config file | Rule | Repository source |
|---|---|---|---|
| Cloudflare Pages | `_headers` | `/*` → `COEP: require-corp`, `COOP: same-origin` | `docs/tutorialkit.dev/src/content/docs/guides/deployment.mdx` ("### Cloudflare"); template `packages/cli/src/commands/create/hosting-config/_headers.txt` |
| Netlify | `netlify.toml` | `[[headers]] for = "/*"` → same two headers | deployment.mdx ("### Netlify"); template `packages/cli/src/commands/create/hosting-config/netlify_toml.txt` |
| Vercel | `vercel.json` | `headers[].source = "/(.*)"` → same two headers | deployment.mdx ("### Vercel"); template `packages/cli/src/commands/create/hosting-config/vercel.json` |

No other deployment or self-hosting page exists: grepping the docs content for `github pages|surge|firebase|render.com|nginx|apache|self-host|static host` returns nothing, and `packages/cli/src/commands/create/generate-hosting-config.ts` offers only `Vercel`, `Netlify`, `Cloudflare`, `skip`. The docs site itself is deployed to Cloudflare Pages (`.github/workflows/publish-docs.yaml`, `cloudflare/pages-action`, directory `dist`), and `docs/tutorialkit.dev/_headers` already contains the same catch-all rule.

Two rows are added for completeness even though TutorialKit does not document them: **GitHub Pages** (because it is the host OpenVessel's `coi-sw.js` fallback targets, and because a TutorialKit user will try it) and **any self-hosted static server** (nginx/Caddy, for which OpenVessel ships reference configurations).

### 1.1 Capability matrix

Cells: ✅ works as-is, ⚠️ works with a caveat, ❌ not possible.

| Target | (a) Set COOP/COEP response headers | (b) Serve arbitrary sub-paths at their real path, correct MIME, no rewriting | (c) Host service workers at `/ov/runtime/` and `/ov/preview/` scopes | Sources |
|---|---|---|---|---|
| **Cloudflare Pages** | ✅ `_headers` in the asset directory; rules apply to static asset responses; up to 100 rules; a rule may be removed with the `!` detach syntax | ✅ static assets are served at their real paths; the SPA fallback ("serves the root (/) for any incoming path that does not correspond to a static asset") only applies to paths that are not files; `X-Content-Type-Options: nosniff` is added by default, so a wrong MIME fails hard; 25 MiB max per asset (the largest OpenVessel file is `nodelib.js` ≈ 6.6 MB) | ✅ both scopes are the directory of their own script, so no `Service-Worker-Allowed` is needed | [headers](https://developers.cloudflare.com/pages/configuration/headers/), [serving-pages](https://developers.cloudflare.com/pages/configuration/serving-pages/), [limits](https://developers.cloudflare.com/pages/platform/limits/), SW spec §5.3/§6.5 |
| **Netlify** | ✅ `_headers` in the publish directory or `[[headers]]` in `netlify.toml`; "Custom headers apply only to files Netlify serves from our own backing store" | ✅ the backing store wins over rewrites: "By default, you can't shadow a URL that actually exists within the site… the path /partials/chat.html would still render the contents of that file"; `!` forces shadowing | ✅ same as above | [headers](https://docs.netlify.com/routing/headers/), [rewrites-proxies](https://docs.netlify.com/manage/routing/redirects/rewrites-proxies/), SW spec §5.3/§6.5 |
| **Vercel** | ✅ `vercel.json` → `headers[]` with `source` patterns such as `/(.*)`; the `source`/`headers` properties use the same path-matching syntax as `redirects`/`rewrites` | ✅ the filesystem wins: "precedence is given to the filesystem prior to rewrites being applied"; "wildcard/catch-all patterns should usually be last" in `routes` | ✅ same as above | [`vercel.json`](https://vercel.com/docs/project-configuration/vercel-json), [headers](https://vercel.com/docs/headers), SW spec §5.3/§6.5 |
| **GitHub Pages** (not documented by TutorialKit) | ❌ no documented mechanism to set response headers; the documented surface is publishing source, custom domain, 404, HTTPS and Jekyll | ✅ static files are served at their real path; but Jekyll would eat paths starting with `_` (e.g. `__ov/`) → an empty `.nojekyll` in the publishing root is required; MIME types come from mime-db and cannot be customised | ✅ same as above | [creating-a-github-pages-site](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site) (`.nojekyll`, MIME types), [publishing source](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site) |
| **Self-hosted static server** (nginx / Caddy) | ✅ `add_header` / `header` directives | ✅ by construction; OpenVessel ships reference blocks | ✅ same as above | OpenVessel `docs/reference/deployment.md` §"Example configurations" |

**Cell notes.**

* **(a) header control** — All three documented TutorialKit targets already put `COOP: same-origin` and `COEP: require-corp` on `/*`. Because the runtime and the preview live on the *same origin* as the site under the decided topology, those catch-all rules already apply to `/ov/runtime/**` and `/ov/preview/**`. Nothing has to change to make the site cross-origin isolated — and, more importantly, nothing has to change to make the *runtime and preview responses* isolated either (see §3).
* **(b) sub-paths** — All three hosts serve files at their real paths, which is what OpenVessel requires: the runtime service worker strips its scope from the request path before matching `/__ov/…`, so `runtime/kernel.js` must exist at the real path `…/ov/runtime/kernel.js` for the virtual `…/ov/runtime/__ov/k/<id>/kernel.js` URL to resolve (`src/runtime/sw.ts`, `SCOPE`/`NS`/`splitKernel`, and the "Serving under a path" section of `docs/reference/deployment.md`). A host that rewrote `/ov/**` to the SPA entry point would break the runtime silently.
* **(c) service worker scopes** — `src/runtime/runtime.ts` registers `new URL('./sw.js', location.href)` with `scope: './'` → script `/ov/runtime/sw.js`, scope `/ov/runtime/`; `src/preview/relay.ts` registers `new URL('../__ov-sw.js', location.href)` with scope `new URL('../', location.href).pathname` → script `/ov/preview/__ov-sw.js`, scope `/ov/preview/`. Both scopes equal the directory of the script, which is the maximum scope the browser allows without a `Service-Worker-Allowed` header (Service Workers spec §5.3, §6.5; OpenVessel `docs/reference/deployment.md` §"`Service-Worker-Allowed`": "This header is not needed"). Every static host serves `.js` with a JavaScript MIME type, which the spec requires for worker scripts (§6.6).

---

## 2. Hosts that cannot set headers: the `coi-sw.js` fallback

### 2.1 What the fallback is

OpenVessel documents it in `docs/reference/deployment.md` §"Hosts that can't set headers (GitHub Pages)" and implements it in `openvessel-demo`:

* both OpenVessel service workers add the isolation headers themselves — the runtime `sw.js` adds `cross-origin-opener-policy: same-origin`, `cross-origin-embedder-policy: require-corp`, `cross-origin-resource-policy: cross-origin` to every same-origin `GET` under its scope that is not a `/__ov/…` endpoint; the preview `__ov-sw.js` adds `credentialless` + `cross-origin` + `same-origin` to its own files, to the `__ov/open` redirect and to every virtual-port response (`src/runtime/sw.ts` `withIsolation()`, `src/preview/sw.ts` `withIsolation()`/`isolationHeaders()`);
* **"Headers the server already sent are kept; the workers only add missing ones."** This is the reason the fallback cannot repair a wrong server header — see §3.3.

The demo closes the first-load gap with a **site-root** `coi-sw.js` (verbatim in the OpenVessel docs and in `openvessel-demo/public/coi-sw.js`):

```js
const ISOLATION = {
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-embedder-policy': 'require-corp',
  'cross-origin-resource-policy': 'cross-origin',
};
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(fetch(req).then((res) => {
    if (res.type === 'opaque' || res.status === 0) return res;
    const headers = new Headers(res.headers);
    for (const [k, v] of Object.entries(ISOLATION)) if (!headers.has(k)) headers.set(k, v);
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  }));
});
```

plus a one-shot reload in the page:

```html
<script>
  if (!crossOriginIsolated && 'serviceWorker' in navigator && !sessionStorage.getItem('ov-coi-reload')) {
    navigator.serviceWorker.register('coi-sw.js').then(() => navigator.serviceWorker.ready).then(() => {
      sessionStorage.setItem('ov-coi-reload', '1');
      location.reload();
    });
  } else sessionStorage.removeItem('ov-coi-reload');
</script>
```

### 2.2 Is it viable inside a TutorialKit site?

**Yes, mechanically.** A TutorialKit site is a static Astro build; a `coi-sw.js` at the site root is just another file in `dist/`. But the following must hold for it to work:

1. **Scope.** The fallback SW must cover `/ov/runtime/` and `/ov/preview/`. A site-root SW has scope `/` (or `/<repo>/` on a GitHub Pages *project* site, which is the correct scope there too: `https://<owner>.github.io/<repository>/` — [creating-a-github-pages-site](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site)). A root scope is a *parent* of both OpenVessel scopes, so it covers them.
2. **It only acts on documents loaded after it is installed.** OpenVessel states it plainly: "A service worker only controls documents loaded after it is installed. The first load of `runtime.html` and of `__ov/relay.html` is not controlled by these workers." Hence the reload. The same applies to the *site* SW and the site page itself: the host page's first load is not isolated either, which is why the demo reloads the page once (and why the demo shows an "unsupported" message if it is still not isolated afterwards).
3. **It cannot replace the OpenVessel workers.** Both OpenVessel workers call `skipWaiting()` on install and `clients.claim()` on activate (`src/runtime/sw.ts`, `src/preview/sw.ts`), so once they are active they take over their narrower scopes ("Once registered, the runtime's and the preview's workers take over their (narrower) scopes").

### 2.3 What it costs

| Cost | Detail | Source |
|---|---|---|
| **One extra page reload on first visit** | the demo reloads the page once, guarded by `sessionStorage['ov-coi-reload']`; the runtime frame additionally reloads itself once (guarded by `sessionStorage['openvessel-coi-reload']`) if it is not isolated after its worker is installed | OpenVessel `docs/reference/deployment.md` §"Hosts that can't set headers"; `src/runtime/runtime.ts` |
| **Two reloads in the worst case** | page reload (for the host page + first `runtime.html`/`relay.html` loads) and then the runtime's own reload | idem |
| **The site becomes cross-origin *embeddable*** | the fallback adds `cross-origin-resource-policy: cross-origin` to **every** same-origin GET in the site, not only to the OpenVessel paths | `coi-sw.js` source above |
| **No runtime CSP, no `frame-ancestors`** | the fallback can only add three headers; the CSP that confines the runtime's processes (`connect-src 'self'`) and the `frame-ancestors` restriction are lost. OpenVessel: "Without headers there is also no runtime CSP and no `frame-ancestors`, so this setup gives up the outbound `connect-src` confinement and the embedding restriction; with one origin it also gives up the origin separation. **Use it for demos only.**" | OpenVessel `docs/reference/deployment.md` |
| **It cannot coexist with another root-scope SW** | Service Workers spec §2.3: "A service worker registration of an identical scope url when one already exists in the user agent causes the existing service worker registration to be replaced." A TutorialKit site that already registers its own root-scope service worker (PWA, offline cache, …) would be replaced by `coi-sw.js` — or replace it, depending on order | [Service Workers](https://www.w3.org/TR/service-workers/) §2.3 |
| **It is not enough for the first load of the runtime** | "…that only helps if the frame could load at all, which inside an isolated host page needs COEP and CORP on the first load" — with the fallback the *host* page is only isolated after the reload, so the first runtime load happens in a non-isolated page; the demo's runtime-frame reload covers it, but a stricter `boot()` timing may not | OpenVessel `docs/reference/deployment.md` |

### 2.4 Can a site-root SW add headers to responses under `/ov/runtime/` and `/ov/preview/`?

**Yes.** A service worker intercepts the requests of the clients it controls, and the scope only decides *which clients* it controls and which registrations match a request ("Set matchingScopeString to the longest value in scopeStringSet which the value of clientURLString starts with" — Service Workers spec, "Match Service Worker Registration"). A root-scope SW that has claimed the site page therefore sees, and can re-serve with extra headers:

* the navigation to `/ov/runtime/runtime.html` and to `/ov/preview/__ov/relay.html` (both are same-origin navigations from the controlled page);
* every sub-resource under those directories.

Two limits:

* the *first* load of those documents happens before the root SW is installed/activated (see above) — hence the reload;
* the root SW can only add headers to responses it constructs; opaque and status-0 responses are passed through, and headers already present are kept (OpenVessel's own workers behave the same way, and the demo's `coi-sw.js` does the same).

**Correct scope for the fallback SW:** the site root of the deployed site (`/` for a root domain, `/<repo>/` for a GitHub Pages project site) — i.e. the directory that contains the site's HTML *and* the `ov/` directory. `openvessel-demo` puts `runtime/` and `preview/` directly under the site directory and registers `coi-sw.js` from the site root for exactly this reason.

---

## 3. Does the existing site-wide COOP/COEP cover the runtime and the preview?

### 3.1 Which responses the browser sees, and when

| # | Response | Who serves it | COOP / COEP the browser applies | Consequence |
|---|---|---|---|---|
| 1 | the tutorial page HTML | the site (catch-all rule) | `same-origin` + `require-corp` | `crossOriginIsolated === true`; `OpenVessel.boot()` does not throw |
| 2 | `/ov/runtime/runtime.html` (iframe) | the site (catch-all rule) | `same-origin` + `require-corp` | the runtime document is isolated; `SharedArrayBuffer` is available; the runtime's own `crossOriginIsolated` check passes |
| 3 | `/ov/runtime/kernel.js`, `process.js`, `node-process.js`, `chunks/*` (module workers) | the site (catch-all rule), or the runtime SW for the `/__ov/k/<id>/…` aliases | `same-origin` + `require-corp` | workers are created from same-origin scripts and are compatible with cross-origin isolation (HTML §7.1.4.2 "Embedder policy checks", worker branch) |
| 4 | `/ov/runtime/sw.js` (the SW script) | the site (catch-all rule) | `same-origin` + `require-corp` | the script itself need not be isolated; what matters is its **CSP** (must not be `connect-src 'self'`) |
| 5 | `/ov/preview/__ov/relay.html` (iframe) | the site (catch-all rule) | `same-origin` + `require-corp` | the relay frame is isolated; it loads only same-origin resources |
| 6 | `/ov/preview/__ov-sw.js` (the SW script) | the site (catch-all rule) | `same-origin` + `require-corp` ⚠️ | **wrong value — see §3.2** |
| 7 | the preview documents (served from the virtual ports) | the preview SW | the SW adds `credentialless` + `cross-origin` + `same-origin` when the dev server did not set them | the preview page is credentialless → third-party images/scripts load without CORP |

**Which policy governs the preview document (row 7)?** The child's *own* response policy, not the parent's: "To determine navigation params policy container … If responsePolicyContainer is not null, then return responsePolicyContainer" (HTML §7.1.7 "Policy containers"), and the gate in §7.1.4.2 allows a navigation whose response policy is compatible with cross-origin isolation even when the parent's policy is `require-corp` (the check returns `true` as soon as `responsePolicy['s value is compatible with cross-origin isolation`). So a `credentialless` preview served from the same origin as a `require-corp` host page is legal, and the preview keeps `credentialless`.

**Conclusion for the question asked:** yes — the existing catch-all rules already cover the runtime and preview **network responses** for isolation. No per-path COOP/COEP rules are needed for the runtime or for the preview's documents.

### 3.2 …except for two per-path requirements

**(a) `/ov/preview/__ov-sw.js` needs `COEP: credentialless`.**

The preview SW passes the preview page's cross-origin `no-cors` loads through **with its own `fetch()`** (`src/preview/sw.ts` → `outside(req)` → `await fetch(req)`), and a service worker's own `fetch()` is governed by the policy delivered with the *worker script* (HTML §7.1.7, "To initialize a worker global scope's policy container"). Under `require-corp` such a load fails unless the other server sends `Cross-Origin-Resource-Policy`; under `credentialless` it is sent without credentials and needs no CORP. OpenVessel states this in `docs/reference/deployment.md`: "The preview's `__ov-sw.js` is served with `credentialless` because the service worker passes the page's `no-cors` loads (images, classic scripts from other servers) through with its own `fetch()`." With the site's catch-all `require-corp` in place, the preview SW script inherits `require-corp`, and third-party images/CDN scripts in the preview break.

The OpenVessel workers **cannot fix this themselves**: `withIsolation()` only sets headers that are *missing* ("Headers the server already sent are kept"), so a server-sent `require-corp` is never replaced by the SW's `credentialless`.

**(b) `/ov/runtime/**` needs the runtime CSP, but `sw.js` must not get it.**

The runtime CSP (OpenVessel `docs/reference/deployment.md` §"The runtime CSP") is:

```text
default-src 'self';
script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval' blob: data:;
connect-src 'self' data: blob:;
worker-src 'self' blob:;
img-src 'self' data: blob:;
style-src 'self' 'unsafe-inline';
frame-ancestors <host origin>
```

`connect-src 'self'` is the point of it: the user's processes may not `fetch` or open a `WebSocket` anywhere but the runtime origin, so the only egress is `/__ov/net`, which the runtime SW checks against the network policy. Without the CSP, that confinement is gone (the runtime SW only intercepts same-origin paths — `if (url.origin !== sw.location.origin || !url.pathname.startsWith(SCOPE)) return;` in `src/runtime/sw.ts` — so cross-origin egress is *not* mediated by the SW and is only prevented by the CSP).

The CSP must **not** be applied to `sw.js`: "A service worker's own `fetch()` is governed by the CSP delivered with the worker script. The runtime service worker is the outbound proxy… With `connect-src 'self'` on `sw.js` every allowed request would fail. `scripts/serve.mjs` drops the CSP for `/sw.js` only."

Because the site currently sets **no** CSP at all, the safe rule set is:

* do **not** add a site-wide CSP that would also land on `/ov/runtime/**` and break the SW egress;
* add the runtime CSP on the runtime's document/worker entry points, which are a short, fixed list: `/ov/runtime/runtime.html`, `/ov/runtime/kernel.js`, `/ov/runtime/process.js`, `/ov/runtime/node-process.js` (plus `ts-strip.js`/`nodelib.js`/`amaro.js`, which are imported modules and only matter for `script-src`), and **not** `/ov/runtime/sw.js`.

Enumerating the entry points works on all three hosts and avoids the "exclude one file from a path rule" problem that Netlify's header syntax cannot express (see §5.2). OpenVessel's own checklist only requires the CSP "on every runtime file except `sw.js`", so this subset satisfies it for the documents and workers that actually execute code.

### 3.3 Two ways to get the per-path values wrong

* **Overriding a catch-all is not safe.** Cloudflare Pages: "An incoming request which matches multiple rules' URL patterns will inherit all rules' headers" and "If a header is applied twice in the `_headers` file, the values are joined with a comma separator." A `/*` rule with `COEP: require-corp` plus a `/ov/preview/__ov-sw.js` rule with `COEP: credentialless` therefore yields `Cross-Origin-Embedder-Policy: require-corp, credentialless`, and the HTML spec is explicit that this **fails open to `unsafe-none`**: "The processing model fails open (by defaulting to 'unsafe-none') in the presence of a header that cannot be parsed as a token. This includes inadvertent lists created by combining multiple instances of the `Cross-Origin-Embedder-Policy` header present in a given response" (HTML §7.1.4.1). The site would silently stop being cross-origin isolated and `boot()` would reject. The same failure mode applies to any host that merges duplicate header values.
  * Netlify and Vercel do **not** document how two matching rules setting the same header behave — see §6 (unverified). Until that is verified, express the per-path values so that the catch-all does **not** also match: on Cloudflare Pages use the documented detach syntax (`! Cross-Origin-Embedder-Policy` in the more specific rule) or scope the catch-all so it does not cover the two paths.
* **`credentialless` on `__ov-sw.js` cannot be applied by the SW itself** (see §3.2a): the SW only adds *missing* headers.

---

## 4. Service worker scope interactions

Registered scopes in the decided topology:

| SW | Script | Scope |
|---|---|---|
| site SW (optional) | `/coi-sw.js` or whatever the site uses | `/` (or `/<repo>/`) |
| runtime SW | `/ov/runtime/sw.js` | `/ov/runtime/` (`scope: './'` relative to `runtime.html`) |
| preview SW | `/ov/preview/__ov-sw.js` | `/ov/preview/` (`scope: '../'` relative to `__ov/relay.html`) |

### 4.1 Does a site SW conflict with the OpenVessel workers?

**No scope conflict** — the two OpenVessel scopes are strictly narrower than the site scope, and a document is controlled by the registration with the **longest matching scope** ("Set matchingScopeString to the longest value in scopeStringSet which the value of clientURLString starts with" — Service Workers spec, "Match Service Worker Registration"). Once the runtime SW is installed, requests under `/ov/runtime/` are handled by the runtime SW, not by the site SW.

**But there are three concrete interactions:**

1. **Registration order for the first load.** The OpenVessel workers only control documents loaded *after* they are installed. On a first visit, the site's own SW (if any) is the one that could add headers to the first `runtime.html` / `relay.html` loads — this is exactly the role of `coi-sw.js`. Without a site SW, the first loads happen with whatever the server sent (fine on the three header-capable targets).
2. **`clients.claim()`.** `claim()` is a no-op for clients that are matched by a *different* (longer) registration: "Let registration be the result of running Match Service Worker Registration given storage key and client's creation URL. If registration is not the service worker's containing service worker registration, continue." (Service Workers spec §4.3.4). Consequences:
   * the runtime SW's `claim()` does **not** steal the host page (the page is outside `/ov/runtime/`), so the host page stays controlled by the site SW — good;
   * the site SW's `claim()` will **not** take the runtime frame once the runtime SW is registered for `/ov/runtime/` (the runtime frame's creation URL matches the longer scope), so the site SW cannot re-add its headers to runtime files after the runtime SW is active. The runtime SW adds the same isolation headers itself, so the result is equivalent;
   * both OpenVessel workers `skipWaiting()` on install, so an updated worker takes over immediately — the recommended upgrade path is unchanged.
3. **Same scope ⇒ replacement.** A site SW registered at scope `/` and a `coi-sw.js` registered at scope `/` are the same registration: "A service worker registration of an identical scope url when one already exists in the user agent causes the existing service worker registration to be replaced" (Service Workers spec §2.3). A TutorialKit site that ships its own root-scope SW **cannot also** ship `coi-sw.js`; it must implement the header injection inside its own worker, or skip the fallback.

### 4.2 A site SW that caches HTML without isolation headers

If a site's SW caches the HTML of `/ov/runtime/runtime.html` or `/ov/preview/__ov/relay.html` (a plausible PWA "precache everything" implementation) and replays it *without* the isolation headers, the runtime/preview frames lose isolation. Note that OpenVessel's own workers only add headers to responses they construct from the network (`withIsolation()` → `fetch(req)` → add missing headers), so a cached copy served by the *site* SW is not repaired by them unless the site SW itself adds the headers. This is the concrete "interaction with the site's own assets" cost of the fallback.

---

## 5. Gotchas a static host would trip on

### 5.1 MIME types

OpenVessel's table (`docs/reference/deployment.md` §"MIME types"):

| Extension | Type | Note |
|---|---|---|
| `.html` | `text/html; charset=utf-8` | |
| `.js` | `text/javascript; charset=utf-8` | **required**: "module workers, `import`, and service worker scripts are refused with a non-JavaScript type" |
| `.json` | `application/json` | `compat/index.json`, source maps |
| `.map` | `application/json` | |
| `.tgz` | `application/gzip` or `application/octet-stream` | read with `fetch().arrayBuffer()`; the type is not checked |
| `.txt` | `text/plain; charset=utf-8` | license files |

* **`dist/` contains no `.wasm`, `.mjs` or `.node` files.** `scripts/build.mjs` emits only `.js`, `.html`, `.json`, `.tgz`, `.txt` and `.map`; WebAssembly is embedded in JavaScript (`amaro.js`) or inside compat tarballs. `.mjs`/`.node`/`.wasm` only appear if a tutorial ships its own files — then `.wasm` must be served as `application/wasm`.
* Cloudflare Pages adds `X-Content-Type-Options: nosniff` by default → a wrong MIME is a hard failure, not a soft one.
* The per-extension tables of Cloudflare Pages, Netlify and Vercel are **not** published in their docs (GitHub Pages documents mime-db; the others do not) → **unverified**: confirm with `curl -I https://<site>/ov/runtime/sw.js` (and `kernel.js`, `compat/index.json`, `compat/*.tgz`) on a preview deployment.

### 5.2 Path rules, rewriting and "one file must not match"

* **Cloudflare Pages** — `_headers` supports the detach syntax: "You may also remove a default header or a header which has been added by a more pervasive rule. This can be done by prepending the header name with an exclamation mark", which is the documented way to give `/ov/preview/__ov-sw.js` a different COEP than `/*`.
* **Vercel** — `headers[].source` uses the same path-matching syntax as `redirects`/`rewrites`, including custom patterns with a negative lookahead, e.g. `"/:path((?!uk/).*)"` (documented in the `redirects`/`rewrites` sections of the `vercel.json` page) → a rule such as `"/ov/runtime/:path((?!sw\\.js).*)"` can exclude `sw.js`.
* **Netlify** — the header path syntax supports wildcards and placeholders only ("Wildcards (`*`) can be used at any place inside of a path segment… Placeholders (`:placeholders`) can only be used at the start of a path segment"); **no** negation and **no** documented detach syntax. Two consequences: (i) a rule that must exclude one file cannot be expressed — hence the recommendation in §3.2b to enumerate the runtime entry points instead of using `/ov/runtime/*`; (ii) the behaviour when two rules match the same path and set the same header is **unverified** (see §6).
* **Rewrites** — none of the three rewrites real files: Cloudflare Pages' SPA fallback applies only "for any incoming path that does not correspond to a static asset"; Netlify does not shadow existing files by default ("the path /partials/chat.html would still render the contents of that file"); Vercel gives the filesystem precedence ("precedence is given to the filesystem prior to rewrites being applied"). A *proxy* rewrite or a catch-all `/*` → `/index.html` 200 rule on a host configured with `!` shadowing would break `/ov/**`.
* **Real paths are mandatory.** The runtime SW strips its scope (and the kernel prefix) from request paths before matching `/__ov/…` (`src/runtime/sw.ts`, `SCOPE`/`NS`; OpenVessel §"Serving under a path"): the files must exist at `/ov/runtime/…` for the virtual `/ov/runtime/__ov/k/<id>/…` URLs to resolve. The preview SW maps the scope ↔ server path and rewrites root-relative `src`/`href`/`action`/`poster`/`formaction`/`srcset` and `Location` headers, inserts an import map `{"imports": {"/": "<scope>", "<scope>": "<scope>"}}` and wraps `fetch()`/`XMLHttpRequest.open` (`src/preview/sw.ts`, `src/preview/inject.ts`). URLs built in other ways (`new URL('/x', location.href)`, CSS `url(/…)`) are **not** rewritten — a known limitation of any preview served under a path, independent of the host.

### 5.3 `.nojekyll` (GitHub Pages)

GitHub Pages runs Jekyll over the published branch by default, and Jekyll ignores files and directories whose names begin with `_`. The OpenVessel preview directory contains `__ov/` (`__ov/relay.html`, `__ov/relay.js`, `__ov/inject.js`) — exactly the pattern Jekyll drops. The documented fix is "disable the Jekyll build process by creating an empty file called `.nojekyll` in the root of your publishing source" ([creating-a-github-pages-site](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site)); `openvessel-demo`'s `build.mjs` writes it for the same reason. A TutorialKit site deployed to GitHub Pages must do the same.

### 5.4 Cache headers

| Files | Advice | Why |
|---|---|---|
| `/ov/runtime/chunks/*-<hash>.js` | long-lived, `immutable` | the name changes with the content |
| `/ov/runtime/compat/<id>-<version>.tgz` | long-lived | versioned name; integrity-checked against `compat/index.json` anyway |
| `/ov/runtime/sw.js`, `/ov/preview/__ov-sw.js` | `no-cache` | "service worker updates must be seen"; the runtime registers with `updateViaCache: 'none'` |
| everything else (`runtime.html`, `runtime.js`, `kernel.js`, `process.js`, `node-process.js`, `nodelib.js`, `amaro.js`, `ts-strip.js`, `compat/index.json`, `__ov/*`) | `no-cache` (revalidate with `ETag`/`Last-Modified`) | fixed names whose content changes between releases |

Source: OpenVessel `docs/reference/deployment.md` §"Caching".

`updateViaCache: 'none'` only bypasses the **browser** HTTP cache: the Service Workers spec makes the script request use cache mode `no-cache` "if … registration's update via cache mode is not 'all'", and notes that "even if the cache mode is not set to 'no-cache', the user agent obeys the Cache-Control header's max-age value in the network layer" — i.e. a CDN with a long `max-age` on `sw.js` can still serve a stale worker script. The `no-cache` advice therefore has to be applied at the CDN, not only to the browser.

Cloudflare Pages notes that the CDN caches assets and adds an `Etag` for `200` responses, and that Pages' asset retention is one week — so the "revalidate" advice is the right default for the non-hashed runtime files.

### 5.5 Asset size

The largest shipped files are `nodelib.js` (≈ 6.6 MB, the Node.js library as strings) and `amaro.js` (≈ 3.8 MB, the swc-based TypeScript stripper with the wasm embedded). Cloudflare Pages' limit is 25 MiB per asset, so both fit. Netlify's and Vercel's per-file limits are **unverified** (see §6).

### 5.6 What the runtime's service worker expects

* the whole `dist/runtime/` directory must be deployed, "including `chunks/`, `compat/`, `nodelib.js`, `amaro.js`, `ts-strip.js` and the license files" (OpenVessel checklist);
* `runtimeUrl` and `previewUrl` must end in `/` (or `runtimeUrl` is the `runtime.html` URL): "`runtimeUrl` is resolved with `new URL('runtime.html', runtimeUrl)` and `previewUrl` with `new URL('./', previewUrl)`… A URL without a trailing slash therefore points at its parent directory";
* `runtime.html`'s `<meta name="openvessel-allowed-hosts">` defaults to `*`; the runtime also checks `location.ancestorOrigins` (the runtime must be embedded directly by the host page) and the CSP `frame-ancestors`. On a one-origin deployment these should name the site's own origin;
* `/etc/openvessel/node` must not be set to `legacy` unless the legacy runtime is wanted (OpenVessel checklist).

---

## 6. Unverified items and how to verify them

| # | Claim | Status | How to verify |
|---|---|---|---|
| 1 | Cloudflare Pages, Netlify and Vercel serve `.js` as a JavaScript MIME type, `.json` as `application/json`, `.tgz` as `application/gzip`/`application/octet-stream` | unverified (the providers do not publish per-extension tables; only GitHub Pages documents mime-db) | `curl -I` each of `/ov/runtime/sw.js`, `/ov/runtime/kernel.js`, `/ov/runtime/compat/index.json`, `/ov/runtime/compat/<id>-<version>.tgz` on a preview deployment |
| 2 | Netlify / Vercel: when two matching header rules set the same header, which value wins (and are duplicate values comma-joined?) | unverified (not documented) | deploy a `_headers`/`vercel.json` with `/*` and `/ov/preview/__ov-sw.js` rules and inspect `curl -I`; also check the browser console for a COEP parsing error |
| 3 | Netlify per-file size limit; Vercel per-file / deployment size limits | unverified | Netlify: <https://docs.netlify.com/build/configure-builds/>; Vercel: <https://vercel.com/docs/limits> |
| 4 | The site's Astro build must copy `dist/runtime` and `dist/preview` into the site output at `/ov/runtime/` and `/ov/preview/` (decided topology) | decided, not implemented in this repo | `packages/astro/src/index.ts` (the integration's `astro:build:done` hook) |
| 5 | Chromium honours the *child's* response COEP for a same-origin iframe (so the preview's `credentialless` survives a `require-corp` host page) | supported by the HTML spec (§7.1.7 "To determine navigation params policy container", §7.1.4.2) but not verified in a browser here | load a page with `COEP: require-corp` embedding a same-origin iframe whose response carries `COEP: credentialless`, and check `document.featurePolicy`/the absence of a "cross-origin embedder policy inheritance violation" report |
| 6 | Whether a browser reports a COEP inheritance violation for the preview iframe | unverified | same test as above, with a `report-to` endpoint configured |

---

## 7. Conclusions and recommendations

1. **All three documented targets (Cloudflare Pages, Netlify, Vercel) can host the one-origin topology.** They can set the headers, they serve `/ov/**` at their real paths with the right MIME types, and they register both OpenVessel service workers at the required scopes without `Service-Worker-Allowed`.
2. **The existing catch-all COOP/COEP rules already isolate the runtime and the preview.** No per-path isolation headers are needed for `runtime.html`, the workers or the preview documents; the same-origin responses inherit `COOP: same-origin` + `COEP: require-corp`.
3. **Two per-path rules are still required**, and they must not be expressed as an override of the catch-all:
   * `/ov/preview/__ov-sw.js` → `Cross-Origin-Embedder-Policy: credentialless` (the preview SW proxies third-party `no-cors` loads with its own `fetch()`, which the site's `require-corp` would block, and the SW cannot repair a header the server already sent);
   * the runtime CSP on `/ov/runtime/runtime.html`, `/ov/runtime/kernel.js`, `/ov/runtime/process.js`, `/ov/runtime/node-process.js` — and **not** on `/ov/runtime/sw.js`, whose egress the CSP would break.
4. **GitHub Pages is possible only through the `coi-sw.js` fallback**, which costs an extra reload (two in the worst case), adds `Cross-Origin-Resource-Policy: cross-origin` to every site response, cannot supply the runtime CSP or `frame-ancestors`, and replaces any other root-scope service worker the site may already have. It must be scoped to the site directory (root, or `/<repo>/` on a project site) and it must be installed *before* the first `runtime.html`/`relay.html` load is useful.
5. **The residual risk is not the hosting, it is the topology.** With one origin, the preview is same-origin with the host page, so the preview's code can reach the host's DOM, cookies and storage; OpenVessel's `SECURITY.md` requires three origins for exactly this reason and calls the one-origin setup demo-only. Every host can technically deliver the one-origin topology; the question of whether it should is a separate, already-decided ticket.
6. **TutorialKit's own deployment assets will need to grow** (research only — nothing changed here): `packages/cli/src/commands/create/hosting-config/*` and `docs/tutorialkit.dev/src/content/docs/guides/deployment.mdx` currently emit only the catch-all rule; the site build has to place `dist/runtime` and `dist/preview` at `/ov/runtime/` and `/ov/preview/`, and the docs should document the two per-path rules and the `coi-sw.js` fallback for header-less hosts.
