# @fulgurjs/federation

[简体中文](./README.md) | English

> **fulgurjs** — Latin for "lightning · flash of light".
> A Vite plugin that makes Module Federation work out of the box: **one config shape per project, separate dev & prod engines, semantics aligned with webpack Module Federation**, with first-class browser support for both Vue 3 and React 18/19.

![tests](https://img.shields.io/badge/tests-460%20%2B%20e2e-green) ![runtime](https://img.shields.io/badge/runtime%20gzip-%3C%209KB-blue) ![vite](https://img.shields.io/badge/vite-5%20%7C%206%20%7C%207%20%7C%208-purple)

---

## 1. Why

| | webpack MF | other vite MF solutions | **@fulgurjs/federation** |
|---|---|---|---|
| dev experience | separate builds required | manual bootstrap usually required | ✅ dual dev-server direct wiring, zero manual async boundaries |
| prod artifacts | ✅ | often missing or degraded | ✅ build-time rewriting, stable remoteEntry filename + manifest |
| semantic parity | 100% | incomplete (version negotiation / singleton / fault tolerance often missing) | ✅ aligned clause-by-clause with webpack semantics, e2e-verified |
| **UMD / CJS-only deps** | DIY | **commonly unusable** | ✅ automatic (dep-optimizer externalization + build-time require shims) |
| remote load failures | raw errors | usually missing | ✅ retry / circuit breaker / timeout built in + explicit `fallbackModule` degradation |
| failure recovery | reload the page | usually missing | ✅ built-in placeholders offer **Retry load** (in-page; failed URLs are varied to penetrate the browser's failed-import cache) and **Refresh page to retry** (a user-initiated full reload for failures the browser caches beyond in-page reach) |
| runtime size | ~40KB+ | varies | **gzip < 9KB** (framework-neutral core; adapters are separate) |
| misconfiguration | hard to debug | cryptic | three-part diagnostics: symptom / cause / fix |

## 2. Feature overview

- **Full exposes / remotes / shared semantics** — `name@url` syntax, key renaming, promise-based remotes, full-semver `requiredVersion`, version negotiation (highest wins), singleton / strictVersion, loaded versions are never replaced, multi-version coexistence, `shareKey` redirection, multiple share scopes
- **UMD / CJS-only deps out of the box** — element-plus, avue and other UMD/CJS-only packages simply go into `optimizeDeps.include`; in dev the plugin re-routes shared keys inside pre-bundled output to negotiation facades (esbuild path on Vite ≤ 7, rolldown plugin on Vite ≥ 8), in build CJS `require(<shared>)` calls are redirected to shims — dual-runtime immune
- **Automatic async boundaries** — top-level await injected automatically (es2022+); no webpack-style manual `import('./bootstrap')`
- **Stable artifacts** — remoteEntry keeps a fixed filename (content changes every build → **must be `no-cache`**; only content-hashed chunks may be cached long); `fulgurjs-manifest.json` asset manifest; one chunk per expose
- **Fault tolerance (webpack MF 2.0 errorLoadRemote aligned)** — retry / circuit breaker / timeout built in; `loadRemote(spec, { retries, fallbackModule })` per-call overrides; on failure the fallback module is returned and the error event is still emitted (**never silent**; without `fallbackModule` the error re-throws)
- **Real failure recovery** — Chromium/Firefox/Safari cache failed dynamic imports per URL, so re-importing the same URL rejects without hitting the network again (verified per browser in this repo's e2e; see MDN import() for the underlying semantics). After a real failure the runtime varies the URL (`fulgurjs_retry=N`) across remote-entry loading, dev container loaders and the prod remoteEntry, so "service recovered → click Retry load" genuinely re-fetches. Successful modules are never re-requested with a varied URL — module identity and singletons are preserved; concurrent failures advance exactly one retry generation (no module-instance split); repeated access to loaded modules issues zero extra requests. **Known boundary**: a failed **static dependency** chunk of an expose cannot recover in-page (the browser caches the dependency URL's failure). The built-in placeholder therefore also offers **Refresh page to retry** — a user-initiated full reload that keeps the current URL (never automatic, no reload loops) — and that is the supported recovery path for this case; the plugin deliberately does not rewrite the whole site dependency graph to work around it
- **Enhancements** — dev type generation (dual-track, see §8.6), manifest-driven `preloadRemote()`, runtime plugin hooks (`beforeLoadRemote` / `afterLoadRemote` / `onRemoteError` / `resolveShare`)
- **Full HMR chain** — remote edits propagate to the host page: component hot swap, state retention, error overlay and recovery
- **Zero-silent-failure discipline** — config problems fail at startup with three-part diagnostics; federation failures throw explicitly (error code + actionable fix); no silent fallback paths
- **CLI** — `fulgurjs init` / `explain` / `check-pages` / `doctor` (see §7)
- **Optional remote init lifecycle** — `federation({ setup })`: `setup(context)` runs once per app, `onSession(context)` runs once per host `sessionKey`; failures are explicit and retryable
- **Host page adapter** — one page table shared by routing and layout: URL resolution, longest-prefix remote attribution, R1–R5 validation, component cache keyed by login generation, skeleton/error placeholders, keep-alive names (Vue only)
- **Cross-app context** — `provideAppContext` / `getAppContext` / `requireAppContext` / `clearAppContext`; transport snapshot + function references (not reactive); account switching carried by `onSession` without page reloads
- **Vue direct rendering** — `remoteComponent('remote/X')` on the runtime entry: `defineAsyncComponent + loadRemote` wrapper with explicit error placeholder; runtime core stays framework-free
- **Full React support (browser)** — dedicated `@fulgurjs/federation/react` entry: `remoteComponent`, `useLoadRemote`, `RemoteErrorBoundary`, `createReactHostPages`; shared `react`/`react-dom` singletons with hooks/StrictMode/Context verified single-instance; mounted components follow `sessionKey` changes without remounting; pure-React projects install zero Vue, pure-Vue projects install zero React
- **CSP friendly** — no `eval` / `new Function` anywhere in loading paths
- **Error-code system (44 codes)** — CFG / DEV / BLD / MFU / CC segments, drift-checked against the code registry (see §11)

## 3. Installation & requirements

```bash
pnpm add -D @fulgurjs/federation
```

- Vite ≥ 5.1 (tested through 8.x)
- Node ≥ 18
- Vue ≥ 3.2.0 and/or React `>=18.0.0 <20` — all three are **optional peers**; install only the framework you use
- Chrome 108+ (native top-level await)

> Vite 8 (rolldown): as of 5.3.3, dev, production builds and production page mounting all pass full acceptance (bidirectional bridge 11-step interaction matrix, see the acceptance report). **5.4.2 boundary note**: in production builds of large apps (e.g. JeecgBoot v3.9.5), the plugin's TLA share facades joining chunk merging can trigger a rolldown codegen bug that merges the app's own async initialization into a sync lazy init and drops the `async` marker (`SyntaxError: Unexpected reserved word`; minify/target/manualChunks variants and a bare-baseline comparison have ruled out other variables) — build such apps for production with Vite 5–7; dev is unaffected. The first page open on a cold dev cache still falls inside the dependency pre-bundling window (DEV-010; it self-recovers via reload). Warm up before acceptance runs or manual judgement, as documented.

`@fulgurjs/federation/runtime` and `@fulgurjs/federation/react` are **ESM-only** browser entries (no `require()`). The build-time main entry supports both ESM and CJS.

## 4. Project shape: two files per app

Every app root owns one `fulgurjs.config.ts` whose **default export is the federation options object itself**; `vite.config.ts` wires it once:

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'            // or @vitejs/plugin-vue
import federation from '@fulgurjs/federation'
import fulgurjsConfig from './fulgurjs.config.ts'

export default defineConfig({ plugins: [react(), federation(fulgurjsConfig)] })
```

An optional named export `hostPages = { pages, remotePrefixes }` is read by the CLI only; the same pure-data module feeds the browser adapter. Page-data modules must stay pure data (no framework/router/browser imports) so the CLI can evaluate them.

Removed in 5.0.0 and not coming back: the aggregate config chain (`root` + `apps[]`, the `/config` entry, `loadRepoConfig`, `federationOptionsForApp`, CLI `--app`), and the no-op options `remoteType`, `library`, `automaticAsyncBoundary`, `dataPrefetch`, `usedExports`, `ignoreUnusedSharedExports` — any of these now fail with `CFG-011` plus migration hints.

## 5. Quick start — React

```ts
// remote: fulgurjs.config.ts
import type { FederationOptions } from '@fulgurjs/federation'

export default {
  name: 'remote-react',
  exposes: {
    './Button': './src/Button.tsx',
    './utils': './src/utils.ts',
    './pages/home': './src/pages/Home.tsx',
  },
  shared: {
    react: { singleton: true },
    'react-dom': { singleton: true },
  },
} satisfies FederationOptions
```

Host consumption — one import point, three usage shapes:

```tsx
import { remoteComponent, useLoadRemote, createReactHostPages, remoteSchema } from '@fulgurjs/federation/react'
import { pages, remotePrefixes } from './src/federation/pages.data'

// ① Component — create the factory at module top level (never inside render).
//    Loading starts on first render. retry rebuilds the load attempt.
const RemoteButton = remoteComponent<{ label: string; onClick?: () => void }>('remote-react/Button', {
  fallback: <p>Loading remote button…</p>,
})

// ② Plain module — generation-guarded hook
type Utils = { formatMoney(v: number, currency?: string): string }

// ③ Page table — same verb as Vue; render the component from your router
const hp = createReactHostPages({ pages, remotePrefixes, schema: remoteSchema })
const RemoteHome = hp.component('remote-react/pages/home')
```

**Data flow for host state (context):** the host provides context (`provideAppContext`, including a non-sensitive `sessionKey`) and then triggers its own re-render (React state / router). Mounted remote components and hooks observe the new `sessionKey` on that render and re-run their load lifecycle — A→B account switching works on the same mounted instance without remounting. `AppContext` is a plain snapshot: the plugin does not subscribe to it reactively; the host must trigger the render. `beforeLoad` (page tables) runs before every actual load attempt to refresh context. Logout: call `clearAppContext()` before unmounting authed UI.

Runnable examples: [`examples/vue/{host,remote}`](./examples) and [`examples/react/{host,remote}`](./examples) — four complete copy-and-run projects installed from the npm registry (see the examples entry page). In-repo e2e fixtures: `fixtures/host-react` / `fixtures/remote-react`.

## 6. Quick start — Vue

Three integration paths (plain module / multi-page `createHostPages` / `setup` + `AppContext`) are documented in the Chinese README §快速开始；the API is identical to the tables below, imported from `@fulgurjs/federation/runtime`. The Vue-specific extras are `createHostPages` (with `keepAliveNames`) and the Vue `remoteComponent` options (`loadingComponent` / `errorComponent` / `delay`).

Cross-framework **plain TS modules** work in both directions (a Vue host can load a React remote's `utils` and vice versa) — direct Vue↔React component rendering in one tree is out of scope.

## 7. CLI

```bash
npx fulgurjs init        # scaffold fulgurjs.config.ts; never rewrites other files
npx fulgurjs explain     # interpret the effective federation shape + load chain
npx fulgurjs check-pages \
  --manifest remote-a=https://cdn.example.com/remote-a/fulgurjs-manifest.json \
  --require-verified     # page-table ↔ remote manifest contract check (CI gate)
npx fulgurjs doctor --site https://example.com   # deployment health check
```

`check-pages`: "confirmed missing" (error, non-zero) is distinct from "unverifiable" (source unreachable — honestly reported, non-zero with `--require-verified`); no fallback to stale local dist output.

## 8. API reference

### 8.1 `@fulgurjs/federation/react` — React entry

Re-exports the common runtime API of §8.2 **except** the Vue-only items (`remoteComponent` Vue options form, `createHostPages`, `keepAliveNames`), plus:

#### `remoteComponent<Props>(spec, options?)` → `ComponentType<Props & { ref? }>`

| Option | Type / default | Semantics |
|---|---|---|
| `fallback` | `ReactNode`, default `null` | placeholder while this load is pending (distinct from the failure placeholder) |
| `error` | `ReactNode` or `(error, retry) => ReactNode`, default built-in Chinese placeholder | shown on load failure **or** subtree render error; the function receives the real error and a working retry |
| `retries` | `number` (integer 0–10), default follows `loadRemote` (2) | passthrough; invalid values throw at factory call |
| `timeout` | `number` (ms), default none | adapter-level wait cap for this component load; does **not** cancel the issued shared request; late results never overwrite the settled state and produce no unhandled rejections |

- Factory creation and page-table declaration have **zero load side effects**; loading starts on first render via `loadRemote` (container negotiation + optional setup/onSession)
- Not built on `React.lazy`: a lazy instance caches its failed promise and an error-boundary reset alone cannot recover; this implementation's retry rebuilds the load attempt (already-cached successful modules are not re-downloaded)
- Export validation: the default export must be a function/class/`memo`/`forwardRef` component; strings/numbers/empty namespaces fail explicitly
- `ref` passthrough works for `forwardRef` exports (verified on React 18 and 19)
- Render exceptions are caught by the built-in boundary and reported separately from network/export errors; the boundary does not catch event-handler or async-callback errors (React semantics)
- **Session switching:** mounted instances read the current `AppContext.sessionKey` on every render; when the host provides new context and re-renders, the load lifecycle re-runs for the new session on the same instance (no remount, no second React). Same-session re-renders do not reload
- The built-in placeholder shows error code + real cause + fix + a working 重试 (retry) button

#### `useLoadRemote<Module>(spec, options?)` → `{ data, error, loading, reload }`

- `data: Module | undefined`, `error: unknown` (always `undefined` when no error), `loading: boolean`, `reload: () => Promise<void>`
- Options: `shareScope`, `retries`, `fallbackModule` (explicit degradation — failures return the fallback value instead of writing `error`)
- Uniform state contract: first load, spec/option/session change and explicit `reload` all enter `data=undefined, error=undefined, loading=true`; the current attempt writes `data` on success or `error` on failure and clears `loading`; stale attempts never write
- Generation guards: fast A→B switching, late slow responses, consecutive reloads, unmount-during-flight and StrictMode double effects can only write from the latest valid request
- `reload` clears old data and re-runs the lifecycle (onSession dedup by generation) but never re-downloads cached successful modules; resolves normally (failures surface in `error`, never an unhandled rejection). Unmount invalidates pending effects and reloads; calling a saved reload after unmount starts no request
- Session-aware: re-runs when `sessionKey` changes; same-session re-renders don't

#### `RemoteErrorBoundary`

Standalone page-level boundary. Props: `children`, `fallback` (node or `({ error, reset }) => ReactNode`), `onError(error, info)`, `resetKeys` (reset when any entry changes). `reset` only clears boundary state; if a child holds a failed cache (e.g. your own `React.lazy`), rebuilding the attempt is the caller's job — `remoteComponent`'s built-in retry already does both. It never sees errors already consumed by `remoteComponent`'s inner boundary.

#### `createReactHostPages(options)` → `{ pages, resolve(path), component(spec) }`

- Data options (identical to Vue): `pages`, `remotePrefixes`, `deriveSpec`, `schema`, `strict`, `base`
- Display options (same semantics as `remoteComponent`): `fallback`, `error`, `retries`, `timeout`; plus `beforeLoad: () => void | Promise<void>` — runs before **every actual load attempt** (including retries) so the host can refresh context; never at table creation
- `component<P>(spec)` returns a React component type; the component cache is keyed by spec + login generation (rebuilt only on a new non-empty `sessionKey`; logout → `undefined` does not rebuild). Module-level caching of `component(spec)` results is supported — mounted pages still follow session changes
- No `keepAliveNames` / no keep-alive promise (Vue-specific); routing is not a runtime dependency — render `component(spec)` output from your router (React Router examples in `examples/react/host`; route params reach remote pages as props)
- Cross-framework Context: host and remote get the **same Context object** through the same expose instance; the plugin does not auto-bridge arbitrary React Contexts

### 8.2 Runtime API — `@fulgurjs/federation/runtime` (Vue apps) and common functions on `/react`

| Function | Signature | Semantics |
|---|---|---|
| `loadRemote` | `<T = Record<string, any>>(spec: string, opts?: { shareScope?: string; retries?: number; fallbackModule?: () => any }) => Promise<T>` | spec = `<remote>/<expose-key-without-./>`. Goes through container negotiation and the optional setup/onSession lifecycle. Modules cached per `remote@scope#module`; failures uncached and retryable. `fallbackModule` returns your module on failure **and** still emits the error event |
| `loadShare` | `(name: string, opts?: LoadShareOptions) => Promise<any>` | shared-deps negotiation: `requiredVersion` (semver or `false`), `singleton`, `strictVersion`, `shareKey`, `shareScope`, `fallback: () => Promise<any>`. Highest satisfying version wins; loaded versions never replaced; singleton keeps one instance (warns MFU-010 when the reused version doesn't satisfy `requiredVersion`; throws MFU-003 with `strictVersion`) |
| `initSharing` | `(scopeName?: string) => ShareScopeMap` (default `'default'`) | creates/returns the share scope map (usually called for you by the injected init) |
| `registerShare` | `(scopeName, name, version, get: () => Promise<any>, opts?: { from?, eager?, loaded? }) => void` | register a provided shared module at runtime; first registration of a version wins |
| `registerRemote` / `registerRemotes` | `(config: RemoteConfig) => void` / `((list: RemoteConfig[]) => void)` | runtime registration: `{ name, entry, shareScope?, timeout?, retries?, fallback?, breaker?, promise? }`. Promise-based remotes pass `promise: () => Promise<container>` |
| `registerPlugins` | `(plugins: RuntimePlugin[]) => void` | register runtime plugins; each `init(hooks)` may set `resolveShare`, `beforeLoadRemote({ remote, module })`, `afterLoadRemote({ remote, module, module_ns })`, `onRemoteError({ remote, error })`. Observer-hook failures warn but never break loading |
| `preloadRemote` | `(spec: string, opts?: { mode?: 'preload' \| 'prefetch' }) => Promise<void>` | manifest-driven preload of entry + expose chunks + CSS; `'prefetch'` = low priority. No lifecycle side effects (setup/onSession are NOT run) |
| `getContainer` | `(name: string) => Promise<any>` | acquire the initialized container |
| `getRuntime` | `() => FgRuntime` | the page-level runtime singleton (`globalThis.__FULGURJS_RUNTIME__`) |
| `parseSpec` | `(spec: string) => { remote, module }` | synchronous spec parsing |
| `shareScopeMap` | `ShareScopeMap` | live registry (debug surface: `window.__FULGURJS_SCOPE__`) |
| `unwrapDefault` | `(ns: any) => any` | ESM/CJS default-interop helper |
| `version` | `string` | plugin/runtime version |
| `clearSessionState` | `() => void` | invalidate all remotes' session signals and onSession dedup state (called by `clearAppContext`) |

Remote-registration config fields: `timeout` (ms, default 15000 — ends the caller's wait, never cancels the issued import), `retries` (0–10, default 2), `fallback: string[]` (spare entry URLs), `breaker: { threshold, resetMs }` (default 5 / 30s).

### 8.3 Plugin options — `federation(options)`

| Option | Type / default | Notes |
|---|---|---|
| `name` | `string`, **required** | container name; unique per page; `/^[a-zA-Z][\w.-]*$/` |
| `exposes` | `Record<string, string \| { import, name? }>` | key normalized to `./Key`; stable chunk name optional |
| `remotes` | `Record<string, string \| RemoteEntryConfig \| (() => Promise<any>)>` | string = url or `name@url`; object = `{ external?, dev?, prod?, timeout?, retries?, fallback?, breaker?, shareScope? }`; function = promise-based remote (runtime-register instead) |
| `shared` | `string[]` or `Record<string, string \| SharedHint>` | see below |
| `setup` | `string` | module path; must default-export `setup(context)`, optional named `onSession(context)` |
| `shareScope` | `string`, default `'default'` | default scope for provides |
| `filename` | `string`, default `'fulgurjs-remoteEntry.js'` | fixed remoteEntry filename |
| `manifest` | `boolean`, default `true` | emit `fulgurjs-manifest.json` |
| `dts` | `boolean \| { dir?, mode?: 'source' \| 'shim' }`, default `true` | dev type generation (see §8.6) |
| `devSharedSelf` | `boolean`, default inferred | pure remotes & dual-role apps: `true` (dev shared rewriting); pure hosts: `false` |
| `devCorsOrigins` | `'*'` or `string[]` | dev endpoints + server.cors share the policy; explicit user `server.cors` wins |
| `devFsRoot` | `boolean`, default `true` | dev manifest carries local fsRoot for type direct-connect; `false` → host falls back to `any` stubs |
| `runtimePlugins` | `string[]` | modules default-exporting a `RuntimePlugin` |

`SharedHint` fields: `import` (local specifier or `false` = pure consumer), `packageName` (infer `requiredVersion` from a different package name), `requiredVersion` (semver or `false`), `singleton`, `strictVersion` (default: `true` when a local fallback exists and not singleton, webpack-aligned), `shareKey`, `shareScope`, `eager`, `version`.

### 8.4 Lifecycle — `setup` / `onSession`

```ts
// federation({ setup: './src/fulgurjs/setup.ts' })
export default async function setup(ctx: { appContext: Record<string, any>; sessionKey?: string; signal: AbortSignal }) {
  // app-level: once per app, before the first business module is returned
}
export async function onSession(ctx: { appContext: any; sessionKey: string; signal: AbortSignal }) {
  // session-level: once per host sessionKey (login generation); re-login re-runs, logout invalidates
}
```

- Failures reject the triggering `loadRemote` (MFU-011/012) and are retryable; already-succeeded stages are not re-run
- `signal` aborts on logout/session change — check `signal.aborted` before writing async results
- `preloadRemote` / `getContainer` never trigger the lifecycle
- Remote declares `onSession` → the host **must** provide a non-empty `sessionKey` (MFU-013); never use a token as sessionKey
- No-setup remotes (plain public components) load normally without any context

### 8.5 AppContext — cross-app values

- `provideAppContext(partial)` — merge-write the page-level singleton (idempotent; later writes win). Host bridge calls it after login and re-calls on account change; then triggers its own re-render
- `getAppContext()` — read the snapshot (`CC-002` if loaded outside the host federation)
- `requireAppContext(...keys)` — validated read; missing keys → `CC-001` with got/expected/example
- `clearAppContext()` — delete context + invalidate session signals/dedup (module and share caches, and completed app-level setup, are preserved). Logout must call it before unmounting authed UI
- Standard fields: `user`, `getToken()`, `store` (host pinia), `hostApp` (host Vue app), `locale`, `events`, `sessionKey` — plus arbitrary extension keys. Transport snapshot + function references; not reactive

### 8.6 Dev types (dual-track)

- Zero config: ambient declarations per expose — imports resolve, exports typed `any`; setup entry never generates declarations
- Precise track: add `"paths": { "<remote>/*": ["<typesDir>/<remote>.d/*"] }` to the app's **effective TS context** — `tsconfig.json` itself, its `extends` chain, or a referenced sub-project whose `include` covers the app source / types output dir. Standalone `tsconfig.test.json`, `tsconfig.node.json` (vite.config only) and other unrelated configs do not affect the decision; imports then resolve through forwarder modules to **source-level types** (wrong props/arguments fail compilation). Remotes covered by paths automatically skip their loose declaration to avoid shadowing

Type generation supports string or array `extends` (later entries override earlier entries) and directory `references`; inherited paths retain their declaring directory. `baseUrl` and `paths` inherit independently. If application contexts disagree on remote `paths`, the plugin keeps loose declarations and reports a diagnostic; align application mappings to enable precise types. Lifecycle errors (`MFU-012`) retain the original setup/onSession exception in `cause`.
- `devFsRoot: false` or unreachable source: degrades to resolvable `any` declarations and cleans stale precise-track files (precise → degrade → restore cycles compile cleanly)
- `dts: false` stops generation without deleting existing output; `dts.dir` relocates; `mode: 'shim'` gives loose IDE-clean placeholders
- Precise track requires the host and remote to share a filesystem (same-machine dev); verified bounds: React 18.0.0–19.x with matching @types

### 8.7 Cross-framework bridge — `/bridge` (sub-app-level Vue↔React, 5.3.0+)

**Scope**: whole-app mount/unmount embedding both ways — a Vue 3 host mounts a React 18/19 sub-app, and a React host mounts a Vue 3 sub-app. Component-level conversion, Angular, SSR/RSC, JS sandbox, CSS isolation are out of scope (§12). Sub-app internal route ↔ browser URL sync is available since 5.4.0 (§8.8).

#### Entries & import graph

```text
build        @fulgurjs/federation              -> the Vite plugin (unchanged)
Vue sub-app  @fulgurjs/federation/runtime      -> defineBridgeApp (zero React)
React sub-app @fulgurjs/federation/react       -> defineBridgeApp (zero Vue; react-dom/client loads at mount time)
bridge host  @fulgurjs/federation/bridge/vue    -> createVueBridgeApp (recommended for Vue hosts; zero React)
             @fulgurjs/federation/bridge/react  -> createReactBridgeApp (recommended for React hosts; zero Vue)
             @fulgurjs/federation/bridge        -> aggregate (kept for compatibility; dev native ESM executes both host adapters)
```

**The split entries are the recommended usage**: a Vue host that only uses `createVueBridgeApp` never executes the React host adapter — in dev native ESM and in the production bundle (asserted by e2e request graphs). The aggregate `/bridge` tree-shakes in production but has no such guarantee in dev.

**Dual-framework install contract (required)**: the bridge host installs `vue` + `react` + `react-dom` and configures all three as `singleton: true` in `shared`. Sub-apps install and share only their own framework. Pure single-framework projects are unaffected. Missing singletons is a usage violation — the plugin runs the negotiation mechanism honestly (double-instance symptoms such as Invalid hook call are documented, not intercepted).

#### Sub-app side: `defineBridgeApp` (`/runtime` and `/react`, same name)

The remote's `./bridge` expose module **default-exports** the contract object; the plugin validates that `mount`/`unmount` are functions (`MFU-015` otherwise).

```ts
// Vue sub-app src/bridge.ts
import { createApp } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { defineBridgeApp } from '@fulgurjs/federation/runtime'
export default defineBridgeApp((props) => {
  const app = createApp(App, props)
  app.use(createRouter({ history: createMemoryHistory(), routes }))
  return app
})
```

```tsx
// React sub-app src/bridge.tsx
import { MemoryRouter } from 'react-router-dom'
import { defineBridgeApp } from '@fulgurjs/federation/react'
export default defineBridgeApp((props) => <MemoryRouter><App {...props} /></MemoryRouter>)
```

Contract semantics (`BridgeApp`):
- `mount(el, props?): void | Promise<void>` — returning `void` means the first root commit completed synchronously (Vue); a Promise keeps the host pending until the first root commit completes (React uses a built-in commit probe; `root.render()` returning does **not** count as success). Failure before the first commit must throw/reject (host turns it into `MFU-016`, `details.phase: 'mount'`) after cleaning up any created root.
- `unmount(el): void` — synchronously invalidates the current generation for that container and cleans up; unknown containers are a no-op. Unmounting while pending immediately invalidates the in-flight generation: late results must not revive DOM, overwrite host state, or produce unhandled rejections. An `unmount` throw is reported as `MFU-016` (`phase: 'unmount'`); the container's cleanup state is uncertain, and the plugin **permanently blocks that container**: neither the in-page retry nor a session change will mount a new instance there (the default placeholder removes its retry button), so a full page reload is the only recovery; audit leftover resources (subscriptions/timers/global side effects) honestly.
- Contract instances are keyed **per container element**; double-mount on the same container is rejected (`MFU-016`).
- Errors inside the sub-app after the first commit belong to **the sub-app's own error boundary** — host boundaries cannot catch cross-root render errors.

#### Host side: `createVueBridgeApp` / `createReactBridgeApp`

```ts
// Vue host
import { createVueBridgeApp } from '@fulgurjs/federation/bridge/vue'
const RemoteReactApp = createVueBridgeApp('bridge-react-remote/bridge', {
  retries: 1,
  getContext: () => getLatestHostContext(), // your own synchronous pure getter
})
// <RemoteReactApp :session-key="loginKey" :app-props="{ userId, onReady }" />
```

```tsx
// React host
import { createReactBridgeApp } from '@fulgurjs/federation/bridge/react'
const RemoteVueApp = createReactBridgeApp('bridge-vue-remote/bridge', { getContext: () => getLatestHostContext() })
// <RemoteVueApp sessionKey={loginKey} appProps={{ userId, onReady }} />
```

| Item | `createVueBridgeApp` | `createReactBridgeApp` |
|---|---|---|
| Factory options | `loadingComponent?` `errorComponent?` (receives `error`; full takeover) `retries?` (0–10) `timeout?` `getContext?` | `fallback?` `error?` (node or `(error, retry) => ReactNode`) `retries?` `timeout?` `getContext?` |
| Component props | `appProps: P` + `sessionKey?: string \| null` (control prop, never mixed into business props) | same |
| Error placeholder | Chinese diagnostic (code + root cause + fix) with retry / full-reload buttons | same |

- **`appProps` snapshot**: shallow-copied top-level fields at mount time; nested objects, reactive stores and functions keep their original references. Later top-level replacements are not tracked (use `:key` / React `key` to remount). Cross-root inheritance (Vue provide/inject, Pinia, React Context, routers) does not happen — pass what is needed explicitly.
- **`getContext`**: a synchronous, side-effect-free getter called before each actual load (first load, retry, session switch). Non-object/thenable returns → `MFU-016` (`phase: 'getContext'`). The bridge validates the snapshot's `sessionKey` against the controlled value (`MFU-017` on mismatch, without writing global state), then writes `provideAppContext` itself. On generation change the bridge clears the previous account context first (zero residue).
- **Controlled `sessionKey`**: accepts `undefined` (no controlled validation) / `null` (logged out: unmount immediately, keep the container empty, stop loading) / non-empty string (login generation). Illegal values → `MFU-017`.
- **Multi-instance**: several same-spec instances coexist (per-el keying); `AppContext` is a page-level singleton — all controlled instances on a page must share the same session (`MFU-017` otherwise). React StrictMode double-effect is safe. Vue `<KeepAlive>` deactivation is **not** an unmount. Late results from invalidated generations are dropped by generation guards; a remote `onSession` must honor the existing `signal.aborted` contract.

### 8.8 Bridge URL sync — `/bridge/router/*` (sub-app internal routes ↔ browser URL, 5.4.0+)

The bridge defaults to memory routing: internal navigation does not touch the browser URL and refresh cannot restore the sub-app's internal page. URL sync makes the **host URL express the sub-app's internal location** — deep links, refresh, bookmarks, back/forward and host-menu navigation all agree. It is opt-in; **default is off** (5.3.x behavior and legacy contracts unchanged).

**Architecture**: the host router is the only writer of browser history; the sub-app uses a controlled memory router; both sides communicate over a dedicated routing channel (not appProps/Context); path/search/hash changes within an instance **do not remount the root, do not rebuild stores, do not reload the remote**.

**Host (Vue Router 4, history or hash mode)**: declare a suffix route (`/approval/:pathMatch(.*)*` — without it detail navigation unmounts the sub-app), add real guards (`beforeEach` rejecting → the channel receives `cancelled`, URL/history/sub-app position unchanged), then `createVueBridgeNavigation(router)` (Vue Router already removes its history base) and pass `routing={{ basePath: '/approval', navigation }}` to the bridge component.

**Sub-app**: declare the protocol and wire a controlled router —
Vue: `defineBridgeApp(async (props, ctx) => { const router = createRouter({ history: createMemoryHistory(), routes }); await connectVueBridgeRouter(ctx.routing!, router).ready; ... app.use(router); return app }, { routing: true })` (await ready BEFORE `app.use(router)` — the install-time initial navigation would otherwise override the deep-link location).
React: `createReactBridgeRouter(ctx.routing!, routes).element` — `createMemoryRouter`-based; `Link`/`useNavigate` work unmodified.

**Host (React Router)**: data routers only (`createBrowserRouter`/`createHashRouter` + `RouterProvider`); `createReactBridgeNavigation(router, { basename, canNavigate })`. `canNavigate` is an optional early rejection policy. The adapter also observes the real blocker: it waits for `reset()` (cancelled) or a committed navigation after `proceed()`. Resolving `router.navigate()` alone does not imply a commit. Declarative `BrowserRouter` has no cancellation semantics and is not supported. Requires react-router ≥ 6.11.

**Lifecycle and navigation**: both child connectors accept an optional third argument `{ signal?: AbortSignal }`; pass `ctx.signal` to dispose on session invalidation, or call `connection.dispose()` yourself. Push and replace retain their history action; numeric navigation delegates to the host history. Concurrent requests are serialized and superseded requests are invalidated. Navigation errors reject with MFU-033 and preserve `cause`; they are not reported as cancellation. Custom host ports receive an optional third argument `{ signal }` and must check it before asynchronous commits.

**Contract highlights**: `basePath` is a static absolute path from the host-router perspective (segment-matched; conflicting/overlapping prefixes rejected, `MFU-030`); location is compared and preserved as three raw strings (duplicate query keys, encoding, fragments survive without re-encoding); cancellation never auto-retries; session switch (`sessionKey→null`) invalidates the old channel — late navigations are rejected and never write the URL; KeepAlive-cached instances pause routing writes; enabling sync against a contract without `{ routing: true }` shows `MFU-031` instead of silently falling back to memory; escaping targets and illegal `go` arguments → `MFU-032`; redirect loops beyond 5 internal replaces → `MFU-033` with the chain attached. Router libraries are optional peers consumed only through the two opt-in entries (`/bridge/router/vue`, `/bridge/router/react`, each gated ≤ 4096B gzip); the default entries never load a router library. Not promised: SSR/RSC, cross-window, nested multi-level bridge routing proxies, TanStack Router and other libraries (extend via the `BridgeHostNavigation`/`BridgeChildRoute` ports).

## 9. Artifacts, endpoints & caching

| Artifact | Cache policy |
|---|---|
| `fulgurjs-remoteEntry.js` (fixed filename, content changes every build) | **`no-cache`** |
| content-hashed chunks / CSS | `immutable` long cache |
| `fulgurjs-manifest.json` | `no-cache` (consumed by `preloadRemote` / `check-pages` / `doctor`) |
| dev endpoints `/@fulgurjs-entry.js` / `/@fulgurjs-manifest.json` | `no-cache`, CORS per `devCorsOrigins` |

Lazy-loading measurement layers: ① nothing until first render of a remote component/page; ② container entry + shared metadata on first load; ③ the expose chunk; ④ shared-dependency bodies (negotiated, possibly already loaded). `preloadRemote(spec)` fetches ②③④ without executing lifecycle code. Verify with real network records — count URLs and transferred bytes per layer, cold cache vs revisit.

## 10. Debugging surfaces

- `window.__FULGURJS_SCOPE__` — live share-scope registry
- `window.__FULGURJS_INFO__` — per-remote status/latency/errors + `errors` log
- `DEBUG=fulgurjs:*` — controlled pipeline diagnostics (off by default)
- Runtime diagnostics are emitted in Chinese by design (language policy); codes are stable identifiers listed below

## 11. Error codes (48)

| Segment | Code | Meaning |
|---|---|---|
| CFG | `CFG-001` | name missing or invalid |
| | `CFG-002` | exposes shape invalid |
| | `CFG-003` | remotes shape invalid / illegal key characters |
| | `CFG-004` | shared shape invalid |
| | `CFG-005` | remotes key collides with a shared key |
| | `CFG-006` | island config (neither provides nor consumes) |
| | `CFG-007` | `name@` prefix misuse in object-form remotes |
| | `CFG-008` | shared illegal combo (eager+import:false / duplicate shareKey) |
| | `CFG-009` | remote runtime params invalid (timeout/retries/breaker) |
| | `CFG-010` | devCorsOrigins invalid |
| | `CFG-011` | removed no-op option (any value errors with migration hints) |
| | `CFG-012` | setup config invalid / reserved expose key squatted |
| DEV | `DEV-001` | remote dev server unreachable (manifest fetch failed) |
| | `DEV-002` | remote dev manifest empty or unrecognized |
| | `DEV-004` | known UMD-only dep missing from optimizeDeps.include |
| | `DEV-005` | remotes dev URL port not listening |
| | `DEV-006` | host/remote plugin version mismatch |
| | `DEV-009` | facade/virtual module 404 (.vite cache drift — clear and restart) |
| | `DEV-010` | dev cold-start pre-bundle window notice (transient) |
| | `DEV-011` | non-loopback host + wildcard dev CORS reminder |
| | `DEV-012` | non-loopback host + fsRoot disclosure reminder |
| BLD | `BLD-001` | expose source resolution failed |
| | `BLD-002` | build target below es2022 |
| | `BLD-003` | expose target declares required props (documented checklist) |
| | `BLD-006` | array-form output prevents automatic facade chunk isolation |
| MFU | `MFU-001` | remote container/module load failure (network / timeout / retries exhausted / breaker) |
| | `MFU-002` | remoteEntry self-reported name mismatch |
| | `MFU-003` | strictVersion requirement not satisfied |
| | `MFU-004` | shared module missing with no local fallback |
| | `MFU-005` | same container re-initialized with a different share scope |
| | `MFU-006` | requested module not exposed by the remote |
| | `MFU-007` | preload failed (non-blocking) |
| | `MFU-008` | unknown remote |
| | `MFU-009` | loaded module has no exports at all |
| | `MFU-010` | reused singleton version doesn't satisfy the consumer requirement (warn-once) |
| | `MFU-011` | setup entry export shape invalid |
| | `MFU-012` | setup/onSession threw (retryable; only the failed stage resets) |
| | `MFU-013` | onSession declared but host sessionKey missing |
| | `MFU-014` | setup/onSession synchronously re-loading the same remote (deadlock guard) |
| | `MFU-015` | bridge contract invalid (`./bridge` default export missing non-function mount/unmount; fix points to `defineBridgeApp`) |
| | `MFU-016` | bridge preparation or lifecycle failure (`details.phase` = getContext/mount/unmount; cause keeps the sub-app's original error) |
| | `MFU-017` | bridge session mismatch (controlled sessionKey vs AppContext / illegal value / page-level single-session conflict) |
| MFU | `MFU-030` | Bridge URL-sync config invalid / prefix conflict (illegal basePath: empty, root, query/hash/wildcard; overlapping active prefixes) |
| MFU | `MFU-031` | Bridge routing protocol missing / channel destroyed (sub-app not declared with `{ routing: true }`; disposed channel reused) |
| MFU | `MFU-032` | Bridge illegal navigation (target escaping its own prefix, illegal `go` argument, request on a dead channel) |
| MFU | `MFU-033` | Bridge routing preparation/sync failed (redirect limit or navigation exception, chain/cause attached; no silent fallback to memory) |
| CC | `CC-001` | AppContext required key missing (got/expected/example) |
| | `CC-002` | runtime singleton unavailable (standalone remote page) |

## 12. Boundaries (explicitly not supported)

- Support covers **browser-client** federation for Vue 3 and React 18–19. Not supported: SSR, React Server Components, Next.js full-stack, React Native, Node-side remote loading. **Cross-framework boundary (5.3.0+)**: sub-app-level embedding is supported (§8.7 `/bridge`); direct component-level Vue↔React rendering in one tree is not (that is the product of framework-conversion libraries). Pure single-framework projects keep zero cross-dependency
- **Bridge isolation boundary (declared honestly in §8.7)**: bridging isolates only the mount/unmount edge of the two component trees — no browser realm isolation. Remote global CSS, `body`/`html` styles, global variables, and DOM rendered outside the container via React Portal / Vue Teleport still affect the host; `unmount` cannot revoke CSS the browser already loaded. Sub-app internal errors do not bubble into host error boundaries (cross-root). Sub-app routing defaults to memory mode; explicit URL sync exists since 5.4.0 (§8.8) — when it is not enabled, refreshing does not restore the sub-app's internal path
- React side does not promise component keep-alive (`keepAliveNames` is Vue-only); re-opened pages still reuse downloaded modules
- Cross-origin Fast Refresh: remote React components update via the remote dev server's HMR push; after a cold start the first round often needs a host refresh — component-state retention across the federation boundary is not promised
- Not compatible with originjs `virtual:__federation__` legacy imports
- No browser DevTools extension (the `window.__FULGURJS_*` surfaces serve debugging)

## 13. Documentation & examples

- [Migration guide (Chinese)](https://github.com/chenmingye/fulgurjs-federation/blob/master/docs/迁移指南.md) — a real qiankun → federation migration (seven steps + acceptance checklist)
- [webpack MF comparison & gaps (Chinese)](https://github.com/chenmingye/fulgurjs-federation/blob/master/docs/webpack-mf-对照与缺口.md)
- [Sandbox boundary audit (Chinese)](https://github.com/chenmingye/fulgurjs-federation/blob/master/docs/沙箱边界审计.md)
- [`DESIGN.md`](https://github.com/chenmingye/fulgurjs-federation/blob/master/DESIGN.md) — architecture and alignment tables
- Examples: [`examples/vue/{host,remote}`](./examples) + [`examples/react/{host,remote}`](./examples) + [`examples/bridge/*`](./examples) — copy-and-run projects, registry-installable (see the examples entry page)

## 14. Development & testing

```bash
pnpm --dir packages/plugin install && pnpm --dir packages/plugin build
for app in fixtures/host-vue fixtures/remote-a fixtures/remote-b fixtures/remote-auto fixtures/host-auto fixtures/remote-react fixtures/host-react e2e; do pnpm --dir "$app" install; done
pnpm --dir e2e exec playwright install chromium

pnpm test:unit                                # full unit suite
pnpm test:dev                                 # Vue + React: dev and fault (four projects)
pnpm test:prod                                # Vue + React: prod (two projects), isolated NGINX; cleans up after tests
pnpm test                                    # unit + all dev/fault + all prod projects
pnpm --dir e2e exec playwright test --list     # inspect unique cases and project ownership
node e2e/scripts/pack-smoke.mjs                # local tarball consumer checks; not registry acceptance
node e2e/scripts/react-types-check.mjs        # dual-track dev types + negative matrix
node e2e/scripts/react-negative-check.mjs     # N08/N10/N11 negative checks
bash e2e/scripts/prod-setup.sh                # build all fixtures + isolated NGINX
```

CI: unit + dual typecheck + build gates (gzip, error-code consistency); e2e Vue+React suites across Vite 6.4.3 / 7.3.6 / 8.3.0; scheduled Vite 5.1 floor job; prod-e2e; tarball consumer smoke (Vue + React).

The known dual-client error-overlay case is skipped only on the reproduced Vite 5.1.4 version and reported as skipped, never passed. Other Vite 5 versions still execute it. Fixture tests do not replace final registry-package testing in a real application's development and production environments.

## License

[MIT](./LICENSE) © chenmingye (Jason)
