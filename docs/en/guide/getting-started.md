# Getting started: install, create a project, and integrate an existing project

> Application code imports only from four public entries: Vite config uses the package root `@fulgurjs/federation`; Vue apps use `@fulgurjs/federation/vue`; React apps use `@fulgurjs/federation/react`; framework-agnostic modules use `@fulgurjs/federation/runtime`.

## Installation

Install in every Vite project that participates in the federation (a dev dependency is enough — the build-time plugin and the runtime code both ship in the package):

```bash
pnpm add -D @fulgurjs/federation
# For npm-based projects: npm install -D @fulgurjs/federation
```

Environment requirements:

- Node.js: the plugin itself requires ≥ 18, but Vite 7/8 requires **20.19+** (or 22.12+). Pick Node according to the Vite version you use.
- Browser baseline: Chrome 108+ (ESM, dynamic import, and top-level await are required).
- Build target `es2022` or newer (lower targets fail with `BLD-002`).
- A plain Vue project only needs Vue; a plain React project only needs react + react-dom. Vue/React projects do **not** need to install the other framework or any router library; the exception is a **bridge host** (when embedding another framework's full sub app into your application, both frameworks must be installed — see [the dual-framework installation contract](app-bridge.md#dual-framework-installation-contract-required-for-bridge-hosts)). A router library is only referenced on demand by the side that actually uses URL sync (type-level imports; a missing runtime dependency only errors when a route-sync API is actually called).

Package manager notes (pnpm users):

- pnpm ≥ 11 enables `minimumReleaseAge: 1440` by default (a 24-hour supply-chain cooldown): a freshly published version is not resolvable within 24 hours, so `pnpm add` installs the newest version that satisfies the cooldown instead. If you need the newest version right after a release, add `minimumReleaseAgeExclude: ['@fulgurjs/federation@<version>']` to `pnpm-workspace.yaml` (this is what the five templates do), or temporarily run `pnpm config set minimum-release-age 0`.
- When pnpm 12 hits unapproved build scripts (esbuild and friends), it writes the `allowBuilds: { esbuild: set this to true or false }` placeholder prompt into `pnpm-workspace.yaml` and finishes the install with a non-zero exit code. Change the value to `true` and rerun the install.

## New project: `fulgurjs create`

Without an existing project, use the CLI to scaffold a runnable federation project from a full template:

```bash
# Interactive template selection (TTY)
npx @fulgurjs/federation create

# Non-interactive: template name + target directory (runs pnpm install --frozen-lockfile by default)
npx @fulgurjs/federation create vue-vue --dir my-federation

# Skip installation / reuse a non-empty directory
npx @fulgurjs/federation create react-react --dir my-react --no-install
npx @fulgurjs/federation create showcase --dir existing-dir --force
```

Five templates:

| Template | Combination | Demonstrates |
|---|---|---|
| `vue-vue` | Vue host × Vue remote | Remote components/TS modules, lazy route loading, error placeholders with retry, production deployment |
| `react-react` | React host × React remote | remoteComponent / useLoadRemote / ErrorBoundary |
| `vue-host-react-remote` | Vue host × React child app | Cross-framework full sub app bridge (mount/unmount/appProps snapshot) |
| `react-host-vue-remote` | React host × Vue child app | The bridge in the other direction |
| `showcase` | Vue/React dual hosts × dual remotes | Bidirectional bridge + URL sync (deep-link refresh / back-forward) |

Behavior notes:

- `create` copies a complete pnpm workspace (root package.json + pnpm-workspace.yaml + lockfile + a unified dev launcher). Template dependencies are pinned to official npm versions and installed from the registry; nothing depends on the plugin repository's source code.
- Before creation, Node is validated against the template's `engines.node` (≥ 20.19.0) and pnpm availability is pre-checked; unmet requirements fail **before any file is written**, with upgrade instructions.
- Non-empty target directories are refused by default; with `--force`, reusing a directory **only adds missing files** — name conflicts are listed item by item and your versions are kept; existing content is never rewritten or deleted.
- Failures (target path is a file / copy interrupted / install failed) all exit non-zero; the partially generated project is kept for inspection. With `--json`, stdout carries only the result JSON and progress goes to stderr.
- App names and ports are not rewritten. For the four-place checklist when changing ports, see [examples and templates](examples.md#the-fixed-checklist-for-changing-ports).

Start it:

```bash
cd my-federation
pnpm dev        # Unified launcher: starts the remote first and probes it, then starts the host; any failure exits the whole group
# Open the host address noted in the template README (for vue-vue: http://localhost:5214)
```

## Integrating an existing project

An existing project does not need to be rebuilt. Only three things to do: install the plugin → write `fulgurjs.config.ts` → register the plugin in `vite.config.ts`. You can generate a starter config with `fulgurjs init` (recommended) or write it by hand. The CLI is invoked uniformly as `npx @fulgurjs/federation <command>` (this also works before the project has installed its dependencies; once installed, `npx fulgurjs` works too).

### Starter config with `fulgurjs init`

Run in the **application root directory**:

```bash
# Detects the framework from package.json (when vue/react deps are unambiguous); generates a minimal dual-role config
npx @fulgurjs/federation init

# When detection is impossible (both frameworks present, or neither), specify explicitly
npx @fulgurjs/federation init --framework react --role consumer

# Roles: consumer (consume only) / provider (provide only) / dual (both, default)
npx @fulgurjs/federation init --framework vue --role provider

# Output elsewhere / overwrite an existing template
npx @fulgurjs/federation init --out config/fulgurjs.config.ts
npx @fulgurjs/federation init --force
```

- `init` generates only a **minimal valid** starter template: shared contains just the framework itself (pinia/vue-router/business pages are not forced in); the role decides whether `remotes`/`exposes` examples are included; pure consumers get a commented example of the `hostPages` named export (delete it if you don't use per-page pages).
- An existing file with the same name is refused (`--force` lifts this).
- After generation it prints four follow-up steps (edit the config → two lines in vite.config.ts → verify with `explain` → `doctor` after deployment).

Validate an existing config and print the integration snippet:

```bash
npx @fulgurjs/federation init --config ./fulgurjs.config.ts
```

### Manual integration (three files)

**① `fulgurjs.config.ts` (application root, one per project)** — the default export is directly `federation()` options:

```ts
// Remote app (provider) example; a consumer replaces exposes with remotes, dual roles write both
import type { FederationOptions } from '@fulgurjs/federation'

export default {
  name: 'remote-a',                                     // Federation container name, unique within the page
  exposes: { './shared/user-badge': './src/components/UserBadge.vue' },
  shared: { vue: { singleton: true } },
} satisfies FederationOptions
```

**② `vite.config.ts`** — only two federation lines:

```ts
import federation from '@fulgurjs/federation'
import fulgurjsConfig from './fulgurjs.config'

export default defineConfig({
  // ...existing config,
  plugins: [
    // ...existing plugins,
    federation(fulgurjsConfig),
  ],
})
```

**③ Application code** — pick the single entry for your framework:

```ts
// Vue apps
import { loadRemote, remoteComponent, provideAppContext, getAppContext } from '@fulgurjs/federation/vue'
// React apps
import { loadRemote, remoteComponent, useLoadRemote } from '@fulgurjs/federation/react'
// Framework-agnostic modules (pure TS utility libraries, no framework code)
import { loadRemote, loadShare } from '@fulgurjs/federation/runtime'
```

### Minimal configuration per role

| Role | Required | Notes |
|---|---|---|
| Provider | `name` + `exposes` | Loaded by others. Components with required props must give default values (otherwise `BLD-003`) |
| Consumer | `name` + `remotes` | Loads others. Two-slot dev/prod addresses or a single address string |
| Dual | `name` + `exposes` + `remotes` | Federation in both directions. `devSharedSelf` defaults to `true` (inferred from the role); no explicit configuration needed |

Providers whose remotes need startup-time initialization (global components/styles/locale/login-state sync) additionally set the `setup` field; see [API reference · setup/onSession](../reference/api.md#setup-on-session).

### Pure TS projects (no Vue/React)

Framework-agnostic modules import from `@fulgurjs/federation/runtime`. When `init --framework` cannot classify such a project it requires an explicit value (it decides which framework's commented example gets generated; the configuration itself is framework-agnostic):

```ts
// utils remote (provider)
export function formatMoney(cents: number): string { return (cents / 100).toFixed(2) }
// fulgurjs.config.ts: exposes: { './money': './src/money.ts' }, shared not needed

// Consumer (any framework or pure TS)
import { loadRemote } from '@fulgurjs/federation/runtime'
const { formatMoney } = await loadRemote<typeof import('remote-utils/money')>('remote-utils/money')
```

> `loadRemote` entry types come from the plugin-synced remote declarations (on by default): synced literals get real module types, misspelled entries error at the call site, and dynamic variables follow the `unknown` boundary; at runtime the module namespace is whatever the remote actually exports. See [loading components and modules · remote types](components-and-modules.md#remote-types-automatic-sync).

## Migrating from other micro-frontend frameworks (concept mapping)

API-level concept mapping when migrating from qiankun-style solutions (general technical conclusions):

| Legacy concept | @fulgurjs/federation counterpart |
|---|---|
| Main app `registerMicroApps` | host `federation({ remotes })` |
| Sub app entry (HTML) | remote entry (dev: the `@fulgurjs-entry.js` middleware / prod: `fulgurjs-remoteEntry.js`) |
| Sub app lifecycle mount/unmount | page-level exposes (the component is the entry, no lifecycle boilerplate); startup-time initialization = the remote's `federation({ setup })` (setup/onSession); embedding a whole app = the bridge contract's `mount`/`unmount` (`defineBridgeApp`, see [sub app bridge](app-bridge.md)) |
| window isolation/sandbox | no sandbox: same-realm direct rendering (conclusions and boundaries in the [sandbox boundary audit (Chinese)](../../maintainers/沙箱边界审计.md)) |
| props passing | component props (component level); `appProps` (bridge level, mount-snapshot semantics); AppContext (cross-app context) |
| Shared dependencies via externals | `shared` (singleton negotiation, "already-loaded wins") |
| qiankun runtime + single-spa | `@fulgurjs/federation/runtime` (a ~20KB runtime kernel, no single-spa) |

Unlike qiankun: there is **no** `unmount` mechanism that force-cleans window-level resources — global side effects of component-level unmounts must be cleaned up by yourself; the checklist lives in [remote page integration · page unmount cleanup checklist](remote-pages.md#page-unmount-cleanup-checklist).

## Verify and next steps

```bash
npx @fulgurjs/federation explain          # Pure local explanation: role/remotes/exposes/shared/load chain
npx @fulgurjs/federation doctor --base http://localhost:5174 --apps remote-a --dev   # Dev container checkup
```

- Loading ordinary components/modules does **not** need a page table, bridge configuration, or login initialization — read [loading components and modules](components-and-modules.md) when needed.
- Only when the host does "page route table → remote pages" (per-page pages) do you add the `hostPages` named export and run `fulgurjs check-pages`; see [remote page integration](remote-pages.md).
- Full sub app embedding: read [sub app bridge](app-bridge.md); business menus and the business Router stay app-owned — the bridge does not register the sub app's internal pages.
- Deployment and caching rules: [deployment guide](deployment.md).
