# API reference

> Config default values, public entries, and types are verified against the repository source and the published package declarations; for version changes see the [CHANGELOG](../../../CHANGELOG.md). Application code imports only the four public entries and never depends on `/internal/*`. Terminology: bridge = "mounting a child app into a DOM container provided by the host"; scope = "a group of shared dependencies".

## Entry overview

| Entry | Purpose | Export surface |
|---|---|---|
| `@fulgurjs/federation` (package root) | Vite config | the `federation(options)` plugin + the `FederationOptions` type (full field set in the [configuration reference](configuration.md)) |
| `@fulgurjs/federation/vue` | **The single entry for Vue apps** | full runtime + `provideAppContext`/`getAppContext`/`requireAppContext`/`clearAppContext` + `definePages`/`validatePages` + `remoteComponent` + `createHostPages` + `defineBridgeApp` + `createVueBridgeApp` + `createVueBridgeNavigation` + `connectVueBridgeRouter` + `remoteSchema` |
| `@fulgurjs/federation/react` | **The single entry for React apps** | the same full runtime + context + pages (`createReactHostPages`) + `remoteComponent`/`useLoadRemote`/`RemoteErrorBoundary` + `defineBridgeApp` + `createReactBridgeApp` + `createReactBridgeNavigation` + `createReactBridgeRouter` + `remoteSchema` |
| `@fulgurjs/federation/runtime` | **Framework-agnostic** | full runtime (loadRemote/loadShare/initSharing/registerRemotes/registerShare/registerRemote/registerPlugins/preloadRemote/getContainer/getLoadedShare/pinLoadedShare/parseSpec/getRuntime/shareScopeMap/unwrapDefault/version/clearSessionState) + context + pages (`definePages`/`validatePages`) + `remoteSchema`; zero Vue/React/router dependency |

<a id="runtime-api"></a>

## Runtime API (shared by all three entries)

Host pages and expose target files (remote pages) — **any file** statically imports directly — the plugin guarantees there is exactly one runtime instance per page (imports inside remote pages are automatically rewritten into a lazy singleton delegation):

```ts
// Vue apps from /vue, React apps from /react, framework-agnostic modules from /runtime — same names, same semantics
import { loadRemote } from '@fulgurjs/federation/runtime'
```

> You can still bypass the proxy and grab the global singleton directly (equivalent, for debugging): `(globalThis as any).__FULGURJS_RUNTIME__`.
> TS note: `/runtime`'s types ship with the package and resolve directly through the package's `exports` and `typesVersions`; no `client` type shim is needed.

### Function table

| Function | Signature | Purpose / boundary |
|---|---|---|
| `loadRemote` | `(spec: string, opts?) => Promise<module namespace>` | Loads a remote module. `spec = 'remoteName/./ExposeKey'` (`./` optional). When the remote has a `setup` configured, this is the **unified trigger** of the initialization lifecycle (after container init and before returning the module, setup/onSession run); `loadRemote('remote')` only fetches the container without running initialization. See opts below |
| `loadShare` | `(name: string, opts?) => Promise<namespace>` | Shared module negotiation (highest version wins / already-loaded first / singleton convergence). opts: `{ requiredVersion?, singleton?, strictVersion?, shareKey?, shareScope?, fallback? }` |
| `preloadRemote` | `(spec: string, opts?: { mode?: 'preload' \| 'prefetch' }) => Promise<void>` | `remote/Expose` preloads just that expose's chunk + CSS; passing only the remote name preloads all its exposes. `preload` waits for CSS load/error; `prefetch` is low-priority and returns immediately. **Only prefetches resources, never executes modules**, and does not trigger setup/onSession; failure does not block the app (`MFU-007`) |
| `getContainer` | `(name: string) => Promise<container>` | Fetches the remote container (triggers load + init), container protocol `{ name, init, get }`; **does not run setup/onSession**. Calling `container.get()` directly likewise guarantees no initialization — any load that needs the lifecycle goes through `loadRemote` |
| `registerRemote` / `registerRemotes` | `(config \| list) => void` | Registers remotes at runtime (promise remote / dynamic addresses). `RemoteConfig`: `{ name, entry, promise?, shareScope?, timeout?, retries?, fallback?, breaker? }`. Validation: `timeout` a finite positive, `retries` an integer 0..10, `breaker.threshold/resetMs` finite positives — illegal values **throw at registration time**; on duplicate registration, entry/timeout/retries/breaker refresh to the latest config while breaker counters are preserved |
| `registerShare` | `(scope, name, version, get, opts?) => void` | Manually registers a shared module (normally done automatically by the init module) |
| `initSharing` | `(scopeName?) => ShareScopeMap` | Initializes the shared scope (normally done automatically by the init module) |
| `registerPlugins` | `(plugins: RuntimePlugin[]) => void` | Registers runtime plugins (below); the boundary of changing policy after the app runs is described under "synchronous vs asynchronous arbitration" |
| `getRuntime` | `() => FgRuntime` | Returns the runtime singleton itself (the same instance as `__FULGURJS_RUNTIME__`) |
| `version` | `string` | Runtime/plugin version (for cross-origin copy consistency diagnostics, together with DEV-006) |
| `unwrapDefault` | `(ns: any) => any` | ESM/CJS default interop utility |

### `loadRemote` options

```ts
const Panel = await loadRemote('shop/Panel', {
  shareScope: 'default',       // Overrides the shareScope declared by the remote
  retries: 3,                  // Per-call override of remote.retries
  fallbackModule: () => import('./PanelFallback'),
  // Returns the fallback module on failure; the error event/console output still fires explicitly (not a silent fallback); without it, the error throws
})
```

The `consumerApp` option is passed automatically by framework adapters (Vue `remoteComponent` / `createHostPages` capture the currently rendering app); business code never sets it by hand: a remote's declared setup `globalComponents` are registered idempotently onto it on every load. A manual `loadRemote` (no component context) omits the option and skips registration.

Call timing and lifecycle: `spec` fully resolved → container load (timeout/retries/breaker) → `init(shareScope)` (shared scope adoption) → setup → onSession → business module returned. The setup module's own imports complete their shared negotiation at that stage.

### Other exported general-purpose functions

Vue imports from `/vue` (or `/runtime`), React from `/react`. Except `validatePages`, these are mainly for advanced diagnostics or custom loading, not required steps for ordinary integration.

| Name | Signature / value | Notes |
|---|---|---|
| `getLoadedShare` | `(name: string, opts?: LoadShareOptions) => any` | Synchronously reads a ready instance without downloading; returns undefined on miss; strict version conflicts can still throw. With a resolveShare policy, only the already-arbitrated result is reused |
| `pinLoadedShare` | `(name, opts: LoadShareOptions, localVersion: string, instance: unknown) => void` | Registers an already-existing local instance; preserves version, first instance, and concurrency protection; never forcibly overwrites someone else's instance. Ordinary integration leaves this to the plugin |
| `parseSpec` | `(spec: string) => { remote: string; module: string }` | Splits a remote module name; the module part is normalized to `./X`, and with only a remote name the module is empty |
| `shareScopeMap` | `ShareScopeMap` | The shared dependency registry — fine for inspection; ordinary business code must not modify it directly |
| `clearSessionState` | `() => void` | Invalidates remote onSession signals and dedup state without deleting the account context itself; logout normally calls `clearAppContext`, which clears these states too |
| `validatePages` | `(pages: PageRouteLike[], options?: PagesOptions) => PageViolation[]` | Returns the page table's R1–R5 issue list without throwing on violations; normally called by definePages/createHostPages |

### Runtime plugins

Configuration: `runtimePlugins: ['./src/fulgurjsPlugin.ts']` (relative paths resolve against the app root).

> Hook error contract: `beforeLoadRemote` / `afterLoadRemote` are **observational hooks** — their own throws only warn and never rewrite the load result; `resolveShare` is a **decision hook** — an explicit throw propagates to the caller (it never silently falls back to another shared copy).
>
> **resolveShare and the consumption path (since 5.7.1)**: HTML entries configured with `runtimePlugins` finish shared arbitration and loading before executing the app; remote containers likewise finish async arbitration before executing an expose. Synchronous facades reuse the decision and instance of the same consumption conditions; an async hook may choose a lower version or an entry outside the original table and is not overwritten by the local copy. The dynamic import boundary between app and provider is preserved; the consumer facade on Vite 8 still has no TLA.
>
> **Entry boundary**: library/custom entries without an HTML entry, or calling `registerPlugins` to change policy after the app runs, require first `await loadShare(name, opts)` and then dynamically importing the new consumer; already-evaluated static bindings cannot be rewritten retroactively. An unprepared synchronous consumer hitting an async hook gets `MFU-004` (`details.syncUnsupported: true`) and its late rejection is taken over. `strictVersion` conflicts give MFU-003; locally adopted instances are registered under their real version, never borrowing another version's slot to bypass checks. To use React 18/19 together, give the whole React group, renderer, and their consumers an independent `shareScope` (see [shared dependencies](../guide/sharing.md#sharescope-group-isolation-react-1819-on-the-same-page)). Runnable example: [React version isolation and recovery](https://github.com/chenmingye/fulgurjs-federation/blob/master/examples/demos/react-versions/README.md).

```ts
import type { RuntimePlugin } from '@fulgurjs/federation/runtime'

export default {
  name: 'my-plugin',
  init(hooks) {
    hooks.resolveShare = async ({ shareKey, shareScope, requiredVersion, picked, available }) => {
      // Override shared version arbitration: return a ShareEntry to take effect
    }
    hooks.beforeLoadRemote = ({ remote, module }) => {}
    hooks.afterLoadRemote = ({ remote, module, module_ns }) => {}
    hooks.onRemoteError = ({ remote, error }) => {}   // error.code ∈ error code table
  },
} satisfies RuntimePlugin
```

### Debug surfaces (no configuration, always present)

| Outlet | Content |
|---|---|
| `window.__FULGURJS_SCOPE__` | Live share scope negotiation results (key → version → `{ get, from, loaded }`) |
| `window.__FULGURJS_INFO__` | `{ remotes: { [name]: { entry, status, lastLoadMs, error, setup } }, errors: [] }` — `setup` ∈ none/pending/ready/failed |
| `window.__FULGURJS_APP_CONFIG__` | Global config mirror (also the AppContext storage itself) |
| `window` event `fulgurjs:error` | `CustomEvent<{ remote, error }>`; every remote loading/sharing error emits it |

<a id="context"></a>

## AppContext — passing values and method references across apps

The first-class channel for the host to pass values to child apps and for child apps to register methods back to the host (with types and an error contract) — no more ad-hoc bare `window.*` hooks.

```ts
// ── Host bridge (host/src/fulgurjs/host/bridge.ts): login state sync (callable repeatedly, idempotent merge) ──
import { provideAppContext, clearAppContext } from '@fulgurjs/federation/vue'   // same names from /react, /runtime

provideAppContext({
  user,                                  // the host's logged-in user in its original shape (snapshot at provide time)
  getToken,                              // fetch the latest token (pull-based, never expires)
  store: piniaInstance,                  // the host pinia: child apps call useUserStore(ctx.store) to share reactive state
  hostApp: app,                          // the host Vue App instance: registration target for global components/directives
  locale,                                // UI configuration (e.g. an EP locale)
  sessionKey: 's-101-1730…',             // non-sensitive login generation ID: a new value on every successful login/re-login;
                                         // kept when a token refreshes but the session does not. The remote's onSession dedupes on it;
                                         // if missing, remotes declaring onSession report MFU-013. Not a token, not an authorization credential
  events: { main: mainEvents },          // event/method pool: the host provides main; child apps register back
  // Only pass keys with real consumers. Project-specific keys are provided as needed (e.g. baseUrl: '/demo')
})

// On logout: delete the context + invalidate remote session signals/onSession dedup state
// (does not reset remote module caches, the shared module graph, or app-level setup registration)
clearAppContext()

// ── Remote setup/onSession: explicit validated consumption ──
import { requireAppContext } from '@fulgurjs/federation/vue'

const { store, user, hostApp } = requireAppContext('store', 'user', 'hostApp')
// Any missing key → [fulgurjs:CC-001] three-part error (got / expected / example pointing at the host bridge);
// no runtime singleton on the page (a remote page opened standalone) → [fulgurjs:CC-002]; fix = load through the host federation.

// ── Read points in remote pages ──
import { getAppContext } from '@fulgurjs/federation/vue'
const dict = getAppContext().events?.main?.getDictItems?.('sex')

// ── Child app registering methods back to the host (remember to remove them in the page's onUnmounted) ──
getAppContext().events!.bpm = { formEvent, formSubmitEvent }
```

### Standard field table

| Field | Type | Semantics | Writer |
|---|---|---|---|
| `user` | `Record<string, any>` | The host's logged-in user in its original shape (snapshot when provided) | Host bridge (read-only convention; re-provide to overwrite on login state change) |
| `getToken` | `() => string \| undefined` | **Fetch the latest token** (pull-based, never expires; the context provides no one-shot token snapshot field) | Host bridge (read-only convention) |
| `store` | `unknown` (at runtime the host pinia) | Child apps mount/read the host's shared reactive state | Host bridge (read-only convention) |
| `hostApp` | Vue App instance (same-realm direct reference) | Registration target for global components/directives | Host bridge (read-only convention) |
| `locale` | `unknown` | UI configuration | Host bridge (read-only convention) |
| `sessionKey` | `string` | Non-sensitive login generation ID: a new value on every successful login/re-login; kept when a token refreshes but the session does not. The remote's onSession dedupes on it (one run per generation; a new generation reruns automatically); after logout `clearAppContext` forces a rerun. Generated by the host login flow; **never a real token**, and not an authorization credential | Host bridge (after login) |
| `events` | `Record<string, any>` | Event/method pool: `events.main.*` provided by the host; other prefixes registered back by child apps | Host bridge builds the pool; child apps attach |
| (extension slot) | `[key: string]: unknown` | Project-specific keys provided as needed (templates pass none by default) | Host bridge; remotes only add keys, never change host keys |

### Change semantics and the timing contract

- `provide` = top-level merge (later writes win, idempotent, callable repeatedly); the convention is "the host writes the standard fields first, remotes only add keys and never change host keys"; nested objects (like `events`) are **reference-shared** — child app property attaches are visible immediately (same-realm direct reference);
- Timing contract: **bridge (provide) → remote setup/onSession (require) → page module returned** — violating it fails explicitly at the initialization point (CC-001 / MFU-013), never silently;
- Data semantics = **transport-layer snapshot + function references, not reactive**. "Live" data travels through two official channels: ① `getToken()` / `events.main.*` function references execute the host's latest closure on every call; ② `context.store` hands the host pinia to the child app (a shared reactive instance). **Same-page account switch (logout → B logs in → reopen the remote page) needs no page refresh**: the host re-provides the latest context + `sessionKey`, and the remote's `onSession` detects the new generation and reruns automatically. The context body is deliberately not Vue-reactive (the runtime is framework-agnostic + a gzip size red line + the double-copy trap of cross-bundle proxies); no real need for "notify on mid-flight change" exists today, so no empty API is reserved;
- Storage note: the context's storage body is the global mirror object `window.__FULGURJS_APP_CONFIG__` (a page-level singleton, one copy shared across bundle copies; debug panels can read it directly).

### Two channels for method references

| Channel | Semantics | Applies to |
|---|---|---|
| **Function references carried on the context** | Synchronous direct call (the bridge runs before any page loads) | High-frequency hot paths (`getToken`/dictionaries/file URLs), child app back-registrations |
| **exposes method modules** | `exposes: { './api': './src/fulgurjs/exposes/api.ts' }` → `const { xxx } = await loadRemote('remote/api')` | Low-frequency/heavy cross-app calls; any expose consumed by anyone; dts type passthrough covers it automatically |

Method module conventions: export pure functions/service objects (no framework components); functions depending on host singletons (the http client going through shared etc.) are written directly — federation negotiation guarantees the same module graph. End-to-end example: [loading components and modules](../guide/components-and-modules.md#option-2-loadremote--imperative-loading-any-framework-or-pure-ts).

<a id="pages-api"></a>

## `definePages` / `validatePages` / `remoteSchema` — page route table

The host hands it the "URL path → remote exposes key" mapping for validation, so silent conflicts of parameterized routes fail at startup instead of loading the wrong component at runtime:

```ts
import { definePages, remoteSchema } from '@fulgurjs/federation/vue'   // same names from /react, /runtime

export const PAGES = definePages(
  [
    { route: '/remote-a/home', name: 'RemoteAHome', title: 'Home' },
    // Parameterized route: by default spec is derived as drop the first segment + strip :param segments;
    // when the derivation collapses onto another entry that is an ERROR;
    // point at a dedicated expose with an explicit spec
    { route: '/remote-a/detail/:id', name: 'RemoteADetail', spec: 'pages/remote-a/detail', title: 'Detail' },
  ],
  {
    deriveSpec: (route) => 'pages/' + route.replace(/^\//, '').split('/').filter(s => !s.startsWith(':')).join('/'),
    remotes: { '/remote-a/': 'remote-a' },   // route prefix → remote name
    schema: remoteSchema,                     // { [remoteName]: { exposes: string[], exists?: boolean } }
    strict: true,                             // ERROR throws by default; false downgrades to console.error
  },
)
```

- **`definePages(pages, options?)`**: call timing = host startup (module evaluation). Returns the validated page table. Rules R1–R5: [remote page integration](../guide/remote-pages.md#define-pages); R3 depends on `schema` (the dev probe result), always an empty table in build (honest degradation).
- **`validatePages(pages, options?)`**: returns the violation list (`PageViolation[]`, with `level` and descriptions) without throwing, useful for self-testing.
- **`remoteSchema`**: the remote exposes probe the plugin fills in automatically during dev; business code only forwards it to `schema`.
- Same-subpath types: `PageRouteLike` (the route entry shape), `PagesOptions` (validation options, with `deriveSpec`/`remotes`/`schema`/`strict`), `PageViolation`, `RemoteSchemaEntry`.

## `createHostPages` (Vue) / `createReactHostPages` (React) — host page adapters

**Import location**: `createHostPages` from `@fulgurjs/federation/vue`; `createReactHostPages` from `@fulgurjs/federation/react`. For the full signature, options, returned members, and behavior contract see [remote page integration](../guide/remote-pages.md#page-adapters) (Vue and React data-item semantics are identical; React display items `fallback`/`error`/`retries`/`timeout` match the React `remoteComponent`, plus `beforeLoad`).

Call timing and lifecycle notes (identical on both ends):

- Page-table creation has zero loading side effects; components call `loadRemote(spec)` only **at render time**;
- Load order: `beforeLoad` → optional remote `setup`/`onSession` → page module; failures enter the error state with no silent fallback;
- The component cache is reused per spec and login generation: rebuilt **only when a new non-empty `sessionKey` arrives** (logout to `undefined` does not rebuild) — reloading after an account switch triggers a new `onSession` generation, while the module itself is reused from the runtime cache without re-downloading;
- Vue-only `keepAliveNames` return value and `keepAlive: true` page-level keep-alive (cache cap max=8 LRU, cache key = sanitized page spec name, why everything is off by default): [remote page integration](../guide/remote-pages.md#page-adapters);
- The React side provides no `keepAliveNames` (no keep-alive promise); routing is not a runtime dependency of the plugin — the example uses React Router 7 (`path` declared in the route table, `element` rendering the `component(spec)` output; parameterized routes pass params to remote page props via `useParams`/`useSearchParams`);
- Cross-framework Context sharing: host and remote consumers get the same Context object through **the same expose instance** (the remote exposes `'./theme-context'` exporting a `createContext` instance; the host fetches it with `useLoadRemote` as the Provider, and the remote component reads the host's value via `useContext`); the plugin does not auto-bridge arbitrary React Contexts — the object must be shared explicitly.

## `remoteComponent` — direct rendering of remote components

### Vue version (`@fulgurjs/federation/vue`)

```ts
import { remoteComponent } from '@fulgurjs/federation/vue'

const FederatedForm = remoteComponent('remote-a/Form', {
  loadingComponent: MyLoading,   // Optional: component shown while loading
  errorComponent: MyError,       // Optional: component shown on failure (receives the error prop)
  retries: 2,                    // Optional: per-call loadRemote retry override
})
```

| Option | Type | Default | Notes |
|---|---|---|---|
| `loadingComponent` | `Component` | — | Shown while loading |
| `errorComponent` | `Component` | Built-in error placeholder | Shown on load failure (Vue receives the `error` prop). When custom, it takes over the display completely and the plugin no longer injects recovery buttons; the default placeholder includes "Retry load / Refresh page" |
| `retries` | `number` | The remote's registered value (default 2) | Passed through to `loadRemote` |
| `delay` | `number` | `200` | Wait before switching to loadingComponent (ms) |
| `timeout` | `number` | — | Timeout into the error state (ms); if unset, the runtime container timeout is the fallback |

Semantics and boundaries:

- Internally = `defineAsyncComponent({ loader: () => loadRemote(spec, opts).then(m => m.default ?? m) })`, returning a standard Vue async component; `props` pass straight through at the usage site;
- **Global-component auto-install (6.1.0)**: a remote component renders inside the **consumer app** context, and string tags in its templates (e.g. `<a-divider>`) resolve against the consumer's global registry — the provider app's `app.use(X)` registrations do not travel with the component. When the remote declares `globalComponents` in its setup module, this factory captures the currently rendering app on load and registers them idempotently (including consumption inside bridge child apps); see Section 6 `federation({ setup })` for the globalComponents contract;
- **No fallback/degradation whatsoever** (zero silent fallback): a load failure explicitly enters the error state; without an `errorComponent`, the built-in placeholder renders (error code + root cause + fix + **Retry load / Refresh page**), and the `fulgurjs:error` event is emitted as usual by the runtime layer;
- Module dedup reuses `loadRemote`'s internal Promise cache — multiple component instances with the same spec load the container module only once;
- Call timing = zero side effects at factory declaration; loading happens at render time;
- The runtime instance is reused via the `globalThis.__FULGURJS_RUNTIME__` page-level singleton — the same destination as the `/vue` import, no extra wiring needed.

### React version (`@fulgurjs/federation/react`)

```tsx
import { remoteComponent } from '@fulgurjs/federation/react'

const RemotePanel = remoteComponent<PanelProps>('remote-a/Panel', { fallback, error, retries, timeout })
```

| Option | Type and default | Semantics |
|---|---|---|
| `fallback` | `ReactNode`, default `null` | Placeholder while this load is pending (distinct from the failure placeholder) |
| `error` | `ReactNode` or `(error, retry) => ReactNode`, default built-in placeholder | Shown on load failure or subtree render errors; the render function receives the real error and a working retry |
| `retries` | `number`, `loadRemote` default (2) | Retry count passed through (integer 0–10; illegal values throw at factory call time) |
| `timeout` | `number` (ms), no adapter timeout by default | Wait cap for this component load; a timeout only ends this wait and does **not cancel** the already-issued shared request; late success/failure never overwrites the terminal state nor produces an unhandled rejection |

- The factory and page-table declarations have **zero loading side effects**; `loadRemote` happens on first render (through container negotiation and the optional setup/onSession). **Does not use `React.lazy`**: a lazy instance caches the failed Promise, so merely resetting an error boundary cannot recover; this implementation's retry rebuilds the load attempt (already-loaded modules come from the runtime cache without re-downloading);
- Component export validation: the default export (or the module itself) must be a legal component type — a function component / class / `memo` / `forwardRef` etc.; strings, numbers, and empty namespaces error explicitly (never a blank success page);
- `ref` passthrough: a `forwardRef` export receives the ref correctly (tested on React 18/19); passing a ref to an ordinary function component follows React's standard behavior;
- Render-time exceptions are caught by the built-in boundary and **recorded and displayed separately** from network/export errors (the copy distinguishes "load failed" from "render error"); the ErrorBoundary does not catch event handler or arbitrary async callback exceptions;
- The built-in default error placeholder includes: the error code (`code` of FgError, `UNKNOWN` when absent), the real root-cause message, an actionable fix, and two recovery actions — **"Retry load"** (rebuilds the load chain on the same page) and **"Refresh page"** (a full page refresh only on user click, keeping the current address). Render-stage errors offer only "Retry load" (the error originates from remote code itself; refreshing cannot fix it);
- Failure recovery genuinely punches through the browser's ESM failure cache: the runtime changes the URL on retry after failure for both the entry URL and the container's expose loader (`fulgurjs_retry=N`); concurrent loads of the same module advance a single retry generation after failure; repeated access to already-loaded modules costs zero extra network requests;
- **Known boundary**: if a static dependency chunk of an expose (an ordinary chunk `import`ed inside the expose chunk) fails, same-page retry cannot recover — the browser's module map cached the failure for that dependency URL. Recovery needs a full page refresh — the default placeholder's "Refresh page" is exactly that path (user-click triggered, never automatic). This limitation belongs to the current native ESM loading path and must not be generalized to webpack MF (see the [comparison notes (Chinese)](../../maintainers/webpack-mf-对照与缺口.md)).

### `useLoadRemote` (`@fulgurjs/federation/react`)

```ts
const { data, error, loading, reload } = useLoadRemote<Utils>('remote-react/utils')
```

- Returns `{ data: Module | undefined, error: unknown, loading: boolean, reload: () => Promise<void> }`; `error` is always `undefined` when there is no error;
- `options`: `shareScope` / `retries` / `fallbackModule` (passed through to `loadRemote`; configuring `fallbackModule` is an explicit declaration — on failure it returns the fallback instead of writing error);
- Dependencies are compared field by field (a new options object on every render by the caller will not cause endless reloading); when spec/options change, old data is cleaned up and a new request begins;
- Each effect round and each `reload` has an independent generation: fast A→B, a slow request resolving late, consecutive reloads, resolution after unmount, and StrictMode double effects all allow only the latest valid request to write state; it is not claimed that duplicate effects never happen (the runtime cache dedupes the network and the lifecycle);
- `reload` clears old data/error and sets loading=true at start; after the current attempt succeeds it writes data, and on failure writes only error, ending loading either way. Unmount invalidates unfinished effect/reload work, and calling a saved reload after unmount issues no request. Already-cached successful modules are not re-downloaded; the `Promise<void>` settles normally (calling it from a button `onClick` produces no unhandled rejection);
- `AppContext` is not a React state subscription: when the host reads a new non-empty `sessionKey`, the **host's own state/routing** triggers the re-render.

### `RemoteErrorBoundary` (`@fulgurjs/federation/react`)

A standalone page-level fallback boundary. Props: `children`, `fallback` (a node or `({ error, reset }) => ReactNode`), `onError(error, info)`, `resetKeys` (any change resets the boundary state; the common controlled-retry form is `resetKeys={[retryEpoch]}`). `reset` only resets the boundary state; if the subtree holds a failure cache (e.g. an external `React.lazy`), the caller must also rebuild the load attempt — the plugin's own `remoteComponent` retry already does both. The error boundary built into `remoteComponent` consumes its own errors, so an outer `RemoteErrorBoundary` never sees exceptions already handled inside; to change the placeholder of a given remote component, use that component's own `error` option.

<a id="setup-on-session"></a>

## `federation({ setup })` — remote initialization lifecycle (setup/onSession)

```ts
// Remote vite.config.ts / fulgurjs.config.ts
federation({ name: 'remote-a', exposes: { /* … */ }, setup: './src/fulgurjs/setup.ts' })
```

```ts
// remote-a/src/fulgurjs/setup.ts — only the two function names below carry automatic lifecycle semantics
import type { RemoteSetupContext, RemoteSetupModule } from '@fulgurjs/federation/runtime'

export default async function setup(context: RemoteSetupContext) {
  // App-level one-time registration: global components/directives, global styles, locale injection, plugin installs on the host app
  // context.appContext = the AppContext snapshot at call time; context.signal = the lifecycle signal
}
export async function onSession(context: RemoteSetupContext) {
  // Session-level sync: current user, permissions, dictionaries, token-related caches
  const data = await fetchUserDicts()
  if (context.signal.aborted) return  // ← must be checked after awaits and before writing state: the account may have switched/logged out meanwhile
  writeToStores(data)
}

// 6.1.0 optional named export: the "consumer-side globally registered components" the exposed
// surface depends on (key = registered name, value = a component object or a zero-arg loader).
// For component federation (remoteComponent): the remote component renders inside the CONSUMER
// app, and string tags in its templates (e.g. <a-divider>) resolve against the consumer's
// global registry — without registration they render as unstyled literal custom elements.
// The runtime registers these idempotently onto the current consumer app on every loadRemote;
// omit for zero behavior.
export const globalComponents: RemoteSetupModule['globalComponents'] = {
  // Recommended zero-arg loader form: the setup module itself stays free of component imports,
  // so components load only when actually rendered by a same-framework consumer (the Vue
  // adapter wraps loaders with defineAsyncComponent at registration). Cross-framework
  // consumers loading pure-TS modules never pull the framework graph.
  ADivider: () => import('ant-design-vue').then((m) => m.Divider),
  // Static component values also work (one step for same-framework consumers):
  // AButton: Button,
}
```

`RemoteSetupContext`: `{ appContext: Readonly<AppContext>, sessionKey?: string, signal: AbortSignal }`. `appContext` is the snapshot taken from the page-level AppContext **at call time** (never a saved stale reference); `signal` is invalidated when the login generation changes or on logout cleanup.

Fixed contract:

| Dimension | Semantics |
|---|---|
| Trigger entry | `loadRemote('remote/module')` is the **unified entry** (`remoteComponent` and the host page adapters share the same source). `loadRemote('remote')`, `getContainer()`, `preloadRemote()`, and calling `container.get()` directly all **do not run** initialization |
| Timing | Container acquired → `init(shareScope)` (shared scope adoption) → **setup** → **onSession** → **globalComponents install** → business module returned. The setup module's own imports complete their shared negotiation at that stage |
| Execution count (setup) | Once per container; concurrent calls share one Promise; never repeated after success. `preloadRemote` only prefetches resources and never executes |
| Execution count (globalComponents) | Declaration is extracted once with setup; **installation runs on every `loadRemote`** (idempotent — `app.component` same-name overwrite, later registration wins) so bridge child apps that create a fresh app instance per mount also receive the registration. Vue `remoteComponent` and `createHostPages` capture the consumer app automatically; a manual `loadRemote` and the React side do not automatically pass it (React has no Vue global-registry concept) — installation is skipped without error. Registrations live for the consumer app's lifetime; there is no separate uninstall API |
| Execution count (onSession) | Deduplicated by the non-sensitive `sessionKey`: once per login generation; a new generation first invalidates the old `signal`, then chains the old call and the new call **serially** per remote (preventing two accounts' async writes from interleaving); `clearAppContext()` invalidates the dedup state, forcing a rerun on the next login. App-level setup does not re-run on logout/generation switch |
| sessionKey | The host login flow generates a new generation on every successful login/re-login (non-sensitive ID, never a token); kept when a token refreshes but the session does not. **onSession present but sessionKey missing → MFU-013**; identity is never guessed from a user object reference; remotes without onSession need no sessionKey |
| Export validation | Must default-export a function; the named `onSession` is optional and must be a function; `globalComponents` is optional and must be an object (key = registered name, value = component). Violations → MFU-011 (reports actual type / expected signature / fix) |
| Failure and retry | setup/onSession throwing → that `loadRemote` rejects (MFU-012); **only the failed stage's cache is cleared** (after a setup failure the retry starts at setup; an onSession failure only reruns the session segment); already-successful stages are not repeated. `fallbackModule` never masks an initialization failure |
| Self-recursion | `loadRemote(same remote/…)` inside setup/onSession's synchronous segment → MFU-014 (the call waits on itself, deadlocking). Same-remote recursion inside the async segment cannot be attributed precisely and shows up as a hang — never load same-remote modules inside initialization |
| dev/prod parity | The dev container (middleware-served) and the prod container (build artifact) carry the same setup metadata (the container's `__fulgurjsSetup` field + the manifest's `setup` field); the internal expose key `./__fulgurjs_setup__` never appears in dts types or public exposes lists |
| Error codes | MFU-011 illegal export / MFU-012 execution failure / MFU-013 missing sessionKey / MFU-014 self-recursion; all carry the remote name, module path/stage, actual result, expectation, and fix, and never record tokens |

"`exposes` an ordinary TS bootstrap module + the host `loadRemote`s and calls it manually" is just the generic use of a normal expose + `loadRemote`, not a plugin API, and has none of `setup`/`onSession`'s once-per-app, dedup-per-session, failure-retry semantics — always use `federation({ setup })` for initialization.

<a id="bridge-api"></a>

## Bridge API — `defineBridgeApp` / `createVueBridgeApp` / `createReactBridgeApp`

**Import locations**: `defineBridgeApp` is dual-exported under the same name from `/vue` and `/react`; `createVueBridgeApp` from `/vue`, `createReactBridgeApp` from `/react`.

**Product scope**: bidirectional embedding with site-level mount/unmount — a Vue 3 host embedding a React 18/19 child app, a React host embedding a Vue 3 child app. For sub app internal routes synced with the host URL see [section 8](#url-sync-api) — explicit opt-in, off by default. Component-level interconversion, Angular, SSR/RSC, JS sandbox, and CSS isolation are outside the supported surface (see [supported scope](../troubleshooting/compatibility.md)).

**Dual-framework installation contract (required)**: a bridge host installs `vue` + `react` + `react-dom` together, with all three shared keys `singleton: true`:

```ts
// Bridge host fulgurjs.config.ts
shared: {
  vue: { singleton: true },
  react: { singleton: true },
  'react-dom': { singleton: true },
}
```

The child app only installs and shares its own framework (Vue child app: `vue`; React child app: `react` + `react-dom`). The zero-other-framework promise of pure Vue / pure React projects is unaffected. Shared subpaths (`react/jsx-runtime`, `react/jsx-dev-runtime`, `react-dom/client`) are negotiated to a single instance by the shared mechanism; the host must configure shared for `react` and `react-dom` (subpath negotiation depends on the parent keys). Real symptoms of a missing singleton (Invalid hook call, double instances) are error code `MFU-010` — the plugin runs the negotiation mechanism as-is and does not block misconfiguration.

### Child app side: `defineBridgeApp(factory, options?)`

The module exposed as `./bridge` declares the contract object as its **default export**; the plugin verifies that both `mount`/`unmount` are functions, otherwise `MFU-015`. The factory signature is `(props, ctx?) => BridgeApp product`; with `options: { routing?: true }` declaring the URL sync protocol, `ctx` carries `{ signal, routing }`. For full usage (Vue returns a fully assembled `createApp` instance; React returns an element) and contract semantics see [sub app bridge](../guide/app-bridge.md#child-app-side-definebridgeapp). Key points:

- `mount(el, props?): void | Promise<void>` — returning void means the first root commit completed synchronously; returning a Promise keeps the host pending until it resolves after the first root commit (React fulfills it via the contract's built-in commit probe; `root.render()` returning does **not** count as success). Failures before the first commit must throw/reject (the host converts them to MFU-016, `details.phase: 'mount'`) and clean up the created app/root;
- `unmount(el): void` — synchronously invalidates that container's generation and cleans up; unknown containers are a no-op; unmounting while pending immediately invalidates the current generation, and late results must not revive the DOM or produce unhandled rejections; an unmount that throws → MFU-016 (`phase: 'unmount'`) and the container is **persistently locked out** (same-page retries and session switches never remount it; only a full page refresh recovers);
- Contract instances are keyed per container el: mounting the same contract in several places does not interfere; mounting again into the same container without unmounting is rejected (MFU-016) and does not overwrite the original instance;
- Child app internal errors after the first root commit are the responsibility of the **child app's own error boundary** — the host's ErrorBoundary/errorCaptured cannot catch render errors across roots, and the plugin does not pretend to be the fallback.

### Host-side factories

```ts
// Vue host (/vue)
import { createVueBridgeApp } from '@fulgurjs/federation/vue'
const RemoteReactApp = createVueBridgeApp<P>('react-remote/bridge', {
  loadingComponent?, errorComponent?, retries?, timeout?, getContext?,
})
// Template: <RemoteReactApp :session-key="loginKey" :app-props="{ userId, onReady }" />

// React host (/react)
import { createReactBridgeApp } from '@fulgurjs/federation/react'
const RemoteVueApp = createReactBridgeApp<P>('vue-remote/bridge', {
  fallback?, error?, retries?, timeout?, getContext?,
})
// JSX: <RemoteVueApp sessionKey={loginKey} appProps={{ userId, onReady }} />
```

| Item | `createVueBridgeApp` (Vue host) | `createReactBridgeApp` (React host) |
|---|---|---|
| Factory options | `loadingComponent?` `errorComponent?` (receives the `error` prop, takes over completely) `retries?` (integer 0–10) `timeout?` (positive finite ms) `getContext?` | `fallback?` (pending placeholder) `error?` (node or `(error, retry) => ReactNode`) `retries?` `timeout?` `getContext?` |
| Returned component props | `appProps: P` (business data) + `sessionKey?: string \| null` (control parameter, not mixed into business props) | Same on the left, `ComponentType<{ appProps: P; sessionKey?: string \| null }>` |
| Generics | `createVueBridgeApp<P>(spec, options?)`; P constrains only `appProps` | Same on the left |
| spec | Full `<remote>/<expose>`, same resolution rules as `remoteComponent`; no remotePrefixes/schema/deriveSpec | Same on the left |
| Default error placeholder | Diagnostic message (error code + root cause + fix) + "Retry load / Refresh page" | Same on the left |

- **`appProps` snapshot semantics**: top-level fields are shallow-copied at mount time, while nested objects/reactive stores/functions keep their original references; later top-level replacements are **not tracked and do not re-render the child app** — to reset, rebuild with `:key`/key. New host closures are not passed to the child app automatically — to read live host state, pass stable callbacks or remount explicitly. Crossing roots inherits nothing: no host provide/inject, Pinia, React Context, or routing.
- **`getContext`**: a side-effect-free **synchronous** getter, called before the actual load on first load, retries, and session switches; it returns a snapshot object (Promises/thenables and non-objects are rejected — `MFU-016`, `phase: 'getContext'`). The bridge layer first validates that the snapshot's `sessionKey` matches the controlled value (on mismatch `MFU-017`, and nothing is written globally); **after validation passes, the bridge layer calls `provideAppContext`** — the getter itself never writes globally. Without a getter, the existing `AppContext.sessionKey` must match the controlled value. On a generation switch, the bridge layer first calls `clearAppContext()` to clear old-account-only fields, then writes the new snapshot.
- **`sessionKey` controlled semantics**: only `undefined` (no controlled session) / `null` (logged-out state: unmount immediately, keep an empty container, no more loadRemote) / a non-empty string (login generation) are accepted. Illegal values such as empty strings or numbers are rejected at mount with `MFU-017`. The full trigger table: [sub app bridge · session](../guide/app-bridge.md#session-sessionkey-and-appcontext).
- **Multiple instances and page-level single session**: multiple instances of the same spec on one page are legal (keyed per el); `AppContext` is a page-level singleton — all controlled bridge instances on a page must share one session, and mismatched generations are rejected with `MFU-017`. Hosting two accounts simultaneously on one page is not promised.
- **DOM ownership**: the wrapper component only creates and keeps a stable empty mount container; host re-renders never patch inside the child app's root. React host StrictMode double effects are safe. Vue `<KeepAlive>` deactivate is not unmount — a child app in a cached page keeps its root and state.
- **Old requests never pretend to be cancelled**: work already inside `loadRemote` is not cancelled because the bridge layer invalidates it — late old results are discarded by generation; the remote's `onSession` must honor the `signal.aborted` contract.

<a id="url-sync-api"></a>

## Bridge URL sync API

**Import locations**: `createVueBridgeNavigation`/`connectVueBridgeRouter` from `/vue`; `createReactBridgeNavigation`/`createReactBridgeRouter` from `/react`. Router libraries are optional peers (vue-router / react-router-dom installed by the consumer; a missing React-side dependency errors clearly only when `createReactBridgeRouter` is actually called).

The bridge defaults to memory routing; URL sync makes the **host URL express the sub app's internal location** (refresh lands directly, bookmarks/sharing, back/forward). Explicit opt-in, off by default. **Architecture conventions**: the host Router is the only writer of browser history; the sub app uses a controlled memory router; the two ends exchange location through an independent routing channel; within the same instance, path/search/hash changes **do not remount the root, do not rebuild the store, do not reload the remote**.

### API signatures

| Function | Signature | Notes |
|---|---|---|
| `createVueBridgeNavigation` | `(router: VueRouterLike) => BridgeHostNavigation` | Vue host navigation port. Vue Router fullPath is already the logical path; no deployment base needed. Vue Router 4, history or hash mode |
| `createReactBridgeNavigation` | `(navigate, { basename?, canNavigate? }) => BridgeHostNavigation` | React host navigation port. **Data router only** (`createBrowserRouter`/`createHashRouter` + `RouterProvider`); declarative mode (BrowserRouter) has no cancellation semantics and is not supported. React Router ≥ 6.11. `canNavigate` is optional and only an early rejection; the port observes the real blocker state — wait for `reset()` to resolve as cancelled and for the actual location to commit after `proceed()`; success is never judged solely by the settle of navigate's Promise |
| `connectVueBridgeRouter` | `(routing: BridgeChildRouting, router: Router, { signal? }) => { ready: Promise, dispose(): void }` | Vue child app wiring for the controlled memory router; `await …ready` settles before `app.use(router)` (order must not be reversed) |
| `createReactBridgeRouter` | `(routing, routes, { signal? }) => { element, dispose(), routerReady }` | React child app: returns a `RouterProvider` element used directly as the contract product. `routerReady: Promise<Router>` is the wired memory-router readiness contract: the fast path (module-level warmup already settled, the common case) returns an **already-resolved** Promise whose value equals `element.props.router`; the slow path (rare warmup race) resolves when the lazy host finishes wiring on first render; a missing react-router-dom rejects with a clear error. Introspect via `await routerReady` instead of assuming `element.props.router` exists synchronously. `dispose()` tears down the wiring idempotently (auto-invoked by the signal); late tasks after dispose never write state |

The channel parameter the host passes to the bridge component: `routing: BridgeHostRouting = { basePath: '/approval', navigation }`; after the child app contract's second parameter declares `{ routing: true }`, it receives the channel from `ctx.routing`. The wiring's third argument on both ends, `{ signal?: AbortSignal }`, defaults to empty; passing `ctx.signal` is recommended for automatic dispose — without it, the child app explicitly calls `dispose()`. A custom `BridgeHostNavigation.navigate(target, action, { signal })` should re-check the optional signal before an async commit and forbid late writes once aborted.

### Behavior contract (fully expanded in the [URL sync guide](../guide/url-sync.md#behavior-contracts-and-boundaries))

- **basePath**: a static absolute path from the host routing perspective (empty/root/with query·hash·wildcard rejected, `MFU-030`); matches by path segment; prefixes of sync instances on one page must not be identical or overlap; `/approval` corresponds to the sub app `/`, and the root redirect is defined by the sub app's routes, normalized via replace;
- **Vite base layering**: when deployed under `/erp/`, Vite base/host Router base are `/erp/` while the bridge basePath remains `/approval` (Vue Router has already stripped the history base; the React port takes `basename`); logical paths carry no deployment prefix;
- **Three-part location equality**: search/hash preserved verbatim (repeated query keys, encoding, non-ASCII characters, and fragments are never double decoded/encoded); parameter-only changes also sync, without a remount;
- **Cancellation semantics**: a Vue Router 4 push/replace settling with a `NavigationFailure` is a real cancellation; the React data router waits on the real blocker's cancel/proceed. After cancellation, URL, history, and the sub app location stay at the last confirmed state, and **there is never an automatic retry**;
- **Navigation and errors**: sub app push/replace preserve the original action; go/back/forward delegate to host history; consecutive requests settle serially, and external navigation invalidates old in-flight and queued requests; guard/loader/port execution errors reject the Promise (MFU-033, cause preserved), never disguised as cancelled;
- **Session and lifecycle**: `sessionKey→null` invalidates the old channel — navigation on the old channel is always cancelled, writes no URL, and never revives the sub app; the channel is destroyed after unmount (re-subscribing yields MFU-031); KeepAlive-cached off-page instances pause route writes (re-syncing on activation); the persistent lockout of a container whose unmount threw cannot be bypassed via routing;
- **Protocol validation**: the host enables routing while the child app did not declare `{ routing: true }` → the `MFU-031` placeholder, **never silently falling back to memory while pretending the deep link worked**;
- **Illegal navigation and loops**: targets outside the sub app's own prefix (`../`, across prefixes), targets already containing the basePath (duplicated prefix) and illegal `go` arguments → `MFU-032`; more than 5 consecutive internal replaces (a redirect loop) → `MFU-033` (with the target chain attached; never silently back to the entry);
- **Lazy loading**: the default `/vue` and `/react` entries pull in no router library; the route-sync APIs only type-import the router libraries plus module-level on-demand prewarming;
- **Not promised**: SSR/RSC, cross-browser windows, route proxying for nested multi-level bridge child apps, TanStack Router and other router libraries (custom extension via the `BridgeHostNavigation`/`BridgeChildRoute` ports is possible).

<a id="dev-types"></a>

## Dev types and remote source

### Type generation (shared by Vue and React exposes)

`dts` is enabled by default: in dev the plugin fetches the remote manifest and generates type declarations for every public exposes module — the host writes `import X from 'remote-a/X'` and gets types. Output goes to `src/fulgurjs/types/` (all federation artifacts in one folder; falling back to `.fulgurjs/types` without a src layout), so src-layout projects work with zero tsconfig configuration; `{ dir }` customizes the location. `mode: 'source'` (default) is cross-project source-level passthrough (completions and go-to-definition land in the remote source; VSCode may show cross-project diagnostics when opening the generated files — an editor-only display issue; command-line checks and builds are unaffected); `mode: 'shim'` is a loose placeholder (a clean IDE throughout, no source-level completion). Both modes read the remote's local source to enumerate export names (shim included); the manifest's `fsRoot`/`src` pass path-boundary validation (relative paths, no `..`, realpath must not escape fsRoot), but **`dts` is not a security boundary against untrusted manifests — enable it only for trusted sources**.

### Dev types when remote source is inaccessible

When the remote sets `devFsRoot: false`, or its source directory is inaccessible from the host machine, the plugin generates `any` declarations for every public expose based on the dev manifest. Default, named, and side-effect imports all resolve, but there is no source completion, no type constraints, and no go-to-definition; the internal setup lifecycle entry gets no declaration. The output directory follows `dts.dir`; by default `src/fulgurjs/types` when a `src` exists, otherwise `.fulgurjs/types`. Make sure the project tsconfig includes that directory. Once source passthrough is restored, restarting the host dev server regenerates the precise mapping; `dts: false` disables generation entirely.

Dev type generation and the runtime use the same `remotes.dev` address: absolute URLs, `//host:port/path`, and same-origin relative paths are all supported. Relative addresses resolve against the host Vite dev server's origin; an explicit `server.origin` wins, otherwise the actual local server address.

### React dev types (dual track)

The `.tsx`/`.ts` exposes of `@fulgurjs/federation/react` share the same dev type generation as Vue (directory, `dts:false`, `dts.dir`, setup filtering, and the `devFsRoot:false` degradation are all identical), plus a **dual-track** form: with zero configuration, resolvable loose declarations are generated (exports as `any`); once the host's **application TS context** (`tsconfig.json` itself, its `extends` chain, or a `references` target whose include covers the app source/type output directories; unrelated contexts like a standalone `tsconfig.test.json` or a `tsconfig.node.json` containing only vite.config do not participate in the decision) configures a `"paths": { "<remote>/*": ["<types dir>/<remote>.d/*"] }` block, same-shaped imports resolve to the forwarding module and gain **source-level types** (precise props/function signatures; wrong props/arguments fail compilation) — remotes whose application context configured paths automatically skip the same-named loose declaration to avoid shadowing; enablement instructions are in the generated directory's `_paths.d.ts`.

Type generation supports string or array `extends` (later entries override earlier ones), `references` pointing at directories, and resolves inheritance paths by declaration file directory. `baseUrl` and `paths` are inherited independently. When multiple actual application contexts disagree on a remote's `paths` takeover, the default loose declaration is kept with a hint; unify those app configurations when precise types are needed. The lifecycle error `MFU-012`'s `cause` preserves the original exception thrown by setup/onSession.

### IDE notes (red squiggles in the `src/fulgurjs/` directory)

- The `*.d.ts` under `types/` are type passthrough declarations **auto-generated by the plugin on every dev run** (never hand-edit): internally they point at sibling projects' source. The command line `vue-tsc --noEmit` (using this app's tsconfig, where skipLibCheck applies) reports 0 errors; but when VSCode/Volar opens these d.ts files it may expand-check cross-project files with an inferred project and show walls of "cannot find module" — an editor-only display issue that does not affect command-line checks or builds; simply do not open the `types/` artifacts;
- If `import ... from '@fulgurjs/federation/*'` reports ts(2307) after a plugin upgrade: the IDE's TS service cached the old package — `Restart TS Server` (⌘⇧P) or reopen the window;
- **Curing the red squiggles**: `federation({ dts: { mode: 'shim' } })` — the artifacts no longer reference cross-project source files and the IDE stays clean throughout; the trade-off is losing the "go-to-definition lands in the remote source" completion ability (the default stays `source`; choose per project preference).

<a id="project-side"></a>

## Optional project-side composition patterns: keep-alive, loading hints, preloading, and the diagnostics page

This section records project-side composition patterns. The constants, pages, and diagnostics panel are implemented by the integrating project — they are not public APIs generated automatically after installing the plugin. `fulgurjs init` only generates the config starter template, not these project files; the plugin runtime is not involved at all. Configuration surface overview:

| Capability | Config item | Type | Default | Configured at |
|---|---|---|---|---|
| Page keep-alive | `keepAlive` | `boolean` | `false` | Page route table entry |
| Page loading skeleton | — (built-in, no config item) | — | See the built-in parameters below | Page factory |
| Idle preload | `PREFETCH_REMOTES` | `string[]` | `[]` (whole-remote preload off, load on demand) | Constant at the top of the host bridge |
| Federation diagnostics panel | — (a built-in page) | — | Always present | A custom route (e.g. `/fulgurjs-demo`) |

### 10.1 Page keep-alive — `keepAlive`

A page-level boolean switch: when on, navigating away from the page **does not destroy the component instance** (deactivate), so form inputs, filters, and scroll position are restored verbatim on return.

```ts
// Page route table entry
{ route: '/some/page', name: 'SomePage', title: 'Page', keepAlive: true }
// Off: omit the field, or set false explicitly (equivalent; off by default)
```

- Cache cap `max: 8` (Vue's native LRU; the least recently used page instance is destroyed beyond the cap);
- Cache key = the sanitized page spec name (`Fulgurjs_<remote>_<expose key>`); the same route with different params (different fullPath) each occupies a cache entry;
- **Why everything is off by default**: caching heavy components (complex tables/form designers) costs a lot of memory; enable explicitly page by page;
- If an enabled page's component registers window-level listeners/timers/context back-registrations, it must follow the [page unmount cleanup checklist](../guide/remote-pages.md#page-unmount-cleanup-checklist) (a kept-alive page only unmounts when actually evicted by the LRU).

### 10.2 Page loading skeleton — built-in `loadingComponent` (no config item)

The page component factory ships a built-in loading placeholder: during federation page chunk download/module execution it shows an animated gradient skeleton instead of a white screen. Built-in parameters: `delay: 200` (ms, shown only past the delay — fast loads do not flash) and the built-in error placeholder as `errorComponent` (spec + error code + root cause + fix). To customize the loading placeholder, bypass the page factory and use `remoteComponent(spec, { loadingComponent })`.

### 10.3 Idle preload — `PREFETCH_REMOTES` (off by default)

**First, separate the four layers (do not confuse "many declared routes" with "the first paint executes every page's code")**:

| Layer | Mechanism | Timing | Network cost |
|---|---|---|---|
| ① Route table declaration | `pages.data.ts` is only a **data mapping**, importing no remote code | Build time | Zero |
| ② Real page load | `createHostPages` wraps each page in an async component; `loadRemote(spec)` happens **at render time** | The user opens that page | That page's chunk + CSS (plus entry/shared dependencies/setup for that remote on first touch) |
| ③ Single-page prefetch | `preloadRemote('remote-a/pages/home', { mode: 'prefetch' })` | Called proactively by the project | That expose's chunk + CSS (**download only, no execution**) |
| ④ Whole-remote prefetch | `preloadRemote('remote-a', { mode: 'prefetch' })` | Explicitly enabled by the project | Every expose's chunk + CSS from the manifest (**download only, no execution**) |

Prefetching is **downloading** (`modulepreload`/`stylesheet` links; `fetchPriority=low` only lowers priority — it does not mean no download) and **does not equal executing page code** — `container.get()`, component instantiation, and `setup/onSession` are triggered only by a real page's `loadRemote`. Loaded modules have a Promise cache: reopening the same page reuses the modules, and an account switch redoes session initialization but never re-downloads the JS.

```ts
// Constant at the top of the host bridge; whole-remote preload off by default (load on demand)
const PREFETCH_REMOTES: string[] = []
// Explicitly warm a whole remote (downloads the full expose list; enable only with a real usage path)
// const PREFETCH_REMOTES: string[] = ['remote-a', 'remote-b']
// Single-page prefetch (recommended: only prefetch the clear next page; low priority, download only, no execution)
// idle(() => preloadRemote('remote-a/pages/home', { mode: 'prefetch' }))
```

> The plugin configuration surface (`FederationOptions`) has **no** `host.prefetch` field — an older document wrongly claimed that config existed; the claim has been corrected. The preload list is just the constant in the host bridge; changing the list means changing exactly that one place.

Behavior and boundaries: preload failure **does not block the app** (the runtime emits the `fulgurjs:error` event with MFU-007 semantics plus a console warning); preloading injects `<link rel="modulepreload">` and `<link rel="stylesheet">` and never executes modules; `preload` waits for stylesheet load/error while `prefetch` loads in the background at low priority; the trigger is the host bridge executing synchronously on every page load (idempotent), with the actual prefetch happening in browser idle callbacks.

### 10.4 Federation diagnostics panel (a login-free page, no config items)

A project can build its own runtime diagnostics page (route `meta.ignoreAuth`), reading six blocks from the runtime registry live:

| Block | Content |
|---|---|
| ① Method module call demo | A button actually calls `loadRemote('remote/api')` and shows the result (a live sample of the method-reference channel) |
| ② Remotes status | Each remote's entry / load status (idle/loading/loaded/failed) / container load duration |
| ③ Shared negotiation | Shared key → version ← provider (multiple coexisting versions visible) |
| ④ Context snapshot | The value shape of every AppContext key (function reference / object / string, including the events pool) |
| ⑤ fulgurjs:error history log | Accumulated window events (timestamp + remote + error message); shows "no errors" when empty |
| ⑥ Remote resource load durations | fulgurjs / remoteEntry / chunk entries and durations from performance resource |

## Related documents

- Full plugin option fields and omitted semantics: [configuration reference](configuration.md)
- All CLI commands: [CLI reference](cli.md)
- All 48 error codes: [error code table](errors.md)
- Artifact endpoints and deployment rules: [deployment guide](../guide/deployment.md)
- Complete runnable projects: [examples](../../../examples/README.md)
