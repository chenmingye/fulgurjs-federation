# Existing applications: required files first, optional capabilities second

## Choose the integration scope

| Need | Required integration | Do not add by default |
|---|---|---|
| Modules/components | Vite plugin; expose existing files; loadRemote/remoteComponent | Application factory, menu table, session files, Providers |
| Complete application | App config; one application factory; host mount view | No duplicated main/bridge bootstrap or repeated child menu registration |
| URL synchronization | Controlled child memory router; one host prefix/navigation port | The child must not write browser history |
| Authentication/session | Explicit host context/sessionKey | No mandatory session/context files for apps without this need |
| Global components/ancestor injection | Declare required setup.globalComponents/pageProviders | Do not wrap every component in the whole business app |

Directory names are optional. A small host can keep mounting and context in its existing view. Examples of different APIs are not instructions to create several directory trees.

## Preview integration before writing

Install `@fulgurjs/federation` in the existing application first. Run from its root, replacing files and addresses with real ones. The command does not install dependencies, start servers or guess ports.

```bash
# Provider: expose an existing component or module; review the full before/after text first.
npx fulgurjs init --plan --role provider --expose ./Button=./src/components/Button.vue
npx fulgurjs init --plan --role provider --expose ./Button=./src/components/Button.vue --write

# Consumer: declare the real development address.
npx fulgurjs init --plan --role consumer --remote remote-a=http://localhost:5174/remote-a
npx fulgurjs init --plan --role consumer --remote remote-a=http://localhost:5174/remote-a --write

# Whole applications: inspect these plans, then append --write when satisfied.
npx fulgurjs init --plan --kind app --role provider
npx fulgurjs init --plan --kind app --role consumer --remote remote-a=http://localhost:5174/remote-a
```

The default component/module mode generates configuration and connects Vite without application, menu, Provider or session files. Consume using `loadRemote('remote-a/math')` or same-framework `remoteComponent('remote-a/Button')` in an existing view, supplying required props. Start remote development servers separately. The suggested production path is `/remote-a`; check it against actual deployment/base before building.

Application mode extracts supported minimal `src/main.ts(x)` entries into one `application` and exposes `./bridge`. A consumer gets `src/fulgurjs/RemoteApplication.vue` or `.tsx` to include in an existing page/route. It does not automatically enable sessions or URL synchronization: wire the real session source and one mounting prefix/navigation port when needed, following the [URL guide](url-sync.md). Child menus remain owned by the child. Cross-framework application dependency requirements are described in the [bridge guide](app-bridge.md).

### Safe automation boundaries

- Supported Vite forms: direct objects, `defineConfig` objects and recognizable single-return arrow factories. Existing plugins, ports and comments remain; a plugin factory value can be preserved as a nested PluginOption.
- Supported minimal entries use named `createApp` for Vue or named `createRoot` with JSX for React. Existing Router/store, guards, asynchronous initialization and custom entry layouts require the factory organization below; the tool never guesses business semantics.
- Ambiguous control flow, interpolated templates, top-level spreads, duplicate plugins and existing manual wiring become blocking tasks. **No files in that plan are written.** File locations and manual integration snippets are reported.
- Existing config files and manually changed mounting views are preserved. Repeating the same plan does not insert duplicate wiring. Preview does not execute business modules or Vite configuration. `--force` does not apply to integration plans.
- Writes recheck file snapshots and roll back on failure. After interruption, `.fulgurjs-init-pending.json` records recovery: run `npx fulgurjs init --rollback`. Subsequent manual edits are protected; reconcile them using the record if automatic recovery refuses. Successful recovery deletes the record; do not commit it.
- Follow successful writes with `npx fulgurjs doctor --config ./fulgurjs.config.ts`, project typechecking/build and real interaction checks. Writing files is not browser acceptance or a completed business migration.

Plain `init` generates only a starter configuration; `init --config` validates an existing declaration. Do not combine plan/write with `--config/--out/--force`. See [CLI reference](../reference/cli.md#fulgurjs-init) for all flags, JSON and exit codes.

## Vue: share one factory between two entry modes

```ts
import { createApp } from 'vue'
import { createRouter, createMemoryHistory, createWebHistory } from 'vue-router'
import { defineApplication } from '@fulgurjs/federation/vue'
import App from './App.vue'
import { routes } from './router/routes'

interface AppProps { label?: string }
export default defineApplication<AppProps>((props, { mode, signal }) => {
  const router = createRouter({
    history: mode === 'bridge' ? createMemoryHistory() : createWebHistory(import.meta.env.BASE_URL),
    routes,
  })
  const app = createApp(App, { ...props })
  // Reuse business plugins/guards here. Check signal.aborted before asynchronous writes.
  // Do not install this router early: the application contract installs and waits for it.
  return { app, router }
}, { routing: true })
```

### Load large application implementations at startup

When existing business code has TS diagnostics unrelated to the exposed contract, import components, routes and business plugins inside the asynchronous factory. Keep one `application.ts`; no forwarding file or whole-project TS cleanup is required:

```ts
export default defineApplication<AppProps>(async (props, { mode }) => {
  const { default: App } = await import('./App.vue')
  const { routes } = await import('./router/routes')
  const router = createRouter({
    history: mode === 'bridge'
      ? createMemoryHistory()
      : createWebHistory(import.meta.env.BASE_URL),
    routes,
  })
  const app = createApp(App, { ...props })
  return { app, router }
}, { routing: true })
```

Reuse the public imports and `AppProps` above, removing the top-level static App/routes imports. Load runtime-only business plugins and icon registration in the factory as well. The plugin still checks the application entry and static public declaration dependencies; runtime implementation trees are not treated as public type contracts. Browsers cache modules, but each factory invocation must create fresh app/router/store instances. Use `fulgurjs types` to verify declaration generation.

App/routes are existing business code. main.ts imports the factory and calls `void application.start('#app').catch(console.error)`. Expose `./bridge` directly from `./src/application.ts`; no forwarding bridge file is needed. Standalone starts a web router and waits for isReady. Routing-enabled bridge mode connects its controlled memory router and waits for the initial deep link. Without routing enabled, a returned local memory router is also installed and awaited automatically. A missing routing channel fails explicitly.

If initialization must continue after routing becomes ready, use the explicit installVueBridgeRouter flow and return only app; do not return an already installed router for a second installation. When returning app alone, the factory owns router installation/readiness.

## React: native and controlled routers in one factory

```tsx
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { defineApplication, createReactBridgeRouter } from '@fulgurjs/federation/react'
import { routes } from './routes'

export default defineApplication((_props, { mode, routing, signal }) => {
  if (mode === 'bridge') {
    const connection = createReactBridgeRouter(routing!, routes, { signal })
    return { element: connection.element, dispose: connection.dispose }
  }
  const router = createBrowserRouter(routes, { basename: import.meta.env.BASE_URL })
  return { element: <RouterProvider router={router} />, dispose: () => router.dispose() }
}, { routing: true })
```

React factories synchronously return JSX or `{ element, dispose? }`. main.tsx calls application.start('#root'); expose points at application.tsx. start resolves at the first root commit, not completion of all loaders/requests. An application without routing can return JSX directly and omit routing.

## Start, cancel, dispose

```ts
const handle = await application.start('#app', { label: 'Standalone' })
handle.unmount()
```

- The container must exist. Repeated start/mount in an occupied container fails.
- `application.unmount(element)` cancels a pending start; start rejects with AbortError and late work cannot remount. Business asynchronous writes still check signal.
- An old handle cannot dispose a new generation. Disposal failures block the container until a full refresh; props/session changes cannot bypass it.
- Create a new app/router/business store instance for each factory call. Do not return a module-global instance to several containers.
- mode is instance-local. hasBridgeMount(context) is true for bridge factories and false for standalone factories; no window mode flag is needed.

## Pinia ownership

Keep native Pinia injection in ordinary component setup. For asynchronous callbacks that cannot depend on global activePinia, bind the actual app instance explicitly:

```ts
import { createPinia, defineStore } from 'pinia'
import { bindStoreToApp } from '@fulgurjs/federation/vue'
const definition = defineStore('counter', { state: () => ({ count: 0 }) })
const pinia = createPinia() // inside this app's factory
const useCounter = bindStoreToApp(definition, pinia)
async function increment() { await Promise.resolve(); useCounter().count++ }
```

Pass this bound function through instance-owned provide/business assembly. Types, $id, and HMR properties remain intact. Explicit useCounter(otherPinia, hot) still wins; omitted/null arguments use the owner. No global activePinia switching or automatic rewriting occurs.

A single default app can pass a getter when Pinia does not exist at module evaluation; missing ownership throws. Parallel instances must bind actual instances or use native injection, not one mutable module variable overwritten by later factories. A React host that does not use Pinia should not register a Pinia provider merely because its child uses it.

## Preflight and deployment checks

```bash
npx @fulgurjs/federation doctor --config ./fulgurjs.config.ts
npx @fulgurjs/federation doctor --config ./fulgurjs.config.ts --json
npx @fulgurjs/federation doctor --base https://your-site --apps host,remote
```

Source mode executes the config only; it does not execute business modules, request sites, or edit files. Missing files are FAIL. Address/history/state/glob risks are WARN with actionable suggestions. Unresolved dynamic paths, globs, external directories and the 256-file limit make complete=false. Only relative imports and @/, /@/, ~/ aliases are followed; custom aliases require the project compiler and manual review. Static preflight is not type checking or browser acceptance.

## Classify the file map

| Category | Examples | Required for everyone? |
|---|---|---|
| Federation integration | Config, child application factory, host mount view | Depends on selected capability |
| Existing entry wiring | main start call, Vite plugin, router construction | Modify existing code; do not clone bootstrap |
| Business additions | Login, dictionary, permissions, registration, ancestors | Only actual dependencies |
| Previous-system migration | Remove qiankun bootstrap/window flags | Absent in a new project |
| Related fixes | Late requests, form hydration, old menus | Not general plugin requirements |
| Generated/build files | Declarations, locks, assets | Separate from handwritten integration; do not edit generated types |

remoteComponent remains the component API. defineBridgeApp remains a current API for a custom bridge-only entry. defineApplication shares assembly when both entry modes are needed.

Source demos: [Vue](../../../fixtures/application-start/vue/src/application.ts), [React](../../../fixtures/application-start/react/src/application.tsx), [README](../../../fixtures/application-start/README.md). These are maintainer fixtures using local link dependencies; public templates must use a published registry package.

The five public templates and the same-frame demo now use application factories and thin main entries. They depend on the exact registry version. Install published packages as described in each README.
