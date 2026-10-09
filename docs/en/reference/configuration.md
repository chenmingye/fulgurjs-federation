# Configuration reference: `federation(options)`

> The complete field set of `FederationOptions`. Each field gives: type, default value, the semantic difference between **omitted vs explicit**, and the valid range. The baseline is the source `packages/plugin/src/options.ts` and the [API reference](api.md). The config lives in one `fulgurjs.config.ts` per project (the default export can be passed straight to `federation()`); see [getting started](../guide/getting-started.md#manual-integration-three-files).

## Field table

| Option | Type | Default (when omitted) | Notes |
|---|---|---|---|
| `name` | `string` **required** | None — omitting errors with CFG-001 | Container name. Must be unique among host/remotes on the same page; must match `/^[a-zA-Z][\w.-]*$/` (starts with a letter, no spaces/slashes) |
| `filename` | `string` | `'fulgurjs-remoteEntry.js'` | Prod container entry filename (a fixed name makes referencing and deployment rules easy; entry content changes every build, **must be no-cache** — long caching is only for content-hashed chunks). If you change filename, the deployment layer and doctor `--entry` must follow |
| `exposes` | `Record<string, string \| { import: string; name?: string }>` | Exposes no modules | Exposed modules: key `'./X'` (omitting `./` is normalized with a reminder), value a source file path; the object form's `name` is a stable chunk filename. Keys must not occupy the reserved internal key `./__fulgurjs_setup__` (CFG-012) |
| `setup` | `string` | **No initialization behavior** (ordinary exposes semantics fully unchanged) | Optional remote initialization entry: a TS/JS module path relative to the app root. The default export `setup(context)` runs once per app; an optional named export `onSession(context)` runs deduplicated per host `sessionKey`. Other exports are not lifecycle entries. An empty/non-string path reports CFG-012. Details: [API reference · setup/onSession](api.md#setup-on-session) |
| `remotes` | `Record<string, string \| RemoteEntryConfig \| (() => Promise<any>)>` | Consumes no remotes | Consumed remotes; the four forms are in the next section. Keys are import prefixes and must not contain `@`, `/`, or whitespace (CFG-003) |
| `shared` | `string[] \| Record<string, string \| SharedHint>` | Shares no dependencies | Shared dependencies. The string shorthand = `requiredVersion`; an array = each item inferred from package.json. Full field set: [shared dependencies guide](../guide/sharing.md#all-sharedhint-fields) |
| `shareScope` | `string` | `'default'` | Default shared scope name; each item can override via `shared[*].shareScope` |
| `manifest` | `boolean \| Record<string, unknown>` | `true` | `false` disables; any other value enables (the object form provides no extra field configuration). A prod build generates `fulgurjs-manifest.json` — `preloadRemote` and `check-pages`/`doctor` depend on it; disabling makes those two capabilities unavailable |
| `runtimePlugins` | `string[]` | `[]` | Runtime plugin module paths (relative paths resolve against the app root). Hook error contract: observational hooks only warn on throw; `resolveShare` (a decision hook) propagates explicit throws to the caller. See [API reference · runtime plugins](api.md#runtime-plugins) |
| `dts` | `boolean \| { dir?: string }` | `true` | Remote type generation and sync. Provider: background generation in dev and a **distributable declaration resource** shipped with the prod build (declaration closure + type manifest — never depends on the remote's local source). Host: automatic dev sync into `src/fulgurjs/types/` (`.fulgurjs/types` without a src layout) producing ambient declarations plus a type registry — plain imports, dynamic imports and the string APIs (`loadRemote`/`remoteComponent`/bridge factories) share one set of types. `{ dir }` overrides the directory; `false` disables. Providers with `.vue` exposes need `vue-tsc` (templates include it). See [CLI · types](cli.md#types) |
| `devSharedSelf` | `boolean` | Inferred from role: apps providing `exposes`/`setup` are `true`; pure hosts `false`; **explicit configuration always wins** | Whether, in dev, the app's own source (including dependencies) participates in the shared negotiation rewrite. Bidirectional federation defaults to `true` with no explicit config needed. In build, the negotiation facade is isolated into plugin-owned chunks automatically; business manualChunks can stay |
| `devCorsOrigins` | `string[] \| '*'` | `'*'` (omitted and explicit `'*'` behave identically; the only difference is whether DEV-011 reminds you) | Dev cross-origin access policy: the plugin endpoints (`/@fulgurjs-entry.js`, `/@fulgurjs-manifest.json`) share the same origin source as `server.cors`. An array reflects the Origin against an allowlist (header omitted on miss). **Dev only**; a user-configured `server.cors` always wins. An illegal form reports CFG-010 |

Omitted-semantics summary: `manifest`/`dts` omitted = enabled/default; `setup` omitted = no initialization behavior; `shared`/`exposes`/`remotes` omitted = the corresponding capability is off (none configured = an isolated-island config, producing a CFG-006-style reminder: neither provides nor consumes).

## The four forms of `remotes`

```ts
remotes: {
  // ① Single-address string: dev appends /@fulgurjs-entry.js automatically, prod appends the filename
  'remote-a': 'http://localhost:5101',

  // ② 'selfName@url': rename semantics (string form only; writing name@ in an object's dev/prod slots is CFG-007)
  'checkout': 'shop@http://localhost:5102',

  // ③ Object: explicit dev/prod split + resilience parameters (everything except dev/prod is optional)
  'remote-b': {
    dev: 'http://localhost:5103/remote-b',   // falls back to external when omitted
    prod: '/remote-b',                       // falls back to external when omitted
    shareScope: 'default',                   // this remote's shared scope
    timeout: 15000,            // load timeout ms (finite positive, validated at config time CFG-009; default 15s when omitted)
    retries: 2,                // retry count on failure (integer 0–10; default 2 when omitted)
    fallback: ['http://backup/remote-b'],  // backup remoteEntry URLs, tried in order
    breaker: { threshold: 5, resetMs: 30000 }, // circuit breaker on consecutive failures (both values must be finite positives)
  },

  // ④ Function: promise-based remote (address unknown at build time; equivalent to webpack "promise new Promise",
  //    needs registerRemote at runtime; the config key is still used to rewrite import syntax, with a concurrency warning)
  'remote-c': () => fetch('/api/remote-url').then(r => r.text()),
}
```

`timeout` semantics: a timeout only means "the caller stops waiting" — the browser does not cancel an already-issued dynamic import; later calls reuse the same in-flight record and never re-initialize the same container.

## `devCorsOrigins` three-state examples

```ts
// ① On (default/omitted): fully open — cross-dev-server collaboration works out of the box; on non-loopback hosts DEV-011/012 remind
federation({ name: 'remote-a', exposes: { './Button': './src/Button.vue' } })

// ② Explicitly fully open: same as ①, but no more reminders (declares "I know")
federation({
  name: 'remote-a',
  exposes: { './Button': './src/Button.vue' },
  devCorsOrigins: '*',
})

// ③ Custom allowlist: only the listed host origins may access federation endpoints and source modules cross-origin;

federation({
  name: 'remote-a',
  exposes: { './Button': './src/Button.vue' },
  devCorsOrigins: ['http://localhost:5100', 'https://team.example.com'],
})
```

Behavior boundaries: `devCorsOrigins` applies only to dev (build output is unaffected); for non-matching origins the endpoints merely omit the `Access-Control-Allow-Origin` response header (same-origin requests are untouched).

## Full shape of `fulgurjs.config.ts`

```ts
// my-app/fulgurjs.config.ts — the default export can be passed straight to federation(); no root/apps[]/role wrapper
import type { FederationOptions } from '@fulgurjs/federation'

export default {
  name: 'my-app',
  exposes: { './pages/home': './src/views/Home.vue' },
  remotes: { 'remote-a': { dev: 'http://localhost:5174/remote-a', prod: '/remote-a' } },
  setup: './src/fulgurjs/setup.ts',   // optional: remote initialization entry
  shared: { vue: { singleton: true } },
  devSharedSelf: true,                // optional: explicit override; inferred from role by default
} satisfies FederationOptions

// ── The named exports below are read only by CLI explain/check-pages; they are not federation() parameters ──
// Per-page hosts: the page table and the runtime createHostPages consume the same data module (the single hand-maintained location)
// import { pages, remotePrefixes, deriveSpec } from './src/fulgurjs/host/pages.data'
// export const hostPages = { pages, remotePrefixes, deriveSpec }
```

- The CLI loader esbuild-bundles the **original config file as the parse baseline**: supports pure TS/JS data modules with project-relative imports, Node ≥ 18, both CJS and ESM; a missing file, no `name`, a wrong field shape, or an expose/setup pointing outside the project or at a missing file all fail with a three-part error;
- The runtime (Vite) and the CLI resolve the same config values; dev/prod URL selection follows the same rules as `federation({ remotes })`;

## Config-time validation (fail fast)

Every configuration error fails immediately at the vite config stage with a three-part "problem + current value + expected value + fix example"; the plugin never runs with a broken config. The CFG error code range: `CFG-001` (name) through `CFG-012` (setup/reserved key); the full set is in the [error code table](errors.md). The `remotes` runtime parameters (timeout/retries/breaker) are validated for numeric validity at config time — bad numbers never reach runtime.
