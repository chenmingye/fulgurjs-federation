# First integration: preserve business startup, add the required bridge

> This guide describes the current public API. Check the installed package, real entry and router first. Example business paths must be replaced with existing project modules.

**Preserve existing main.ts(x) and business initialization locations by default. A complete application adds a bridge contract that reuses initialization; ordinary components expose their original files.** Moving main into src/fulgurjs/, registering an entire UI library again, and creating component wrappers are not general requirements.

## 0. Decide what is being loaded

| Need | Default integration | Changes to main |
|---|---|---|
| Forms, buttons, components or functions | Expose original files; remoteComponent for components, loadRemote for functions | None |
| A complete application with its own router/state | Expose a bridge contract calling existing business initialization | Preserve standalone startup; check for a reusable initialization function |
| A new project choosing plugin-managed standalone/embedded startup | Optionally use defineApplication | Only this choice uses application.start in main |

For component parameters, types and optional Providers see [components and modules](components-and-modules.md). **Do not apply full-application bootstrap steps merely to display a form.**

Read real index.html, main, router, stores, authentication and initialization functions. Record dependency locations, mount selector, initialization order, development URLs and deployment base. List pre-existing business TS diagnostics separately; fix diagnostics introduced by integration.

## 1. Preserve startup and find reusable initialization

If bootstrap, createApplication, setupAll or another initialization function already exists, inspect whether it creates an app, installs business plugins, creates a router or mounts immediately. **Its name and current location can stay.**

A bridge needs the current instance and cleanup ownership. A typical Vue boundary creates/configures app and router and returns them before mounting. Existing main keeps its standalone startup and the bridge calls the same function.

| Existing project | Action |
|---|---|
| A function returns an unmounted app/router | Reuse it in place with its existing business registration |
| Existing mount/unmount lifecycle | Check container, cancellation, router and cleanup against the bridge contract |
| Main only contains top-level createApp/use/mount | Make the smallest necessary business startup adaptation; place reusable creation/initialization according to existing business responsibilities |
| Only components are exposed | Do not reorganize main or create an application factory |

Importing a main that mounts immediately can target a fixed #app, start browser history, or execute only during the first module evaluation. The plugin cannot safely intercept arbitrary startup scripts. **An application without a reusable boundary needs some business startup adaptation; that does not require moving the whole main into the integration directory.** Never duplicate component, permission, i18n or store installation lists.

## 2. Vue: adapt existing initialization at the bridge boundary

The following assumes an **existing** src/bootstrap.ts exporting createBusinessApplication. This is a business function, not a plugin API or a mandatory new file. In this example it accepts execution mode/cancellation and returns { app, router }; adapt arguments to the real business interface.

```ts
// src/fulgurjs/exposes/application.ts: federation bridge boundary only.
import { defineBridgeApp } from '@fulgurjs/federation/vue'
import { createBusinessApplication } from '../../bootstrap'

export default defineBridgeApp((_props, context) => {
  return createBusinessApplication({
    mode: 'bridge',
    signal: context?.signal,
  })
}, { routing: true })
```

defineBridgeApp can coexist with the original standalone main. It defines this **bridge entry**, not a prohibition on standalone execution elsewhere in the project. This path does not require changing main to application.start().

The reused function must satisfy these lifecycle conditions. Do not repeat installations it already performs:

- Return this mount's Vue app/router with required stores, i18n, UI plugins, directives and guards already configured.
- Use memory history in bridge mode. Standalone startup keeps its web/hash history; an embedded application must not compete for host browser history.
- With { app, router } and { routing: true }, do not call app.use(router) or app.mount first. The plugin connects the routing channel, waits for the initial location, installs the router and mounts. The host must provide routing as in section 3.
- If initialization must continue after router readiness, use [explicit router installation](url-sync.md) and return only app. Do not return the installed router for a second installation.
- Install dynamic menus and guards on every new router. Cached user data does not mean a new router has its routes.
- Observe the current signal before asynchronous writes. Module imports execute once; repeated import does not reinstall side effects for a new router.
- Declare store ownership accurately. A module-level createPinia() reuses a container; app.use(store) does not create a fresh store. Parallel instances require independent state and cleanup; see [store binding](existing-apps.md#pinia-ownership).

Add to the existing provider configuration:

```ts
// Merge into fulgurjs.config.ts without replacing other settings.
export default {
  name: 'orders',
  exposes: { './bridge': './src/fulgurjs/exposes/application.ts' },
}
```

Only new integration wiring belongs under src/fulgurjs/. Existing initialization, App, router, stores, component-registration sources and pages stay where they are. Do not add forwarding-only expose files. Dynamic imports are optional for real code splitting/declaration boundaries; do not turn all of main into Promise.all lists or use imports to hide integration type errors.

### Optional: defineApplication manages both startup modes

New projects, or projects deliberately choosing plugin-managed standalone and bridge startup, can call the same business initializer through defineApplication:

```ts
// An alternative to the defineBridgeApp entry above, not a second bootstrap.
import { defineApplication } from '@fulgurjs/federation/vue'
import { createBusinessApplication } from '../../bootstrap'

export default defineApplication((_props, { mode, signal }) => {
  return createBusinessApplication({ mode, signal })
}, { routing: true })
```

**Only when choosing this option**, standalone main may call application.start('#app'), letting the plugin manage installation, mounting and disposal. This is optional startup organization, not a prerequisite migration for existing projects. See [existing application reference](existing-apps.md) for the complete contract and React integration.

## 3. One host mount view and one route prefix

Render in the existing host page/router. Vue example:

```vue
<!-- src/fulgurjs/host/RemoteApplication.vue -->
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

Point /orders/:pathMatch(.*)* at this view in existing host routes. Remote pages, permissions and menus stay remote-owned; do not copy every route. The logical prefix excludes deployment base: deploying at /main/ still uses /orders.

Keep the bridge stable during navigation within one remote; distinguish remotes by spec when choosing Vue keys. Do not remount the complete child on every fullPath change. React hosts use createReactBridgeApp and createReactBridgeNavigation; see [bridging](app-bridge.md).

## 4. Add business context only when required

Vue hosts derive getIdentity/getContext from existing authentication. These are business functions accepted by the example view, not a second login system:

- Return a stable non-sensitive ID when ready, undefined during restoration, null after logout. Read reactive state.
- Do not use tokens as identity or manually create sessionKey. Context contains actual business capabilities, such as getToken: () => latestToken.
- Reuse existing authentication-cache mapping if the child needs it. Read current credentials for requests instead of remounting the application on token rotation.
- Prefer token state once assigned, including an empty logout value; only fall back to cache before restoration.
- The plugin handles non-sensitive generations and session invalidation. Unobservable same-account reauthentication needs a business authentication-batch identifier or explicit session handling.

### Host-provided forms

For a fixed pair, expose original host forms and use remoteComponent in the child. Several hosts providing different implementations may inject loaders through getContext. See [components and modules](components-and-modules.md#providing-host-components-to-a-child-recommendation-and-decision-rules) for examples, precise props and optional environment adaptation.

**Nested control registration is an acceptance requirement.** Visible form data does not prove dictionary selectors, user pickers or uploaders work. Follow [registration reuse and nested-control verification](components-and-modules.md#reuse-an-existing-component-registration-source) to identify the actual consumer app, global tags, child components and project-specific implementations before wiring globalComponents. Raw a-select/a-button tags in production DOM prevent acceptance. That section includes complete wiring, standalone compatibility, remount and readonly checks.

**Ordinary remote components require no additional wrapper files.** Expose components directly when their dependencies are satisfied. Declare pageProviders only for missing ancestor injection. Reference a single existing Provider directly; create a wrapper only for real composition or parameter adaptation. Global tag registration is separate: a Provider does not copy app registries, and an entire UI-library registration list is not a default requirement.

## Validate the integration design as well as the rendered page

**A visible page does not establish that the integration design is acceptable.** Existing applications and new templates are different cases. A template may legitimately choose `defineApplication/start`; that choice does not require an existing application to rewrite its entry. Apply this checklist during initial integration, AI execution and regression review, recording source evidence and actual verification.

| Check | Recommended behavior and acceptance | Reject |
|---|---|---|
| Original standalone entry | Preserve standalone startup; reuse existing initialization in place | Moving the whole main into federation code or requiring application.start without a demonstrated need |
| No reusable boundary exists | Extract only shared creation/configuration into one business function; main mounts standalone and the bridge reuses unmounted instances | Moving all assembly into another helper merely to shorten the bridge, or adding forwarding-only files |
| Business plugins and registration | Install actual dependencies for each new app; maintain one original registration source and reuse missing consumer dependencies | Assuming registries transfer between apps or copying another UI-library inventory |
| Ordinary remote forms | Expose original business components; add props to the original URL page when needed and preserve its route entry | Wrappers that only forward props/slots, or full-application startup for two components |
| Providers | Establish which injection is missing; reference a single existing Provider directly | Creating FormProviders.vue by default or assuming Providers copy registries |
| Parameter types | Define precise fields once at the provider; infer consumer types from generated declarations and test invalid fields/types | Editing generated declarations, repeating consumer DTOs or replacing known fields with broad dictionaries |
| Routing and side effects | Match standalone history to the actual deployment base; use controlled memory routing for bridges; install hooks/guards for each new router | Falling back to an incorrect root base or expecting repeated imports to rerun module side effects |
| Async work and feature flags | Clear timers on leave, reject late writes to old forms, and avoid requests for disabled business features | Updating an unmounted form or requesting disabled tenant/extension functionality |

`src/bootstrap.ts` is not mandatory. Keep an existing reusable function; extract business creation only when it must be shared and is currently coupled to a fixed mount. Business initialization remains necessary: the objective is clear ownership and one maintained installation source. One source does not mean one execution for the lifetime of the page: every new app must install its required dependencies, and different applications may use different UI libraries.

Record evidence using the [maintainer acceptance rules](../../maintainers/testing.md#已有工程接入方案验收). Components do not need business application startup; complete applications must retain required registrations, guards and state mapping rather than optimizing for line count.

## 5. Preview and verify

Manual wiring is supported. CLI init --plan previews; --write changes files. Component mode does not create application factories. Application mode may propose extracting supported minimal main entries: **this is a tool-selected rewrite plan, not a runtime prerequisite**. If unsuitable, preserve main and configure the actual bridge entry manually. The current CLI --application option recognizes explicit default defineApplication exports only, not arbitrary bridge contracts or self-mounting main files. Projects preserving standalone main with defineBridgeApp configure exposes manually without that option.

Check configuration/types from each real application directory, start its development service, then verify:

1. Standalone startup, host login, real lists and business components.
2. Deep links, menus, back/forward/reload and correct browser-history ownership.
3. Leave/reenter, cancellation, account changes/logout, late tasks and cleanup.
4. Formal-package builds/deployment bytes; when Providers/registration are needed, actual fields, values, readonly state, fonts and layout.

Document paths, tool writes, type generation, builds, deployment and browser acceptance are distinct evidence. Documentation-only changes do not rebuild a business site or imply that business code has been reorganized.
