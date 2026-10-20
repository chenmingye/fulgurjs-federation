# Public type reference

These types describe the current public API. This page lists import locations, fields and optionality. Runtime defaults, call order and error handling are defined in the [API reference](api.md) and [configuration reference](configuration.md). Optional fields may be omitted; optionality does not imply that they can be changed at any lifecycle stage.

Related types in signatures can be inferred from their API values. Do not import related types from internal/src/dist when they are not public exports.

## FederationOptions

Vite federation plugin configuration.

Import from: `@fulgurjs/federation`.

| Field | Optional | Type | Contract |
|---|---|---|---|
| `name` | no | `string` | Required page-unique container name: starts with a letter, followed by letters/digits/underscore/dot/hyphen. |
| `filename` | yes | `string` | Production entry filename, default fulgurjs-remoteEntry.js; update caching rules and doctor --entry together. |
| `exposes` | yes | `Record<string, string \| ExposeHint>` | Public module keys mapped to real source files; both components and ordinary modules may be exposed. |
| `setup` | yes | `string` | Optional setup module path. The default setup function is optional; declare at least one of default/onSession/globalComponents/pageProviders. Application/session/consumer execution scopes are defined in the [setup contract](api.md). |
| `remotes` | yes | `Record<string, string \| RemoteEntryConfig \| (() => Promise<any>)>` | Configured remotes; addresses must resolve in every dev/prod environment actually used. |
| `shared` | yes | `SharedConfig` | Dependency keys and consumption conditions; does not create or automatically share business stores. |
| `shareScope` | yes | `string` | Sharing group name; scopes negotiate independently, default default. |
| `manifest` | yes | `boolean \| Record<string, unknown>` | Production manifest enabled by default; false disables it without disabling ordinary module loading, but limits manifest-based checks/preloading. |
| `runtimePlugins` | yes | `string[]` | Runtime plugin module paths, empty by default; relative paths resolve from the application root. |
| `dts` | yes | `boolean \| { dir?: string }` | Remote type generation and sync (see the [configuration reference](configuration.md) and [API · remote types](api.md#remote-types-generation-and-sync)). |
| `devSharedSelf` | yes | `boolean` | Whether dev source participates in sharing. Omitted: true for exposes/setup providers, false for pure consumers; explicit values win. The plugin manages its pre-bundling wiring; do not manually exclude all shared packages by default. |
| `devCorsOrigins` | yes | `string[] \| "*"` | Dev federation entry/manifest/types Origin policy, default *. It supplies Vite module CORS only when server.cors is omitted; explicit server.cors does not override plugin endpoints. Non-loopback wildcard configurations may still warn DEV-011. Production CORS is separate. |

## PageRouteLike

Host route to remote module mapping.

Import from: `@fulgurjs/federation`, `@fulgurjs/federation/react`, `@fulgurjs/federation/runtime`, `@fulgurjs/federation/vue`.

| Field | Optional | Type | Contract |
|---|---|---|---|
| `route` | no | `string` | Host logical route matched by static/:param segments, not a remote deployment URL. |
| `spec` | yes | `string` | In a page table, an expose key without the remote name; in a resolved result, a full remote/expose spec. |
| `name` | yes | `string` | Host route name; title/keepAlive and other fields may be added, without automatic router registration. |

## ShareEntry

One shared dependency provider.

Import from: `@fulgurjs/federation/react`, `@fulgurjs/federation/runtime`, `@fulgurjs/federation/vue`.

| Field | Optional | Type | Contract |
|---|---|---|---|
| `version` | no | `string` | Actual provided dependency version used in negotiation; never mislabel versions to bypass compatibility checks. |
| `get` | no | `() => Promise<any>` | Factory loading this version module; successful results are reused by the runtime. |
| `from` | no | `string` | Provider identity for arbitration diagnostics and provenance. |
| `eager` | no | `boolean` | Whether the local share is eagerly/synchronously available; does not preload business modules. |
| `loaded` | yes | `boolean` | Whether the provider entry has been consumed; singleton selection prefers loaded entries. |
| `value` | yes | `any` | Cached successfully loaded module instance; application code should not mutate the registry. |
| `pendingGet` | yes | `Promise<any>` | In-flight shared loading Promise, reused concurrently and cleared after settlement. |

## ShareScope

Shared versions indexed by dependency key.

Import from: `@fulgurjs/federation/react`, `@fulgurjs/federation/runtime`, `@fulgurjs/federation/vue`.

```ts
export type ShareScope = Record<string, Record<string, ShareEntry>>
```

## ShareScopeMap

Shared dependency scopes.

Import from: `@fulgurjs/federation/react`, `@fulgurjs/federation/runtime`, `@fulgurjs/federation/vue`.

```ts
export type ShareScopeMap = Record<string, ShareScope>
```

## RemoteConfig

Runtime remote container registration.

Import from: `@fulgurjs/federation/react`, `@fulgurjs/federation/runtime`, `@fulgurjs/federation/vue`.

| Field | Optional | Type | Contract |
|---|---|---|---|
| `name` | no | `string` | Runtime registration name matching the remote prefix in loading specs. |
| `entry` | no | `string` | Remote container entry URL; runtime registration expects the actual entry file, not a business page. |
| `shareScope` | yes | `string` | Sharing group name; scopes negotiate independently, default default. |
| `timeout` | yes | `number` | Container wait limit, default 15000 ms; does not cancel browser dynamic import. |
| `retries` | yes | `number` | Retry count after load failure, integer 0–10; omitted inherits the remote registration default of 2. |
| `fallback` | yes | `string[]` | Backup entry URLs tried in order after primary-entry failure. |
| `breaker` | yes | `{ threshold?: number; resetMs?: number; }` | Breaker threshold and reset delay, default threshold=5 and resetMs=30000; values must be finite and positive. |
| `promise` | yes | `() => Promise<any>` | Resolve a container or entry URL dynamically, subject to runtime timeout/retry policy. |
| `manifestUrl` | yes | `string` | Optional manifest locator for preloading, normally supplied by generated registration config. |

## LoadShareOptions

Version and scope conditions for loading a share.

Import from: `@fulgurjs/federation/react`, `@fulgurjs/federation/runtime`, `@fulgurjs/federation/vue`.

| Field | Optional | Type | Contract |
|---|---|---|---|
| `requiredVersion` | yes | `string \| false` | Semver range accepted by this call; false accepts any version. This runtime call does not infer package.json ranges. |
| `singleton` | yes | `boolean` | Consume one instance within a shareScope/shareKey; does not make incompatible versions compatible. |
| `strictVersion` | yes | `boolean` | Reject incompatible versions; manual runtime calls do not inherit build-time inferred default combinations. |
| `shareKey` | yes | `string` | Dependency key looked up in the scope; omitted uses the call name. |
| `shareScope` | yes | `string` | Sharing group name; scopes negotiate independently, default default. |
| `fallback` | yes | `() => Promise<any>` | Explicit local copy when no usable share is available; does not hide strict version conflicts. |
| `localVersion` | yes | `string` | Actual local fallback version used by synchronous facades/instance registration, not a compatibility override. |

## LoadRemoteOptions

Remote loading retry, scope and consumer app options.

Import from: `@fulgurjs/federation/react`, `@fulgurjs/federation/runtime`, `@fulgurjs/federation/vue`.

| Field | Optional | Type | Contract |
|---|---|---|---|
| `shareScope` | yes | `string` | Sharing group name; scopes negotiate independently, default default. |
| `retries` | yes | `number` | Retry count after load failure, integer 0–10; omitted inherits the remote registration default of 2. |
| `fallbackModule` | yes | `() => any` | Explicit replacement module after remote module loading failure; initialization failures still reject rather than being hidden. |
| `consumerApp` | yes | `unknown` | Vue remoteComponent/createHostPages supplies the actual consumer app for idempotent globalComponents registration; manual loading and React do not supply it automatically. |

## PreloadRemoteOptions

Preload or prefetch remote resources.

Import from: `@fulgurjs/federation/react`, `@fulgurjs/federation/runtime`, `@fulgurjs/federation/vue`.

| Field | Optional | Type | Contract |
|---|---|---|---|
| `mode` | yes | `"preload" \| "prefetch"` | Default preload; prefetch lowers resource-hint priority without automatic idle scheduling; see the API for wait boundaries. |

## RuntimePlugin

Named runtime hook plugin.

Import from: `@fulgurjs/federation/react`, `@fulgurjs/federation/runtime`, `@fulgurjs/federation/vue`.

| Field | Optional | Type | Contract |
|---|---|---|---|
| `name` | yes | `string` | Optional diagnostic plugin name identifying hook provenance. |
| `init` | yes | `(hooks: RuntimeHooks) => void` | Receives the mutable hooks object during plugin registration; install needed hooks rather than loading business pages here. |

## RuntimeHooks

Remote loading and share selection hooks.

Import from: `@fulgurjs/federation/react`, `@fulgurjs/federation/runtime`, `@fulgurjs/federation/vue`.

| Field | Optional | Type | Contract |
|---|---|---|---|
| `resolveShare` | yes | `(shareInfo: { shareKey: string; shareScope: string; requiredVersion?: string \| false; picked?: ShareEntry; available: ShareEntry[]; }) => void \| ShareEntry \| Promise<void \| ShareEntry>` | Decision hook: return ShareEntry to override, void to retain the default, optionally via Promise; explicit errors propagate to the caller. |
| `beforeLoadRemote` | yes | `(info: { remote: string; module: string; }) => void` | Observation hook before remote loading; thrown errors warn without changing the loading decision. |
| `afterLoadRemote` | yes | `(info: { remote: string; module: string; module_ns?: any; }) => void` | Observation hook after remote loading; module_ns is the actual result, and thrown errors do not replace it. |
| `onRemoteError` | yes | `(info: { remote: string; error: FgError; }) => void` | Receives remote errors and identity for logging/diagnostics, not as a replacement-module return channel. |

## RemoteDebugInfo

Remote container diagnostics snapshot.

Import from: `@fulgurjs/federation/react`, `@fulgurjs/federation/runtime`, `@fulgurjs/federation/vue`.

| Field | Optional | Type | Contract |
|---|---|---|---|
| `entry` | no | `string` | Remote container entry URL; runtime registration expects the actual entry file, not a business page. |
| `status` | no | `"idle" \| "loading" \| "loaded" \| "failed"` | Container state idle/loading/loaded/failed; loaded does not mean every business page request is complete. |
| `lastLoadMs` | yes | `number` | Latest container load duration in milliseconds, not complete business-page readiness time. |
| `error` | yes | `string` | Latest container error message string, not a React error-rendering option. |
| `setup` | yes | `"none" \| "pending" \| "ready" \| "failed"` | Remote application-level setup status, not a module path; ready does not mean every session/business request is complete. |

## FgRuntime

Framework independent runtime object.

Import from: `@fulgurjs/federation/react`, `@fulgurjs/federation/runtime`, `@fulgurjs/federation/vue`.

| Field | Optional | Type | Contract |
|---|---|---|---|
| `shareScopeMap` | no | `ShareScopeMap` | Current share registry for diagnostics, not direct business-state mutation. |
| `initSharing` | no | `(scopeName?: string) => ShareScopeMap` | Initialize a named scope, default default; normally called by generated plugin code. |
| `registerShare` | no | `(scopeName: string, name: string, version: string, get: () => Promise<any>, opts?: { from?: string; eager?: boolean; loaded?: boolean; }) => void` | Register one dependency version and loader; normally generated by the plugin. |
| `registerRemotes` | no | `(list: RemoteConfig[]) => void` | Register several remote configs with registerRemote semantics. |
| `registerRemote` | no | `(remote: RemoteConfig) => void` | Register/update remote config with immediate validation; provide the actual entry URL. |
| `registerPlugins` | no | `(list: RuntimePlugin[]) => void` | Install runtime hooks; later sharing-policy changes do not rewrite evaluated static bindings. |
| `loadShare` | no | `(name: string, opts?: LoadShareOptions) => Promise<any>` | Negotiate and retrieve a share asynchronously; ordinary imports are transformed by the plugin. |
| `loadShareSync` | no | `(name: string, opts: LoadShareOptions) => { kind: "ready" \| "local"; value?: any; }` | Used by generated synchronous facades: ready/value or local; unsupported async decisions fail explicitly. Not the normal application loader. |
| `prepareShares` | no | `(requests: { name: string; opts: LoadShareOptions; }[]) => Promise<void>` | Prepare a group of share decisions before generated entry evaluation; for advanced custom integration. |
| `getLoadedShare` | no | `(name: string, opts?: LoadShareOptions) => any` | Synchronously read a ready share, undefined if absent; no download, while strict version errors may still throw. |
| `pinLoadedShare` | no | `(name: string, opts: LoadShareOptions, localVersion: string, instance: unknown) => void` | Register an existing instance under its actual version without overwriting other provider facts; normally plugin-managed. |
| `loadRemote` | no | `typeof loadRemote` | Same as loadRemote from the public entry; infers synchronized entries by default, while explicit `loadRemote<T>` puts type ownership on the caller. |
| `getContainer` | no | `(name: string) => Promise<any>` | Load/init the remote container without running business setup/onSession. |
| `preloadRemote` | no | `(spec: string, opts?: PreloadRemoteOptions) => Promise<void>` | Preload resources without executing modules; prefetch does not schedule idle time, and stylesheets can affect the current page. |
| `parseSpec` | no | `(spec: string) => { remote: string; module: string; }` | Split remote and ./module; module is empty for a bare remote name. |
| `clearSessionState` | no | `() => void` | Invalidate onSession signals/deduplication without deleting AppContext; normal logout uses clearAppContext. |

## RemoteSetupContext

Context passed to setup/onSession.

Import from: `@fulgurjs/federation/react`, `@fulgurjs/federation/runtime`, `@fulgurjs/federation/vue`.

| Field | Optional | Type | Contract |
|---|---|---|---|
| `appContext` | no | `Readonly<Record<string, any>>` | Readonly context snapshot at call time, not a continuing reactive subscription. |
| `sessionKey` | yes | `string` | Non-sensitive login generation, distinct from user ID/token; required by onSession and stable within the session. |
| `signal` | no | `AbortSignal` | Cancellation signal for this lifecycle; check aborted after awaits before writing state. |

## RemoteSetupModule

Remote setup module and component registration contract.

Import from: `@fulgurjs/federation/react`, `@fulgurjs/federation/runtime`, `@fulgurjs/federation/vue`.

| Field | Optional | Type | Contract |
|---|---|---|---|
| `default` | yes | `(ctx: RemoteSetupContext) => void \| Promise<void>` | Optional application-level setup, once per successfully initialized remote container; not a per-app/component factory. |
| `onSession` | yes | `(ctx: RemoteSetupContext) => void \| Promise<void>` | Sync/async session function deduplicated by generation; a new generation invalidates the old signal, and failures can retry. |
| `globalComponents` | yes | `Record<string, unknown>` | Static components retain their identity. Zero-argument functions with displayName/props/emits metadata are components; unmarked zero-argument functions are lazy loaders. See the setup API for installation and retry semantics. |
| `pageProviders` | yes | `unknown[]` | Ancestor Providers required by remote components; each item is a component or zero-argument loader. Adapters wrap the actual consumer tree without copying the provider application. |

## AppContext

Application and session context supplied by the host.

Import from: `@fulgurjs/federation/react`, `@fulgurjs/federation/runtime`, `@fulgurjs/federation/vue`.

| Field | Optional | Type | Contract |
|---|---|---|---|
| `user` | no | `Record<string, any>` | User snapshot when provided by the host, not an automatically updated user subscription. |
| `getToken` | yes | `() => string \| undefined` | Read the latest token at call time, allowing undefined; authentication owns validity/refresh. |
| `store` | yes | `unknown` | Explicit host Pinia reference; not automatically installed in a child and not a substitute for provider-store ownership. |
| `hostApp` | yes | `unknown` | Host app reference; register child globals against the actual consumer app rather than this reference. |
| `locale` | yes | `unknown` | Explicit UI configuration; does not automatically install a locale Provider. |
| `events` | yes | `Record<string, any>` | Shared-reference callbacks/events organized by business namespace; remove owned reverse registrations on unmount. |
| `sessionKey` | yes | `string` | Non-sensitive login generation, distinct from user ID/token; required by onSession and stable within the session. |

## PagesOptions

Page table validation options.

Import from: `@fulgurjs/federation/react`, `@fulgurjs/federation/runtime`, `@fulgurjs/federation/vue`.

| Field | Optional | Type | Contract |
|---|---|---|---|
| `deriveSpec` | yes | `(route: string) => string` | Derives an expose key when page spec is omitted; default drops the first and :param segments without adding pages/. |
| `remotes` | yes | `Record<string, string>` | Configured remotes; addresses must resolve in every dev/prod environment actually used. |
| `schema` | yes | `Record<string, RemoteSchemaEntry>` | Remote expose probe table; use public remoteSchema rather than internal virtual modules. |
| `strict` | yes | `boolean` | Page validation defaults true; false only logs errors instead of throwing and does not repair the contract. |

## PageViolation

One page table validation issue.

Import from: `@fulgurjs/federation/react`, `@fulgurjs/federation/runtime`, `@fulgurjs/federation/vue`.

| Field | Optional | Type | Contract |
|---|---|---|---|
| `rule` | no | `"R1" \| "R2" \| "R3" \| "R4" \| "R5"` | Violation rule identifier R1–R5; see the per-page validation table. |
| `level` | no | `"error" \| "warn"` | error is a deterministic contract violation; warn flags an issue to assess. |
| `message` | no | `string` | Explanation of the actual problem and remedy for startup logs or CLI reports. |

## FgRemoteTypes — remote type registry

> How to check: the generated `registry.d.ts` must be part of the TypeScript program (the project `tsconfig.json` include must cover `src/fulgurjs/types/**/*.d.ts`), and the project must be checked with `vue-tsc -p tsconfig.json` or the IDE. Passing a single file to `tsc`/`vue-tsc` does not load ambient module augmentation, so a misspelled entry will not be reported — that is a checking-method problem, not a moduleResolution limitation; `node` (node10), `bundler` and `NodeNext` can all resolve this package's types.

The **augmentable interface** shared by all three entries (`/runtime`, `/vue`, `/react`). Its single declaration lives in a static shared file inside the package (the `./internal/registry.js` subpath pointing at `types/registry.d.ts`) — the host-generated `src/fulgurjs/types/<remote>/registry.d.ts` augments it with `'<remote>/<expose>': typeof import('<remote>/<expose>')`. Never implement or extend this interface by hand: its members come entirely from the plugin's synced output.

| Type | Meaning |
|---|---|
| `FgRemoteTypes` | Entry string → module namespace type registry. Empty while no types are synced (all literals pass with `unknown` results) |
| `FgStaticEntry<S>` | Static check on string-API parameters (empty-registry/dynamic pass; registered literals narrow to themselves; unregistered literals get an error type carrying the fix text, failing at the call site) |
| `FgRemoteModule<S>` | The module type for an entry: registered → module namespace; unsynced/dynamic → `unknown` |

Framework-entry check types (re-exported by `/vue` and `/react`): `FgComponentEntry<S>` (remoteComponent accepts only exposes whose default export is a component), `FgBridgeEntry<S>` (bridge factories accept only a `defineBridgeApp` default export), `FgBridgeAppProps<S>` (bridge props extracted from the provider's declaration), `FgRemoteVueComponent<S>` / `FgReactRemoteProps<S>` (real remote component/props types), `FgVueBridgeWrapper<S>` (the Vue bridge wrapper component). Semantics and limits: [API reference · string-API entry checks](api.md#entry-checks-for-the-string-apis-type-registry).

## RemoteSchemaEntry

One remote expose declaration.

Import from: `@fulgurjs/federation/react`, `@fulgurjs/federation/runtime`, `@fulgurjs/federation/vue`.

| Field | Optional | Type | Contract |
|---|---|---|---|
| `exposes` | no | `string[]` | This remote’s public expose keys, compared without the ./ prefix. |
| `exists` | yes | `boolean` | Whether the remote manifest is verifiable; false skips its R3 check and is not verification success. |

## RemoteSchema


Expose declarations indexed by key.

Import from: `@fulgurjs/federation/react`, `@fulgurjs/federation/runtime`, `@fulgurjs/federation/vue`.

```ts
export type RemoteSchema = Record<string, RemoteSchemaEntry>
```

## RemoteComponentOptions

Vue remote component loading and placeholder options.

Import from: `@fulgurjs/federation/vue`.

| Field | Optional | Type | Contract |
|---|---|---|---|
| `loadingComponent` | yes | `Component` | Optional Vue loading component, unset by default; no business skeleton is generated automatically. |
| `errorComponent` | yes | `Component` | Vue load-error component; default diagnostics/recovery UI. A custom component takes full control and receives the error prop only. |
| `retries` | yes | `number` | Retry count after load failure, integer 0–10; omitted inherits the remote registration default of 2. |
| `delay` | yes | `number` | Delay in milliseconds before loading UI, default 200; not a request timeout. |
| `timeout` | yes | `number` | Adapter wait limit in milliseconds, unset by default; timing out does not cancel in-flight shared requests. |

## HostPagesOptions

Vue host page adapter options.

Import from: `@fulgurjs/federation/vue`.

| Field | Optional | Type | Contract |
|---|---|---|---|
| `beforeLoad` | yes | `() => void \| Promise<void>` | Called before each actual page-module loading attempt; may return a Promise, and is not run while creating the page table. |
| `loadingComponent` | yes | `Component` | Optional Vue loading component, unset by default; no business skeleton is generated automatically. |
| `errorComponent` | yes | `Component` | Vue load-error component; default diagnostics/recovery UI. A custom component takes full control and receives the error prop only. |
| `delay` | yes | `number` | Delay in milliseconds before loading UI, default 200; not a request timeout. |
| `pages` | no | `PageRouteLike[]` | Original shared page records; the host still registers routes. |
| `remotePrefixes` | no | `Record<string, string>` | Host-route-prefix to remote-name mapping, longest prefix first; unmatched routes fail during adapter creation. |
| `deriveSpec` | yes | `(route: string) => string` | Derives an expose key when page spec is omitted; default drops the first and :param segments without adding pages/. |
| `schema` | yes | `Record<string, RemoteSchemaEntry>` | Remote expose probe table; use public remoteSchema rather than internal virtual modules. |
| `strict` | yes | `boolean` | Page validation defaults true; false only logs errors instead of throwing and does not repair the contract. |
| `base` | yes | `string` | Host deployment prefix stripped during resolve, not the bridge business basePath. |

## HostPages

Vue page resolution and component factory.

Import from: `@fulgurjs/federation/vue`.

| Field | Optional | Type | Contract |
|---|---|---|---|
| `pages` | no | `PageRouteLike[]` | Original shared page records; the host still registers routes. |
| `resolve` | no | `(path: string) => ResolvedHostPage` | Match a path to a page, full spec and params; null when unmatched, without automatically supplying query/hash props. |
| `component` | no | `(spec: string) => Component` | Return a component for a full remote/expose spec; reusing a module does not keep component state alive. |
| `keepAliveNames` | no | `string[]` | Vue KeepAlive include names; the host must still render KeepAlive and choose max/key. |

## ResolvedHostPage

Resolved page and extracted path parameters.

Import from: `@fulgurjs/federation/react`, `@fulgurjs/federation/vue`.

| Field | Optional | Type | Contract |
|---|---|---|---|
| `page` | no | `PageRouteLike` | Original page record matched by this resolution. |
| `remote` | no | `string` | Matched remotes registration name, not a page path. |
| `spec` | no | `string` | In a page table, an expose key without the remote name; in a resolved result, a full remote/expose spec. |
| `params` | no | `Record<string, string>` | Decoded :param path parameters, excluding query/hash. |

## BridgeApp

Remote application mount/unmount contract.

Import from: `@fulgurjs/federation/react`, `@fulgurjs/federation/vue`.

| Field | Optional | Type | Contract |
|---|---|---|---|
| `mount` | no | `(el: HTMLElement, props?: Record<string, unknown>, options?: BridgeMountOptions) => void \| Promise<void>` | Mount into the supplied container; Promise completion means first root commit, not all business async work. |
| `unmount` | no | `(el: HTMLElement) => void` | Synchronously invalidate/clean this container generation; throwing locks the container rather than allowing unsafe remount. |
| `routing` | yes | `BridgeRoutingProtocol` | Whether this contract declares URL-sync protocol support, not a router object or deployment base. |

## BridgeSession

Import from `@fulgurjs/federation/vue`. Return type of `createBridgeSession`.

| Field | Optional | Type | Meaning |
|---|---|---|---|
| `sessionKey` | no | `Ref<string \| null>` | Non-sensitive login generation; null means logged out. |
| `renew` | no | `() => string` | Create, persist and return a new generation; do not call for token refresh. |
| `clear` | no | `() => void` | Clear the generation and storage; controlled bridges unmount. |

## VueBridgeAppContext

Import from `@fulgurjs/federation/vue`. The plugin supplies this second factory argument; business props are separate.

| Field | Optional | Type | Meaning |
|---|---|---|---|
| `signal` | yes | `AbortSignal` | Aborted when the session becomes invalid; check before asynchronous writes. |
| `routing` | yes | `BridgeChildRoute` | Controlled route channel when the host enables URL synchronization; see the URL sync guide. |

`hasBridgeMount(ctx)` queries this factory context's mode, without page-global state.

## VueBridgeAppFactory

Factory creating an independent Vue application.

Import from: `@fulgurjs/federation/vue`.

```ts
export type VueBridgeAppFactory = ( props: Record<string, unknown>, ctx?: VueBridgeAppContext, ) => VueApp | VueBridgeAppSetup | Promise<VueApp | VueBridgeAppSetup>
```

## VueBridgeAppSetup

Import from `@fulgurjs/federation/vue`. A `defineBridgeApp` factory may return this object or a Promise of it. Declare `{ routing: true }`; the plugin syncs and installs the router before mounting.

| Field | Optional | Type | Description |
|---|---|---|---|
| `app` | no | `VueApp` | Unmounted app with business plugins initialized. |
| `router` | no | `VueRouterLike` | This app’s memory router, guards registered, not yet installed with app.use(router). |

The connection is released on unmount, guard failure and mount failure. Do not reuse an already mounted app or connected router. Return an app directly when URL sync is not needed.

## VueBridgeAppOptions

Vue host bridge loading and context options.

Import from: `@fulgurjs/federation/vue`.

| Field | Optional | Type | Contract |
|---|---|---|---|
| `loadingComponent` | yes | `Component` | Optional Vue loading component, unset by default; no business skeleton is generated automatically. |
| `errorComponent` | yes | `Component` | Vue load-error component; default diagnostics/recovery UI. A custom component takes full control and receives the error prop only. |
| `retries` | yes | `number` | Retry count after load failure, integer 0–10; omitted inherits the remote registration default of 2. |
| `timeout` | yes | `number` | Adapter wait limit in milliseconds, unset by default; timing out does not cancel in-flight shared requests. |
| `getContext` | yes | `() => Partial<AppContext> & Record<string, unknown>` | Side-effect-free synchronous snapshot getter before actual loading; do not call provide or return a Promise. |
| `session` | yes | `() => string \| number \| null \| undefined` | Reactive non-sensitive identity; managed generations. null=logout, undefined=restoring; do not combine with sessionKey. |
| `sessionStorageKey` | yes | `string` | Automatic session namespace; defaults to fulgurjs-bridge-session and is shared by one host. |


## VueBridgeRouterConnection

Vue child memory router connection, readiness and disposal.

Import from: `@fulgurjs/federation/vue`.

| Field | Optional | Type | Contract |
|---|---|---|---|
| `ready` | no | `Promise<void>` | Promise for initial controlled navigation; await before installing the Vue router. |
| `dispose` | no | `() => void` | Idempotently release this routing connection/subscriptions, not unrelated application resources. |

## BridgeHostRouting

Host navigation port and child route prefix.

Import from: `@fulgurjs/federation/react`, `@fulgurjs/federation/vue`.

| Field | Optional | Type | Contract |
|---|---|---|---|
| `basePath` | no | `string` | Static absolute host logical-route prefix, excluding deployment base/query/hash/wildcards; same-page prefixes cannot overlap. |
| `navigation` | no | `BridgeHostNavigation` | Host navigation port created by its framework adapter; the host owns browser history. |

## ReactBridgeAppOptions

React host bridge loading and context options.

Import from: `@fulgurjs/federation/react`.

| Field | Optional | Type | Contract |
|---|---|---|---|
| `fallback` | yes | `ReactNode` | React pending UI, default null; not a replacement business module after failure. |
| `error` | yes | `ReactNode \| BridgeErrorFallback` | React error UI node or render function; defaults to built-in diagnostics/recovery. |
| `retries` | yes | `number` | Retry count after load failure, integer 0–10; omitted inherits the remote registration default of 2. |
| `timeout` | yes | `number` | Adapter wait limit in milliseconds, unset by default; timing out does not cancel in-flight shared requests. |
| `getContext` | yes | `() => Partial<AppContext> & Record<string, unknown>` | Side-effect-free synchronous snapshot getter before actual loading; do not call provide or return a Promise. |

## BridgeErrorFallback

React bridge error fallback callback.

Import from: `@fulgurjs/federation/react`.

```ts
export type BridgeErrorFallback = (error: unknown, retry: () => void) => ReactNode
```

## ReactRemoteComponentOptions

React remote component loading and placeholder options.

Import from: `@fulgurjs/federation/react`.

| Field | Optional | Type | Contract |
|---|---|---|---|
| `fallback` | yes | `ReactNode` | React pending UI, default null; not a replacement business module after failure. |
| `error` | yes | `ReactNode \| RemoteErrorFallback` | React error UI node or render function; defaults to built-in diagnostics/recovery. |
| `retries` | yes | `number` | Retry count after load failure, integer 0–10; omitted inherits the remote registration default of 2. |
| `timeout` | yes | `number` | Adapter wait limit in milliseconds, unset by default; timing out does not cancel in-flight shared requests. |

## RemoteErrorFallback

React remote loading error fallback callback.

Import from: `@fulgurjs/federation/react`.

```ts
export type RemoteErrorFallback = (error: unknown, retry: () => void) => ReactNode
```

## UseLoadRemoteOptions

React remote module hook options.

Import from: `@fulgurjs/federation/react`.

| Field | Optional | Type | Contract |
|---|---|---|---|
| `shareScope` | yes | `string` | Sharing group name; scopes negotiate independently, default default. |
| `retries` | yes | `number` | Retry count after load failure, integer 0–10; omitted inherits the remote registration default of 2. |
| `fallbackModule` | yes | `() => any` | Explicit replacement module after remote module loading failure; initialization failures still reject rather than being hidden. |

## UseLoadRemoteResult

React hook data, error, loading state and reload.

Import from: `@fulgurjs/federation/react`.

| Field | Optional | Type | Contract |
|---|---|---|---|
| `data` | no | `Module` | Current successfully loaded module; undefined before completion, at retry start or after failure. |
| `error` | no | `unknown` | Current loading error, undefined when clear; isolated per attempt rather than retaining an earlier error. |
| `loading` | no | `boolean` | Whether this hook attempt is pending, not global application loading state. |
| `reload` | no | `() => Promise<void>` | Restart the hook attempt, returning Promise<void>; successful cached modules are reused and no requests start after unmount. |

## RemoteErrorBoundaryProps

React rendering error boundary props.

Import from: `@fulgurjs/federation/react`.

| Field | Optional | Type | Contract |
|---|---|---|---|
| `children` | yes | `ReactNode` | React subtree protected by the boundary; excludes internal errors of a separate bridged root. |
| `fallback` | yes | `ReactNode \| ((args: { error: unknown; reset: () => void; }) => ReactNode)` | Render-error UI node or function receiving error/reset, not pending UI. |
| `onError` | yes | `(error: unknown, info: ErrorInfo) => void` | Logging callback for captured render errors, receiving error/info; does not catch event-handler exceptions. |
| `resetKeys` | yes | `readonly unknown[]` | Reset the React error boundary when any key changes; does not clear external React.lazy failed caches. |

## ReactHostPagesOptions

React host page adapter options.

Import from: `@fulgurjs/federation/react`.

| Field | Optional | Type | Contract |
|---|---|---|---|
| `beforeLoad` | yes | `() => void \| Promise<void>` | Called before each actual page-module loading attempt; may return a Promise, and is not run while creating the page table. |
| `fallback` | yes | `ReactNode` | React pending UI, default null; not a replacement business module after failure. |
| `error` | yes | `ReactNode \| RemoteErrorFallback` | React error UI node or render function; defaults to built-in diagnostics/recovery. |
| `retries` | yes | `number` | Retry count after load failure, integer 0–10; omitted inherits the remote registration default of 2. |
| `timeout` | yes | `number` | Adapter wait limit in milliseconds, unset by default; timing out does not cancel in-flight shared requests. |
| `pages` | no | `PageRouteLike[]` | Original shared page records; the host still registers routes. |
| `remotePrefixes` | no | `Record<string, string>` | Host-route-prefix to remote-name mapping, longest prefix first; unmatched routes fail during adapter creation. |
| `deriveSpec` | yes | `(route: string) => string` | Derives an expose key when page spec is omitted; default drops the first and :param segments without adding pages/. |
| `schema` | yes | `Record<string, RemoteSchemaEntry>` | Remote expose probe table; use public remoteSchema rather than internal virtual modules. |
| `strict` | yes | `boolean` | Page validation defaults true; false only logs errors instead of throwing and does not repair the contract. |
| `base` | yes | `string` | Host deployment prefix stripped during resolve, not the bridge business basePath. |

## ReactHostPages

React page resolution and component factory.

Import from: `@fulgurjs/federation/react`.

| Field | Optional | Type | Contract |
|---|---|---|---|
| `pages` | no | `PageRouteLike[]` | Original shared page records; the host still registers routes. |
| `resolve` | no | `(path: string) => ResolvedHostPage` | Match a path to a page, full spec and params; null when unmatched, without automatically supplying query/hash props. |
| `component` | no | `<P = Record<string, unknown>>(spec: string) => ComponentType<P>` | Return a component for a full remote/expose spec; reusing a module does not keep component state alive. |

## ReactBridgeAppContext

Import from `@fulgurjs/federation/react`. The plugin supplies this second factory argument; business props are separate.

| Field | Optional | Type | Meaning |
|---|---|---|---|
| `signal` | yes | `AbortSignal` | Aborted when the session becomes invalid; check before asynchronous writes. |
| `routing` | yes | `BridgeChildRoute` | Controlled route channel when the host enables URL synchronization; see the URL sync guide. |

`hasBridgeMount(ctx)` queries this factory context's mode, without page-global state.

## ReactBridgeAppFactory

Factory creating the React child application element.

Import from: `@fulgurjs/federation/react`.

```ts
export type ReactBridgeAppFactory = (props: Record<string, unknown>, ctx?: ReactBridgeAppContext) => ReactElement
```

## ReactBridgeCancelPolicy

```ts
import type { ReactBridgeCancelPolicy } from '@fulgurjs/federation/react'
```

Synchronous host navigation predicate: `(next: BridgeLocation) => boolean`. Return `true` to allow navigation, `false` to reject it. Pass it to `createReactBridgeNavigation(router, { canNavigate })`; do not supply an async function.

## ReactBridgeRouterConnection

```ts
import type { ReactBridgeRouterConnection } from '@fulgurjs/federation/react'
```

Return value of `createReactBridgeRouter`.

| Field | Type | Usage |
|---|---|---|
| `element` | `ReactElement` | Return as the child application's root from the bridge factory. |
| `routerReady` | `Promise<Router>` | Resolves when the memory router is wired; rejects if dependencies cannot load. Await this promise instead of assuming `element.props.router` exists synchronously. |
| `dispose` | `() => void` | Release routing subscriptions and wiring during bridge cleanup. |

## Application / ApplicationHandle

入口 / Entry: `@fulgurjs/federation/vue`, `@fulgurjs/federation/react`.

| 类型 / Type | 字段 / Fields |
|---|---|
| Application<P extends object> | BridgeApp + `__fgBridgeProps?: P` + `start(target: string \| HTMLElement, ...props: {} extends P ? [props?: P] : [props: P]): Promise<ApplicationHandle>` |
| ApplicationHandle | `element: HTMLElement`, `unmount(): void` |
| VueApplicationContext | `mode: 'standalone' \| 'bridge'`, `signal: AbortSignal`, `routing?: BridgeChildRoute` |
| VueApplicationSetup | `app: VueApp`, `router: VueRouterLike & { install(app: VueApp): void; isReady(): Promise<void> }` |
| VueApplicationFactory<P> | `(props: P, context: VueApplicationContext) => VueApp \| VueApplicationSetup \| Promise<VueApp \| VueApplicationSetup>` |
| ReactApplicationContext | `mode: 'standalone' \| 'bridge'`, `signal: AbortSignal`, `routing?: BridgeChildRoute` |
| ReactApplicationSetup | `element: ReactElement`, `dispose?: () => void` |
| ReactApplicationFactory<P> | `(props: P, context: ReactApplicationContext) => ReactElement \| ReactApplicationSetup` |

See the [API reference](api.md#one-application-for-standalone-and-bridge-startup-defineapplication) for lifecycle and defaults.

## DefineVueBridgeAppOptions / DefineReactBridgeAppOptions

Import Vue options from /vue and React options from /react. defineApplication and defineBridgeApp share their framework options type.

| Field | Optional | Type | Default and purpose |
|---|---|---|---|
| `routing` | yes | `boolean` | false; true declares host URL synchronization. defineApplication can also install a local memory router without synchronization. |
