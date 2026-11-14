# Existing applications: required files first, optional capabilities second

> When retaining standalone URLs, first verify [URL and props runtime semantics](#url-props), especially absent Boolean values and real business keys.

For a first complete application integration, start with the [single-path guide](first-integration.md); this page is the assembly/tool reference.

## Choose the integration scope

| Need | Required integration | Do not add by default |
|---|---|---|
| Modules/components | Vite plugin; expose existing files; loadRemote/remoteComponent | Application factory, menu table, session files, Providers |
| Complete application | Config; a bridge contract reusing initialization; host mount view | Do not relocate main or duplicate business registration/menu lists |
| URL synchronization | Controlled child memory router; one host prefix/navigation port | The child must not write browser history |
| Authentication/session | Explicit host context/sessionKey | No mandatory session/context files for apps without this need |
| Global components/ancestor injection | Declare required setup.globalComponents/pageProviders | Do not wrap every component in the whole business app |

For host-provided forms and other components, prefer `exposes + remoteComponent` for a fixed provider; choose `getContext` injection when several hosts supply different implementations. A host can provide components and a full child can consume them. See [decision rules and the recommended example](components-and-modules.md#providing-host-components-to-a-child-recommendation-and-decision-rules) for two forms, Providers and store ownership.

Use the layout below for new integration code. Existing business views may call the API directly; keep new wiring and helpers together instead of creating separate trees for each API example.

## Keep integration files together

Existing entry points, initialization, routers, stores, registration sources and pages stay in place. The following lists possible **new wiring**, not a mandatory directory tree:

```text
src/fulgurjs/
├── host/RemoteApplication.vue  # Only for mounting complete remote applications
├── exposes/application.ts     # Only if a new bridge adapter is needed; calls existing initialization
├── setup.ts                   # Only for actual remote initialization/missing component environment
└── types/                     # Automatically synchronized declarations
```

Expose original components directly. An existing valid bridge contract can also be exposed in place. Do not move business files or add forwarding shells for directory uniformity. Reference one existing Provider directly; add a Provider component only for real composition/adaptation. Add context.ts only for meaningful business mapping.

main.ts(x) remains the standalone entry. The bridge calls the same business initializer; main need not call application.start. Projects deliberately choosing defineApplication may use start, but this is optional startup organization rather than an integration prerequisite.

Use host/ and exposes/ for newly added consumption/provider wiring. New-project unified startup examples may use host/application.ts(x) or exposes/application.ts(x). Paths are organizational conventions; the plugin loads configured files rather than discovering special filenames. Templates choose unified startup without imposing that layout on existing projects.

### Providing components while consuming route and dialog applications

Consider an admin host that exposes existing forms to a workflow application and mounts that application in both menu routes and approval dialogs. Organize files by **caller and responsibility**. The names below are examples; add files only for actual entry points.

| File or location | Caller and responsibility |
|---|---|
| Existing business form | `exposes` points directly to the original file. Props, business logic, and local components stay there. |
| `setup.ts` | Referenced by provider configuration. Declares the environment actually required. Reference an existing Provider directly. Place a new Provider that performs real composition or adaptation under `exposes/`, for example `FormEnvironmentProvider.vue`. |
| `host/WorkflowRouteView.vue` | Loaded by the host route table for a full-page mount. The host owns browser history and the child uses controlled routing. |
| `host/WorkflowDialogView.vue` | Loaded by a business dialog or renderer for an embedded mount. Location is scoped to the instance, closing releases the mount, and the host URL stays intact. |
| `host/context.ts` | Extract only when the route and dialog share meaningful user, session, or business-event mapping. |
| `types/` | Declarations and metadata synchronized by the plugin. Application code imports contracts through public remote entry points. |

Routes and dialogs can use the same remote bridge entry. Give each caller a clear boundary for navigation ownership and lifecycle. Share a dialog component only when its props, events, and closing behavior agree. For example, keep a form's save-result mapping in the entry that owns that contract. Name entry files so readers can tell which are loaded by the route table and which are loaded by dialogs. Avoid multiple entry points with generic names such as `RemoteApplication` or `Bridge` in the same directory.

Check public plugin APIs and the existing application wiring first. When `getContext` and `appProps` have identical user and event payloads, share the mapping and let each caller obtain it at the appropriate lifecycle point. Reuse an existing token getter directly. Add a navigation adapter only when the dialog needs isolated location state, and reuse applicable public types. If the adapter tracks only the current location, document that it has no local history. An empty `go()` does not implement back navigation. An instance-local counter starting at zero on every mount cannot supply unique identifiers across instances.

### Session context, instances, and failure states

With automatic `session`, provide the current login's capabilities through synchronous `getContext`. If business context exists without a matching generation, omitting the getter rejects mounting and preserves the existing object. It does not replace that object with a sessionKey-only snapshot. Empty context supports session-only configuration; remounts in the same generation may reuse published context. Account changes require a fresh snapshot and must not retain a captured previous-account snapshot.

`provideAppContext` performs a page-level shallow merge. An events object replaces the previous object under that key. Keep an explicit host context assembly source and read current capabilities through getters. Instance-local layout, subscriptions, and state belong to that application's provide/inject or store, with subscriptions released on disposal. Use public `hasBridgeMount(app or factory context)` for execution mode. The existence of another bridge on the page does not identify the origin of a request. Bind HTTP authentication and error handling to the actual application; tokens are not session identities.

The plugin handles remote loading, sharing, contract, and mount failures. Business empty results, success=false, and missing schemas require page-level states. Cover pending, success, empty, and error. Empty states explain missing records; errors retain a cause and retry action that invokes the same data-loading function. Before asynchronous writes, verify instance lifetime and request generation. Release timers, subscriptions, and cancellable requests on disposal. Valid null components, Suspense, and conditional visibility must not be treated as rendering failures.

### Public contracts and lazy assembly in large applications

Keep public bridge parameters independent of business initialization dependencies. Define shared parameters once in a real contract module, referenced by both the application creation function and exposed entry. Consumers import synchronized named types. Disabling dts because a static assembly closure reports many business diagnostics also stops that application's consumer type synchronization.

An exposed `src/fulgurjs/exposes/application.ts` can use:

```ts
import { defineBridgeApp } from '@fulgurjs/federation/vue'
import type { ApplicationProps } from './contracts'
export type { ApplicationProps } from './contracts'

export default defineBridgeApp<ApplicationProps>(async (props, context) => {
  const { createBusinessApplication } = await import('../../application')
  return createBusinessApplication(props, context)
}, { routing: true })
```

`contracts.ts` defines genuinely shared parameters. The existing `application.ts` references it for its creation arguments and returns a value satisfying the public bridge factory contract. Keep plugins, router, store, and registrations in their original assembly source. Lazy loading defines an assembly boundary. Declaration checking of the static public closure and business implementation typechecking are separate validations. Run effective project typechecks for the creation function and business implementation. Successful declarations do not imply the entire application's implementation passed. Diagnose generation failures through the exposes entry's static imports and type dependencies, retaining actual errors and scope boundaries.

### File formats and names

- Vue components use `.vue`; prefer `<script setup lang="ts">` for new components. Existing `defineComponent` components remain valid. A separate normal `<script lang="ts">` may hold shared module state; do not accidentally recreate it inside each setup.
- React components use `.tsx`. Configuration, sessions, context and theme logic without JSX/templates use `.ts`.
- `.d.ts` files contain declarations. Remote declarations in `types/` are generated. Declare real props at the provider entry and use synchronized types at the consumer instead of copying interfaces.
- Name files by responsibility: `RemoteApplication.vue`, `OrderForm.vue`, `context.ts`. Avoid vague `App1`/`App2` descriptions or naming every helper `bridge.ts`.

### Distinguish roles from execution modes

| Term | Meaning |
|---|---|
| Host | Project mounting or displaying remote content |
| Remote/provider | Project exposing a component, module or complete application |
| Consumer | Project loading remote content; it may also expose its own content |
| Standalone / embedded | Two execution modes of the same project, not two extra projects |

Use concrete project names with roles, such as “orders remote” and “admin host.” A child application means a complete remote application embedded in a host; loading a remote component does not require creating another application.

## Preview integration before writing

Install `@fulgurjs/federation` in the existing application first. Run from its root, replacing files and addresses with real ones. The command does not install dependencies, start servers or guess ports.

```bash
# Provider: expose an existing component or module; review the full before/after text first.
npx fulgurjs init --plan --role provider --expose ./Button=./src/components/Button.vue
npx fulgurjs init --plan --role provider --expose ./Button=./src/components/Button.vue --write

# Consumer: declare the real development address.
npx fulgurjs init --plan --role consumer --remote remote-a=http://localhost:5174/remote-a
npx fulgurjs init --plan --role consumer --remote remote-a=http://localhost:5174/remote-a --write

# Whole applications: inspect whether the plan rewrites the existing main before choosing --write.
npx fulgurjs init --plan --kind app --role provider
npx fulgurjs init --plan --kind app --role consumer --remote remote-a=http://localhost:5174/remote-a
```

The default component/module mode generates configuration and connects Vite without application, menu, Provider or session files. Consume using `loadRemote('remote-a/math')` or same-framework `remoteComponent('remote-a/Button')` in an existing view, supplying required props. Start remote development servers separately. The suggested production path is `/remote-a`; check it against actual deployment/base before building.

Application mode extracts supported minimal `src/main.ts(x)` entries into `src/fulgurjs/exposes/application.ts(x)` and exposes `./bridge`. A consumer gets `src/fulgurjs/host/RemoteApplication.vue` or `.tsx` to include in an existing page/route. It does not automatically enable sessions or URL synchronization: wire the real session source and one mounting prefix/navigation port when needed, following the [URL guide](url-sync.md). Child menus remain owned by the child. Cross-framework application dependency requirements are described in the [bridge guide](app-bridge.md).

### Safe automation boundaries

- Supported Vite forms: direct objects, `defineConfig` objects and recognizable single-return arrow factories. Existing plugins, ports and comments remain; a plugin factory value can be preserved as a nested PluginOption.
- Supported minimal entries use named `createApp` for Vue or named `createRoot` with JSX for React. Existing Router/store, guards, asynchronous initialization and custom entry layouts require the factory organization below; the tool never guesses business semantics.
- Ambiguous control flow, interpolated templates, top-level spreads, duplicate plugins and existing manual wiring become blocking tasks. **No files in that plan are written.** File locations and manual integration snippets are reported.
- Existing config files and manually changed mounting views are preserved. Repeating the same plan does not insert duplicate wiring. Preview does not execute business modules or Vite configuration. `--force` does not apply to integration plans.
- Writes recheck file snapshots and roll back on failure. After interruption, `.fulgurjs-init-pending.json` records recovery: run `npx fulgurjs init --rollback`. Subsequent manual edits are protected; reconcile them using the record if automatic recovery refuses. Successful recovery deletes the record; do not commit it.
- Follow successful writes with `npx fulgurjs doctor --config ./fulgurjs.config.ts`, project typechecking/build and real interaction checks. Writing files is not browser acceptance or a completed business migration.

Plain `init` generates only a starter configuration; `init --config` validates an existing declaration. Do not combine plan/write with `--config/--out/--force`. See [CLI reference](../reference/cli.md#fulgurjs-init) for all flags, JSON and exit codes.

## Vue: reuse existing initialization first

The default [first-integration path](first-integration.md) calls existing business creation from defineBridgeApp and preserves standalone main. Check bridge routing, unmounted return values, per-router guards and cleanup. If business dependencies are already installed, do not install them again in the bridge.

### Optional: defineApplication manages both startup modes

Use this for new projects or an explicit choice of unified startup. It does not require moving an existing main or registration lists. Prefer the existing initializer; the expanded createApp/router example only explains the return contract.

```ts
import { createApp } from 'vue'
import { createRouter, createMemoryHistory, createWebHistory } from 'vue-router'
import { defineApplication } from '@fulgurjs/federation/vue'
import App from '../../App.vue'
import { routes } from '../../router/routes'

interface AppProps { label?: string }
export default defineApplication<AppProps>((props, { mode, signal }) => {
  const router = createRouter({
    history: mode === 'bridge' ? createMemoryHistory() : createWebHistory(new URL(import.meta.env.VITE_ROUTER_BASE || import.meta.env.BASE_URL, window.location.origin).pathname),
    routes,
  })
  const app = createApp(App, { ...props })
  // Reuse business plugins/guards here. Check signal.aborted before asynchronous writes.
  // Do not install this router early: the application contract installs and waits for it.
  return { app, router }
}, { routing: true })
```

### Imports and the original standalone entry

Static and dynamic imports are both supported according to real dependencies. Do not turn main into Promise.all lists as a default integration recipe. Module-level side effects still evaluate once and do not reinstall guards for every router. Attribute business and public-contract diagnostics separately; do not hide errors with any or broad dictionaries.

Only when choosing defineApplication may standalone main call:

```ts
import application from './fulgurjs/exposes/application'
void application.start('#app').catch(console.error)
```

A defineBridgeApp entry alongside existing standalone startup does not require this change. Expose the actual contract file directly. In unified startup, standalone uses its web/hash router and waits for readiness; bridge uses controlled memory history. A missing required routing channel fails explicitly. Local routers without synchronization are also installed/awaited by defineApplication. Do not create forwarding-only files.

If initialization must continue after routing becomes ready, use the explicit installVueBridgeRouter flow and return only app; do not return an already installed router for a second installation. When returning app alone, the factory owns router installation/readiness.

## React: native and controlled routers in one factory

This is also optional unified startup. Existing standalone startup can stay with a defineBridgeApp adapter reusing React initialization. The example factory is in `src/fulgurjs/exposes/application.tsx`.

```tsx
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { defineApplication, createReactBridgeRouter } from '@fulgurjs/federation/react'
import { routes } from '../../routes'

export default defineApplication((_props, { mode, routing, signal }) => {
  if (mode === 'bridge') {
    const connection = createReactBridgeRouter(routing!, routes, { signal })
    return { element: connection.element, dispose: connection.dispose }
  }
  const router = createBrowserRouter(routes, { basename: import.meta.env.BASE_URL })
  return { element: <RouterProvider router={router} />, dispose: () => router.dispose() }
}, { routing: true })
```

React factories synchronously return JSX or `{ element, dispose? }`. Only projects choosing this option have main.tsx call application.start('#root'); expose points at application.tsx. start resolves at the first root commit, not completion of all loaders/requests. An application without routing can return JSX directly and omit routing.

## Start, cancel, dispose

```ts
const handle = await application.start('#app', { label: 'Standalone' })
handle.unmount()
```

- The container must exist. Repeated start/mount in an occupied container fails.
- `application.unmount(element)` cancels a pending start; start rejects with AbortError and late work cannot remount. Business asynchronous writes still check signal.
- An old handle cannot dispose a new generation. Disposal failures block the container until a full refresh; props/session changes cannot bypass it.
- Return a usable app/router with explicit ownership for each mount. Parallel instances need isolated state; installing an existing module-level store does not create a new store. The plugin does not silently rewrite business singletons.
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

A module-level `const state = useCounter()` keeps the first store object. Creating a new Pinia in a later application factory does not replace that variable. Resolve stores in the current factory, component setup, or callbacks bound to that instance. Review ownership when adapting business utilities designed as permanent singletons; the plugin does not silently rewrite the business tree. Before asynchronous initialization writes authentication state, creates a store, or installs plugins, check the current `signal.aborted`.

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
| Federation integration | Config, full-app bridge contract, host mount view | Components need no application contract |
| Existing entry wiring | Vite registration, creation/cleanup boundary, router mode | Preserve main; start belongs only to optional unified startup |
| Business additions | Login, dictionary, permissions, registration, ancestors | Only actual dependencies |
| Previous-system migration | Remove qiankun bootstrap/window flags | Absent in a new project |
| Related fixes | Late requests, form hydration, old menus | Not general plugin requirements |
| Generated/build files | Declarations, locks, assets | Separate from handwritten integration; do not edit generated types |

remoteComponent remains the component API. defineBridgeApp can coexist with original standalone startup. defineApplication is optional when the project chooses plugin-managed startup for both modes.

Source examples: [Vue host factory](../../../examples/templates/vue-vue/host/src/fulgurjs/host/application.ts), [React remote factory](../../../examples/templates/vue-host-react-remote/react-remote/src/fulgurjs/exposes/application.tsx), [React host factory](../../../examples/templates/react-host-vue-remote/react-host/src/fulgurjs/host/application.tsx), [template guide](../../../examples/templates/README.md). Copy whole templates and install their published registry dependencies independently.

The current CLI --application option recognizes explicit default defineApplication exports only, not arbitrary business initializers or defineBridgeApp. startup describes its proposed unified-startup rewrite, not a prerequisite. To preserve main, configure the real bridge expose manually instead of applying an unsuitable --write plan.

## Third-party renderers created inside a page belong to that instance

`remoteComponent` loads Vue/React components. Charts, form engines, editors, and other `embed()` instances created by the page do not automatically become framework components. Retain the returned instance and dispose it through the library's actual API. Removing DOM, closing a dialog, or observing the outer bridge unmount does not prove that its internal renderer was released.

First establish whether preparation, creation, and disposal are asynchronous, the actual disposal method, and whether multiple instances can coexist. A typical failure is preparation starting before closure and completing afterward, mounting into a deleted container. Earlier preparation can also overwrite newer parameters. Fixed timeouts prove neither readiness nor ownership.

This example covers **asynchronous preparation with synchronous creation and disposal** only. It assumes the existing renderer exports `prepareRenderer()` and `createRenderer(element, schema)`, returning `{ destroy() }`. Use real APIs; do not invent empty modules to satisfy these imports.

```vue
<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { prepareRenderer, createRenderer } from './existing-renderer-module'

const props = defineProps<{ schema: object }>()
const container = ref<HTMLElement>()
let current: ReturnType<typeof createRenderer> | undefined
let alive = true
let generation = 0

function releaseCurrent() {
  const previous = current
  current = undefined
  previous?.destroy()
}
onBeforeUnmount(() => {
  alive = false
  generation++
  releaseCurrent()
})

watch(() => props.schema, async schema => {
  const epoch = ++generation
  try {
    await prepareRenderer()
    if (!alive || epoch !== generation) return
    await nextTick()
    if (!alive || epoch !== generation || !container.value) return
    releaseCurrent()
    current = createRenderer(container.value, schema)
  } catch (error) {
    if (alive && epoch === generation) throw error
  }
}, { immediate: true, deep: true })
</script>
<template><div ref="container" /></template>
```

- Return the Promise from the watcher so current failures reach Vue's error handling and the configured content error boundary. Do not discard an async return value inside its callback. Native timers and floating Promises also require explicit error handling.
- Generation checks do not replace disposal. Release created instances on parameter rebuilds and unmount. Notifications, save callbacks, and later requests require the same ownership checks.
- Prefer a container ref. If a selector is required, generate a unique ID per instance instead of sharing a fixed `#form`. Do not search Vue's private component parent chain.
- Asynchronous creation/disposal requires handling instances returned after closure and preventing container reuse until disposal finishes. Prefer bridge lifecycle for complete applications; this synchronous creation example does not establish asynchronous safety.
- Test closing before readiness, updating parameters during preparation, normal closure, simultaneous instances, late successful/failed requests, and reopening. Check instance counts, real content, notification/save ownership, and unhandled errors separately; outer DOM counts are insufficient.

<a id="url-props"></a>

## Keep standalone URLs and remote props consistent

Verify the original standalone URL and remote props separately. Identify business, process and task IDs correctly. Define one named provider interface and consume synchronized declarations; a process-instance ID is not a business key.

**Prefer adapting query parameters in the provider's own route record.** The component handles props alone rather than reading the consumer's route.query or window.location.search. Unrelated projects can then use the same route name or id parameter without mixing data. This example assumes the existing page really is `src/views/OrderFormPage.vue`; use verified files and routes rather than creating another business form.

```vue
<!-- src/views/OrderFormPage.vue -->
<script lang="ts">
export interface OrderFormProps {
  /** String business order key, not a process-instance ID. */
  id: string
  /** Distinguish absence from explicit false. */
  disabled?: boolean | string
}
</script>
<script setup lang="ts">
import { computed } from 'vue'
const props = withDefaults(defineProps<OrderFormProps>(), { disabled: undefined })
const allowed: readonly unknown[] = [undefined, true, false, 'true', 'false', '1', '0', '']
const parameterError = computed(() => {
  if (typeof props.id !== 'string' || !props.id) return 'Missing valid business order key; id must be one string'
  if (!allowed.includes(props.disabled)) return 'Read-only flag must be true/false or 1/0; check props and original URL'
  return ''
})
const disabled = computed(() => props.disabled === true || props.disabled === 'true' || props.disabled === '1')
</script>
<template>
  <p v-if="parameterError" role="alert">{{ parameterError }}</p>
  <div v-else>
    <p>Order key:{{ id }}</p>
    <!-- Parameter demonstration; retain the real existing form. -->
    <input aria-label="Parameter example" :disabled="disabled" />
  </div>
</template>
```

```ts
// Original provider route: one interface, no duplicate DTO or guessed consumer URL.
import type { RouteRecordRaw } from 'vue-router'
import type { OrderFormProps } from '../views/OrderFormPage.vue'
const singleText = (value: unknown) => typeof value === 'string' ? value : undefined
export const orderFormRoute: RouteRecordRaw = {
  path: '/order-form',
  name: 'OrderFormPage',
  component: () => import('../views/OrderFormPage.vue'),
  props: route => ({
    id: singleText(route.query.id) ?? '',
    disabled: Array.isArray(route.query.disabled)
      ? JSON.stringify(route.query.disabled)
      : singleText(route.query.disabled),
  } satisfies OrderFormProps),
}
```

A valid URL such as `/order-form?id=7&disabled=true` is mapped by this application's router to business key 7 and string true. Repeated Boolean values remain visibly invalid instead of silently enabling editing. Reuse actual loading, saving, permission and error handling; this example does not define a backend API. Consumers import synchronized `OrderFormProps`. Do not add `data` or `params` wrappers unless the provider's real contract contains them.

**An optional TypeScript Boolean is not necessarily undefined at runtime.** Vue casts an absent prop containing Boolean to false. If an existing component temporarily retains query fallback, `props.disabled ?? query.disabled` may still mask the original URL's `disabled=true`. Use `withDefaults(..., { disabled: undefined })` to distinguish absence from explicit false. Do not use `props.disabled || query.disabled`, which loses explicit false. Query fallback must also be proven to belong to the provider's own standalone entry; a potentially duplicated consumer route name is insufficient. Prefer the route-record adaptation above for new integrations.

Export the public interface from a normal script, use that same interface in setup and let the plugin generate declarations. Explicit read-only mode must override business-node editing flags. Explicit false only removes this parameter's forced read-only condition; real permissions and business state still apply.

Verify these paths separately before delivery; successful builds or declaration generation do not replace them:

1. With no component props, the original `id=7&disabled=true` still loads order 7 read-only, including when node names or other editing flags are present.
2. Use a valid editable record to verify explicit false is preserved. Test absence, false, true and string flags separately.
3. Invalid flags and missing business keys leave actionable feedback in the content area instead of silently showing no data.
4. A consumer's same-named id or route must not replace the provider business key. Inspect real requests and returned records rather than only counting inputs.
5. Retest standalone deep links, refresh, query/hash and remote props. Read-only checks include selects, user pickers, attachments, subtables and rich-text editors.
