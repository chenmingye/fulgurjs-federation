# API reference (English)

> For 5.9.0. Start with the [usage guide](../README.en.md). This reference preserves signatures, defaults and lifecycle rules; integration fragments may use application-owned objects. Complete runnable projects are in [examples](../examples/README.en.md). Only import public entries; `/internal/*` is implementation detail.

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

<a id="pages"></a>

#### `createReactHostPages(options)` → `{ pages, resolve(path), component(spec) }`

- Data options (identical to Vue): `pages`, `remotePrefixes`, `deriveSpec`, `schema`, `strict`, `base`
- Display options (same semantics as `remoteComponent`): `fallback`, `error`, `retries`, `timeout`; plus `beforeLoad: () => void | Promise<void>` — runs before **every actual load attempt** (including retries) so the host can refresh context; never at table creation
- `component<P>(spec)` returns a React component type; the component cache is keyed by spec + login generation (rebuilt only on a new non-empty `sessionKey`; logout → `undefined` does not rebuild). Module-level caching of `component(spec)` results is supported — mounted pages still follow session changes
- No `keepAliveNames` / no keep-alive promise (Vue-specific); routing is not a runtime dependency — render `component(spec)` output from your router (React Router examples in `examples/templates/react-react/host`; route params reach remote pages as props)
- Cross-framework Context: host and remote get the **same Context object** through the same expose instance; the plugin does not auto-bridge arbitrary React Contexts

### Async shared decisions and React version isolation (5.7.1)

HTML entries configured with `runtimePlugins` negotiate and load shared dependencies before dynamically executing the application. Remote containers prepare shared decisions before executing exposes. Sync facades reuse the same decision and instance, including async hooks selecting a lower version or an external entry. Vite 8 consumer facades remain synchronous; the bootstrap boundary keeps negotiation waits out of consumer dependency cycles.

Library/custom entries without HTML, and policies registered after application startup, must `await loadShare(name, opts)` before dynamically importing new consumers. Existing evaluated static bindings cannot be changed retroactively. An unprepared synchronous consumer still reports MFU-004 with `details.syncUnsupported`; late hook rejections are handled rather than becoming additional unhandled rejections. Local singleton adoption records the instance under its actual version, preserving strict version rejection. To run React 18 and 19 together, isolate React and its renderer in separate share scopes and bridge plain props/callbacks, not React elements or Context objects. See [the runnable version isolation demo](https://github.com/chenmingye/fulgurjs-federation/blob/master/examples/demos/react-versions/README.md).

<a id="runtime"></a>

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

<a id="plugin-options"></a>


#### Other exported common helpers

Import from `/runtime` in Vue or `/react` in React. Apart from page validation, these are advanced tools rather than required setup.

| Name | Signature / value | Purpose |
|---|---|---|
| `getLoadedShare` | `(name: string, opts?: LoadShareOptions) => any` | Read an already-ready instance synchronously without fetching. Undefined on a miss; strict conflicts can throw. With a resolveShare policy, reuse only an existing decision |
| `pinLoadedShare` | `(name, opts: LoadShareOptions, localVersion: string, instance: unknown) => void` | Register an existing local instance with version/first-instance/concurrency protection; not an override mechanism |
| `parseSpec` | `(spec: string) => { remote: string; module: string }` | Split a remote spec; normalize the module part to `./X`, or empty for a bare remote |
| `shareScopeMap` | `ShareScopeMap` | Dependency registry for diagnostics; ordinary business code should not mutate it |
| `clearSessionState` | `() => void` | Invalidate onSession signals/dedup, not the account context. Normal logout calls clearAppContext, which also performs this cleanup |
| `validatePages` | `(pages: PageRouteLike[], options?: PagesOptions) => PageViolation[]` | Return R1–R5 page violations without throwing for them |

### 8.3 Plugin options — `federation(options)`

| Option | Type / default | Notes |
|---|---|---|
| `name` | `string`, **required** | container name; unique per page; `/^[a-zA-Z][\w.-]*$/` |
| `exposes` | `Record<string, string \| { import, name? }>` | key normalized to `./Key`; stable chunk name optional |
| `remotes` | `Record<string, string \| RemoteEntryConfig \| (() => Promise<any>)>` | string = url or `name@url`; object = `{ external?, dev?, prod?, timeout?, retries?, fallback?, breaker?, shareScope? }`; function = promise-based remote (runtime-register instead) |
| `shared` | `string[]` or `Record<string, string \| SharedHint>` | see below |
| `setup` | `string` | module path; must default-export `setup(context)`, optional named `onSession(context)` |
| `shareScope` | `string`, default `'default'` | default scope for provides |
| `runtime` | `string \| false`, default built-in runtime | Custom runtime module path; false disables the built-in runtime |
| `runtimeChunk` | `boolean \| 'single'`, no explicit default | Request a separate runtime chunk |
| `filename` | `string`, default `'fulgurjs-remoteEntry.js'` | fixed remoteEntry filename |
| `manifest` | `boolean \| Record<string, unknown>`, default `true` | false disables; other values enable output. Object form has no additional option fields |
| `dts` | `boolean \| { dir?, mode?: 'source' \| 'shim' }`, default `true` | dev type generation (see §8.6) |
| `devSharedSelf` | `boolean`, default inferred | pure remotes & dual-role apps: `true` (dev shared rewriting); pure hosts: `false`. In production builds, shared package bodies (with their static closure) are isolated into `fulgurjs-provider-<key>` groups (since 5.8.0, taking precedence over user `manualChunks` groups — prevents self-waiting cycles and cross-chunk TDZ), so **your own `manualChunks` rules can stay as-is** |
| `devCorsOrigins` | `'*'` or `string[]`, default `'*'` | dev endpoints + server.cors share the policy; explicit user `server.cors` wins |
| `devFsRoot` | `boolean`, default `true` | dev manifest carries local fsRoot for type direct-connect; `false` → host falls back to `any` stubs |
| `runtimePlugins` | `string[]`, default `[]` | modules default-exporting a `RuntimePlugin` |

`SharedHint` fields: `import` (local specifier or `false` = pure consumer), `packageName` (infer `requiredVersion` from a different package name), `requiredVersion` (semver or `false`), `singleton`, `strictVersion` (default: `true` when a local fallback exists and not singleton, webpack-aligned), `shareKey`, `shareScope`, `eager`, `version`. Import defaults to the config key; requiredVersion is inferred from package.json; singleton/eager default false; strictVersion defaults true with local fallback and non-singleton, otherwise false. shareKey defaults to the config key; shareScope inherits the plugin scope; version is read from the installed package when not specified.

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

<a id="context"></a>

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

<a id="bridge"></a>

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

<a id="url-sync"></a>

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

## 8.9 CLI commands

| Command | Purpose |
|---|---|
| `fulgurjs create [--list]` | **Full-project wizard (new projects)**: copies a complete template workspace (lockfile + startup script included) from the installed npm package and runs `pnpm install --frozen-lockfile` by default. Interactive on a TTY; non-interactive form: `fulgurjs create <template> [--dir <path>] [--no-install] [--force] [--json]` with templates `vue-vue` / `react-react` / `vue-host-react-remote` / `react-host-vue-remote` / `showcase`. Refuses a non-empty target unless `--force` (merge mode: only fills in missing files; same-name conflicts are listed one by one and your files are kept verbatim — never overwritten or deleted). A target path that is a file, a mid-copy failure, or an install failure all exit non-zero and keep the generated project for inspection. With `--json`, stdout carries only the final result JSON while progress and install logs go to stderr. Does not rename apps/ports (four-place checklist in the template README) |
| `fulgurjs init [--template <path>] [--force]` | Writes a single-project `fulgurjs.config.ts` starter (default export = `federation()` options) for an **existing** project; `--template` is the output file path, not a template id. Refuses to overwrite unless `--force` |
| `fulgurjs init --config <path>` | Validates a config (CFG three-part errors) and prints the `federation(fulgurjsConfig)` wiring snippet plus checklist |
| `fulgurjs explain [--config <path>] [--json]` | Explains the effective federation shape (role, remotes, exposes, setup, shared, page mapping, `devSharedSelf`, load chain) purely offline; adds bridge-completeness WARNs (`./bridge` sub-apps must singleton their own framework — React needs react+react-dom; hosts sharing both vue and react need all three keys singleton). No new error codes |
| `fulgurjs check-pages [--config <path>] [--site <URL>] [--manifest <r>=<p\|URL>]... [--require-verified] [--json]` | Compares the host page table with remote manifests. Manifest source priority: `--manifest` > `--site`/prod derivation; explicit sources never fall back. Deterministic errors exit 1; unreachable remotes report "unverified" (non-zero only with `--require-verified`) |
| `fulgurjs doctor --base <URL> --apps <a,b,c> [--dev] [--json] [--chunk-sample N]` | Deployment check of `<base>/<app>/` (`--apps` are **deployment subdirectories**, not container names): remoteEntry/manifest/index.html 200 + no-cache + JS shape, CORS, chunk sampling, shared-version skew rehearsal. Exit 1 on any FAIL |

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

<a id="error-codes"></a>

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

