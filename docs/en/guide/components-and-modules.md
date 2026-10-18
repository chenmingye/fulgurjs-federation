# Loading components and modules

> Loading a remote component or function module needs no bridge, no page table, and no login initialization — this is the minimal use of the federation. Import entries: Vue imports from `@fulgurjs/federation/vue`, React from `@fulgurjs/federation/react`, framework-agnostic code from `@fulgurjs/federation/runtime`.

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

### Reuse an existing component registration source

If a project already has `registerComponents(app)`, do not copy a second component-library list into setup. Nested user pickers and uploaders may also use global tags, so scanning only the outer form misses dependencies. An ancestor Provider can obtain the actual consumer app through `getCurrentInstance()?.appContext.app` in setup and call the existing registration function. Use a module-level `WeakSet<App>` for idempotence and mark the app only after successful registration. A new bridge app needs its own installation; a one-time container flag is insufficient. Preserve project-specific components and resolve ownership before overwriting names.

This explicitly registers components in the consumer; provide/inject does not copy the registry. Reusing the entire registration function also brings its dependencies. If a smaller expose is needed, extract the required public subset from the original source and share it between the standalone entry and Provider, rather than maintaining two lists.

Share theme configuration as well: extract font, text color, border radius, and primary color into one function used by both the standalone root and remote Provider. Copying only the light/dark algorithm can still change the form appearance. Direct federation rendering shares the DOM, so global CSS can affect other components. For faded text, inspect matching selectors, `color`, and `-webkit-text-fill-color`; scope the fix to the owning component instead of adding global overrides or layers of `!important`. Compare real controls, data, read-only behavior, and computed styles; successful CSS requests alone do not establish visual equivalence.

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
- **Context does not cross from the provider's app root**: same as Vue — React Context created at the provider app's root is invisible inside the consumer tree; exposed surfaces depending on Context carry their own Provider inside the exposed entry component (single source).

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

For a hands-on completion and error-checking example, see the [Vue template type demo](../../../examples/templates/vue-vue/README.md#体验远程类型提示与错误检查). Its browser page shows real function results and a remote component; `host/src/type-demo.ts` contains five non-executed negative examples, and `typecheck` verifies that all five are rejected. Hover over `sumNumbers` or request completion after `utils.`. Temporarily remove an `@ts-expect-error` to see its diagnostic, then restore it.

`dts` is on by default: providers ship a **distributable declaration resource** with dev/build output (never depending on the remote's source being on the host machine), and hosts sync it automatically in dev into `src/fulgurjs/types/` (`.fulgurjs/types` without a src layout); src-layout projects work with zero tsconfig configuration:

```ts
// In the host, import directly as 'remote-name/X' for typed access (plain import and import() share the source)
import UserBadge from 'remote-a/shared/user-badge'
// String APIs check too: a misspelled entry errors at the call site; dynamic variables pass (unknown boundary)
const mod = await loadRemote('remote-a/shared/user-badge')
```

- Plain modules, Vue/React component props and bridge `appProps` all come from the remote's real declarations (produced by the official vue-tsc/TypeScript toolchain, not loose placeholders);
- Hosts need no hand-written tsconfig `paths`, no remote source and no symlinks; cross-machine development works the same;
- Provider source changes update declarations automatically. Temporary compiler configs and downloaded declarations do not trigger generation again. Temporary configs are removed when generation finishes or is aborted; do not add them to the project or maintain them manually;
- When a provider restarts and declarations are still compiling, hosts retain their existing snapshot and replace it once generation finishes. Strict type acceptance must wait for a successful sync; an old snapshot is not a current pass.
- A remote without type resources (older version / `dts: false`): pages run normally and entries follow the dynamic boundary (`unknown`); run `npx @fulgurjs/federation types` in CI for strict checks (see the [CLI reference](../reference/cli.md#fulgurjs-types));
- `dts: false` disables everything (no generation, no download); details and known limits in the [API reference · remote types](../reference/api.md#remote-types-generation-and-sync).

The first generation follows the dependencies of exposed entries to infer their real types. Even two entries may reference many files, so entry count alone does not predict compile time. Generation follows the toolchain’s supported API: tools with a per-file program API check the exposed closure; CLI-based tools reuse that dev server’s incremental cache. Changed props are still checked; logs, screenshots and Markdown do not trigger generation. The cache stays inside `node_modules` and is removed after the dev server closes. No configuration or commit is needed. One-off builds and CLI runs use independent output.


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

The full 49 codes: [error code table](../reference/errors.md); symptom-based troubleshooting: [troubleshooting index](../troubleshooting/README.md).
