# Loading components and modules

> Loading a remote component or function module needs no bridge, no page table, and no login initialization — this is the minimal use of the federation. Import entries: Vue imports from `@fulgurjs/federation/vue`, React from `@fulgurjs/federation/react`, framework-agnostic code from `@fulgurjs/federation/runtime`.

## Providing host components to a child: recommendation and decision rules

**Use `exposes + remoteComponent` when components have a fixed provider and a stable public interface.** Inject component loaders through bridge `getContext` when the current host must choose the implementation and the child supports several hosts. Both approaches are supported today; neither is a deprecated form, and working injection integrations do not need rewriting.

Host/child describe application mounting; provider/consumer describe module loading. **An application host can also provide components, and its child can consume them.** Being called a host does not require passing every component through context.

| Requirement | Recommended approach | Child dependency |
|---|---|---|
| A fixed admin/workflow pair; workflow needs two admin forms | Admin exposes two component entries; workflow uses `remoteComponent` | Remote name, expose keys, component props/events |
| One workflow is mounted by several business hosts, each supplying different forms | Each host injects component loaders through `getContext` | Agreed loader signatures and returned component props/events |
| Content needs an entire router, state container and application lifecycle | [App bridging](app-bridge.md) | Application bridge contract; do not render a complete application as an ordinary component |

### Recommended example: a host provides two forms

This example reuses **Vue components in Vue**. It also works inside a Vue bridged child, but does not make Vue components renderable by React. Use application bridging for complete cross-framework applications.

The relationships are `admin host → mounts workflow child` and `workflow → loads forms from admin`. They are separate responsibilities, not two complete applications mounting each other. Avoid module-level waits for each other's full application startup.

**1. Expose two component entries in the host.** Preserve existing business files. Add adapters only when actual parameter conversion or environment assembly is needed; do not create forwarding-only files just to expose something.

```ts
// admin/fulgurjs.config.ts: merge into the existing configuration; preserve remotes/shared.
import type { FederationOptions } from '@fulgurjs/federation'

export default {
  name: 'admin',
  exposes: {
    './business-form': './src/components/forms/BusinessForm.vue',
    './schema-form': './src/components/forms/SchemaForm.vue',
  },
  shared: { vue: { singleton: true } },
} satisfies FederationOptions
```

These paths point directly to existing business components; no relocation or forwarding wrapper is required. Pass record IDs and readonly state through props, and report save/cancel through emits. Do not infer them from the host's current URL. Declare props at the provider entry and use generated/synchronized types in the consumer instead of copying another interface.

**2. Configure the provider in the child.** Keep the host's existing child remote configuration. This additional configuration belongs to the child and identifies its component source.

```ts
// workflow/fulgurjs.config.ts: preserve the existing application bridge expose and other options.
import type { FederationOptions } from '@fulgurjs/federation'

export default {
  name: 'workflow',
  remotes: {
    admin: { dev: 'http://localhost:5173', prod: '/admin' },
  },
  shared: { vue: { singleton: true } },
} satisfies FederationOptions
```

Replace these illustrative addresses with the provider's actual development root URL and production mount path, including any Vite base. Both projects must register `federation(fulgurjsConfig)` in their Vite configurations; creating this file alone is insufficient. See [getting started](getting-started.md). Production `/admin` must serve the admin build.

To load deployed components and their types during local development, see [local development against a deployed remote](#local-development-against-a-deployed-remote): dev can point to a production entry, using its complete `.js` URL.

**3. Render inside the child's existing business view.** This example assumes both entries declare `recordId: string` and `readonly?: boolean`; use the actual provider-generated props in your application.

```vue
<!-- workflow/src/views/ApprovalDetail.vue: use the existing business view. -->
<script setup lang="ts">
import { remoteComponent } from '@fulgurjs/federation/vue'

defineProps<{ recordId: string; formKind: 'business' | 'schema' }>()
const BusinessForm = remoteComponent('admin/business-form')
const SchemaForm = remoteComponent('admin/schema-form')
</script>

<template>
  <BusinessForm v-if="formKind === 'business'" :record-id="recordId" :readonly="true" />
  <SchemaForm v-else :record-id="recordId" :readonly="true" />
</template>
```

This path does not pass these two loaders through `getContext`. Context still carries required user information, the latest-token getter and business events. `remoteComponent` handles remote loading and load-error UI/retry; remote declarations support props inference. It does not supply missing business parameters, permissions or Providers.

### Does a remote component require a wrapper?

**Being remote does not require an additional wrapper component.** Expose existing forms directly as above and pass their props/events normally. Keep direct rendering when dependencies are already satisfied.

| Boundary | Created by | When needed |
|---|---|---|
| remoteComponent's internal asynchronous/session boundary | Plugin | Loading, retry and session handling for this API; no new business file |
| Business adapter component | Project | Real parameter mapping, business composition or interface conversion; no forwarding-only files |
| Ancestor Provider wrapping | Provider declaration, applied by adapter | Missing ancestor injection required by the original component |

Omitted/empty pageProviders adds no Provider layer. The internal remoteComponent boundary does not require FormProviders.vue. Do not wrap an entire business App merely to render an ordinary component.

### Declare a Provider only for missing ancestor injection

Inspect actual inject/context dependencies first. Does the component already contain its Provider? Does the consumer ancestor provide the same injection key? Components without these dependencies need no setup/Provider file. Sharing Vue does not connect separate ancestor trees, but not every component needs extra environment.

If the original AppProvider really is missing, add setup: './src/fulgurjs/setup.ts' at the provider and reference the existing component directly:

```ts
// admin/src/fulgurjs/setup.ts: only for a real ancestor dependency.
export const pageProviders = [
  () => import('../components/Application/src/AppProvider.vue').then(m => m.default),
]
```

The example assumes an existing default-exported Provider at that path. Use actual paths/exports. No forwarding-only FormProviders.vue is needed. The adapter puts remote components under this Provider in the consumer tree without starting another App or RouterView. Check that the Provider's own listeners, store access and side effects fit this lifecycle.

Create a component such as exposes/FormProviders.vue only for real composition of several Providers, theme/locale parameters or adaptation. It must render its slot. Choose either provider-owned component wrapping or pageProviders wrapping, avoiding duplicates. The filename has no special semantics and is not mandatory. pageProviders applies to components loaded from that remote by component adapters, not to individual expose selections. If only some components need a Provider, satisfy that dependency inside those original components instead of wrapping the entire remote.

### Global registration and Providers are different dependencies

Local component imports travel with the module. Global string tags resolve against the **actual consumer Vue app's** registry. Registration performed by provider main is not copied to another app. Follow this order:

1. If the consumer already registered the components/directives or the original component imports them locally, do not add registration.
2. For a few missing tags, reuse actual implementations from existing sources. globalComponents should declare only real missing dependencies.
3. For extensive existing registry dependencies, reuse the original installer idempotently for the actual consumer app. Check dependency cost, customizations and name ownership rather than copying a second UI-library inventory.

GlobalComponents, pageProviders and business application startup have separate roles. Providers do not copy registries; globalComponents does not restore injection; component reuse does not run the provider's entire main. Missing permission directives need real implementations, not no-op substitutes. See [registration reuse](#reuse-an-existing-component-registration-source).

### Automatic types: define once at the provider, infer at the consumer

Declare accurate fields in the **original form**, for example defineProps<{ recordId: string; readonly?: boolean }>(). The plugin synchronizes that contract. A provider Record<string, unknown> remains a broad dictionary after generation; the plugin cannot guess business constraints.

Consumers do not import generated `.d.ts` files by filesystem path. The synchronized registry supplies remoteComponent props/events. For local parameter state, **prefer importing the provider's named business type directly from the remote component entry**:

```ts
import { ref } from 'vue'
import { remoteComponent } from '@fulgurjs/federation/vue'
import type { BusinessFormParams } from 'admin/business-form'

const BusinessForm = remoteComponent('admin/business-form')
const params = ref<BusinessFormParams>()
```

Consumers need no VisibleFields, NonNullable, InstanceType or duplicate DTO. `import type` is erased and does not load remote JS. Define and export the contract once at the provider; the plugin preserves native named exports through generation and synchronization. See the [provider example and field checks](#nested-params-require-field-level-checks).

The public `FgVueRemoteProps<'admin/business-form'>` helper remains available for generic props extraction when the provider does not export a business type. It is not mandatory boilerplate for every business page and does not change component-tag hovers.

This does not maintain another interface. Do not redeclare known fields as broad objects or any; truly open extension data can be modeled separately. Verify both missing required fields and wrong field types, not only rejection of a string in place of the whole object.

Business components own reload-on-prop-change behavior and timer/late-write cleanup. Shared Vue/Pinia packages do not share business state; see [store ownership](existing-apps.md#pinia-ownership). Providers do not isolate CSS. Compare real data, resolved labels, readonly behavior and layout after asynchronous echo completes.

#### Complete provider-to-IDE integration and acceptance sequence

For typed Vue remote integration, **an accurate provider contract, updated type resources, correct consumer checking and readable actual IDE output are four separate requirements**. Do not combine partial evidence into “types complete.” File existence or a successful CLI exit alone is insufficient.

1. **Trace the real expose to its original SFC.** Inspect defineProps, named contracts, events, slots and public instances. Known params fields must not be any or broad dictionaries. Normalize standalone URL strings at that boundary; remote props must not guess host query values. Do not add forwarding shells or duplicate DTOs.
2. **Verify actual installed official packages on both sides.** Check each application's package.json, lockfile and resolved package path, not only repository source. Source links, manual node_modules replacement and historical versions are not final published-package evidence.
3. **Publish new provider resources in reality.** In development, run the real provider and verify type generation. In production, run its existing build and deploy the resulting manifest, type index and declarations with dist. The provider phase of fulgurjs types validates generation; **it does not rebuild/deploy production dist or write newly validated declarations into the deployed site**. Downloading the unchanged site still returns old declarations.
4. **Inspect actual HTTP resources.** Follow manifest.types.index rather than guessing a path; verify revision, generator package version and entry declarations. Recognized concrete SFCs should have an expose-named interface inheriting the original type. Keeping the long DefineComponent declaration is intentional: do not delete its inheritance source. Preserve unrecognized advanced wrappers and report their display limits honestly.
5. **Sync in the consumer application directory.** Use its own package manager and replace the example origin with the actual site; relative production remotes need this base:

   ```bash
   pnpm exec fulgurjs types --mode prod --base https://portal.example.com
   ```

   Use actual dev configuration for development. Verify metadata source/revision, tsconfig inclusion and a single physical plugin registry. Do not hand-edit modules.d.ts or registry.d.ts.
6. **Consume the public contract directly and check both views.** Keep the real remoteComponent type. Prefer import type of the provider contract and ref<BusinessType>() for local state. Re-export an existing contract from the original SFC instead of making consumers write mapping helpers, layered extraction or duplicate DTOs. Verify component-tag and parameter/field behavior separately; shorter imports alone do not prove better IDE output.
7. **Run real-project positive and negative checks.** Cover nested missing fields, misspellings, wrong scalars and union values. Verify expected errors, then remove directives to observe actual diagnostics. Check events, slots and ref/expose when changing component representation. OOM, an incompatible checker or a broad fallback cannot count as success; record historical errors separately.
8. **Verify the user's actual IDE.** Check the Vue template tag, params attribute, parameter value and fields, plus completion/docs/navigation. Capture real template output. Plain TS quickInfo, a successful vue-tsc run or declaration-file screenshots do not replace it. If an upgrade leaves a static entry with empty props in the IDE despite correct CLI checks, inspect resolution and refresh Vue/TS services as described below; do not accept fallback as a shorter display.
9. **Regress actual behavior and deliver four evidence categories.** Check real data, readonly state, nested controls and reentry as affected. Report the provider contract, deployed version/revision, positive/negative checks and IDE screenshots separately. Do not relabel previous/candidate evidence as final official-package verification.

| Observation | Decision and next action |
|---|---|
| dts:false makes the command exit successfully | Type support was explicitly disabled; this cannot pass a task requiring types |
| Provider params are a broad dictionary, but types exits successfully | Invalid contract; fix the provider rather than adding a consumer DTO |
| Only consumer upgraded; provider HTTP revision is unchanged | New generation has not been delivered; rebuild/deploy the provider and sync |
| Only InstanceType replaced with FgVueRemoteProps | Extraction changed; display and field constraints still need verification |
| Registered static entry has empty props / unknown fallback | Registry chain is not ready; not a display improvement |
| Recognized concrete SFC still expands and only a comment was added | Named display is unverified; inspect resources, sync and IDE resolution instead of lowering acceptance |
| Field display is required but only an opaque parameter name is visible | Field readability is incomplete; verify the mapped view and exact hover position |
| Terminal checks without actual IDE evidence | IDE result unverified; report tool/lock-screen blockers honestly, never PASS |
| Original DefineComponent retained, hover named and constraints intact | Correct; keep the original signatures as the source of truth |

#### Nested params require field-level checks

The exported params type and defineProps must use the same contract. Declare and export it in the original SFC without adding a wrapper or forwarding file:

```vue
<!-- Original provider BusinessForm.vue. Ordinary script owns module-level exports. -->
<script lang="ts">
/** Existing business record and published schema. */
export interface BusinessFormParams {
  /** Business record identifier */
  id: string
  /** Published schema identifier */
  formId: string
  /** Readonly detail mode, not a URL string */
  disabled?: boolean
}
</script>
<script setup lang="ts">
// An optional URL-entry root does not make supplied fields optional.
defineProps<{ params?: BusinessFormParams }>()
</script>
```

If the contract already lives in a business `.ts` module, do not move or duplicate fields. Add `export type { BusinessFormParams } from './existing-contract'` to the original SFC's ordinary script, and continue importing that same type in setup for defineProps. Script setup does not allow module exports. Merge into an existing ordinary script instead of adding a second one. Export intended business contracts rather than all implementation types.

```ts
import { ref } from 'vue'
import { remoteComponent } from '@fulgurjs/federation/vue'
import type { BusinessFormParams } from 'admin/business-form'
const BusinessForm = remoteComponent('admin/business-form')
const params = ref<BusinessFormParams>({ id: 'order-1', formId: 'schema-1', disabled: false })

// Run in an effective TS project containing synchronized declarations.
// @ts-expect-error required formId is missing
const missing: BusinessFormParams = { id: 'order-1' }
// @ts-expect-error boolean required, not a URL string
const wrongType: BusinessFormParams = { id: 'order-1', formId: 'schema-1', disabled: 'false' }
// @ts-expect-error misspelled field must fail
const typo: BusinessFormParams = { id: 'order-1', formId: 'schema-1', disabeld: true }
```

Public names require native provider export interface / export type declarations; the plugin does not guess business names. Default components and named types share the same existing expose target. The plugin generates and syncs declarations rather than requiring hand-maintained `.d.ts`. Fix a missing export at the provider instead of adding a consumer ambient placeholder. Wait for dev generation/sync, or rebuild and deploy provider resources in production; editing only the consumer while fetching an old site is insufficient.

First check the project with expected errors (unused directives must fail), then temporarily remove directives and confirm actual TS diagnostics. Rejecting only params='text' can still accept Record<string, unknown>. Normalize/validate any backend values at the assignment boundary; do not bypass checks with any, assertions or a duplicate DTO. Successful fulgurjs types proves generation/sync, not an accurate business contract. Parse URL strings at the standalone boundary; remote props must not guess missing fields from the host URL.

#### Direct imports must also show fields on hover

Keep the consumer's two lines: `import type { BusinessFormParams } from 'admin/business-form'` and `ref<BusinessFormParams>()`. **The provider generator creates expandable views for named data objects automatically. Business files need no VisibleFields, NonNullable or duplicate DTO.** It uses the provider's TypeScript checker to verify the public type shape and adds a declaration-only view. Original contracts and complete component signatures remain; runtime JS is unchanged.

For supported data contracts, verify these targets independently in the actual IDE:

1. Hover BusinessFormParams: show field names, types, required/optional markers and inherited fields, rather than just an interface name.
2. Hover the parameter variable or template parameter value: show the same field structure. Vue's outer Ref may remain; an alias name alone is insufficient.
3. Check field hovers, completion and semantic diagnostics: preserve provider JSDoc, readonly, optionality, unions and required fields. Better display with weakened checking is a failure.

Example hover information (editor output generated from the provider, not copied into consumer code):

```text
{
  id: string
  formId: string
  disabled?: boolean
}
```

Changing imports, enabling definition navigation or showing a contract name alone does not complete field readability. Capture real editor/Vue-template results; ordinary TS quickInfo is a regression layer, not a substitute for GUI acceptance.

Only confirmed non-generic data objects get these views. Generic types, unions, arrays/tuples, callable/constructable types, classes/private brands, polymorphic this, methods/accessors and other advanced contracts retain their original declarations to preserve signatures and identity. Function, array and nested-object field types are not recursively rewritten.

This happens during **provider declaration generation**. Run the provider with the current plugin for dev resources, or rebuild and deploy its production manifest, index and declarations. Consumers must synchronize the new revision. Upgrading only the consumer while downloading old resources does not produce a new view; never edit generated caches to pretend it does.

#### Component names and business fields are separate hover targets

Provider generation adds an expose-named interface, such as `ApprovalForm`, for directly exposed concrete Vue SFC declarations whose official type is `import("vue").DefineComponent<…>`. The interface inherits the complete original declaration instead of reconstructing `$props`. Consumer component hovers can therefore show `ApprovalForm` while keeping the original signatures, events and instance methods in the declaration closure.

This is neither a second hand-maintained DTO nor an effect of `FgVueRemoteProps`. No wrapper component or return-type cast is required. Regenerate/publish the provider's type resources and sync the consumer; upgrading only the consumer plugin while downloading old declarations does not change their display.

Inspect template `params`, assigned fields or the provider's named interface to read the business contract. Maintain field documentation at that source. Verify component and field hovers separately in the actual IDE. Generic function components, additional slots wrappers and other unrecognized advanced declarations retain their original representation to preserve exact signatures; short names are not promised for every component/editor. When exposes share a declaration, the first expose supplies the name; identifier conflicts are avoided without changing runtime component names.

For a registered static component entry, `DefineComponent<{}, {}, unknown>` after an upgrade is a fallback without the real registry, not a successful short-name display. Check tsconfig inclusion, metadata source/revision and the package's physical path resolved by the IDE. If CLI checks are correct but the IDE retains old dependency resolution, run `Vue: Restart Vue and TS servers` and verify again. Do not hide registry failure by deleting declarations, loosening contracts or blindly reinstalling dependencies.

### When to inject through `getContext`

If workflow must not know admin's name or address—for example, procurement and production hosts use the same workflow—each host supplies the same business contract through bridge `getContext`, such as `loadBusinessForm` and `loadSchemaForm`. The child invokes the current host's loader instead of hardcoding a host remote spec.

These are **application-defined fields, not built-in plugin APIs**. Agree on arguments, synchronous/asynchronous returns, component props/events, missing-capability errors and a real capability source for standalone operation. Never hide absence with an empty component. Loaders satisfy any actual Provider dependencies of returned components and fulfill the agreed registration and state-ownership responsibilities.

Passing a component directly or returning one from a local `import()` **does not run the federation setup/pageProviders pipeline**. It also does not automatically receive `remoteComponent`'s remote type synchronization or load-error UI; the caller handles its own loading/error/retry. If the loader actually calls `remoteComponent`, that returned remote component retains its federation loading semantics. Context functions are not reactive subscriptions; do not retain components, data or callbacks from an old session after account changes.

Choose one component acquisition contract. Do not silently fall back from a missing context capability to another remote at the same consumption site. Existing injection integrations that serve multiple hosts can stay as they are, without adding a fixed host dependency merely to use federation.

## Provider: expose a module

The remote app declares the modules it exposes in `fulgurjs.config.ts`. Ordinary components and function modules can both be exposed directly:

```ts
// remote-a/fulgurjs.config.ts
import type { FederationOptions } from '@fulgurjs/federation'

export default {
  name: 'remote-a',
  exposes: {
    './Panel': './src/components/Panel.vue',        // Vue component
    './money': './src/utils/money.ts',              // Pure TS module
  },
  shared: { vue: { singleton: true } },
} satisfies FederationOptions
```

Key convention `'./X'` (the `./` prefix may be omitted; the config normalizes it and reminds you); the value is a source file path relative to the project root. Only modules used as "pages" in a host page route table must be standalone pages (taking route params); ordinary components have no such requirement. Consumers must supply required props of ordinary remote components, or the component can provide defaults. `BLD-003` is a page independence check, not a build restriction requiring defaults for every required prop.

## Consumer: three ways to load

### Option 1: `remoteComponent` — direct component rendering (recommended)

**Vue** (`@fulgurjs/federation/vue`):

```ts
import { remoteComponent } from '@fulgurjs/federation/vue'

// Full spec = remote name + exposes key (./ may be omitted)
const RemotePanel = remoteComponent('remote-a/Panel', {
  loadingComponent: MyLoading,   // Optional: component shown while loading
  errorComponent: MyError,       // Optional: component shown on failure (receives the error prop; a built-in placeholder is used if omitted)
  retries: 2,                    // Optional: per-call loadRemote retry override
  delay: 200,                    // Optional: ms to wait before entering the loading state (default 200)
  timeout: 15000,                // Optional: ms before timing out into the error state; if unset, the runtime container timeout is the fallback
})
```

```vue
<template>
  <!-- props are passed straight through to the remote component at the usage site -->
  <RemotePanel :title="'Details'" :form-params="{ id: 42 }" />
</template>
```

Semantics:

- Returns a standard Vue async component that renders the remote default export (or the module itself). KeepAlive state is retained within a session. When mounted or activated after a session change, the new session initializes before the page renders;
- **Zero silent fallback**: a load failure explicitly enters the error state; when no `errorComponent` is passed, the built-in placeholder renders (error code + root cause + fix + "Retry load / Refresh page" buttons), and the `fulgurjs:error` window event is emitted as usual;
- Multiple component instances with the same spec share `loadRemote`'s internal Promise cache — the container module loads only once.
- **provide/inject does not cross from the provider's app root**: the remote component renders inside the **consumer's** component tree — `provide` calls at the provider app's root (`App.vue` etc., global `AppProvider`, prefixCls, theme, ConfigProvider) do not travel with the component, while the consumer's own ancestor provides apply as usual. A missed inject shows up as default empty values (typically a class prefix like `undefined-xxx` or missing theme classes). The recommended fix when the exposed surface depends on such context (one declaration, all exposed components covered): declare `pageProviders` (an ancestor-provider array) in the provider's `federation({ setup })` module — the consumer's `remoteComponent`/`createHostPages` wraps this remote's components automatically outer→inner, so multiple remote pages stop hand-writing wrappers per page:

  ```ts
  // provider src/fulgurjs/setup.ts — federation({ setup: './src/fulgurjs/setup.ts' })
  export const pageProviders = [
    () => import('../components/Application').then((m) => m.AppProvider), // zero-arg loader form
  ]
  ```

  It and `globalComponents` (consumer-side registration, solving string-tag resolution) are **two different things and not interchangeable**; global CSS/theme styles travel with the build output and are not carried by providers either. Manual `loadRemote` / `useLoadRemote` (module in hand, self-rendered) apply nothing automatically — wrap the provider yourself in your JSX/template.

- **Custom directives require consumer registration**: `globalComponents` registers components; it does not copy the provider’s `app.directive(...)` calls. Register the required directive implementation when initializing the consumer app, or assemble it in a shared provider. Handle name conflicts explicitly; never replace a permission directive with a no-op.

- **State injection belongs to the consumer too**: a remote component using injected Pinia may resolve a consumer store with the same ID. When provider-owned state is required, pass the provider Pinia instance explicitly. A complete application requiring its own router, stores and lifecycle should use [app bridging](app-bridge.md).

**Error scope**: Vue remoteComponent errorComponent handles module/initialization/Provider loading failures. Errors thrown **inside** the remote component subtree (setup/render/nested async components) keep their default propagation semantics (still handled by business onErrorCaptured/app.config.errorHandler), but the plugin observes them at the component boundary: the `fulgurjs:error` event and the `onRemoteError` hook receive `MFU-020` (`details.phase='render'`, the original exception preserved in `cause`) — so even when a business handler swallows the error and leaves the region blank, the event is still observable. To display and recover in place, pass `renderErrorComponent` to remoteComponent/createHostPages (it receives `error`/`retry` props; once it owns the display the error stops propagating globally, and retry remounts the remote component). Exceptions in event handlers or arbitrary async callbacks remain outside plugin observation. React remoteComponent ships a built-in subtree render boundary (also reporting MFU-020) but still does not catch event-handler or arbitrary async callback errors. A full-app bridge host boundary also does not cover internal errors in another root. The same error object crossing boundaries (runtime throw → UI placeholder) is reported only once; every new load/render attempt is visible again.

### Reuse an existing component registration source

#### Why checking the outer form is insufficient

Vue's global component registry belongs to an **app instance**, not the window or the shared Vue package. Suppose a management host creates app A, a bridged workflow creates app B, and B loads a form provided by A. The form renders in **B's component tree**. Registrations made with app.component/app.use on A do not transfer to B, even when both use the same Vue instance.

This produces a misleading partial success: locally imported Input/Form controls work, but globally resolved dictionary selectors, user pickers, buttons or uploaders fail. All dropdown options may appear as ordinary adjacent text, a button becomes its label alone, and row/column layout disappears. Requests, real data and CSS can all load successfully without an exception reaching the error boundary. **None of those facts proves complete component rendering.** Development may report Failed to resolve component; production may omit that warning. An empty console is not sufficient evidence.

Inspect nested controls because schema/componentMap resolution is only one layer. The selected dictionary, picker or upload component may itself use global SelectOption, Button or Row/Col tags. Finding the outer component in a map does not prove that its internal dependencies resolve. Ordinary remote component reuse does not execute the provider's main.

#### Step 1: identify the actual rendering app and dependencies

Before changing wiring, record:

1. Who creates the consumer app, including standalone startup and each bridge remount.
2. The original expose target and its schema-driven, dynamic and dialog components.
3. Whether each failing dependency comes from a local import, existing registry/function, ancestor injection or CSS.
4. Exact registration names and implementations, including Select Option/OptGroup. Registering a parent component does not call its install function or register its children.
5. Project-specific replacements such as AButton with custom icon, permission, color or loading behavior. Preserve the real implementation instead of silently substituting the library default.

Do not import the provider's main to obtain registrations: it may create another app, install routing, start authentication or mount. Do not copy an entire UI library inventory into setup or create a Provider solely for registration.

#### Step 2: choose wiring by dependency type

| Actual situation | Implementation |
|---|---|
| Local import or matching existing consumer registration | Keep it; add nothing |
| Existing component map | Export the required map as globalComponents from provider setup |
| Only registerComponents(app) exists | Extract the required map in its original module; share it with that function and remote setup |
| Actual missing ancestor inject/context | Reuse the real Provider through pageProviders; handle registration separately |
| Existing registration function must run and a Provider is already required | Obtain the actual consumer app in that Provider and install idempotently |
| Correct component DOM, wrong color/size/layout | Inspect CSS, theme and container rules; do not hide unresolved tags with CSS |

The following complete wiring assumes the project already uses Ant Design Vue and has src/components/registerComponents.ts plus its real BusinessButton.vue. Adapt actual paths; do not create fake modules. This list is an example's dependency subset, not a mandatory UI inventory.

```ts
// src/components/registerComponents.ts: the existing registration source.
import type { App, Component } from 'vue'
import { Select, Row, Col } from 'ant-design-vue'
import BusinessButton from './BusinessButton.vue'

export const formComponents = {
  ASelect: Select,
  ASelectOption: Select.Option,
  ASelectOptGroup: Select.OptGroup,
  ARow: Row,
  ACol: Col,
  AButton: BusinessButton, // Preserve the project's button behavior.
} satisfies Record<string, Component>

export function registerComponents(app: App) {
  for (const [name, component] of Object.entries(formComponents)) {
    app.component(name, component)
  }
  // Preserve unrelated existing registrations; do not duplicate this list.
}
```

```ts
// src/fulgurjs/setup.ts: declare registrations without starting another app.
export { formComponents as globalComponents } from '../components/registerComponents'
```

```ts
// fulgurjs.config.ts: merge with the actual existing configuration.
import type { FederationOptions } from '@fulgurjs/federation'
export default {
  name: 'admin',
  setup: './src/fulgurjs/setup.ts',
  exposes: { './business-form': './src/components/forms/BusinessForm.vue' },
  shared: { vue: { singleton: true } },
} satisfies FederationOptions
```

The original standalone entry still calls registerComponents(app). The consumer keeps remoteComponent('admin/business-form'), which delivers setup's globalComponents to the **current consumer app**. No UI-library sharing or second application startup is required. Connect the configuration to Vite and rebuild the provider; validating old dist does not validate source edits.

globalComponents maps actual registration names to components or zero-argument component loaders. It is not an app.use plugin list. Declaration delivery works for newly created consumer apps; a container-level installed=true flag would skip bridge remounts. When manually calling an installer, use a WeakSet keyed by the actual App and mark only after success.

Resolve same-name conflicts before replacing existing consumer components. Registration does not copy directives, router, Pinia instances or theme. Inspect each separately. Manual loadRemote followed by custom rendering must not assume remoteComponent's consumer registration delivery.

#### Step 3: verify real controls in development and production

- Test the original standalone URL and remote-props entry with real data, required parameters, readonly state and layout.
- Assert real combobox/select structure and an actual option popup, rather than all option labels appearing as inline text.
- Verify picker input, button and layout. In an editable test mode open and cancel the dialog without saving to the backend; in readonly mode verify actual controls are disabled.
- Inspect uploaders, editor toolbars, schema-driven and conditional controls after they appear. Hidden controls cannot prove correct resolution.
- Leave/reenter and destroy/remount the bridge. The new app must still resolve components, and existing consumer controls must retain their behavior.
- Reject raw tags that should have been Vue components. Use known project tags, not every hyphenated tag: actual Web Components, SVG and editor iframes have their own valid structures.

```js
// Read-only browser DOM diagnostic for known Vue component tags.
const unresolved = [...document.querySelectorAll(
  'a-select,a-select-option,a-select-opt-group,a-button,a-row,a-col'
)]
console.table(unresolved.map(el => ({ tag: el.tagName, text: el.textContent })))
```

Deliver control assertions/screenshots, production build identity, remount evidence and the shared registry source path. HTTP 200, loaded CSS, input counts, no MFU error or visible data alone are insufficient. Fix unresolved components before CSS; do not add arbitrary Providers, mount a whole app again or accept placeholder text as a working control.

Reuse the existing theme source for fonts, text colors, radius and tokens. Providers do not isolate CSS. If DOM is correct but text is faint, inspect actual selectors, color, -webkit-text-fill-color and disabled rules. Limit changes to the owning component; avoid global overrides or stacked !important.

**React** (`@fulgurjs/federation/react`):

```tsx
import { remoteComponent } from '@fulgurjs/federation/react'

// Infer props from the synced provider declarations; do not duplicate their interface in the host.
const RemotePanel = remoteComponent('remote-a/Panel', {
  fallback: <Spinner />,                     // pending placeholder (default null)
  error: (err, retry) => <ErrorBox error={err} onRetry={retry} />,  // or pass a ReactNode
  retries: 2,
  timeout: 15000,
})

export default function Page() {
  return <RemotePanel title="Details" />
}
```

React version notes:

- The factory and page-table declarations have **zero loading side effects**; `loadRemote` only happens on first render; the simplest usage needs no hand-written Suspense/`React.lazy`;
- **Does not use `React.lazy`**: lazy caches the failed Promise, so merely resetting an error boundary cannot recover; this implementation's retry rebuilds the load attempt (already-loaded modules come from the runtime cache and are not downloaded again);
- Built-in pending placeholder, error placeholder, and error boundary; load failure and render errors are **recorded and displayed separately** (copy distinguishes "load failed" from "render error");
- Failure recovery punches through the browser's ESM failure cache: after a failure, the entry URL and the container's expose loader get a changed URL on retry (`fulgurjs_retry=N`); concurrent failures advance a single retry generation;
- **Known boundary**: if a static dependency chunk of an expose fails, same-page retry cannot recover (the browser's module map cached the failure for that dependency URL); a full page refresh is needed — the default placeholder's "Refresh page" is exactly that path (user click only, never an automatic refresh).
- **Context does not cross from the provider's app root**: same as Vue — React Context created at the provider app's root is invisible inside the consumer tree; declare required React Providers in setup.pageProviders for remoteComponent/createReactHostPages to apply. Alternatively wrap the exposed entry itself; choose one source instead of double-wrapping. Consumer ancestor Providers only apply when using the same Context object; do not pass Context across different renderers/versions.

Complete runnable examples: the host home page of the [vue-vue](https://github.com/chenmingye/fulgurjs-federation/tree/master/examples/templates/vue-vue) / [react-react](https://github.com/chenmingye/fulgurjs-federation/tree/master/examples/templates/react-react) templates.

### Option 2: `loadRemote` — imperative loading (any framework or pure TS)

```ts
// Vue: @fulgurjs/federation/vue | React: @fulgurjs/federation/react | pure TS: @fulgurjs/federation/runtime
import { loadRemote } from '@fulgurjs/federation/runtime'

const { formatMoney } = await loadRemote('remote-a/money')     // function module
const mod = await loadRemote('remote-a/Panel')                  // component module (.default ?? the module itself)
```

Options (all optional):

```ts
const Panel = await loadRemote('shop/Panel', {
  shareScope: 'default',       // Overrides the shareScope declared by the remote
  retries: 3,                  // Per-call override of remote.retries
  fallbackModule: () => import('./PanelFallback'),   // Returns a fallback module on failure (explicit, declared behavior:
                               // the error event/console output still fires; this is not a silent fallback; without it, the error throws)
})
```

When the remote has a `setup` configured, `loadRemote('remote/module')` is the unified trigger for the initialization lifecycle (see [API reference · setup/onSession](../reference/api.md#setup-on-session)); `loadRemote('remote')` only fetches the container and does not run initialization.

### Option 3: `useLoadRemote` — React hook

```tsx
import { useLoadRemote } from '@fulgurjs/federation/react'

const { data, error, loading, reload } = useLoadRemote<Utils>('remote-react/utils')
// data: Module | undefined; error is always undefined when there is no error
// options pass through shareScope / retries / fallbackModule (configuring fallbackModule is an explicit declaration: on failure, return the fallback instead of writing error)
```

Semantics:

- Dependencies are compared field by field — a new options object created on every render by the caller will not cause endless reloading; when spec/options change, old data is cleaned up and a new request begins;
- Each effect round and each `reload` has an independent generation: fast A→B, a slow request resolving late, consecutive reloads, resolution after unmount, and StrictMode double effects all allow only the latest valid request to write state;
- `reload()` clears old data/error and sets loading at start; unmount invalidates unfinished requests, and calling a saved reload after unmount issues no request;
- `AppContext` is not a React state subscription: when the host reads a new non-empty `sessionKey`, the host's own state/routing triggers the re-render.

## `RemoteErrorBoundary` — page-level React fallback boundary

```tsx
import { RemoteErrorBoundary } from '@fulgurjs/federation/react'

<RemoteErrorBoundary
  fallback={({ error, reset }) => <ErrorBox error={error} onRetry={reset} />}
  onError={(error, info) => report(error)}
  resetKeys={[retryEpoch]}      // any change resets the boundary state
>
  <RemotePanel title="Details" />
</RemoteErrorBoundary>
```

- `reset` only resets the boundary state; if the subtree holds a failure cache (e.g. an external `React.lazy`), the caller must rebuild the load attempt — the plugin's own `remoteComponent` retry already does both;
- The error boundary built into `remoteComponent` consumes its own errors, so an outer `RemoteErrorBoundary` never sees errors already handled inside; to change the placeholder of a given remote component, use that component's own `error` option;
- Does not catch exceptions in event handlers or async callbacks (follows React's own semantics).

Vue has no separate boundary component: `remoteComponent`'s built-in error placeholder plus the `errorComponent` option carry the same responsibility.

## Remote types (automatic sync)

Generated `.d.ts` files are for editors and TypeScript, not runtime modules. If application code uses `import.meta.glob` to scan every `.ts` file, exclude declarations, for example `import.meta.glob(["./**/*.ts", "!./**/*.d.ts"])`. Component/tool registries should also exclude application bootstrap and federation assembly files.

In type positions, `typeof import(...)` and `import("vue").DefineComponent` only describe types and do not load a module. In a value expression, `typeof import(...)` does start a real load. `import(...)` returns a Promise; use `await` to access the module.

For a hands-on completion and error-checking example, see the [Vue template type demo](../../../examples/templates/vue-vue/README.md#体验远程类型提示与错误检查). Its browser page shows real function results and a remote component; `host/src/fulgurjs/host/type-demo.ts` contains five non-executed negative examples, and `typecheck` verifies that all five are rejected. Hover over `sumNumbers` or request completion after `utils.`. Temporarily remove an `@ts-expect-error` to see its diagnostic, then restore it.

`dts` is on by default: providers ship a **distributable declaration resource** with dev/build output (never depending on the remote's source being on the host machine), and hosts sync it automatically in dev into `src/fulgurjs/types/` (`.fulgurjs/types` without a src layout); src-layout projects work with zero tsconfig configuration:

```ts
// In the host, import directly as 'remote-name/X' for typed access (plain import and import() share the source)
import UserBadge from 'remote-a/shared/user-badge'
// String APIs check too: a misspelled entry errors at the call site; dynamic variables pass (unknown boundary)
const mod = await loadRemote('remote-a/shared/user-badge')
```

- Plain modules, Vue/React component props and bridge `appProps` all come from the remote's real declarations (produced by the official vue-tsc/TypeScript toolchain, not loose placeholders);
- Hosts need no hand-written tsconfig `paths`, no remote source and no symlinks; cross-machine development works the same;
- Provider source changes update declarations automatically. Temporary compiler configs and individual synchronized-file writes do not retrigger the source watcher; a complete newly synchronized generation triggers one local provider recheck. Temporary configs are removed when generation finishes or is aborted; do not add them to the project or maintain them manually;
- When a provider restarts and declarations are still compiling, hosts retain their existing snapshot and replace it once generation finishes. Strict type acceptance must wait for a successful sync; an old snapshot is not a current pass.
- A remote without type resources (older version / `dts: false`): pages run normally and entries follow the dynamic boundary (`unknown`); run `npx @fulgurjs/federation types` in CI for strict checks (see the [CLI reference](../reference/cli.md#fulgurjs-types));
- `dts: false` disables everything (no generation, no download); details and known limits in the [API reference · remote types](../reference/api.md#remote-types-generation-and-sync).

The first generation follows the dependencies of exposed entries to infer their real types. Even two entries may reference many files, so entry count alone does not predict compile time. Generation follows the toolchain’s supported API: tools with a per-file program API check the exposed closure; CLI-based tools reuse that dev server’s incremental cache. Changed props are still checked; logs, screenshots and Markdown do not trigger generation. Per-server compiler temporary directories are removed on shutdown; successful declaration resources have a separate cross-restart cache below. One-off builds and CLI runs always generate independently, rather than using dev snapshots for strict verification.


### Local development against a deployed remote

**A consumer running a local dev server can load both modules and types from a provider's deployed production build.** Different computers means the consumer does not need the provider's source or local files: reachable remote resources are sufficient. The provider does not have to run a Vite dev server just because the consumer does.

#### 1. Configure the entry the consumer actually uses

`remotes.<alias>.dev` selects the address when the **consumer runs its development server**; `prod` selects it for the consumer's production build. Neither field restricts the target to a development, staging or production environment. The plugin uses the configured address; it does not discover a production site or select the provider's local source automatically.

```ts
// Consumer fulgurjs.config.ts: merge into the existing config; preserve other remotes/exposes.
import type { FederationOptions } from '@fulgurjs/federation'

export default {
  name: 'workflow',
  remotes: {
    admin: {
      // Local workflow development consumes the deployed admin build.
      dev: 'https://assets.example.com/admin/fulgurjs-remoteEntry.js',
      // The workflow production build uses the same site; change to its real target if different.
      prod: 'https://assets.example.com/admin/fulgurjs-remoteEntry.js',
    },
  },
  shared: { vue: { singleton: true } },
} satisfies FederationOptions
```

Replace the domain, base and filename with real provider values. Both projects must still register `federation(fulgurjsConfig)` in their Vite configurations; creating this file alone is insufficient. React projects keep their appropriate shared configuration rather than copying the Vue setting above.

**Use the complete entry `.js` URL in dev when consuming a deployed remote.** A directory such as `https://assets.example.com/admin` becomes `/admin/@fulgurjs-entry.js` in dev, which is a development-server endpoint that ordinary static production deployments do not serve. A complete `/admin/fulgurjs-remoteEntry.js` is used verbatim. Use the actual filename when the provider customizes `filename`.

`dev` and `prod` do not fall back to each other. A dev-only address does not establish a production-build address; each omitted slot falls back only to `external`. See the [configuration reference](../reference/configuration.md#the-four-forms-of-remotes).

#### 2. Modules and types have different readers

| Resource | Reader | Example address / local location |
|---|---|---|
| Remote JS entry and its JS/CSS dependencies | Browser, when the page loads the remote module | `https://assets.example.com/admin/fulgurjs-remoteEntry.js` and referenced assets |
| Manifest | Type synchronizer in the consumer's development process | Sibling `https://assets.example.com/admin/fulgurjs-manifest.json` |
| Type index and declarations | Synchronizer, following and verifying manifest.types | Usually `/admin/fulgurjs-types/index.json` and its listed declarations; the manifest is authoritative |
| Combined declarations and entry registry | Local IDE and TypeScript/vue-tsc | Default `src/fulgurjs/types/admin/modules.d.ts` and `registry.d.ts`; metadata.json records the synchronized generation |

Declarations in the provider's deployed dist are downloadable resources for consumer development tools, not browser executable code. Synchronization does not require opening the remote page first. The consumer needs neither provider source nor its complete node_modules, and should not copy declarations into business files.

#### 3. Provider deployment and consumer startup

1. Keep provider `dts` enabled by default, accurately declare public props/events or module signatures, and run the normal production build.
2. Deploy JS, CSS, `fulgurjs-manifest.json` and `fulgurjs-types/` from the same build. All declarations listed in index.json must be reachable. Deploying JS alone can leave a working page without types. Provider `fulgurjs types` validates generation; it does not update deployed dist.
3. Configure the actual production entry as above, keep consumer `dts` enabled, and start the consumer's normal dev server. No provider dev server or manual type-generation command is required for ordinary dev use.
4. Wait for successful synchronization in the logs, confirm the real tsconfig includes generated declarations, then inspect actual parameters in the IDE. Background type synchronization does not block page startup; a visible page does not prove synchronization has finished.
5. Rebuild and deploy after changing the provider contract. Consumer dev polling detects the new revision and updates declarations. Unpublished local provider changes are not visible. Refresh the page as required by the browser's module cache; a type update does not hot-replace already running production modules.

#### 4. Conditions and troubleshooting

- **Check both network paths:** the browser must load cross-origin JS/CSS, and the consumer's Node development process must fetch the manifest and declarations. If static resources require login or special network access, confirm the development process can reach them too. Browser login does not give the type synchronizer that browser's cookies.
- **Shared dependencies and business context keep their contracts:** Vue/React versions, share scopes, Providers, authentication and backend API addresses do not become correct merely because types download successfully. The remote entry address does not rewrite backend API addresses inside the component.
- **Deploy consistent, refreshable resources:** do not pin fixed entry, manifest or type-index URLs behind stale long-lived caches. Declaration digests must match the manifest revision. Never edit generated declarations or index/revision values to silence errors.

| Symptom | Check and action |
|---|---|
| Local dev requests `@fulgurjs-entry.js` from the production site and gets 404 | The dev value is a directory; use the complete actual production `.js` entry |
| Page works but types are absent | Check manifest.types, deployed declarations, both dts settings and sync logs; an unknown fallback is not precise-type success |
| Types still contain old fields | Verify new declarations/revision were deployed and synchronization succeeded; failures retain an old snapshot, which is not current verification |
| Types are correct but loading/rendering fails | Check browser errors, cross-origin assets, shared negotiation and component runtime context separately; type success does not prove runtime success |
| Local provider edits do not appear | The configuration consumes a deployed build; switch to the provider's dev-server address to test undeployed source |

The consumer's own production build/CI still follows [strict synchronization](../reference/cli.md#fulgurjs-types): synchronize from the intended site before typechecking. Dev automation does not mean every build mode automatically downloads types.

For consumer/provider applications importing upstream named types, initial generation may precede synchronization. A newly synchronized complete generation triggers local provider regeneration automatically. Unchanged polls and failed syncs do not trigger a generation loop.

### Reusing types across dev-server restarts

Provider dev automatically saves successful declaration resources. On the next startup it validates inputs and declaration digests. **When source, configuration, dependencies and tools are unchanged and the cache is complete, it restores the same revision without running vue-tsc/TypeScript compilation.** Normal startup requires neither a manual generation command nor an additional cache setting.

**Vite availability and type readiness are separate events.** The type task is not a prerequisite for the dev server to listen. Do not report the declaration generation time as Vite startup, or treat an open page as proof that types are available. IDE use still requires a cache-hit or generation-success message followed by consumer synchronization.

**A priority configuration preparation hook starts the type task alongside Vite startup.** This separate hook prepares types without changing how shared dependencies, aliases, or chunk configuration are merged. The later core configuration checks root and public exposes; changes cancel the earlier task and create a new one. With no successful snapshot file (first start or deleted cache), generation starts directly. An existing snapshot is validated first: invalid inputs regenerate and a hit skips compilation. Cold generation overlaps provider-tool loading and validation-worker initialization; preloading does not mean compilation succeeded. Build, preview, and dts:false do not start these tasks.

Once the server takes ownership, closing or restarting releases the owned compiler process, worker, and listeners, including middleware mode. Another plugin's configuration failure may prevent a server from ever being created, so unattached preparation has a maximum 60-second lease. Normal CLI exit also disconnects the child IPC channel. No extra user startup command is required.

Set `FG_DTS_TIMINGS=1` when investigating startup cost: the success log then includes per-stage timings for the dev service (cold start / cache check / generation / publish), the generator parent (config, static closure, compiler, display, total) and the compiler child (config, Program, global diagnostics, static-closure diagnostics, emit, input recording). These values are diagnostics only and are not printed by default; they are not the same metric as Vite ready and cannot substitute for it.

With supported modern Vue Program APIs, the isolated compiler records the source, configuration, and dependencies it actually reads. The cache reuses that record instead of performing another full-project scan before cold compilation. Diagnostics still cover the complete static closure, while declaration emit follows only public declaration dependencies. Actual tool modules and logical links are recorded without walking unrelated tool tests/examples or their test-only dependencies. Older tools retain an available conservative path; incomplete tracking disables persistence explicitly.

Input recording, digest validation, and compression run in the isolated compiler/Node worker, keeping heavy scans off the Vite main thread. The provider's official compiler still infers props, events, slots, expose, and return values. No any, handwritten replacement interfaces, noCheck, or skipped error gates are used for speed.

**Saving source changes also reuses the in-memory program.** Each provider dev server owns one isolated compiler session. Unchanged files retain their AST and official Vue mappings; changed files are read and processed again. Every generation still runs real diagnostics over the complete static closure rather than reusing potentially stale diagnostics. Imported type changes, global declarations, and shifted error locations must be reflected. Compiler settings, dependency structure, or incompatible tools rebuild the state. Timeout, cancellation, and shutdown terminate the owned process. CLI/build do not reuse this memory, and compiler dependency changes still require a full dev-process restart.

**Reusing reads within a compilation requires validation before publication.** Modern Vue generation can reuse recorded file, directory, and link reads within one request. Generated global-types and compiler temporary files are excluded. Before publishing results or diagnostics, the service checks real inputs, resolution candidates, links, and ambient declaration membership again. Changed inputs discard the result and queue a recheck. If recording or validation is unavailable, it disables read reuse and repeats full compilation with ordinary reads; unvalidated results are never served. Failed-compilation records are used only for rechecking and watching external dependency repairs, never as successful cached declarations.

Where the provider's official TypeScript API supports it, the ordinary tool path parses third-party declarations with the JSDoc needed for correct type errors. Business source, JavaScript, and SFC documentation still receive full parsing. Consumers must retain public field documentation, including inherited library fields. Custom Vue compiler extensions retain their original parsing path. Links are still checked independently on cache restoration and subsequent generations.

The first generated line of synchronized modules.d.ts/registry.d.ts records source/revision only. Updating that ledger line no longer triggers compilation on its own. Declaration bodies, field types, business JSDoc, and all remaining bytes still invalidate appropriately; distributed output digests continue to cover the full content. Restoring a deleted consumer types directory can reuse a successful provider result when the recovered declaration bodies are unchanged.

**A small declaration output does not imply a small compiler input.** TypeScript also follows barrel exports, route views, and engine types. Record program input count, static-closure diagnostic count, and distributed declaration count separately, then trace real import chains. Type-only consumers should reference the canonical definition; a barrel can continue re-exporting it without duplicating DTOs. Full application routing and ordinary component contracts need clear boundaries. Change assembly only when callers already accept a general lazy-loading contract and the runtime still loads the same modules; verify real paths, missing-module errors, standalone entry, deep links, and menus.

An engine may offer separate side-effect initialization and API-definition entries. Use them only when the library actually provides them, retains registration behavior, and preserves API instance identity. Do not invent empty component/library declarations to hide required types, global augmentations, or errors. The plugin does not rewrite application routes or third-party packages automatically. Validate performance under the complete contract rather than cutting program inputs to an arbitrary count.

The cache is one compressed snapshot under project `node_modules/.cache/fulgurjs/types/`. It contains input fingerprints and generated declarations, not hundreds of additional business types, and stays out of Git/SVN. Shutdown preserves successful snapshots while releasing each server's private compiler directory. Mutable tsbuildinfo is never shared between processes.

| Situation | Behavior |
|---|---|
| First startup, deleted cache or plugin/tool upgrade | Generate normally; supported Vue tools reuse the actual compiler input record |
| Unchanged inputs after stopping and restarting | Validate and restore successful declarations; logs report a cache hit and validation time |
| Source, inherited tsconfig, exposes, lockfiles, dependency declarations or link targets change | Invalidate and regenerate; new directory members and higher-priority resolution candidates are checked too |
| Corrupt cache, mismatched digests or generation failure | Never advertise stale output as newly successful; ignore bad caches or retain failure diagnostics, writing only successful snapshots |
| Cache cannot be written | Current generation and page serving continue with a cache warning; the next startup may compile again |
| Custom Vue compiler plugins, external templates or other incompletely modeled inputs | Use normal compilation rather than guessing reuse is safe |

Validation uses contents and resolution observations, not mtime alone. Same-length edits, imports outside include, JS/JSDoc external types, declaration dependencies and symlinks invalidate appropriately. Inputs changing during generation prevent that result from being persisted; a recheck is queued. Concurrent servers keep private compiler directories and atomically replace successful snapshots.

**A hit is not free and does not guarantee total Vite startup time.** Input reads and hashing still cost time, particularly in large projects. Cold generation or changed inputs may still take tens of seconds; Vite dependency prebundling has its own cost. Measure cold generation, cross-process restoration, dev readiness and consumer synchronization separately.

Delete this cache directory (or node_modules) and restart dev normally to rebuild the cache. Deleting consumer `src/fulgurjs/types/` is separate: dev downloads declarations again, while provider input validation decides whether compilation is needed. When missing upstream types initially prevent local provider generation, wait for automatic sync and generation rechecks instead of adding placeholder declarations.

Restoration validates the local inputs and successful snapshot, not an upstream update that has not synchronized yet. New upstream declarations still trigger local checking. Strict CI/production workflows continue generation and synchronization as documented; build and CLI never reuse these dev snapshots.

For startup performance acceptance, compare dts disabled with its default enabled behavior in the same project and dependency-prebuild state. Record Vite ready, first HTTP, type readiness, and compiler invocations separately. Different projects or warmup states cannot substantiate a seconds-level startup claim.

### Type dependency boundaries also affect cold generation

`import type` removes the runtime import, but TypeScript still reads its target and re-exports to resolve types. A utility importing one form type through a barrel that also exports many Vue components can pull unrelated components, pages, and UI libraries into the program. Pruning the final declaration files does not recover that parsing/checking time.

Within a business project, prefer the existing type's definition module for type-only dependencies. Verify the original re-export resolves to the same definition before changing the path. Do not duplicate DTOs, handwrite generated declarations, or add empty forwarding files. Third-party packages still follow their public exports; SDK imports remain on `@fulgurjs/federation`, `/vue`, or `/react`.

```ts
// Business-internal path: reuse the existing type definition.
import type { FormSchema } from '../components/Form/types'
```

Validate unchanged public declarations and field diagnostics, with no new caller errors. Measure cold generation, real props edits, error feedback, and recovery separately. Providers, registrations, initialization, and checks must not be removed to improve a timing. A large dependency graph still has real compilation costs; there is no universal fixed-seconds guarantee.

### Why declarations can outnumber exposed entries

The provider first uses TypeScript/vue-tsc to analyze the sources needed for correct inference. Distribution then starts from the emitted public entry declarations and follows only their declaration dependencies. Implementation-only tables, editors and request utilities are omitted when their types do not appear in public signatures. Externals are recalculated from retained declarations, so implementation-only packages are not required in the consumer.

One file per entry is not a safe limit. Shared props interfaces, inferred return types, re-exports, `import("./types")`, `import = require(...)`, declaration side-effect imports and `reference path` dependencies may require additional files. Shared dependencies are retained once and cycles terminate. Do not delete required files or substitute `any`, `Record<string, unknown>` or copied DTOs to reduce the count.

Pruning reduces distributed files, download size and consumer input. The compiler may still analyze many source files for inference, so file-count reductions do not imply proportional cold-generation speedups. The rule applies automatically in dev/build without an extra command or setting; production consumers still follow the strict synchronization steps above.

Measure exposed entries, `index.json.files` count, bundle bytes, cold generation time and consumer synchronization separately. Validate real props, events and instance members with accepted and rejected inputs. Fewer files with missing fields or weakened error checking is a failure, even when the build succeeds.

## Runtime imports inside remote pages

Expose target files (remote pages/components loaded cross-origin by the host) can **statically import** the runtime APIs directly — the plugin automatically rewrites such imports into a lazy singleton proxy, so host and remote code look identical:

```ts
// Inside a remote page — exactly the same as in a host page
import { loadRemote } from '@fulgurjs/federation/runtime'
```

For debugging, `(globalThis as any).__FULGURJS_RUNTIME__` gives direct access to the page-level runtime singleton (equivalent; for special cases only).

## Error and recovery quick reference

| Symptom | Error code | Handling |
|---|---|---|
| Network/timeout/retries exhausted/breaker open | `MFU-001` | Check the remote address and availability; configure a `fallback` entry or `fallbackModule` |
| Self-reported name differs from the configured name | `MFU-002` | Fix the `remotes` key or align using the `'selfName@url'` string form |
| Requested module is not exposed | `MFU-006` | Verify `remoteName/exposes key` (do not repeat the remote name prefix in the spec) |
| Unknown remote | `MFU-008` | Verify the `remotes` key matches the spec prefix |
| Module has no exports at all | `MFU-009` | Check the exports of the expose target file |
| Component renders, but string tags like `<a-divider>` stay as dead elements | — | The remote declares `globalComponents` in its setup module (auto-installed for `remoteComponent` consumers); see [API reference · setup/onSession](../reference/api.md#setup-on-session) |
| Component renders, but the class prefix turns `undefined-xxx` / theme classes missing (inject miss) | — | The remote declares `pageProviders` in its setup module (ancestor providers auto-wrapped); see the provide/inject note above |

The full error code list: [error code table](../reference/errors.md); symptom-based troubleshooting: [troubleshooting index](../troubleshooting/README.md).
