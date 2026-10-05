# Sub app bridge: embedding a full sub app (Vue ↔ React)

> Scenario: mount a **full sub app** (with its own Router/store/menus) into a host of the other framework — a Vue 3 host embedding a React 18/19 child app, or the reverse. What is embedded is the child app: it creates its own component tree and the host only provides a DOM container; **no component type conversion happens** (Vue's `remoteComponent` cannot render React components directly).
>
> 6.0.0 entries: the child app imports `defineBridgeApp` from `@fulgurjs/federation/vue` or `@fulgurjs/federation/react`; the host factories `createVueBridgeApp`/`createReactBridgeApp` likewise come from `/vue` and `/react`. The old `/bridge*` entries have been removed.

## Product scope

- Supported: bidirectional embedding with site-level mount/unmount; sub app internal routes synced with the host URL (explicit opt-in, see [URL sync](url-sync.md); default off = memory routing); controlled sessions (switch/logout); nesting (multiple bridge instances on one page, A→B→C multi-level).
- Not supported: component-level interconversion, Angular, SSR/RSC, JS sandbox, automatic CSS isolation (see [supported scope](../troubleshooting/compatibility.md) and the [sandbox boundary audit (Chinese)](../../maintainers/沙箱边界审计.md)).

## Dual-framework installation contract (required for bridge hosts)

A bridge host installs `vue` + `react` + `react-dom` together, with all three shared keys `singleton: true`:

```ts
// Bridge host fulgurjs.config.ts
import type { FederationOptions } from '@fulgurjs/federation'

export default {
  name: 'bridge-host',
  remotes: {
    'react-remote': { dev: 'http://localhost:5303/react-remote', prod: '/react-remote' },
  },
  shared: {
    vue: { singleton: true },
    react: { singleton: true },
    'react-dom': { singleton: true },
  },
} satisfies FederationOptions
```

The child app only installs and shares its own framework (Vue child app: `vue`; React child app: `react` + `react-dom`). Shared subpaths (`react/jsx-runtime`, `react/jsx-dev-runtime`, `react-dom/client`) are negotiated to a single instance by the shared mechanism; the host configuring shared for `react` and `react-dom` is the prerequisite for that subpath negotiation. The zero-other-framework promise of pure Vue/pure React projects is unaffected. Real symptoms of a missing singleton (Invalid hook call, two isolated instances) are error code `MFU-010` — the plugin runs the negotiation mechanism as-is and does not block misconfiguration. When multiple React major versions share a page, singleton cannot make incompatible versions compatible; isolate them into separate scopes per [version isolation](sharing.md#sharescope-group-isolation-react-1819-on-the-same-page).

## Child app side: `defineBridgeApp`

The module exposed as `./bridge` declares the contract object as its **default export**. The plugin verifies that both `mount`/`unmount` are functions, otherwise `MFU-015`.

**Vue child app** (`@fulgurjs/federation/vue`):

```ts
// src/bridge.ts — fulgurjs.config.ts: exposes: { './bridge': './src/bridge.ts' }
import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { defineBridgeApp } from '@fulgurjs/federation/vue'
import App from './App.vue'
import { routes } from './routes'

export default defineBridgeApp((props) => {
  const app = createApp({ setup: () => () => h(RouterView) }, props)
  const router = createRouter({ history: createMemoryHistory(), routes })
  app.use(router)
  return app   // Returns a fully assembled Vue App; mount/unmount are handled by the contract
})
```

**React child app** (`@fulgurjs/federation/react`; `react-dom/client` loads only at actual mount time):

```tsx
// src/bridge.tsx
import { MemoryRouter } from 'react-router-dom'
import { defineBridgeApp } from '@fulgurjs/federation/react'
import App from './App'

export default defineBridgeApp((props) => (
  <MemoryRouter>
    <App {...props} />
  </MemoryRouter>
))
```

Contract semantics (the `BridgeApp` interface; `/vue` and `/react` share the same type definitions):

- `mount(el, props?): void | Promise<void>` — returning `void` means the first root commit has completed synchronously (Vue mounts synchronously); returning a Promise keeps the host pending until it resolves after the first root commit (React fulfills it via the contract's built-in commit probe; `root.render()` returning does **not** count as success). Failures before the first commit must throw/reject (the host converts them to `MFU-016`, `details.phase: 'mount'`) and clean up the created app/root.
- `unmount(el): void` — synchronously invalidates that container's generation and cleans up; unknown containers are a no-op. Unmounting while pending immediately invalidates the current generation; a late success/failure must not revive the DOM, rewrite host state, or produce an unhandled rejection. An error thrown by unmount is caught by the host and reported as `MFU-016` (`phase: 'unmount'`); that container's cleanup state is uncertain, so the plugin **persistently locks out the container**: neither same-page "retry load" nor a session switch will remount into that container (the default placeholder removes the "Retry load" button); only a full page refresh recovers; residual resources (event subscriptions/timers/global side effects) must be honestly investigated and fixed.
- Contract instances are **keyed per container el**: mounting the same contract in multiple places does not interfere; mounting again into the same container without unmounting is rejected (`MFU-016`, container already occupied) and does not overwrite the original instance.
- Child app internal errors after the first root commit are the responsibility of the **child app's own error boundary** — the host's ErrorBoundary/errorCaptured cannot catch render errors across roots, and the plugin does not pretend to be the fallback.

The second argument of `defineBridgeApp(factory, { routing: true })` declares the URL sync protocol; see [URL sync](url-sync.md).

## Host side: `createVueBridgeApp` / `createReactBridgeApp`

**Vue host** (`@fulgurjs/federation/vue`):

```vue
<script setup lang="ts">
import { createVueBridgeApp } from '@fulgurjs/federation/vue'
import { getLatestHostContext } from './host-context'   // the host's own synchronous pure getter

const RemoteReactApp = createVueBridgeApp<{ message: string }>('react-remote/bridge', {
  loadingComponent: MyLoading,
  errorComponent: MyError,     // receives the error prop and takes over the display completely
  retries: 1,                  // integer 0–10
  timeout: 15000,              // positive finite ms
  getContext: () => getLatestHostContext(),
})
</script>

<template>
  <RemoteReactApp :session-key="loginKey" :app-props="{ message: 'Hello from the Vue host' }" />
</template>
```

**React host** (`@fulgurjs/federation/react`):

```tsx
import { createReactBridgeApp } from '@fulgurjs/federation/react'
import { getLatestHostContext } from './host-context'

const RemoteVueApp = createReactBridgeApp<{ message: string }>('vue-remote/bridge', {
  fallback: <Spinner />,
  error: (err, retry) => <ErrorBox error={err} onRetry={retry} />,
  getContext: () => getLatestHostContext(),
})

export default function BridgePage() {
  return <RemoteVueApp sessionKey={loginKey} appProps={{ message: 'Hello from the React host' }} />
}
```

Both ends side by side:

| Item | `createVueBridgeApp` (Vue host) | `createReactBridgeApp` (React host) |
|---|---|---|
| Factory options | `loadingComponent?` `errorComponent?` (receives the `error` prop, takes over completely) `retries?` (integer 0–10) `timeout?` (positive finite ms) `getContext?` | `fallback?` (pending placeholder) `error?` (node or `(error, retry) => ReactNode`) `retries?` `timeout?` `getContext?` |
| Returned component props | `appProps: P` (business data) + `sessionKey?: string \| null` (control parameter, not mixed into business props) | Same on the left, `ComponentType<{ appProps: P; sessionKey?: string \| null }>` |
| Generics | `createVueBridgeApp<P>(spec, options?)`; P constrains only `appProps` | Same on the left |
| spec | Full `<remote>/<expose>`, same resolution rules as `remoteComponent`; no remotePrefixes/schema/deriveSpec | Same on the left |
| Default error placeholder | Diagnostic message (error code + root cause + fix) + "Retry load / Refresh page" | Same on the left |

## `appProps` snapshot semantics (important)

**Top-level fields are shallow-copied at mount time**; nested objects/reactive stores/functions keep their original references. Later top-level replacements are **not tracked and do not re-render the child app** — to reset, rebuild explicitly with `:key`/key.

Host closures are not passed to the child app automatically. Three channels for live data, choose as needed:

| Scenario | What to use | Cost |
|---|---|---|
| The child app needs live host values (token, username, etc.) | Pass a **stable callback** (e.g. `getToken: () => store.token`); the child app gets the latest value when it calls | No remount; good for "reading" |
| Both sides share one piece of state | Pass the host store instance via `appProps` or AppContext; both sides subscribe to the same instance | Framework reactivity does not cross roots; the child app must subscribe itself |
| Must re-initialize with new props | The host changes the bridge component's `key` to remount explicitly (unmount → full load chain again) | All state resets; do not trigger frequently |

Crossing roots inherits nothing: no host provide/inject, Pinia, React Context, or routing — needed data goes through `appProps`, AppContext, shared instances, or the child app installs its own.

## Session (sessionKey) and AppContext

`sessionKey` controlled semantics — only three values are accepted, with completely different meanings:

| Value | Meaning |
|---|---|
| Omitted (`undefined`) | No controlled session; a snapshot can still be provided or the existing AppContext reused; if the remote declares `onSession`, the existing runtime rules apply (no sessionKey → `MFU-013`) |
| `null` | Logged-out state: unmount immediately, keep an empty container, no more loadRemote; the host then calls `clearAppContext()` and removes/disables cached private pages |
| Non-empty string | Login generation. First render goes: getContext (if provided) → validate snapshot/existing context → the bridge layer calls `provideAppContext` → loadRemote → contract validation → `contract.mount(el, appProps snapshot)`; the remote's `onSession` uses the same generation |

Illegal values such as empty strings or numbers are rejected at mount with `MFU-017`.

`getContext` is a **synchronous, side-effect-free getter**: called before the actual load on first load, retries, and session switches; it returns a snapshot object (Promises/thenables and non-objects are rejected — `MFU-016`, `phase: 'getContext'`). The bridge layer first validates that the snapshot's `sessionKey` matches the controlled value (on mismatch `MFU-017` and nothing is written globally); **after validation passes, the bridge layer calls `provideAppContext`** — the getter itself never writes globally. Without a getter, the existing `AppContext.sessionKey` must match the controlled value. On a generation switch, the bridge layer first calls `clearAppContext()` to clear old-account-only fields, then writes the new snapshot, guaranteeing zero residue of the old account.

Session change table:

| Trigger | Behavior |
|---|---|
| First render, `sessionKey` is a non-empty string | Full load chain (see above) |
| First render, `sessionKey` omitted | No controlled validation; a remote onSession without sessionKey reports `MFU-013` |
| `sessionKey` A→B | Recommended: the host first sets `null`, waits for unmount and `clearAppContext()`, then updates; on direct A→B, the wrapper first invalidates and unmounts A, and only after that completes writes B's context and mounts |
| `sessionKey` → `null` | Immediately invalidates the old load and unmounts; keeps an empty container and requests nothing more |
| Same-session re-render / only the `appProps` reference changes | No remount, no repeated loadRemote; business data is still the last mount snapshot |
| Clicking "Retry load" on the error placeholder | Rebuilds the attempt on the same page (loaded modules come from the runtime cache; failed entries re-fetch with a changed URL per the existing mechanism) |

**Multiple instances and page-level single session**: multiple instances of the same spec on one page are legal (contracts are keyed per el); `AppContext` is a page-level singleton — all controlled bridge instances on a page must share one session, and a later-mounted instance whose generation mismatches the active one is rejected with `MFU-017`. Hosting two accounts simultaneously on one page is not promised.

**Old requests never pretend to be cancelled**: work already inside `loadRemote` is not cancelled because the bridge layer invalidates it — late old results are discarded by generation (no mount, no overwrite, no unhandled rejection); the remote's `onSession` must honor the existing `signal.aborted` contract (check the signal after awaits and before writing private state).

## DOM ownership and lifecycle boundaries

- The wrapper component only creates and keeps a stable empty mount container; the pending/error placeholders are its siblings; host re-renders never patch inside the child app's root;
- React host StrictMode double effects (mount→cleanup→mount) are safe;
- Vue `<KeepAlive>` deactivate is not unmount — a child app in a cached page keeps its root and state; if you want destroy-on-leave, do not cache that page, and the logout flow should also remove cached private pages;
- Window-level listeners/timers/back-registrations inside the child app must be cleaned up by the child app (see [migration guide · page unmount cleanup checklist](../migration.md#6-page-unmount-cleanup-checklist)).

## Nesting

- Multiple instances on one page: mounting the same spec in several places is legal, keyed per container without interference; multiple bridge instances of different specs coexist just as legally;
- Multi-level nesting (A→B→C): each level is its own pair of "host factory + child app contract"; **bridge routing does not auto-proxy multiple levels** — C's URL sync is configured by B acting as a host itself; see [URL sync · out of scope](url-sync.md#out-of-scope);
- Runnable examples: templates [vue-host-react-remote](https://github.com/chenmingye/fulgurjs-federation/tree/master/examples/templates/vue-host-react-remote) / [react-host-vue-remote](https://github.com/chenmingye/fulgurjs-federation/tree/master/examples/templates/react-host-vue-remote) / [showcase](https://github.com/chenmingye/fulgurjs-federation/tree/master/examples/templates/showcase) (bidirectional + URL sync + multiple remotes coexisting).

## Error quick reference

| Error code | Trigger | Handling |
|---|---|---|
| `MFU-015` | The `./bridge` default export lacks `mount`/`unmount` or they are not functions | Build the contract object with `defineBridgeApp` |
| `MFU-016` | Bridge preparation/mount/unmount failure (`details.phase` distinguishes getContext/mount/unmount; the root cause carries the child app's original error) | Troubleshoot the child app initialization code by phase; a container whose unmount threw is persistently locked out — recover with a full page refresh |
| `MFU-017` | Session parameters inconsistent with AppContext (controlled sessionKey contradicts the global session, illegal values, page-level single-session conflict) | Unify controlled sessions on the page; change illegal values to a legal string/null/omitted |
| `MFU-013` | Remote declares onSession but the host lacks sessionKey | The host login flow provides a non-sensitive login generation ID (never a token) |
| `MFU-010` | The selected singleton version fails some consumer's requirement (double-instance-like symptoms when singleton is missing) | Bridge host: all three keys singleton; multiple React major versions: split scopes |
