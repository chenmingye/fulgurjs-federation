# URL sync: sub app routes ↔ host browser address

> Bridge defaults to **memory routing**: sub app internal navigation does not change the browser address, and a refresh cannot restore the sub app's internal page. URL sync makes the **host URL express the sub app's internal location** — refresh lands directly, bookmarks/sharing, back/forward, and host menu navigation all behave consistently. It is an explicit opt-in, **off by default** (without sync, sub app internal navigation does not touch the host address — that is normal behavior).
>
> 6.0.0 entries: `createVueBridgeNavigation`/`connectVueBridgeRouter`/`createReactBridgeNavigation`/`createReactBridgeRouter` all import from `@fulgurjs/federation/vue` or `@fulgurjs/federation/react`. The old `/bridge/router/vue` and `/bridge/router/react` have been removed. Router libraries are optional peers: `/vue` does not require vue-router, `/react` does not require react-router-dom — the corresponding library is only needed when the route-sync APIs are actually called (the React side errors clearly when the dependency is missing).

## Effect

```text
Host address /approval/list        → sub app /list
Host address /approval/detail/42   → sub app /detail/42
Refresh /approval/detail/42       → sub app lands directly on the detail page (deep link)
Browser back/forward               → the sub app location follows
Host guard rejects                 → URL/history/sub app location all unchanged
```

## Architecture conventions

- The host Router is the **only writer** of browser history; the sub app uses a controlled memory router;
- The two ends exchange location through an independent routing channel (not via appProps, not via AppContext);
- Within the same instance, path/search/hash changes **do not remount the root, do not rebuild the store, do not reload the remote**;
- The sub app installs its own internal router as usual (vue-router/react-router-dom), which does not interfere with the federation's shared negotiation.

## ① Host side (Vue Router 4, history or hash mode)

**Step 1: declare suffix matching in host routes** (without it, detail navigation unmounts the sub app):

```ts
// main.ts
import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL), // use createWebHashHistory for hash mode
  routes: [
    { path: '/', component: Home },
    // Catch every sub path under /approval and render the bridge page
    { path: '/approval/:pathMatch(.*)*', component: ApprovalBridgePage },
  ],
})

// A real permission guard: rejection → the channel receives cancelled; URL/history/sub app location all unchanged
router.beforeEach((to) => (to.path.startsWith('/approval/secret') ? false : undefined))
```

**Step 2: create the navigation port on the bridge page and pass it to the bridge component**:

```vue
<!-- ApprovalBridgePage.vue: the routing prop = an independent control channel -->
<script setup lang="ts">
import { createVueBridgeApp, createVueBridgeNavigation, type BridgeHostRouting } from '@fulgurjs/federation/vue'

const navigation = createVueBridgeNavigation(router) // Vue Router fullPath is already the logical path; no deployment base needed
const routing: BridgeHostRouting = { basePath: '/approval', navigation }
const RemoteApp = createVueBridgeApp('react-remote/bridge', { /* factory options as in the bridge guide */ })
</script>

<template>
  <RemoteApp :session-key="sess" :routing="routing" :app-props="props" />
</template>
```

## ② Host side (React Router, data router mode only)

`createReactBridgeNavigation(router, { basename, canNavigate })` supports only the **data router** (`createBrowserRouter` / `createHashRouter` + `RouterProvider`); declarative mode (`BrowserRouter`) has no cancellation semantics and is not supported. React Router requires ≥ 6.11 (`createMemoryRouter`).

```tsx
// main.tsx
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { ApprovalBridgePage } from './ApprovalBridgePage'

const router = createBrowserRouter([
  { path: '/', element: <Home /> },
  { path: '/approval/*', element: <ApprovalBridgePage /> },
])

export function App() {
  return <RouterProvider router={router} />
}
```

```tsx
// ApprovalBridgePage.tsx
import { useNavigate } from 'react-router-dom'
import { createReactBridgeApp, createReactBridgeNavigation } from '@fulgurjs/federation/react'

export function ApprovalBridgePage() {
  const navigate = useNavigate()
  const navigation = createReactBridgeNavigation(navigate, { basename: '/' })
  const routing = { basePath: '/approval', navigation }
  const RemoteApp = createReactBridgeApp('vue-remote/bridge', { /* factory options as in the bridge guide */ })
  return <RemoteApp sessionKey={sess} routing={routing} appProps={props} />
}
```

`canNavigate` is optional and only an early rejection; the port observes the real blocker state — wait for `reset()` to resolve as cancelled, and for the actual location to commit after `proceed()` to count as committed; **you cannot judge success solely by the settle of navigate's Promise**.

## ③ Child app side (declare the protocol and wire the controlled router)

**Vue child app**: `defineBridgeApp(factory, { routing: true })` — the factory's second parameter receives `{ signal, routing }`:

```ts
// src/bridge.ts (Vue child app)
import { createApp, h } from 'vue'
import { createRouter, createMemoryHistory, RouterView } from 'vue-router'
import { defineBridgeApp, connectVueBridgeRouter } from '@fulgurjs/federation/vue'

export default defineBridgeApp(async (props, ctx) => {
  if (!ctx?.routing) throw new Error('This contract requires the host to enable URL sync')
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/list', component: List },
      { path: '/detail/:id', component: Detail },
    ],
  })
  // Install after the initial push settles (order must not be reversed)
  await connectVueBridgeRouter(ctx.routing!, router, { signal: ctx.signal }).ready
  const app = createApp({ setup: () => () => h(RouterView) }, props)
  app.use(router)
  return app
}, { routing: true })
```

**React child app**: `createReactBridgeRouter` returns `{ element, dispose(), routerReady }`, where `element` is a directly usable `RouterProvider` element:

```tsx
// src/bridge.tsx (React child app)
import { createReactBridgeRouter } from '@fulgurjs/federation/react'
import { defineBridgeApp } from '@fulgurjs/federation/react'

export default defineBridgeApp((_props, ctx) => {
  if (!ctx?.routing) throw new Error('This contract requires the host to enable URL sync')
  return createReactBridgeRouter(ctx.routing, [
    { path: '/list', element: <List /> },
    { path: '/detail/:id', element: <Detail /> },
  ], { signal: ctx.signal }).element
}, { routing: true })
```

`routerReady: Promise<Router>` is the wired memory-router readiness contract: the fast path (module-level warmup settled — the overwhelmingly common case) returns an **already-resolved** Promise whose value equals `element.props.router`; the slow path (a rare warmup race) resolves when the lazy host finishes wiring on first render; a missing react-router-dom rejects with a clear error. Hosts/tests that need to introspect the router instance (e.g. asserting the current location) should `await routerReady` instead of assuming `element.props.router` exists synchronously. After teardown (`dispose()` / `signal` abort), late router operations never write navigation state.

The third argument of the wiring on both ends, `{ signal?: AbortSignal }`, defaults to empty; passing `ctx.signal` is recommended for automatic dispose — without it, the child app must explicitly call the connection's `dispose()`.

## Behavior contracts and boundaries

### basePath

- A **static absolute path** from the host routing perspective; empty/root/with query·hash·wildcard is rejected (`MFU-030`);
- Matches by path segment: `/approval` hits `/approval/detail/1` but not `/approval-old`;
- Prefixes of concurrent sync instances on one page must not be identical or overlap;
- `/approval` corresponds to the sub app `/`; the root redirect is defined by the sub app's routes and normalized via replace (no phantom extra history entry).

### Vite base and routing layering (subdirectory deployment)

When deployed under `/erp/`: Vite base and the host Router base are `/erp/`, while the bridge `basePath` remains `/approval` (Vue Router has already stripped the history base; the React port takes `basename`). The logical paths output by the adapter carry no deployment prefix, so `/erp/erp/...` can never be produced.

### Sub app logical paths must not contain the basePath

The sub app uses only its own logical paths (`/approval` corresponds to the sub app's `/`). If the sub app navigates with a host-style full path (e.g. `router.push('/approval/list')`), the host URL stacks into `/approval/approval/list` and both sides then self-consistently keep the wrong prefix. Such targets are rejected **before the first host history write** (`MFU-032`, with the de-prefixed target suggested in the error); the host history stays untouched and the sub app remains at its last confirmed location. A manually pasted `/approval/approval/list` in the address bar is still broadcast host-authoritatively (the sub app receives `/approval/list`) and never bounces.

### Three-part location equality

search/hash are **preserved verbatim**: repeated query keys, encoding, non-ASCII characters, and fragments are never double decoded/encoded; parameter-only changes also sync, without a remount.

### Cancellation semantics

- Vue Router 4: push/replace settling with a `NavigationFailure` is a real cancellation;
- React Router data router: wait on the real blocker's cancel/proceed; `canNavigate` is only an optional early rejection;
- After cancellation, URL, history, and the sub app location stay at the last confirmed state, and **there is never an automatic retry** (a function return from `router.push` never poses as a committed success);
- Guard/loader/port execution errors reject the Promise (`MFU-033`, with cause preserved) and are never disguised as cancelled.

### Navigation and errors

- Sub app push/replace preserve the original action; go/back/forward delegate to host history;
- Consecutive requests settle serially; external navigation invalidates old in-flight and queued requests;
- A custom `BridgeHostNavigation.navigate(target, action, { signal })` should re-check the optional signal before an async commit and forbid late writes once aborted.

### Session and lifecycle

- Account switch/logout (`sessionKey→null`) invalidates the old channel — navigation on the old channel is always cancelled, writes no URL, and never revives the sub app;
- Notifications after unmount are dead (the channel is destroyed; re-subscribing yields `MFU-031`);
- KeepAlive-cached off-page instances pause route writes (they do not seize the URL, do not destroy the channel, and re-sync on activation);
- The persistent lockout of a container whose unmount threw cannot be bypassed via routing.

### Protocol validation and error codes

| Error code | Trigger | Behavior |
|---|---|---|
| `MFU-030` | Illegal basePath (empty/root/with query·hash·wildcard) or overlapping prefixes on one page | Rejected at configuration time |
| `MFU-031` | The host demands sync but the child app did not declare `{ routing: true }`; or the channel is reused after destruction | Placeholder error, **never silently falls back to memory while pretending the deep link worked** |
| `MFU-032` | The sub app navigates outside its own prefix (`../`, across prefixes), its target already contains the basePath (duplicated prefix), an illegal `go` argument, or a request on a dead channel | That navigation is rejected (host history stays untouched) |
| `MFU-033` | Route preparation/sync failure (redirect overflow or a navigation error, with the target chain/cause attached) | Explicit error, no silent fallback |

More than 5 consecutive internal replaces (a redirect loop) are reported as `MFU-033` (with the target chain attached; never silently back to the entry).

### Lazy loading and bundle size

- The default `/vue` and `/react` entries pull in no router library; the route-sync APIs only type-import vue-router/react-router-dom plus module-level on-demand prewarming — a pure component project that never uses route sync has zero router dependency;
- When react-router-dom is missing on the React side, only an actual call to `createReactBridgeRouter` errors, clearly.

## Out of scope

SSR/RSC, cross-browser windows, automatic route proxying for nested multi-level bridge child apps, and built-in adapters for TanStack Router or other router libraries (custom extension via the `BridgeHostNavigation`/`BridgeChildRoute` ports is possible).

## Full runnable example

The [showcase template](https://github.com/chenmingye/fulgurjs-federation/tree/master/examples/templates/showcase): Vue/React dual hosts × dual remotes, deep-link refresh, back/forward, guard cancellation, non-ASCII/encoded parameters, deployment base (for subdirectory + hash-mode inner snippets, see the runnable reference implementations in the repository under `fixtures/host-bridge-*/`).
