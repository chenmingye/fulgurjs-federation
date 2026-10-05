# @fulgurjs/federation

**Let one Vite app use components, pages, functions — or entire sub apps — provided by another.**

For example: a main system loads an independently deployed approval page, a Vue page embeds a React sub app, or several apps share one copy of a dependency. Providers and consumers can live in separate repos and build/deploy independently. Supports Vue 3 and React 18/19 on Vite 5.1–8.

[简体中文](README.md) ｜ **[Documentation center](docs/README.md)** (Chinese [docs/zh](docs/zh/README.md) · English [docs/en](docs/en/README.md))

## Quick start

**New project** (recommended): scaffold a fully runnable federation workspace from a template:

```bash
npx @fulgurjs/federation create vue-vue --dir my-federation
cd my-federation
pnpm dev
```

**Existing project**: install the package, register the plugin in `vite.config.ts`, and import from the unified entry for your framework:

```bash
npm add @fulgurjs/federation
```

```ts
// vite.config.ts — build config uses the package root
import federation from '@fulgurjs/federation'

export default {
  plugins: [federation({
    name: 'my-app',
    // exposes / remotes / shared as needed — see "Adopting in an existing project"
  })],
}
```

```ts
// Vue app code imports from @fulgurjs/federation/vue
import { loadRemote, remoteComponent } from '@fulgurjs/federation/vue'
const RemoteButton = remoteComponent('remote-a/Button')
const math = await loadRemote<{ add(a: number, b: number): number }>('remote-a/math')
```

```tsx
// React app code imports from @fulgurjs/federation/react
import { remoteComponent, useLoadRemote, RemoteErrorBoundary } from '@fulgurjs/federation/react'
```

```ts
// Framework-agnostic browser modules: @fulgurjs/federation/runtime (zero Vue/React)
import { loadRemote, loadShare } from '@fulgurjs/federation/runtime'
```

## Entries (6.0.0)

| Where | Entry |
|---|---|
| Vite config, `FederationOptions` types | `@fulgurjs/federation` |
| Vue app code (components/pages/bridge/router sync) | `@fulgurjs/federation/vue` |
| React app code (components/pages/bridge/router sync) | `@fulgurjs/federation/react` |
| Framework-agnostic browser modules | `@fulgurjs/federation/runtime` |

Since 6.0.0 the legacy entries `/bridge`, `/bridge/vue`, `/bridge/react` and `/bridge/router/{vue,react}` are removed; their features live in `/vue` and `/react`. See the [migration guide](docs/en/migration.md).

## Capabilities

- **Components & modules**: `remoteComponent` (Vue/React), `useLoadRemote`, `RemoteErrorBoundary`, `loadRemote` — explicit retryable error states, no silent fallbacks.
- **Per-page pages**: `definePages` + `createHostPages` (host route table → remote pages) with CLI `check-pages` contract checks.
- **Full sub app bridge**: `defineBridgeApp` (child) + `createVueBridgeApp` / `createReactBridgeApp` (host); mount/unmount, session epochs, unmount-failure quarantine.
- **URL sync**: `createVueBridgeNavigation` / `createReactBridgeNavigation` (host) + `connectVueBridgeRouter` / `createReactBridgeRouter` (child); deep-link refresh, guard cancellation, query/hash preservation.
- **Shared dependencies**: singleton / requiredVersion / strictVersion / shareScope / eager, sync & async negotiation, React 18/19 multi-version isolation.
- **CLI**: `create` / `init` / `explain` / `check-pages` / `doctor` / `port`.

## Documentation

| Need | Entry |
|---|---|
| New project / existing project | [Getting started](docs/en/guide/getting-started.md) |
| Vue/React components & plain modules | [Components & modules](docs/en/guide/components-and-modules.md) |
| Full sub apps / cross-framework nesting | [App bridge](docs/en/guide/app-bridge.md) |
| Router sync / deep links | [URL sync](docs/en/guide/url-sync.md) |
| All options & defaults | [Configuration](docs/en/reference/configuration.md) |
| Full API signatures & semantics | [API reference](docs/en/reference/api.md) |
| CLI commands & exit codes | [CLI reference](docs/en/reference/cli.md) |
| Error codes (symptom/cause/fix) | [Error code table](docs/en/reference/errors.md) |
| Troubleshooting / compatibility | [Troubleshooting](docs/en/troubleshooting/README.md) |
| Templates & demos | [Examples overview](examples/README.md) |

## Examples

Five complete templates (`vue-vue` / `react-react` / `vue-host-react-remote` / `react-host-vue-remote` / `showcase`) plus feature demos live in [examples/](examples/README.md). Each can be copied out and installed standalone.

## Contributing & security

- See [CONTRIBUTING.md](CONTRIBUTING.md); architecture and release process live in [docs/maintainers/](docs/maintainers/README.md).
- Please report security issues privately via [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
