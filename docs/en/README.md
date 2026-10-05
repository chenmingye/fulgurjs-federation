# English Documentation Index

> Corresponds to @fulgurjs/federation **6.0.0**. Application code imports from exactly four public entries: the package root (Vite plugin), `@fulgurjs/federation/vue`, `@fulgurjs/federation/react`, and `@fulgurjs/federation/runtime`. The old `/bridge*` entries were removed in 6.0.0 (see the [migration guide](migration.md)).

## Recommended reading paths

**First contact (build a project from scratch)**:

1. [Getting started](guide/getting-started.md) — install, scaffold with `fulgurjs create`, run it
2. [Loading components and modules](guide/components-and-modules.md) — the most-used `remoteComponent` / `loadRemote`
3. When something breaks, check the [troubleshooting index](troubleshooting/README.md); for option details see the [configuration reference](reference/configuration.md) and the [API reference](reference/api.md)

**Integrating an existing project**:

1. [Getting started · integrating an existing project](guide/getting-started.md#integrating-an-existing-project) — `fulgurjs init` / manual integration; choose the configuration by role (provider/consumer/dual)
2. Go deeper as needed: [shared dependencies](guide/sharing.md) (one instance across apps) → [remote pages](guide/remote-pages.md) (per-page pages) or [sub app bridge](guide/app-bridge.md) (full sub app embedding)
3. When remote business pages need login state, read the AppContext section of [sub app bridge](guide/app-bridge.md#session-sessionkey-and-appcontext) and [API reference · setup/onSession](reference/api.md#setup-on-session)

**Cross-framework embedding (Vue host embedding React, or the reverse)**:

1. [Sub app bridge](guide/app-bridge.md) — defineBridgeApp / createVueBridgeApp / createReactBridgeApp, the appProps snapshot, session switching
2. When refresh/sharing must restore the sub app's internal pages: [URL sync](guide/url-sync.md)
3. Before deploying, read the [deployment guide](guide/deployment.md) and run `fulgurjs doctor`

## Directory

### Guides (guide/)

| Document | Content |
|---|---|
| [Getting started](guide/getting-started.md) | Install, scaffold a new project with `create`, integrate existing projects with `init`/manual wiring (Vue/React/pure TS; consumer/provider/dual) |
| [Loading components and modules](guide/components-and-modules.md) | remoteComponent (Vue/React), useLoadRemote, RemoteErrorBoundary, loadRemote, dev-time type passthrough |
| [Remote page integration](guide/remote-pages.md) | definePages / createHostPages / createReactHostPages, the `hostPages` named export, check-pages, and the boundary that business menus stay app-owned |
| [Sub app bridge](guide/app-bridge.md) | defineBridgeApp, createVueBridgeApp/createReactBridgeApp, the sessionKey lifecycle, the appProps snapshot, mount/unmount/nesting |
| [URL sync](guide/url-sync.md) | createVueBridgeNavigation/createReactBridgeNavigation (host), connectVueBridgeRouter/createReactBridgeRouter (child app), deep links/guard cancellation/query+hash/history and hash hosts |
| [Shared dependencies](guide/sharing.md) | initSharing, the shared config, singleton/requiredVersion/strictVersion/shareScope/eager, load order, sync vs async arbitration |
| [Deployment guide](guide/deployment.md) | base alignment, artifact endpoints, no-cache, SPA fallback, CORS, the doctor checkup |
| [Examples and templates](guide/examples.md) | Choosing, running, and ports for the five templates and feature demos |

### Reference (reference/)

| Document | Content |
|---|---|
| [Configuration reference](reference/configuration.md) | Every `federation(options)` field: type/default value/omitted-vs-explicit semantics/valid range; the four remotes forms, every SharedHint field, the `hostPages` named export |
| [API reference](reference/api.md) | Every public API of the four entries: purpose/import location/signature/default value/return value/lifecycle/error boundaries/full usage |
| [CLI reference](reference/cli.md) | create / init / explain / check-pages / doctor / port: syntax/flags/default values/side effects/exit codes/examples |
| [Error code table](reference/errors.md) | All 48 error codes, each with symptom/cause/fix |

### Troubleshooting (troubleshooting/)

| Document | Content |
|---|---|
| [Find problems by symptom](troubleshooting/README.md) | Remote loading failures/white screens/shared version conflicts/URL prefixes/cache/type fetching failures… |
| [Supported scope and real limitations](troubleshooting/compatibility.md) | Vite 5.1+/6/7/8, React 18/19, Vue 3.2+, router library versions, cross-framework boundaries |

### Migration

| Document | Content |
|---|---|
| [6.0.0 migration guide](migration.md) | Old entry → new entry mapping table + before/after code; every breaking change from 5.x to 6.0.0 |

### Maintainers (../maintainers/, Chinese)

| Document | Content |
|---|---|
| [Maintainer index](../maintainers/README.md) | Repository conventions and documentation entry points |
| [Architecture tour](../maintainers/architecture.md) | DESIGN.md summary and reading order |
| [Testing](../maintainers/testing.md) | Unit tests / e2e / fixtures / gates |
| [Releasing](../maintainers/releasing.md) | Release triggers publish.yml, npm verification, doc sync |
| [webpack MF comparison](../maintainers/webpack-mf-对照与缺口.md) | Capability comparison and boundaries versus webpack ModuleFederationPlugin |
| [Sandbox boundary audit](../maintainers/沙箱边界审计.md) | Same-realm conclusions for CSS / global variables / public dependencies |
| [Vite 7/8 compatibility matrix](../maintainers/P5-vite7-8兼容矩阵.md) | Full-version e2e fixture matrix |
