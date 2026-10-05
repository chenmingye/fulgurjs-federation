# Shared dependencies: singleton, version arbitration, and scopes

> shared lets multiple apps share the same dependency instance (e.g. one Vue/React runtime, one Pinia store), avoiding double-instance crashes and bundle bloat. The arbitration semantics align with webpack Module Federation.

## Basic usage

```ts
// fulgurjs.config.ts (host and remote each write their own; both must declare the same key for sharing to happen)
import type { FederationOptions } from '@fulgurjs/federation'

export default {
  name: 'my-app',
  exposes: { /* ... */ },
  shared: {
    // Full form (all SharedHint fields below)
    vue: {
      singleton: true,            // single instance for the whole page (strongly recommended true for vue/react/react-dom/pinia/vue-router)
      requiredVersion: '^3.4.0',  // full semver syntax; false = accept anything; omitted = inferred from this app's package.json
      strictVersion: false,       // default rule: with a local copy and non-singleton → true (mismatch throws MFU-003)
    },
    // String shorthand: equivalent to { requiredVersion: '^4.4.5' }
    'vue-router': '^4.4.5',
    // Array form: shared: ['vue', 'pinia'] — each item is equivalent to requiredVersion inferred from package.json
  },
} satisfies FederationOptions
```

Principle: **only list libraries the project actually installs and wants to share across apps**. Do not put business libraries (component libraries/dayjs etc.) into shared — the plugin handles their internal references to shared keys automatically during pre-bundling and build. A full sub app designed with its own isolated Router/store is legitimate — not every shared item must be singleton.

## All SharedHint fields

| Field | Type | Default | Semantics |
|---|---|---|---|
| `singleton` | `boolean` | `false` | Only one instance allowed: converge onto the same instance ("already-loaded wins"). Libraries that need the same instance for reactivity/Hooks/renderer across apps must be true |
| `requiredVersion` | `string \| false` | Inferred from this app's package.json dependencies; if inference fails, degrades to `false` (accepts any version, with a reminder) | Expected version range, full semver syntax. `false` explicitly accepts anything |
| `strictVersion` | `boolean` | **When omitted**: with a local copy (`import !== false`) and non-singleton → `true`; otherwise `false` | When true, a version not satisfying requiredVersion throws `MFU-003` (fail fast). Explicit `false` = mismatches do not throw (usually paired false under singleton, relying on the MFU-010 warning) |
| `shareKey` | `string` | The config key (trailing `/` stripped) | The key inside the shared scope; used when the import name differs from the shared name |
| `shareScope` | `string` | The top-level `shareScope` (default `'default'`) | Which shared group this item belongs to |
| `eager` | `boolean` | `false` | true = bundle the local copy into the initial chunk (synchronously available, at a permanent download cost) |
| `import` | `string \| false` | The config key | Local copy module path; **`false` = pure consumer, provides nothing** (only consumes others' versions, no local fallback). Mutually exclusive with `eager` (CFG-008) |
| `version` | `string` | Reads the actually installed version from local node_modules | Explicitly provide the version (rarely needed; when the installed version cannot be read, registers as `0.0.0` with a reminder) |
| `packageName` | `string` | The config key | Package name used to infer requiredVersion from package.json (for locally aliased installs) |

Key differences between omitted and explicit values:

- `requiredVersion` **omitted** ≠ accept anything — it is first inferred from package.json's dependencies/optionalDependencies/peerDependencies/devDependencies; only when inference fails does it fall back to `false` with a warning;
- The default for **omitted** `strictVersion` varies with the `import`/`singleton` combination (see the table above); it is not always false;
- `import: false` together with `eager: true` = configuration error `CFG-008`; declaring the same `shareKey + shareScope` twice = `CFG-008`.

## Version arbitration rules

1. **The highest version satisfying requiredVersion wins**; multiple candidate versions are not an error by themselves (`^2.1.7` includes `2.3.1` — differing version numbers alone never prove incompatibility);
2. **The already-loaded version is never replaced** — while the first loaded instance is present, later requests negotiate onto it;
3. **singleton converges onto one unique instance** — everyone gets the same one, regardless of who loaded first;
4. A `strictVersion` conflict throws `MFU-003`;
5. `MFU-010` warns only when **the finally selected singleton version fails some consumer's requiredVersion**: it lists candidate versions, the actual provider, impact, and fixes; the same version combination warns only once.

Load order (identical in dev and prod): at app/container initialization, the plugin-generated init module calls `initSharing(shareScope)` to build the scope and registers each `shared` key via `registerShare`; afterwards, imports of those keys in business code are rewritten to negotiate through `loadShare` — synchronous consumers take the ready/synchronously available instance, asynchronous consumers await the negotiation result. `initSharing`/`registerShare` normally run automatically from the init module; manual calls are only for custom runtimes.

## Synchronous vs asynchronous arbitration

- **Default (no runtimePlugins)**: the HTML entry finishes shared preparation before executing the app; the remote container finishes arbitration before executing an expose; the synchronous facade reuses the same decision.
- **With `runtimePlugins` configured and async hooks**: HTML entries configured with runtimePlugins finish shared arbitration and loading before executing the app; remote containers likewise finish async arbitration before executing an expose. An async hook may choose a lower version or an entry outside the original table, and is not overwritten by the local copy. The dynamic import boundary between app and provider is preserved; the consumer facade on Vite 8 still has no TLA.
- **Entry boundary**: library/custom entries without an HTML entry, or calling `registerPlugins` to change policy after the app runs, require first `await loadShare(name, opts)` and then dynamically importing the new consumer; already-evaluated static bindings cannot be rewritten retroactively. An unprepared synchronous consumer hitting an async hook reports `MFU-004` (`details.syncUnsupported: true`); `strictVersion` conflicts report `MFU-003`.

## shareScope: group isolation (React 18/19 on the same page)

Different shareScopes are mutually independent sharing groups, each arbitrating versions on its own. For **React 18 and React 19 on the same page**: give the whole React group, renderer, and their consumers an independent scope, pass plain props/callbacks through the bridge, and **never pass ReactElement or Context across renderers**:

```ts
// Host (React 19)
export default {
  name: 'rv-host',
  remotes: {
    'remote18': { dev: 'http://localhost:5441/remote18', prod: '/remote18' },
  },
  shared: {
    react: { singleton: true, shareScope: 'react19', requiredVersion: '^19.0.0' },
    'react-dom': { singleton: true, shareScope: 'react19' },
  },
} satisfies FederationOptions

// remote18 (React 18) configures shareScope: 'react18' itself; specify at load time:
// await loadRemote('remote18/Widget', { shareScope: 'react18' })
```

singleton does not turn incompatible major versions into compatible ones — React 18's renderer cannot be negotiated into compatibility with React 19; either align versions or isolate the whole dependency group plus its consumers by scope. Runnable example: [examples/demos/react-versions](https://github.com/chenmingye/fulgurjs-federation/tree/master/examples/demos/react-versions).

## dev-time participation of local source in negotiation: `devSharedSelf`

`devSharedSelf` controls whether, in dev, the app's own source (including dependencies) participates in the shared negotiation rewrite:

| Scenario | Default | Notes |
|---|---|---|
| Apps providing `exposes` (or `setup`) | `true` | Components consumed by the host must negotiate onto the host instance |
| Pure host (consume only) | `false` | Its own imports are its own provides, avoiding TLA/circular dependency risk in giant projects |
| Bidirectional federation (both expose and consume) | `true` | Inferred from role since 4.1.0 — no need to memorize; **explicit configuration always wins** |

In build, the negotiation facade for that path is automatically isolated into plugin-owned chunks (`fulgurjs-runtime` + `fulgurjs-shared-<key>`); the shared package bodies (including their static closures) are automatically isolated into `fulgurjs-provider-<key>` groups (since 5.8.0, taking precedence over user `manualChunks` groups — preventing self-await cycles and cross-chunk TDZ), **while business `manualChunks` grouping rules are preserved as-is**; no guarantee is made about arbitrary user module graphs having no cycles.

## Diagnostics

- `window.__FULGURJS_SCOPE__`: live share scope negotiation results (key → version → `{ get, from, loaded }`);
- `loadShare(name, opts?)`: explicit negotiation (highest version wins / already-loaded first / singleton convergence); opts: `{ requiredVersion?, singleton?, strictVersion?, shareKey?, shareScope?, fallback? }`;
- `getLoadedShare(name, opts?)`: synchronously read a ready instance without downloading; returns undefined on miss;
- `shareScopeMap`: the shared registry itself — fine for inspection; ordinary business code must not modify it directly.

Error codes: `CFG-004/005/008` (config time), `MFU-003` (strictVersion conflict), `MFU-004` (shared missing and no fallback), `MFU-010` (singleton version fails some consumer). Symptom/cause/fix for each: [error code table](../reference/errors.md).
