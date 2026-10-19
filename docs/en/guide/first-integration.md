# First integration into existing applications

> Automatic Vue sessions, `--application`, and declaration-only setup modules ship in the official package starting with 6.12.0. Every example on this page works directly with the registry release.

Follow one path: preserve the existing projects, share one application factory between standalone and embedded execution, then mount the complete remote application. For individual components/functions use [components and modules](components-and-modules.md).

## 0. Record facts before editing

Read the actual package/lock files, index.html entry, main, router, guards and authentication source. Record each project's real install/start commands, mount selector, App/router/store/i18n/registration order, routes export, history base, development root URL, and any authentication dependency. Do not create empty files to satisfy example imports or reuse assumptions from another project.

Check TS diagnostics belonging to new or modified integration files. Existing business diagnostics are a separate category, not a prerequisite to integration.

Distinguish first connection (host login works, the remote shows real content, basic navigation works) from production delivery (build/deployment, refresh/deep links, sessions, reentry and recovery). One hour is a target for first connection, not a universal delivery guarantee.

## 1. Preview the actual projects

Install the plugin inside each existing application with its own package manager and lock strategy. Follow [installation](getting-started.md#installation) for approvals and package-age restrictions; verify the installed version.

For a Vue host loading an orders remote, replace these example names and URLs with recorded facts:

```bash
# Remote root: app means a complete application; component is the CLI default.
npx fulgurjs init --plan --kind app --role provider --name orders
# Host root
npx fulgurjs init --plan --kind app --role consumer --name admin --remote orders=http://localhost:5174
```

A supported minimal entry is extracted into `src/fulgurjs/exposes/application.ts`. For a complex entry, no files are written. The `startup.entry/application/imports/steps` report names the actual entry, destination and imports and provides an ordered migration checklist. Preserve the business application; do not replace it with a downloaded shell.

Reuse an existing factory using `--application <real file>`. The CLI does not overwrite it or delete the original main. A successful write is not browser acceptance.

## 2. Preserve one remote application factory

Put new wiring in `src/fulgurjs/`; leave the original business App, pages and routes where they are. Do not create empty host/types/setup/session files.

```ts
// src/fulgurjs/exposes/application.ts
import { defineApplication } from '@fulgurjs/federation/vue'

export default defineApplication(async (_props, { mode, signal }) => {
  const [{ createApp }, { default: App }, { createApplicationRouter }] = await Promise.all([
    import('vue'), import('../../App.vue'), import('../../router'),
  ])
  if (signal.aborted) throw new DOMException('Application start cancelled', 'AbortError')
  const app = createApp(App)
  const router = createApplicationRouter(mode)
  // Move the original store/i18n/components/directives/guards here in their original order.
  // Check signal after awaits before writes. Do not mount or install this router here.
  return { app, router }
}, { routing: true })
```

Loading business modules and assembling the app are separate stages. Top-level module code runs before `app.use(pinia)`; avoid calling an app-dependent `useStore()` at the top level of directives or utilities. Read the store when the permission check or business operation actually runs. Outside components, pass that application's Pinia explicitly or reuse its existing explicit store getter. Refreshing, adding delays, or relying on another app to activate Pinia does not establish a reliable initialization order.

The router is created per instance. This example assumes an existing named `routes` export from `./routes`; use the real export found in step 0:

```ts
import { createRouter, createMemoryHistory, createWebHistory } from 'vue-router'
import { routes } from './routes'
export function createApplicationRouter(mode: 'standalone' | 'bridge') {
  const router = createRouter({
    history: mode === 'bridge' ? createMemoryHistory() : createWebHistory(import.meta.env.BASE_URL),
    routes,
  })
  // Install the original guards on this router here.
  return router
}
```

If a guard module imports a default singleton router and registers at module evaluation, turn it into an installer accepting the current router. Dynamic import alone does not reinstall guards on reentry. Never create a web router first and replace its history later: it may already have written the host URL.

Keep existing style imports in their real entry/assembly locations. main only starts this factory:

```ts
import application from './fulgurjs/exposes/application'
void application.start('#app').catch(console.error) // original mount selector
```

Preview again, then append `--write` after review:

```bash
npx fulgurjs init --plan --kind app --role provider --name orders --application src/fulgurjs/exposes/application.ts
# Existing config is preserved; check:
# exposes: { './bridge': './src/fulgurjs/exposes/application.ts' }
```

React uses `exposes/application.tsx`. Return the existing BrowserRouter/RouterProvider for standalone mode and controlled `{ element, dispose }` for embedded mode, preserving original Providers and per-instance stores. See the [complete React remote factory](../../../examples/templates/showcase/react-remote/src/fulgurjs/exposes/application.tsx); do not apply Vue createApp code to React.

## 3. Mount from one host view and one route prefix

The host plan generates `src/fulgurjs/host/RemoteApplication.vue`. For Vue with URL synchronization:

```vue
<script setup lang="ts">
import { useRouter } from 'vue-router'
import { createVueBridgeApp, createVueBridgeNavigation } from '@fulgurjs/federation/vue'
const props = defineProps<{
  getIdentity?: () => string | number | null | undefined
  getContext?: () => Record<string, unknown>
}>()
const RemoteApplication = createVueBridgeApp('orders/bridge', {
  session: props.getIdentity,
  getContext: () => props.getContext?.() ?? {},
})
const routing = { basePath: '/orders', navigation: createVueBridgeNavigation(useRouter()) }
</script>
<template><RemoteApplication :routing="routing" /></template>
```

Add `/orders/:pathMatch(.*)*` to the host's existing routes and point it at this view. Keep remote menus/routes inside the remote. For multiple remotes, select spec/basePath by static prefix and key a reused Vue mount view by spec. Route paths exclude the deployment base: deployment `/main/` still uses logical `/orders`.

The [React host view](../../../examples/templates/showcase/react-host/src/fulgurjs/host/BridgeVuePage.tsx) connects the existing data router through createReactBridgeNavigation. React sessions remain explicitly controlled by sessionKey; automatic identity getters on this page are a Vue host capability.

## 4. Add business context only when required

Bind the existing authentication state through getIdentity/getContext, inline or in one useful `host/context.ts`:

- Return a stable, non-sensitive user ID when authenticated. Include a tenant identifier if changing tenants requires resetting business instances.
- Return undefined while identity is restoring; mounting pauses without deleting the saved generation.
- Return null on explicit logout; pending work is invalidated, instances unmount and old context clears.
- Return the real user, a getter for the latest token, and genuinely consumed business capabilities from getContext. Do not supply sessionKey or call provide inside the getter.
- Use a stable module-level getter reading the host store, not local props that stop updating after unmount. Identity observation continues after the remote view leaves so logout while away is recognized.
- Read reactive state. localStorage alone is not reactive. Tokens are credentials, not identity keys; token rotation must not remount.
- sessionStorage saves the non-sensitive identity and random generation for restoration; do not pass tokens, passwords or personal sensitive data. A reauthentication event with no observable identity/logout change requires a business login-batch identity or explicit controlled sessions; the plugin cannot infer it.

If the remote uses a different token cache/user schema, map it once in `exposes/context.ts`, before loading guards/pages. Check signal after asynchronous operations before writing. Private authentication rules stay in the application.

Only components that need ancestor environment require a declaration:

```ts
// src/fulgurjs/setup.ts — no empty default function needed
export const pageProviders = [() => import('./exposes/FormProviders.vue').then(m => m.default)]
```

Skip this file for ordinary components without Providers. Business iframes are not automatically migrated: replace their actual creation sites with the appropriate component/application bridge and verify data, readonly state and styles. TinyMCE's internal editing iframe is not a cross-application business iframe.

## 4.1 Host facilities that must be handled together when replacing a legacy shell

A mountable remote does not mean the legacy shell is gone. Check each item before calling the integration complete:

- **Legacy micro-frontend registration points**: the entry bootstrap, a layout `onMounted`, a login `setToken` callback, or similar hooks can each register the old shell again. Disable or short-circuit all of them, and confirm no second container claims the same prefix.
- **Dynamic routes generated from backend menus**: backend menus often generate component-less records for the child application's internal paths. They are for menu display only. Registering them in vue-router gives them a more specific path than the remote prefix catch-all and leaves the content area blank after a menu click. Build the menu tree first, then remove same-prefix records from the route table.
- **Host page container key**: do not rebuild the remote mount view from `route.fullPath`. Child-internal navigation synchronizes the host URL; a changing fullPath unmounts the entire remote application, and an asynchronously initializing page then touches refs that have already been cleared. Use a stable per-remote key for the remote prefix route.
- **Legacy cross-application iframes / host pages**: replace them with host-provided real components and events (a component loader, global component installation and event objects returned from getContext) and render inside the child application. A same-origin iframe is only a fallback for old environments, never evidence of federation. TinyMCE's internal editing iframe is the exception.
- **Session identity reads**: a logout action may clear store state before clearing the persistent cache. If the identity getter reads a Pinia-cached getToken getter, it can cache the old cached token during that intermediate state; the router guard then redirects `/login` back to the home page. Read state first: use state.token whenever it is assigned (including the empty string) and read the persistent cache only while it is still undefined.
- **Quick leave and re-entry**: every child mount creates a new router, and its dynamic route table belongs to that router only. A permission guard must not skip `addRoute` merely because user information was already loaded; register dynamic routes per router instance.
- **Host dependencies of business components**: rendering a component from the host module graph inside the child application requires installing the global components, events and store ownership it assumes. Otherwise you see unresolved tags, raw usernames or empty selects. Do not call getCurrentInstance inside async callbacks to obtain the app; capture it during setup.

## 5. Connect and diagnose in order

1. Start remotes using their existing scripts. Check the actual dev manifest/remoteEntry and provider declaration generation.
2. Start the host; confirm its original login/home before visiting a remote prefix.
3. Require real remote content and one real navigation/action. An empty shell, menu or placeholder is not first connection.
4. Inspect synchronized declarations for actual props/methods. Do not copy consumer interfaces or hide errors with any/Record.
5. Check new/modified integration TS only, recording inherited diagnostics separately.
6. Then perform production build/deployment and verify deep links, refresh, query/hash, sessions, reentry, recovery and visuals.

Build target: the shared facade output contains top-level await. The production `target` must support TLA (for example es2022), or use a TLA transform that correctly handles every emitted chunk; do not disable a legal `manualChunks` configuration just to make the build pass. `sourcemap: 'inline'` can trigger a Vite import-analysis stack overflow on very large outputs; external sourcemaps are a supported alternative. After introducing the plugin into an existing project for the first time, clear `node_modules/.vite` once before acceptance.

Preserve the first error, URL and stack before diagnosing. Fix implementation/documentation defects; do not use silent fallbacks, disabled valid chunk settings, fabricated API responses or weakened acceptance. Record unreachable backends by actual endpoint and continue independent work.

## 6. Handoff evidence

Provide installed version/document commit, baseline, changed-file map with responsibilities, commands, first real connection time, blockers and durations, TS ownership, deployment manifest and actual per-case results. Mark unexecuted/external cases explicitly; never reuse earlier run totals as current evidence.

### A dynamic tag renders as `[object Object]`

Inspect the resolved component before attributing the problem to multiple framework instances based on chunk names. Do not register imperative services with `app.component(service.name, service)`: minification can rename a function to an HTML tag such as `b`, and `resolveDynamicComponent` may then select that service. Register actual view components under stable public component names; use services through their documented invocation or installation APIs. Do not work around the collision by changing business tags or disabling valid chunk configuration.

### Providers belong to the consuming component tree

Sharing a Vue package does not give separate apps the same ancestor tree. Recreate the providers that the original component uses for its theme, class prefix, locale, or other injected values. Global component registration only resolves component names. Reuse the original business root provider around the content, without mounting another RouterView or a full application.

Passing a component through a business callback does not run a remote module's setup/provider pipeline. That callback's business adapter must return a component already wrapped in its required providers. Check the actual class prefix and control/editor widths; successful CSS requests or matching text colors alone do not establish visual equivalence.
