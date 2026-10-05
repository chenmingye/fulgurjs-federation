# 6.0.0 migration guide

> 6.0.0 completes **public entry unification**: Vue apps, React apps, and framework-agnostic modules each have exactly one entry, and all bridge and route-sync APIs are merged into `/vue` and `/react`. This guide covers every breaking change from 5.x to 6.0.0, each with an old → new mapping and before/after code. For even earlier breaking changes of historical versions (≤5.9.x, the 5.0.0 removals), see the appendix at the end.

## 1. 6.0.0 breaking changes at a glance

| # | Change | Impact | Migration action |
|---|---|---|---|
| 1 | Entry `/bridge` (aggregate) removed | Code importing `createVueBridgeApp`/`createReactBridgeApp` from `/bridge` fails with an exports resolution error | Import from `/vue` and `/react` respectively (see the mapping below) |
| 2 | Entries `/bridge/vue`, `/bridge/react` removed | Vue/React bridge host factory imports fail | `createVueBridgeApp` → `@fulgurjs/federation/vue`; `createReactBridgeApp` → `@fulgurjs/federation/react` |
| 3 | Entries `/bridge/router/vue`, `/bridge/router/react` removed | URL sync API imports fail | All four route-sync APIs merged into `/vue` and `/react` |
| 4 | `/runtime` no longer exports Vue's `remoteComponent`, `createHostPages`, `defineBridgeApp` | Code importing these three Vue APIs from `/runtime` gets undefined/errors | Import from `@fulgurjs/federation/vue`; `/runtime` stays framework-agnostic (full runtime + context + pages + remoteSchema, zero Vue/React/router dependency) |
| 5 | `fulgurjs init` flag consolidated: `--template` renamed to `--out` | The old flag is still accepted but interpreted as the output path, with a rename hint (removed in a later version) | Use `fulgurjs init --out <path>` |

The aggregate `/bridge` could be tree-shaken in production builds, but **dev native ESM has no tree-shaking guarantee** (it would execute both host adapters) — after entry unification this problem disappears: `/vue` has zero React, `/react` has zero Vue.

## 2. Import mapping table (old → new)

| API | Old import (≤5.9) | New import (6.0.0) |
|---|---|---|
| `federation` / `FederationOptions` | `@fulgurjs/federation` | `@fulgurjs/federation` (unchanged) |
| `loadRemote`/`loadShare`/`preloadRemote`/`getContainer`/`registerRemote(s)`/`registerShare`/`initSharing`/`registerPlugins`/`getRuntime`/`shareScopeMap`/`unwrapDefault`/`version`/`clearSessionState`/`parseSpec`/`getLoadedShare`/`pinLoadedShare` | `@fulgurjs/federation/runtime` (or the same names from `/vue`, `/react`) | Unchanged; React apps may also uniformly import from `/react` |
| `provideAppContext`/`getAppContext`/`requireAppContext`/`clearAppContext` | `/runtime` (or `/vue`, `/react`) | Unchanged; framework-agnostic |
| `definePages`/`validatePages`/`remoteSchema` | `/runtime` (or `/vue`, `/react`) | Unchanged |
| `remoteComponent` (Vue form) | `@fulgurjs/federation/runtime` | **`@fulgurjs/federation/vue`** |
| `createHostPages` (Vue form) | `@fulgurjs/federation/runtime` | **`@fulgurjs/federation/vue`** |
| `remoteComponent`/`useLoadRemote`/`RemoteErrorBoundary`/`createReactHostPages` (React) | `@fulgurjs/federation/react` | Unchanged |
| `defineBridgeApp` (Vue child app) | Old entry `/runtime` or aggregate `/bridge` | **`@fulgurjs/federation/vue`** |
| `defineBridgeApp` (React child app) | Old entry `/react` or aggregate `/bridge` | Unchanged (`/react`) |
| `createVueBridgeApp` | Old entry `bridge/vue` (or aggregate `/bridge`) | **`@fulgurjs/federation/vue`** |
| `createReactBridgeApp` | Old entry `bridge/react` (or aggregate `/bridge`) | **`@fulgurjs/federation/react`** |
| `createVueBridgeNavigation`/`connectVueBridgeRouter` | Old entry `bridge/router/vue` | **`@fulgurjs/federation/vue`** |
| `createReactBridgeNavigation`/`createReactBridgeRouter` | Old entry `bridge/router/react` | **`@fulgurjs/federation/react`** |
| `RuntimePlugin`/`RemoteConfig`/`SharedHint` and other types | `/runtime`, package root | Unchanged |

Mnemonic: **"whatever framework the app runs, import from that framework's entry"** — everything Vue from `/vue`, everything React from `/react`, pure TS modules used by both from `/runtime`, Vite config from the package root.

## 3. Before/after code examples

### 3.1 Vue child app bridge contract

```ts
// ── Old (5.x) ──
import { defineBridgeApp } from '@fulgurjs/federation/runtime'

export default defineBridgeApp((props) => {
  const app = createApp(App, props)
  return app
})
```

```ts
// ── New (6.0.0) ──
import { defineBridgeApp } from '@fulgurjs/federation/vue'

export default defineBridgeApp((props) => {
  const app = createApp(App, props)
  return app
})
```

### 3.2 Vue host mounting a React child app

```ts
// ── Old (5.x): imported from the old entry bridge/vue (under the @fulgurjs/federation package root, removed in 6.0.0) ──
import { createVueBridgeApp } from '…/bridge/vue'
const RemoteReactApp = createVueBridgeApp('react-remote/bridge', { retries: 1 })
```

```ts
// ── New (6.0.0) ──
import { createVueBridgeApp } from '@fulgurjs/federation/vue'
const RemoteReactApp = createVueBridgeApp('react-remote/bridge', { retries: 1 })
```

### 3.3 URL sync (Vue host + Vue child app, both ends)

```ts
// ── Old (5.x) ── (old entry bridge/router/vue, removed in 6.0.0)
// Host
import { createVueBridgeNavigation, type BridgeHostRouting } from '…/bridge/router/vue'
const navigation = createVueBridgeNavigation(router)
const routing: BridgeHostRouting = { basePath: '/approval', navigation }
// Child app
import { connectVueBridgeRouter } from '…/bridge/router/vue'
await connectVueBridgeRouter(ctx.routing!, router, { signal: ctx.signal }).ready
```

```ts
// ── New (6.0.0) ──
// Host (same entry as createVueBridgeApp)
import { createVueBridgeApp, createVueBridgeNavigation, type BridgeHostRouting } from '@fulgurjs/federation/vue'
const navigation = createVueBridgeNavigation(router)
const routing: BridgeHostRouting = { basePath: '/approval', navigation }
// Child app (same entry as defineBridgeApp)
import { defineBridgeApp, connectVueBridgeRouter } from '@fulgurjs/federation/vue'
await connectVueBridgeRouter(ctx.routing!, router, { signal: ctx.signal }).ready
```

### 3.4 React host URL sync

```tsx
// ── Old (5.x) ── (old entries bridge/react and bridge/router/react, removed in 6.0.0)
import { createReactBridgeApp } from '…/bridge/react'
import { createReactBridgeNavigation, createReactBridgeRouter } from '…/bridge/router/react'
```

```tsx
// ── New (6.0.0) ──
import {
  createReactBridgeApp,
  createReactBridgeNavigation,
  createReactBridgeRouter,
  defineBridgeApp,
} from '@fulgurjs/federation/react'
```

### 3.5 Vue host per-page pages (Vue APIs moved out of `/runtime`)

```ts
// ── Old (5.x) ──
import { createHostPages, remoteComponent } from '@fulgurjs/federation/runtime'
```

```ts
// ── New (6.0.0) ──
import { createHostPages, remoteComponent } from '@fulgurjs/federation/vue'
```

### 3.6 Pure TS modules (no migration)

```ts
// Old and new are identical: framework-agnostic code always imports from /runtime
import { loadRemote, loadShare } from '@fulgurjs/federation/runtime'
```

## 4. Migration steps (mechanical replacement suffices)

1. **Globally search for the old subpaths**: search your source for `bridge/vue`, `bridge/react`, `bridge/router/vue`, `bridge/router/react`, `/bridge'` and other old entry references — the 6.0.0 package no longer has those exports, and the build error points at every occurrence;
2. **Rewrite imports per the mapping table in section 2**: the contents of `/bridge/vue`, `/bridge/react`, `/bridge/router/vue`, `/bridge/router/react` merged into `/vue` and `/react` respectively; multiple bridge APIs in one file collapse into a single import statement;
3. **Audit the `/runtime` import surface**: anything importing `remoteComponent`/`createHostPages`/`defineBridgeApp` (Vue-only APIs) from `/runtime` moves to `/vue`; all other `/runtime` exports are unchanged;
4. **Finish with TS diagnostics**: run `vue-tsc --noEmit`/`tsc --noEmit` on changed files, confirming no `Failed to resolve import`/ts(2307); if the IDE reports ts(2307), `Restart TS Server` first to clear the TS service cache;
5. **Verify the dev request graph**: the bridge host's dev first paint no longer loads the other framework's adapter (`/vue` host executes zero React, and vice versa);
6. **`fulgurjs init --template` callers**: switch to `--out` (the old name still works but prints a rename hint).

## 5. Migrating from other micro-frontend solutions (concept mapping)

API-level concept mapping when moving in from qiankun-style solutions (generic technical conclusions, not business-specific):

| Old solution concept | @fulgurjs/federation equivalent |
|---|---|
| Main app registerMicroApps | Host `federation({ remotes })` |
| Child app entry (HTML) | Remote entry (dev: `@fulgurjs-entry.js` middleware / prod: `fulgurjs-remoteEntry.js`) |
| Child app lifecycle mount/unmount | Page-level exposes (the component is the entry, no lifecycle boilerplate); startup-time initialization = remote `federation({ setup })` (setup/onSession); whole-app embedding = the bridge contract's `mount`/`unmount` (`defineBridgeApp`) |
| Window isolation/sandbox | No sandbox: same-realm direct rendering (conclusions and boundaries in the [sandbox boundary audit (Chinese)](../maintainers/沙箱边界审计.md)) |
| Props passing | Component props (component level); `appProps` (bridge level, mount snapshot semantics); AppContext (cross-app context) |
| Common-dependency externals | `shared` (singleton negotiation, "already-loaded first") |
| qiankun runtime + single-spa | `@fulgurjs/federation/runtime` (~20KB runtime kernel, no single-spa) |

## 6. Page unmount cleanup checklist

The qiankun-style `unmount` forces child apps to clean window-level resources; federation **component-level** unmount does not clean automatically — the following resources must be removed by the page component itself in `onUnmounted` (effect cleanup in React), otherwise navigating away and back re-registers/re-fires:

| Resource | How to clean up |
|---|---|
| Back-registrations like `getAppContext().events.<prefix>.xxx = fn` | Delete the property on unmount (compare the function reference, then delete) |
| `window.addEventListener(...)` | Keep the function reference and `removeEventListener` on unmount |
| `setInterval` / `setTimeout` | `clearInterval` / `clearTimeout` on unmount |
| Other global keys you attached | Explicitly delete likewise |

```ts
import { onUnmounted } from 'vue'
import { getAppContext } from '@fulgurjs/federation/vue'

const onHostEvent = (e: unknown) => { /* ... */ }
getAppContext().events!.bpm = { onHostEvent }
onUnmounted(() => {
  const events = getAppContext().events
  if (events?.bpm?.onHostEvent === onHostEvent) delete events.bpm.onHostEvent
})
```

> A lightweight reminder, not a plugin mechanism: the vast majority of pages only make data requests (which end naturally when the component is destroyed) and need no cleanup; pages with global side effects should walk through this checklist item by item. Full sub apps mounted via the bridge are cleaned at container level by the contract's `unmount`; an unmount that throws persistently locks out the container (only a full page refresh recovers), so the child app's cleanup logic must be robust.

## 7. First-use pitfall checklist (general engineering issues)

| # | Pitfall | Symptom | Fix |
|---|-----|------|------|
| 1 | Not clearing `.vite` after a plugin upgrade | Pages render with old logic / facade signature drift 404 (DEV-009) | `rm -rf node_modules/.vite` + restart dev + switch browser profile |
| 2 | pnpm tarball install leaves broken symlinks | `Cannot find module '@fulgurjs/federation'` | Reinstall and verify the directory resolves |
| 3 | UMD/CJS dependency moved out of pre-bundling | Bare CJS white screen in dev, `Cannot destructure property 'node'` (DEV-004) | Put it back into `optimizeDeps.include` (the plugin externalizes shared keys automatically) |
| 4 | Adding an ESM alias for a shared dependency | Build-time `xxx.default.extend is not a function` | **Must be removed for build** (prod rollup double interop); in dev, if the dependency was moved out of pre-bundling, its CJS subpaths need a dev-only alias (injected only when `command==='serve'`) |
| 5 | Asserting before the async login chain completes | e2e intermittently bounced back to the login page | Wait for "the login form to disappear" rather than a fixed number of seconds; leave generous timeouts for slow chains |
| 6 | Multi-version component library CSS | Later-loaded overrides clobber `:root` variables | Harmless if mainstream versions share the same variables; watch it during upgrades |
| 7 | Backend missing an endpoint | 404/401 resource errors | Add an honest empty-response shim at the proxy/NGINX layer (never fabricate business data) |
| 8 | Remote pages (expose target files) statically importing the runtime | Worrying about double instances | Just import statically — the plugin rewrites it into a lazy singleton proxy, identical to host code |

## Appendix: legacy APIs removed in 5.0.0 (for cross-version upgraders)

5.0.0 was a deliberate breaking cleanup. Passing a legacy API always fails with a "current value → reason → migration" error; it is never silently accepted:

| Removed (5.0.0) | Replacement |
|---|---|
| The `@fulgurjs/federation/config` subpath (`defineRepoConfig` / `loadRepoConfig` / `federationOptionsForApp` / `RepoConfig` and other aggregate types) | One `fulgurjs.config.ts` per app root whose default export directly `satisfies FederationOptions`; `host.pages`/`remotePrefixes`/`deriveSpec` become the `hostPages` named export |
| CLI `--app <app name>` (aggregate config selector) | Run `fulgurjs explain` / `fulgurjs check-pages` directly in each app root; passing `--app` errors with a migration message |
| check-pages' old aggregate form's local dist fallback | `--manifest <remote>=<path\|URL>` or `--site <URL>` (an explicit source failing honestly reports "cannot verify" — it never pretends to pass) |
| `federation()` options: `remoteType`, `library`, `automaticAsyncBoundary`, `dataPrefetch`, `usedExports`, `ignoreUnusedSharedExports` | Delete the field outright: remoteEntry is always ESM, the TLA async boundary is always on, and tree-shaking is native to the bundler; for preloading call `preloadRemote()` at runtime (a `/runtime` export). Passing any value (including historically valid ones) reports `CFG-011` |
| The old "expose a bootstrap module + host calls it manually" initialization pattern | `federation({ setup })`: default-export `setup(context)` runs once per app + named export `onSession(context)` deduplicated per session |

For the complete version history see the [CHANGELOG](../../CHANGELOG.md).
