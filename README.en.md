# @fulgurjs/federation

[简体中文](./README.md) | English

> **fulgurjs** — Latin for "lightning · flash of light".
> A Vite plugin that makes Module Federation work out of the box: **one config shape, dev & prod engines, semantics aligned with webpack Module Federation**, with first-class browser support for both Vue 3 and React 18/19.

![tests](https://img.shields.io/badge/tests-436%20%2B%20e2e-green) ![runtime](https://img.shields.io/badge/runtime%20gzip-%3C%209KB-blue) ![vite](https://img.shields.io/badge/vite-5%20%7C%206%20%7C%207%20%7C%208-purple)

---

## Why

| | webpack MF | other vite MF solutions | **@fulgurjs/federation** |
|---|---|---|---|
| dev experience | separate builds | manual bootstrap usually required | ✅ dual dev-server direct wiring, zero manual async boundaries |
| prod artifacts | ✅ | often missing or degraded | ✅ build-time rewriting, stable remoteEntry filename + manifest |
| semantic parity | 100% | incomplete (version negotiation / singleton / fault tolerance often missing) | ✅ aligned clause-by-clause with webpack semantics, e2e-verified |
| **UMD / CJS-only deps** | DIY | **commonly unusable** | ✅ automatic (dep-optimizer externalization + build-time require shims) |
| remote load failures | raw errors | usually missing | ✅ retry / circuit breaker / timeout built in + explicit `fallbackModule` degradation |
| runtime size | ~40KB+ | varies | **gzip < 9KB** |
| misconfiguration | hard to debug | cryptic | three-part diagnostics: `got / expected / example` |

## Features

- **Full exposes / remotes / shared semantics** — `name@url` syntax, key renaming, promise-based remotes, full-semver `requiredVersion`, version negotiation (highest wins), singleton / strictVersion, loaded versions are never replaced, multi-version coexistence, `shareKey` redirection, multiple share scopes
- **UMD / CJS-only deps out of the box** — element-plus, avue and other UMD/CJS-only packages simply go into `optimizeDeps.include`; in dev the plugin automatically re-routes shared keys inside pre-bundled output to negotiation facades, in build CJS `require(<shared>)` is redirected to shims — dual-runtime immune
- **Automatic async boundaries** — top-level await injected automatically (es2022+), no webpack-style manual `import('./bootstrap')`
- **Stable artifacts** — remoteEntry keeps a fixed filename for stable referencing (its content changes every build, **it must be `no-cache`** — only content-hashed chunks may be long-cached); `fulgurjs-manifest.json` asset manifest; one chunk per expose
- **Fault tolerance (aligned with webpack MF 2.0 errorLoadRemote)** — load retry / circuit breaker / timeout built in; `loadRemote(spec, { retries, fallbackModule })` per-call overrides — on failure the fallback module is returned and the error event is still emitted explicitly (**never silent**; without `fallbackModule` the error is re-thrown)
- **Failure recovery really penetrates the browser ESM failure cache** — a failed `import()` of the same URL is cached as failed by the browser module map and would never hit the network again; the runtime varies the URL on retries after failure (`fulgurjs_retry=N`) for both remote entries and exposed chunks, so "service recovered → click retry" genuinely re-fetches
- **Enhancements** — dev type generation (dts), manifest-driven `preloadRemote()`, runtimePlugin hooks
- **Full HMR chain** — remote edits propagate to the host page: component hot swap, state retention, error overlay and recovery
- **Zero-silent-failure discipline** — config problems fail at startup with three-part diagnostics; federation failures throw explicitly (error code + actionable fix); **no silent fallback paths**
- **CLI (bin in the main package)** — `fulgurjs init` (single-project `fulgurjs.config.ts` starter, never rewrites project files), `fulgurjs explain` (interprets the effective federation shape and load chain), `fulgurjs check-pages` (page-table ↔ remote manifest contract check; `--manifest` / `--site` sources, `--require-verified` for CI), `fulgurjs doctor` (deployment health check: remoteEntry/manifest/HTML cache headers, CORS, chunk sampling, version-skew rehearsal)
- **Optional remote init lifecycle** — `federation({ setup })`: default-exported `setup(context)` runs once per app; optional named `onSession(context)` runs once per host `sessionKey` (login generation) — re-login re-runs, logout via `clearAppContext` invalidates session state; failures are explicit and retryable (`MFU-011~014`); `preloadRemote`/`getContainer` are side-effect free
- **Optional host page adapter** — one page table shared by routing and layout: URL resolution (incl. base stripping), longest-prefix remote attribution, `definePages` R1–R5 validation, async component cache (rebuilt on login-generation change), skeleton/error placeholders, keep-alive names (Vue)
- **Cross-app values & function references** — `provideAppContext` / `getAppContext` / `requireAppContext` / `clearAppContext` on the runtime entry; page-level singleton snapshot + function references (not reactive — "live" data via function references / host pinia sharing; same-page account switching is handled by `onSession`, no page reload)
- **Vue direct rendering** — `remoteComponent('remote/X')` on `@fulgurjs/federation/runtime`: `defineAsyncComponent + loadRemote` standard wrapper with explicit error placeholder (code + cause + fix); runtime.js has zero framework dependencies
- **Full React support (browser)** — dedicated `@fulgurjs/federation/react` entry: `remoteComponent` (Suspense/error placeholders + retry, avoiding the `React.lazy` failed-promise-cache trap), `useLoadRemote` (generation-guarded module hook), `RemoteErrorBoundary`, `createReactHostPages` (same page-table source and R1–R5 validation as Vue); shared `react` / `react-dom` singleton negotiation with Hooks / StrictMode / Context verified single-instance across host and remote (dev pre-bundle externalization + prod CJS shims automatically handle `react/jsx-runtime` and `react-dom/client` subpaths); pure-React projects need zero Vue, pure-Vue projects need zero React
- **CSP friendly** — native ESM loading with no `eval` / `new Function` anywhere; runs under strict CSP (no `unsafe-eval`)
- **End-to-end error-code system (41 codes)** — CFG/DEV/BLD/MFU/CC segments + drift-checked code table (§6)

## Installation

```bash
pnpm add -D @fulgurjs/federation
```

Requirements: Vite ≥ 5.1 (tested through 8.x), Node ≥ 18, Vue 3 and/or React 18–19 (both optional peers — install per the framework you use), Chrome 108+ (native TLA).

The browser runtime entries are ESM-only: `@fulgurjs/federation/runtime` (Vue apps) and `@fulgurjs/federation/react` (React apps). They do not support `require()`; the build-time main entry works in both ESM and CJS.

## Quick start (React)

Host and remote use the same "two files per app" config shape; the only difference for React is the browser import point: `@fulgurjs/federation/react`.

Remote (`fulgurjs.config.ts` — the default export is the federation options object itself):

```ts
import type { FederationOptions } from '@fulgurjs/federation'

export default {
  name: 'remote-react',
  exposes: {
    './Button': './src/Button.tsx',
    './utils': './src/utils.ts',
    './pages/home': './src/pages/Home.tsx',
  },
  shared: {
    react: { singleton: true },
    'react-dom': { singleton: true },
  },
} satisfies FederationOptions
```

```ts
// vite.config.ts — the React plugin stays first; federation is one line
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import federation from '@fulgurjs/federation'
import fulgurjsConfig from './fulgurjs.config'

export default defineConfig({ plugins: [react(), federation(fulgurjsConfig)] })
```

Host consumption:

```tsx
import { remoteComponent, useLoadRemote, createReactHostPages, remoteSchema } from '@fulgurjs/federation/react'
import { pages, remotePrefixes } from './src/federation/pages.data' // pure data module (CLI + browser)

// ① Component: create the factory at module top level (never inside render); loads on first render
const RemoteButton = remoteComponent<{ label: string; onClick?: () => void }>('remote-react/Button', {
  fallback: <p>Loading remote button…</p>,
})

// ② Plain module: useLoadRemote (data/error/loading/reload)
type Utils = { formatMoney(v: number, currency?: string): string }

// ③ Page table: same verb as Vue — component(spec); render from your router
const hp = createReactHostPages({ pages, remotePrefixes, schema: remoteSchema })
const RemoteHome = hp.component('remote-react/pages/home')
```

Full runnable projects: [`examples/react-host`](./examples/react-host) and [`examples/react-remote`](./examples/react-remote). Exact semantics (timeout / retry / StrictMode / Context / error recovery) in [§8.1 React adapter API](#81-react-adapter-api--fulgurjsfederationreact).

## Quick start (Vue): three integration paths

### Path ①: expose and load plain modules (no setup, no bridge, no page table)

```ts
// remote-a/vite.config.ts —— 最小远程：只要 name + exposes
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { federation } from '@fulgurjs/federation'

export default defineConfig({
  plugins: [
    vue(),
    federation({
      name: 'remote-a',
      exposes: {
        './utils': './src/utils.ts',       // 普通模块
        './Button': './src/Button.vue',    // 组件
      },
    }),
  ],
})
```

```ts
// host/src/main.ts —— 宿主按需加载（spec = '<remote>/<expose 键去 ./ >'）
import { loadRemote } from '@fulgurjs/federation/runtime'

const utils = await loadRemote<{ formatMoney(v: number): string }>('remote-a/utils')
```

### Path ②: host multi-page integration (`createHostPages`)

```ts
import { createHostPages, remoteSchema } from '@fulgurjs/federation/runtime'
import { pages, remotePrefixes } from './federation/pages.data' // 宿主路由与布局共用的唯一数据源

export const hostPages = createHostPages({
  pages,               // [{ route: '/remote-a/home', name: 'Home' }, ...]
  remotePrefixes,      // { '/remote-a': 'remote-a' }
  schema: remoteSchema, // dev 期自动校验 spec 存在性（R3）
})
// hostPages.component('remote-a/home') → 异步组件（缓存/占位/错误处理内置）
// hostPages.keepAliveNames → KeepAlive include 白名单
```

### Path ③: remote pages need host environment (`setup` + `AppContext` + session switching)

```ts
// remote: federation({ setup: './src/fulgurjs/setup.ts' })
export default async function setup(ctx: { appContext: Record<string, any>; signal: AbortSignal }) {
  // 应用级执行一次：初始化远程自身的 store/实例，消费宿主 context
}
export async function onSession(ctx: { appContext: any; sessionKey: string; signal: AbortSignal }) {
  // 会话级：按宿主 sessionKey 去重——换账号/重登自动重跑
}
```

```ts
// host bridge: 登录成功后 provide；登出时 clearAppContext()
import { provideAppContext, clearAppContext } from '@fulgurjs/federation/runtime'
provideAppContext({ user, getToken, store, hostApp, locale, sessionKey, events: { main: mainEvents } })
```

### Common boundaries (all three paths)

- `spec` = `<remote-name>/<expose-key without './'>`; remote names come from `remotes` keys (or `name@url` self-reported names)
- shared deps must be declared on **both** sides for negotiation; UMD/CJS-only deps go into `optimizeDeps.include`
- build target must be es2022+ (TLA)

## CLI

`fulgurjs init` / `fulgurjs explain` / `fulgurjs check-pages` / `fulgurjs doctor` — see [§5 CLI command reference](#5-cli-command-reference). The config file `fulgurjs.config.ts` is one per app root; `vite.config.ts` calls `federation(fulgurjsConfig)` once. The page-data module must stay pure data (no React/Vue/router/browser imports) so the CLI can evaluate it standalone.

## API reference

### 1. `federation(options)` — the Vite plugin (host & remote, same API)

```ts
import federation from '@fulgurjs/federation'

federation({
  name: 'my-app',                       // required, unique per page
  exposes: { './Button': './src/Button.vue' },
  remotes: {
    'remote-a': { dev: 'http://localhost:5101', prod: '/remote-a' },
    shop: 'remote-a@http://localhost:5101',      // webpack syntax + rename
    'promise-remote': () => Promise.resolve(container),
  },
  shared: {
    vue: { singleton: true, requiredVersion: '^3.4.0' },
    pinia: { singleton: true, eager: true },
    'lodash-es': { shareKey: 'lodash' },
  },
  setup: './src/fulgurjs/setup.ts',     // optional lifecycle entry
  shareScope: 'default',
  filename: 'fulgurjs-remoteEntry.js',
  manifest: true,
  dts: true,                            // or { dir, mode: 'source' | 'shim' } or false
  devSharedSelf: undefined,             // default inferred by role (see below)
  devCorsOrigins: '*',                  // or ['http://localhost:5100', ...]
  devFsRoot: true,                      // false → host dts degrades to any stubs
  runtimePlugins: [],
})
```

Key semantics (full tables in the Chinese README §1, same source of truth):

- `remotes`: `dev` / `prod` split, `external`, `timeout` (default 15s — ends the caller's wait, never cancels the issued import), `retries` (0–10, default 2), `fallback` entry list, `breaker: { threshold, resetMs }`, promise-based remotes
- `shared`: full `SharedHint` (`import: false` pure consumer, `shareKey`, `shareScope`, `strictVersion` default follows webpack, `eager`, `version`); version read from the installed package; negotiation = highest version satisfying `requiredVersion`; loaded versions never replaced; singleton warnings (`MFU-010`) fire only when the reused instance does not satisfy the consumer's requirement, once per combination
- `devSharedSelf`: whether the app's own dev source participates in shared rewriting — default `remotes.length === 0 || exposes.length > 0` (pure remotes and dual-role apps participate, pure hosts don't)
- removed-in-5.0.0 options (`remoteType`, `library`, `automaticAsyncBoundary`, `dataPrefetch`, `usedExports`, `ignoreUnusedSharedExports`) fail with `CFG-011` and migration hints; the old aggregate config chain (`root` + `apps[]`, `/config` entry, `--app`) is gone

### 2. Runtime API — `@fulgurjs/federation/runtime` (Vue apps)

Framework-neutral core re-exported through a Vue-shaped entry:

| Export | Semantics |
|---|---|
| `loadRemote<T>(spec, opts?)` | load a remote module; `opts: { shareScope, retries, fallbackModule }`; goes through container negotiation and the optional setup/onSession lifecycle; module results are cached per `remote@scope#module`, failures are uncached and retryable |
| `loadShare(name, opts?)` | shared-dependency negotiation: `requiredVersion` / `singleton` / `strictVersion` / `shareKey` / `shareScope` / `fallback` |
| `registerRemotes([...])` / `registerRemote(r)` | runtime registration (`name`, `entry`, `timeout`, `retries`, `fallback`, `breaker`, promise-based) |
| `preloadRemote(spec, { mode })` | manifest-driven preload of entry + expose chunks + CSS; `mode: 'preload' | 'prefetch'`; no lifecycle side effects |
| `getContainer(name)` | acquire the initialized container |
| `getRuntime()` / `shareScopeMap` / `parseSpec` / `unwrapDefault` / `version` | runtime singleton, live scope map, spec parsing, default-interop helper |
| `provideAppContext` / `getAppContext` / `requireAppContext` / `clearAppContext` | cross-app context (see §9) |
| `definePages` / `validatePages` | page-table validation R1–R5 (see §3) |
| `remoteComponent` / `createHostPages` | Vue adapters (see §8 / §10) |
| `remoteSchema` | dev-only expose inventory (empty object at build/Node time) |

### 8.1 React adapter API — `@fulgurjs/federation/react`

The single import point for React browser apps: re-exports the common runtime API (`loadRemote`, `preloadRemote`, `provideAppContext`, `definePages`, `remoteSchema`, …) plus the React adapters below. It does **not** include Vue's `createHostPages`, Vue `RemoteComponentOptions` or `keepAliveNames`.

#### `remoteComponent<Props>(spec, options?)`

Returns a renderable React component type (`Props` constrains JSX usage — a compile-time contract, not runtime validation). Factory and page-table creation have **zero load side effects**; loading starts on first render via `loadRemote` (through container negotiation and the optional setup/onSession). Pending placeholder, error placeholder and an error boundary are built in — no hand-written Suspense / `React.lazy` needed. **It deliberately avoids `React.lazy`**: a lazy instance caches its failed promise, and resetting an error boundary alone cannot recover; this implementation's retry rebuilds the load attempt (already-succeeded modules are not re-downloaded through the runtime cache).

| Option | Type & default | Semantics |
|---|---|---|
| `fallback` | `ReactNode`, default `null` | placeholder while this load is pending (distinct from the failure placeholder) |
| `error` | `ReactNode` or `(error, retry) => ReactNode`, default built-in Chinese placeholder | shown on load failure **or** subtree render error; the function receives the real error and a working retry |
| `retries` | `number`, follows the `loadRemote` default (2) | passthrough retry count (integer 0–10; invalid values throw at factory call) |
| `timeout` | `number` (ms), default none | wait cap for this component load; ending the wait does **not** cancel the issued shared request; late results never overwrite the settled state and never produce unhandled rejections |

- Component-export validation: the default export (or the module itself) must be a function component / class / `memo` / `forwardRef`; strings, numbers and empty namespaces fail explicitly (never a blank success page)
- `ref` passthrough works for `forwardRef` exports (verified on React 18/19); refs to plain function components follow standard React behavior
- Render-time exceptions are caught by the built-in boundary and reported **separately** from network/export errors ("加载失败" vs "渲染出错"); the boundary does not catch event-handler or arbitrary async-callback errors — those follow React's own semantics
- The built-in error placeholder contains: the error code (`code` from FgError; `UNKNOWN` for render errors without one), the real cause message, an actionable fix and a retry button
- Failure recovery genuinely penetrates the browser ESM failure cache (see Features)

#### `useLoadRemote<Module>(spec, options?)`

```ts
const { data, error, loading, reload } = useLoadRemote<Utils>('remote-react/utils')
```

- Returns `{ data: Module | undefined, error: unknown, loading: boolean, reload: () => Promise<void> }`; `error` is always `undefined` when there is no error
- `options`: `shareScope` / `retries` / `fallbackModule` (passthrough to `loadRemote`; configuring `fallbackModule` is explicit behavior — failures return the fallback value instead of writing `error`)
- Dependency comparison is per-field (callers creating a fresh options object per render do not trigger reload loops); spec/option changes clear stale data and start a new request
- Each effect run and each `reload` carries its own generation: fast A→B switching, late slow responses, consecutive reloads, returns after unmount and StrictMode double effects can only ever write from the latest valid request; duplicate effects do happen (StrictMode) — the runtime cache dedupes network and lifecycle work
- `reload` re-runs the lifecycle and failure retry but never re-downloads an already-cached successful module; it resolves normally as `Promise<void>` (button `onClick` calls produce no unhandled rejections)
- `AppContext` is not a React subscription: when the host reads a new non-empty `sessionKey`, the **host's own state/routing** must trigger the re-render (`createReactHostPages` rebuilds its component cache on new login generations, which triggers the new `onSession`)

#### `RemoteErrorBoundary`

A standalone page-level boundary. Props: `children`, `fallback` (node or `({ error, reset }) => ReactNode`), `onError(error, info)`, `resetKeys` (boundary resets when any entry changes; the usual controlled form is `resetKeys={[retryEpoch]}`). `reset` only resets boundary state; if the subtree holds a failed cache (e.g. an external `React.lazy`) the caller must also rebuild the load attempt — the built-in `remoteComponent` retry already does both. The boundary built into `remoteComponent` consumes its own errors, so an outer `RemoteErrorBoundary` never sees them; to customize one remote component's placeholder use that component's `error` option.

#### `createReactHostPages(options)`

Shares the same page-table data and `definePages` R1–R5 validation with Vue (the pure parsing core is shared since 5.1.0); returns `{ pages, resolve(path), component(spec) }` — `component(spec)` returns a React component type; render it from your router (JSX / `createElement`; no `.element()` synonym).

- Data options: `pages / remotePrefixes / deriveSpec / schema / strict / base` (identical semantics to Vue); display options: `fallback / error / retries / timeout` (same semantics as `remoteComponent`) plus `beforeLoad` (runs before every actual load attempt, including retries, for the host to refresh context; never runs at table creation)
- `resolve` keeps base stripping, longest-prefix attribution, param decoding (a bad `%` sequence only fails that match), query/hash handling, `null` on no match
- The component cache is keyed by spec + login generation; **only a new non-empty `sessionKey` rebuilds** (logout → `undefined` does not — same semantics as Vue); after account switching the rebuilt loads trigger the new-generation `onSession`
- No `keepAliveNames` on the React side (component keep-alive is not promised; the `keepAlive` page field is a plain extension slot); routing is not a runtime dependency — the examples use React Router 7 (`path` declared in the route table, `element` renders `component(spec)`; params reach remote pages as props via `useParams` / `useSearchParams`)
- Cross-framework Context sharing: host and remote consumers get the **same Context object** through the **same expose instance** (e.g. the remote exposes `./theme-context` exporting a `createContext` instance; the host obtains it via `useLoadRemote` and renders the Provider; the remote component's `useContext` reads the host value). The plugin does not auto-bridge arbitrary React Contexts — the object must be explicitly shared

#### React dev types

`.tsx`/`.ts` exposes share the same dev type generation as Vue (directories, `dts:false`, `dts.dir`, setup filtering, `devFsRoot:false` degradation), with a **dual-track** addition: zero-config generates resolvable loose declarations (exports typed `any`); after adding `"paths": { "<remote>/*": ["<typesDir>/<remote>.d/*"] }` to any host `tsconfig*.json`, the same imports resolve through forwarder modules to **source-level types** (precise props/signatures; wrong props/arguments fail compilation) — remotes covered by a paths mapping automatically skip their loose declaration to avoid shadowing; see the `_paths.d.ts` note inside the generated directory.

### 3. `definePages` — host page-table validation

`validatePages(pages, options)` returns violations; `definePages` aggregates and throws on ERROR level (or `console.error` with `strict: false`):

- **R1 [ERROR]** a param route's derived spec (prefix + `:param` segments stripped) collides with another entry's effective spec — would silently load the wrong component
- **R2 [WARN]** duplicate effective specs (deliberate menu aliases allowed, flagged for awareness)
- **R3 [ERROR]** spec not in the remote's expose inventory (dev, when schema is available; unreachable remotes are honestly skipped)
- **R4 [ERROR]** static route shadowed by an earlier param route (first-match-wins dead routes) and exact duplicates
- **R5 [WARN]** duplicate `name` fields (named-navigation ambiguity)

### 4. `fulgurjs.config.ts` — one federation config per project

Default-export the `FederationOptions` object directly; optionally also export `hostPages = { pages, remotePrefixes }` (CLI-only named export; the same pure-data module feeds the browser adapter). `vite.config.ts` calls `federation(fulgurjsConfig)` once. The removed aggregate chain (`root` + `apps[]`, `loadRepoConfig`, `federationOptionsForApp`, CLI `--app`) fails with migration hints.

### 5. CLI command reference

```bash
npx fulgurjs init              # scaffold fulgurjs.config.ts (never rewrites other files)
npx fulgurjs explain           # interpret effective federation shape + load chain
npx fulgurjs check-pages \
  --manifest remote-a=https://cdn.example.com/remote-a/fulgurjs-manifest.json \
  --require-verified           # page-table ↔ manifest contract check; strict CI gate
npx fulgurjs doctor --site https://example.com   # deployment health check
```

`check-pages` distinguishes "confirmed missing" (errors, non-zero) from "unverifiable" (source unreachable — honestly reported; non-zero with `--require-verified`); it never falls back to stale local dist output.

### 6. Error-code table (41 codes)

| Segment | Code | Meaning |
|---|---|---|
| CFG (config) | `CFG-001` | name missing or invalid |
| | `CFG-002` | exposes shape invalid |
| | `CFG-003` | remotes shape invalid / illegal key characters |
| | `CFG-004` | shared shape invalid |
| | `CFG-005` | remotes key collides with a shared key |
| | `CFG-006` | island config (neither provides nor consumes) |
| | `CFG-007` | `name@` prefix misuse in object-form remotes |
| | `CFG-008` | shared illegal combo (eager+import:false / duplicate shareKey declaration) |
| | `CFG-009` | remote runtime params invalid (timeout/retries/breaker) |
| | `CFG-010` | devCorsOrigins invalid (must be "*" or an array of http(s) origins) |
| | `CFG-011` | removed webpack-compat/no-op options (any value errors with migration hints) |
| | `CFG-012` | setup config invalid (empty/non-string path, or exposes squatting the reserved `./__fulgurjs_setup__` key) |
| DEV (development) | `DEV-001` | remote dev server unreachable (manifest fetch failed) |
| | `DEV-002` | remote dev manifest empty or unrecognized |
| | `DEV-004` | known UMD-only dep missing from optimizeDeps.include |
| | `DEV-005` | remotes dev URL port not listening |
| | `DEV-006` | host/remote plugin version mismatch |
| | `DEV-009` | facade/virtual module 404 (.vite cache drift — clear cache and restart) |
| | `DEV-010` | dev cold-start pre-bundle window notice (first 30–60s transient) |
| | `DEV-011` | non-loopback host + wildcard dev CORS (exposure reminder) |
| | `DEV-012` | non-loopback host + fsRoot in dev manifest (local path disclosure reminder) |
| BLD (build) | `BLD-001` | expose source resolution failed |
| | `BLD-002` | build target below es2022 (TLA required) |
| | `BLD-003` | expose target declares required props (documented checklist item) |
| | `BLD-006` | array-form output prevents automatic facade chunk isolation (manual branch needed) |
| MFU (runtime) | `MFU-001` | remote container/module load failure (network / timeout / retries exhausted / breaker open) |
| | `MFU-002` | remoteEntry self-reported name mismatch |
| | `MFU-003` | strictVersion requirement not satisfied |
| | `MFU-004` | shared module missing with no local fallback |
| | `MFU-005` | same container re-initialized with a different share scope |
| | `MFU-006` | requested module not exposed by the remote |
| | `MFU-007` | preload failed (non-blocking) |
| | `MFU-008` | unknown remote |
| | `MFU-009` | loaded module has no exports at all |
| | `MFU-010` | chosen singleton version does not satisfy the consumer's requirement (warn-once per combination, with versions, provider, impact and fix) |
| | `MFU-011` | setup entry export shape invalid (default/onSession not a function) |
| | `MFU-012` | setup/onSession threw (this loadRemote rejects; only the failed stage's cache is cleared — directly retryable) |
| | `MFU-013` | remote declares onSession but host AppContext lacks sessionKey (never use a token as sessionKey) |
| | `MFU-014` | setup/onSession synchronously re-loading the same remote (self-deadlock guard) |
| CC (context) | `CC-001` | AppContext required key missing (three-part: got/expected/example) |
| | `CC-002` | runtime singleton unavailable (remote page opened standalone; load through the host federation instead) |

Runtime diagnostics remain in Chinese by design (language policy unchanged in this release).

### 7. Artifacts & endpoints

| Artifact | Cache policy |
|---|---|
| `fulgurjs-remoteEntry.js` (fixed filename, content changes every build) | **must be `no-cache`** |
| content-hashed chunks / CSS | long-cache immutable |
| `fulgurjs-manifest.json` | no-cache (consumed by `preloadRemote` / `check-pages` / `doctor`) |
| dev endpoints `/@fulgurjs-entry.js` / `/@fulgurjs-manifest.json` | no-cache, CORS per `devCorsOrigins` |
| `fulgurjs.config.ts` / page-data modules | config files; never hashed |

Lazy-loading layers (distinguish them when measuring): ① nothing loaded until first render of a remote component/page; ② container entry + shared metadata on first load; ③ the expose chunk itself; ④ shared-dependency body (negotiated singleton, possibly already loaded by the host). `preloadRemote(spec)` fetches ②③④ without executing the lifecycle.

### 8. `remoteComponent` — Vue direct rendering (`@fulgurjs/federation/runtime`)

`defineAsyncComponent + loadRemote` standard wrapper; `loadingComponent` / `errorComponent` / `delay` / `retries` options; the built-in error placeholder shows code + cause + fix; runtime.js stays framework-free.

### 9. `AppContext` — cross-app values & references

`provideAppContext(partial)` merges into a page-level singleton mirror (idempotent; later writes win). Standard fields: `user`, `getToken()` (pull-style to avoid stale snapshots), `store` (host pinia), `hostApp` (host Vue app), `locale`, `events`, plus the non-sensitive `sessionKey` (login generation; required by `onSession`, never a token). `requireAppContext(...keys)` validates explicitly (`CC-001`); `clearAppContext()` deletes the context and invalidates session signals/dedup state (module/share caches and successful app-level setup are preserved). The data model is a transport snapshot + function references — not reactive; same-page account switching is carried by `onSession`, never by page reloads.

### 10. `createHostPages` and `setup`/`onSession`

`createHostPages(options)` — page table, URL resolution, component cache (rebuilt on new non-empty sessionKey; logout does not rebuild — KeepAlive deactivation-race proven), skeleton/error placeholders, `keepAliveNames`. `setup`/`onSession` — app-level once / session-level per login generation; failures reject that loadRemote with `MFU-012` and stay retryable; `preloadRemote` and `getContainer` never trigger them.

## Gotchas (from real migrations)

1. **Plugin upgraded → restart the dev server** — the plugin self-clears `.vite` caches on version change (DEV-009)
2. **pnpm + tarball** — verify the link resolves after installing from a tarball
3. **UMD/CJS-only deps** go into `optimizeDeps.include`, never exclude them
4. **dev cold start** — warm up once (wait for network idle) before asserting; the first 30–60s pre-bundle window is a transient (DEV-010)
5. **never alias/rewrite shared imports by hand** — the negotiation facades own them
6. **build target es2022+**
7. **`loadRemote` explicit degradation** — `fallbackModule` returns your fallback and still emits the error event
8. **missing backend endpoints** stay real errors — no fake 200s
9. **multi-version component CSS** coexists via per-expose CSS chunks
10. **env-sync scripts** may rewrite env files between dev/prod — pin them
11. **React dev types precision** — add the `paths` mapping (see §8.1) to get source-level types; zero-config gives resolvable `any`

Debug surfaces: `window.__FULGURJS_SCOPE__` (live share negotiation), `window.__FULGURJS_INFO__` (remote status/latency/errors), `DEBUG=fulgurjs:*` for controlled diagnostics.

## Boundaries (explicitly not supported)

- Support covers **browser-client** federation for Vue 3 and React 18–19. Not supported: SSR / React Server Components / Next.js full-stack / React Native / loading remotes from Node servers / directly mixed Vue+React component rendering in one tree. Pure projects of either framework never pull in the other; cross-framework consumption of **plain TS modules** (e.g. a Vue host loading a React remote's utils) works
- React side does not promise component keep-alive: `createReactHostPages` has no `keepAliveNames` (Vue KeepAlive is Vue-specific); module reuse for re-opened pages still applies
- Cross-origin Fast Refresh: remote React components update through the remote dev server's `@vite/client` push (after a cold start the first round often needs a host page refresh — state retention across the federation boundary is not promised)
- Not compatible with originjs's `virtual:__federation__` legacy imports
- No SSR (warns and disables hooks on detection)
- No browser DevTools extension (the `window.__FULGURJS_SCOPE__ / __FULGURJS_INFO__` surfaces serve debugging)
- No JS sandbox / CSS isolation — same-realm coexistence, dual runtimes prevented by shared singleton negotiation (see the sandbox audit doc)

## Documentation

- [Migration guide (Chinese)](https://github.com/chenmingye/fulgurjs-federation/blob/master/docs/迁移指南.md) — a real qiankun → federation migration case (seven steps + acceptance checklist)
- [webpack MF comparison & gaps (Chinese)](https://github.com/chenmingye/fulgurjs-federation/blob/master/docs/webpack-mf-对照与缺口.md)
- [Sandbox boundary audit (Chinese)](https://github.com/chenmingye/fulgurjs-federation/blob/master/docs/沙箱边界审计.md)
- [Vite 7/8 compatibility matrix (Chinese)](https://github.com/chenmingye/fulgurjs-federation/blob/master/docs/P5-vite7-8兼容矩阵.md)
- [`DESIGN.md`](https://github.com/chenmingye/fulgurjs-federation/blob/master/DESIGN.md) — architecture, alignment tables, test & acceptance approach
- Runnable examples: [`examples/react-host`](./examples/react-host) + [`examples/react-remote`](./examples/react-remote) (React, install from the npm registry and run); [`examples/host`](./examples/host) + [`examples/remote-a`](./examples/remote-a) (Vue config samples); in-repo e2e fixtures live under `fixtures/`

## Development & testing

```bash
pnpm --dir packages/plugin install && pnpm --dir packages/plugin build
for app in fixtures/host-vue fixtures/remote-a fixtures/remote-b fixtures/remote-react fixtures/host-react e2e; do pnpm --dir "$app" install; done

pnpm test:unit   # full unit suite (count per actual output)
pnpm test:dev    # dev e2e
pnpm test:prod   # prod e2e (needs NGINX, see e2e/scripts/prod-setup.sh)
node e2e/scripts/react-types-check.mjs        # R15: React dev-type dual-track compile checks
node e2e/scripts/react-negative-check.mjs     # N08/N10/N11 negative checks
```

CI (GitHub Actions, every push/PR): `test` (unit + dual typecheck + build gates: runtime gzip ≤ 9216B, error-code three-way consistency), `e2e` (Vue + React dev/fault suites across Vite 6.4.3 / 7.3.6 / 8.3.0), `vite5` (scheduled 5.1 floor), `prod-e2e` (NGINX), `tarball` (consumer smoke incl. the React entry).

## License

[MIT](./LICENSE) © chenmingye (Jason)
