# @fulgurjs/federation

[简体中文](./README.md) | [English](./README.en.md)

**Use components, pages and functions from another Vite application.**

For example, a main application can load a separately deployed approval page, a Vue host can embed a React sub-app, or several applications can use the same utility module. Each application can live in its own repository and build and deploy separately.

This is the usage guide, with examples for **5.7.1**. Signatures, defaults and execution rules are in the [API reference](https://github.com/chenmingye/fulgurjs-federation/blob/master/docs/API.en.md).

## Choose what you need

| Goal | Use | Example |
|---|---|---|
| Load a Vue component in Vue | `remoteComponent` | [Vue examples](https://github.com/chenmingye/fulgurjs-federation/tree/master/examples/vue) |
| Load a React component in React | `remoteComponent` from `/react` | [React examples](https://github.com/chenmingye/fulgurjs-federation/tree/master/examples/react) |
| Call a remote JS/TS function | `loadRemote`; React also has `useLoadRemote` | Quick start below |
| Map several host routes to remote pages | `createHostPages` (Vue) / `createReactHostPages` (React) | [Page demo](https://github.com/chenmingye/fulgurjs-federation/tree/master/demo/pages-cli) |
| Embed Vue in React, or React in Vue | `defineBridgeApp` + a host bridge component | [Bridge examples](https://github.com/chenmingye/fulgurjs-federation/tree/master/examples/bridge) |
| Restore a sub-app detail route after refresh | Enable bridge URL sync | [Router demo](https://github.com/chenmingye/fulgurjs-federation/tree/master/demo/bridge-router) |
| Provide user data or run remote initialization | `AppContext`, optional `setup`/`onSession` | Initialization below |
| Run React 18 and 19 on the same page | Separate dependency groups and consumers using `shareScope` | [Version isolation demo](https://github.com/chenmingye/fulgurjs-federation/tree/master/demo/react-versions) |

Combine these features as needed. **A simple remote component does not require a bridge, page table or login lifecycle.**

## Terms in plain language

| Term | Meaning |
|---|---|
| Host | The application displaying remote content |
| Remote | The application providing a module |
| `exposes` | Files the remote allows other applications to load |
| `remotes` | The remote names and addresses the host uses |
| `shared` | Dependencies that participate in sharing, such as Vue or React |
| `singleton` | Adopt one dependency instance within a share scope; this does not make incompatible major versions compatible |
| `shareScope` | A group of shared dependencies; separate groups can use separate versions |
| Bridge | A DOM container in which a sub-app manages its own rendering and cleanup |
| URL sync | Record the sub-app route in the host URL so refresh, sharing and history navigation can restore it |

An application can both expose and consume modules.

## Install

Install in every participating Vite project:

```bash
pnpm add -D @fulgurjs/federation
# npm projects: npm install -D @fulgurjs/federation
```

- Supports browser applications using Vue 3, React 18/19, and plain JS/TS modules.
- Supports Vite 5.1+ within the Vite 5/6/7/8 series. Your framework plugins must also support your chosen Vite version.
- The plugin requires Node.js ≥18, but **Vite 7/8 require Node.js 20.19+ or 22.12+**. Meet both requirements.
- Set the build target to `es2022` or newer. Chrome 108+ is the browser baseline; other browsers need corresponding ESM, dynamic import and top-level await support.
- A pure Vue application needs Vue; a pure React application needs React and react-dom. A cross-framework bridge host installs both frameworks as explained below.

## Quick start: two Vue applications

These steps add federation to **existing Vite + Vue projects**, which retain their own HTML and application entry files.

```text
remote-vue/     Provides a button and add() function; dev port 5174
host-vue/       Loads them; dev port 5173
```

### 1. Declare remote files

`remote-vue/fulgurjs.config.ts`:

```ts
import type { FederationOptions } from '@fulgurjs/federation'

export default {
  name: 'remote-vue',
  exposes: {
    './Button': './src/Button.vue',
    './math': './src/math.ts',
  },
  shared: { vue: { singleton: true, strictVersion: true } },
} satisfies FederationOptions
```

`remote-vue/src/Button.vue`:

```vue
<script setup lang="ts">
import { ref } from 'vue'
defineProps<{ label: string }>()
const count = ref(0)
</script>

<template>
  <button @click="count++">{{ label }}: {{ count }}</button>
</template>
```

`remote-vue/src/math.ts`:

```ts
export function add(a: number, b: number): number {
  return a + b
}
```

### 2. Declare the address in the host

`host-vue/fulgurjs.config.ts`:

```ts
import type { FederationOptions } from '@fulgurjs/federation'

export default {
  name: 'host-vue',
  remotes: {
    'remote-vue': {
      dev: 'http://localhost:5174',
      prod: '/remote-vue',
    },
  },
  shared: { vue: { singleton: true, strictVersion: true } },
} satisfies FederationOptions
```

`dev` is the development URL. `prod` is the deployed URL; `/remote-vue` refers to a path on the host origin, not a local filesystem folder.

### 3. Register the plugin in both applications

Each project's `vite.config.ts` imports its own federation config:

```ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import federation from '@fulgurjs/federation'
import fulgurjsConfig from './fulgurjs.config'

export default defineConfig({
  plugins: [vue(), federation(fulgurjsConfig)],
  build: { target: 'es2022' },
})
```

Keep existing aliases, proxies and other settings. Install compatible Vue versions in both applications; `strictVersion` rejects incompatible shared versions.

### 4. Display and call the remote modules

`host-vue/src/App.vue`:

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { loadRemote, remoteComponent } from '@fulgurjs/federation/runtime'

const RemoteButton = remoteComponent('remote-vue/Button')
const result = ref('Not calculated yet')

async function calculate() {
  try {
    const math = await loadRemote<{ add(a: number, b: number): number }>('remote-vue/math')
    result.value = String(math.add(1, 2))
  } catch (error) {
    result.value = error instanceof Error ? error.message : String(error)
  }
}
</script>

<template>
  <RemoteButton label="Remote button" />
  <button @click="calculate">Call remote add()</button>
  <p>{{ result }}</p>
</template>
```

In `remote-vue/Button`, `remote-vue` matches the host's `remotes` key and `Button` matches the remote's `./Button` expose key. The `./` can be omitted when loading it.

`loadRemote` returns module exports. You still need to call `math.add()` to perform the calculation.

### 5. Run both applications

```bash
# Terminal one, inside remote-vue
npm run dev -- --port 5174 --strictPort

# Terminal two, inside host-vue
npm run dev -- --port 5173 --strictPort
```

Open `http://localhost:5173`. The remote button should count clicks, and the calculation should display `3`. pnpm projects can use `pnpm dev` instead.

Complete projects and deployment configuration: [Vue examples](https://github.com/chenmingye/fulgurjs-federation/tree/master/examples/vue).

## React setup

Use the same configuration structure with these changes:

1. Use `@vitejs/plugin-react` in `vite.config.ts`, followed by `federation(fulgurjsConfig)`.
2. Expose `./Button` from `./src/Button.tsx`; configure the remote's address in the host.
3. Both applications use compatible React/renderer versions and share:

```ts
shared: {
  react: { singleton: true, strictVersion: true },
  'react-dom': { singleton: true, strictVersion: true },
}
```

Remote `src/Button.tsx`:

```tsx
import { useState } from 'react'

export default function Button({ label }: { label: string }) {
  const [count, setCount] = useState(0)
  return <button onClick={() => setCount(count + 1)}>{label}: {count}</button>
}
```

Host `src/App.tsx`, with a remote configured as `remote-react`:

```tsx
import { remoteComponent } from '@fulgurjs/federation/react'

// Create once at module scope, not on every render.
const RemoteButton = remoteComponent<{ label: string }>('remote-react/Button', {
  fallback: <p>Loading…</p>,
})

export default function App() {
  return <RemoteButton label="Remote React button" />
}
```

React also imports `loadRemote` and `useLoadRemote` from `/react` for ordinary modules. Complete projects: [React examples](https://github.com/chenmingye/fulgurjs-federation/tree/master/examples/react).

## Embed Vue and React in each other

**A bridge embeds a sub-app with its own component tree. It does not convert a React component into a Vue component.**

For a Vue host embedding React:

1. React remote `src/bridge.tsx`:

```tsx
import { defineBridgeApp } from '@fulgurjs/federation/react'

export default defineBridgeApp((props) => (
  <section>React sub-app: {String(props.message ?? '')}</section>
))
```

2. Add `exposes: { './bridge': './src/bridge.tsx' }` to the remote config.
3. Configure the remote address in the Vue host, then use:

```vue
<script setup lang="ts">
import { createVueBridgeApp } from '@fulgurjs/federation/bridge/vue'
const RemoteApp = createVueBridgeApp<{ message: string }>('remote-react/bridge')
</script>

<template>
  <RemoteApp :app-props="{ message: 'From Vue host' }" />
</template>
```

A cross-framework host installs and shares `vue`, `react` and `react-dom`. The child installs and shares its own framework. React and react-dom must be compatible; multiple React majors need separate dependency groups and consumers, as shown in the isolation demo.

In the other direction, use `createReactBridgeApp` in the React host. The Vue child uses `defineBridgeApp` from `/runtime` and returns a `createApp(...)` application.

Remember:

- `appProps` is a snapshot taken at mount. Replacing top-level fields later does not update the child. Pass stable callbacks/shared stores for live data, or change the component `key` to remount.
- Separate component trees do not inherit Context, provide/inject or routers. Pass or install what is needed explicitly.
- Use `remoteComponent` for a same-framework component; use a bridge for a sub-app.

Complete bidirectional setup and login/cleanup flows: [bridge examples](https://github.com/chenmingye/fulgurjs-federation/tree/master/examples/bridge).

## Keep child routes in the browser URL

Bridging does not change the host URL by default. Enable URL sync to map:

```text
Host /approval/list        → Child /list
Host /approval/detail/42   → Child /detail/42
```

Configure both sides:

1. The host router must handle all child paths under `/approval` without unmounting the child on each detail navigation.
2. Pass `routing` to the host bridge component, including `basePath: '/approval'` and the host navigation adapter.
3. The child declares `defineBridgeApp(..., { routing: true })` and connects a controlled memory router.

Vue uses `createVueBridgeNavigation` / `connectVueBridgeRouter`; React uses `createReactBridgeNavigation` / `createReactBridgeRouter`. React hosts need a data router (`createBrowserRouter` or `createHashRouter`), not `BrowserRouter`. Built-in adapters support Vue Router 4 and React Router ≥6.11.

Refresh, shared links and browser history restore the route, **not form contents or business data**. See [routing API](https://github.com/chenmingye/fulgurjs-federation/blob/master/docs/API.en.md#url-sync) and the runnable [router demo](https://github.com/chenmingye/fulgurjs-federation/tree/master/demo/bridge-router).

## User data and remote initialization

These features are optional. A plain button or utility module does not need them.

| Need | API | When |
|---|---|---|
| Provide user, token getter, store, etc. | `provideAppContext` | Host supplies them before loading business modules |
| Read host values | `getAppContext` / `requireAppContext` | Called by remote business code |
| Initialize a remote once | Default export in configured `setup` file | Before the first business `loadRemote('remote/module')` returns |
| Synchronize permissions after login/account changes | Named `onSession` export in the same file | Deduplicated by `sessionKey` |
| Clear account context on logout | `clearAppContext` | Host logout flow; host also removes private pages/caches |

`sessionKey` identifies a login attempt; it is **not a token or authorization credential**. Generate a new value on login/account change; token refresh alone retains it.

A bridge can read current data using `getContext`. Controlled `sessionKey: null` means logged out: unmount and stop loading. Omitting the key disables controlled session switching.

Only a configured `setup` file participates in initialization. `preloadRemote` fetches resources without running setup/onSession. Async initialization must check `context.signal.aborted` before writing state, so late responses do not restore old-account data.

See the [API reference](https://github.com/chenmingye/fulgurjs-federation/blob/master/docs/API.en.md#context).

## Several remote pages

Maintain a page table and pass it to `createHostPages` (Vue) or `createReactHostPages` (React). These helpers resolve modules, cache loading components and provide loading/error states. **They do not create your host Router.**

The table records the host `route` and the remote expose `spec` (omit `./` and do not repeat the remote name); `remotePrefixes` selects the remote. For example, `/shop/home`, `spec: 'pages/Home'` and `remotePrefixes: { '/shop': 'shop' }` resolve to `shop/pages/Home`. Vue can use KeepAlive for component state; React has no equivalent keep-alive promise here.

See [page API](https://github.com/chenmingye/fulgurjs-federation/blob/master/docs/API.en.md#pages) and [page demo](https://github.com/chenmingye/fulgurjs-federation/tree/master/demo/pages-cli).

## Build and deploy

Build each application separately with its own `npm run build`. The remote produces `fulgurjs-remoteEntry.js` and `fulgurjs-manifest.json` by default. The host locates them through `prod`.

Check these settings:

- Remote deployment `/remote-vue/` → remote Vite `base: '/remote-vue/'` and host `prod: '/remote-vue'`.
- HTML, remoteEntry and manifest use `Cache-Control: no-cache`; content-hashed chunks can use long-lived caching.
- SPA routes support refresh; missing resource URLs return 404 rather than HTML.
- Cross-origin deployments need production CORS headers; dev settings do not configure the production server.
- Keep chunks still referenced by old pages available during releases, or use a deployment flow that avoids mixed versions.

Deployment examples: [Vue](https://github.com/chenmingye/fulgurjs-federation/blob/master/examples/vue/README.md) / [React](https://github.com/chenmingye/fulgurjs-federation/blob/master/examples/react/README.md).

## Handle failures

| Symptom | Check | Recovery |
|---|---|---|
| Remote unavailable | Server, address, CORS | Timeout/retry/error UI; optional backup entry or fallback module |
| Module missing | remotes name and exposes key | Fix the name and retry |
| Shared version incompatible | Installed versions, requiredVersion, strictVersion, scope | Align or isolate versions |
| Static dependency remains failed after service recovery | Browser may retain the failed dependency URL | User-initiated refresh preserves the current address |
| Child unmount fails | Child cleanup, timers and subscriptions | Container stays blocked; refresh and fix cleanup |

`remoteComponent` and bridge components provide default error UI. Direct `loadRemote` calls and React `useLoadRemote` require application error handling. An explicit `fallbackModule` does not repair the original remote.

Errors include a code, cause and fix. See [error codes](https://github.com/chenmingye/fulgurjs-federation/blob/master/docs/API.en.md#error-codes).

## Vite 8 and support boundaries

**Supports Vite 8 development and production. The earlier large-application startup hang has been fixed and relevant regression tests pass.**

Two practical details:

- A first dev visit may reload while Vite prepares newly discovered dependencies. Wait for optimization before judging stable behavior. This is not a production behavior on every visit.
- Some shared scenarios fetch an unused local library copy. One singleton scope still uses one instance; explicitly isolated React 18/19 scopes may use one each. Downloaded file count and active instance count are different.

Not provided: SSR/RSC, Node-side federation, React Native, automatic JS/CSS isolation, webpack `script/var` artifact interoperability, component-type conversion, automatic multi-level bridge routing proxies or cross-window route sync. Global CSS/variables can affect the host; children need their own internal error handling.

See the [capability comparison](https://github.com/chenmingye/fulgurjs-federation/blob/master/docs/webpack-mf-对照与缺口.md) for detailed boundaries and differences from webpack.

## Debugging, types and CLI

Run in the application directory:

```bash
npx fulgurjs init
npx fulgurjs explain

# Optional: validate a configured host page table
npx fulgurjs check-pages --site http://localhost:5173

# After deployment under /remote-vue/, substitute your actual site:
npx fulgurjs doctor --base https://your-site.example --apps remote-vue
```

For `doctor`, `--base` is the site URL and `--apps` lists deployment subdirectories: the example checks `/remote-vue/`. It does not infer a different development port from a container name.

`init` creates a federation config template, not a full application, router or Nginx configuration. `check-pages` compares the page table with remote exposes; an unreachable remote is reported as unverified.

Remote dev types are generated by default. Accessible source provides more precise mapping; inaccessible source produces `any` declarations without precise checks/completion. Set `dts: false` to disable generation. See the reference for details.

Advanced diagnostics use `window.__FULGURJS_SCOPE__`, `window.__FULGURJS_INFO__` and `FULGURJS_DEBUG`. Normal integration does not require editing these objects.

## API reference

Use the current reference rather than guessing signatures from old task documents:

- [Plugin options and defaults](https://github.com/chenmingye/fulgurjs-federation/blob/master/docs/API.en.md#plugin-options)
- [Runtime loading, registration and hooks](https://github.com/chenmingye/fulgurjs-federation/blob/master/docs/API.en.md#runtime)
- [Bridge props, sessions and cleanup](https://github.com/chenmingye/fulgurjs-federation/blob/master/docs/API.en.md#bridge)
- [URL sync and navigation](https://github.com/chenmingye/fulgurjs-federation/blob/master/docs/API.en.md#url-sync)
- [Chinese API reference](https://github.com/chenmingye/fulgurjs-federation/blob/master/docs/API.md)

### When an AI implements your integration

Specify the framework, whether you need a component or sub-app, remote URLs/expose names, and whether login switching or URL sync is required. Have it read the guide and relevant API section first, preserve the existing Vite configuration, check installed versions and use the correct browser entry. It should not invent configuration fields. Verify mounting, interaction and error handling; URL sync also needs deep-link refresh, history and cancellation checks.

## Documentation

- [Demo catalog](https://github.com/chenmingye/fulgurjs-federation/blob/master/demo/README.md): setup and runnable scenarios.
- [Migration guide](https://github.com/chenmingye/fulgurjs-federation/blob/master/docs/迁移指南.md).
- [CHANGELOG](https://github.com/chenmingye/fulgurjs-federation/blob/master/CHANGELOG.md): changes and migration requirements.
- [Acceptance records](https://github.com/chenmingye/fulgurjs-federation/blob/master/docs/完整Demo展示与全面复测-验收报告-20261002.md): version-specific evidence, not a substitute for testing your application.

## Development and testing

These commands develop **this plugin repository**; ordinary consumers do not need them:

```bash
pnpm --dir packages/plugin install
pnpm --dir packages/plugin build
pnpm test:unit
```

See [CONTRIBUTING](https://github.com/chenmingye/fulgurjs-federation/blob/master/CONTRIBUTING.md) for fixture installation and browser test prerequisites. CI checks builds, types, unit tests, installed packages and browser scenarios across multiple Vite versions. Counts come from the corresponding run.

## License

[MIT](./LICENSE) © chenmingye (Jason)
