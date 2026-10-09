# Public type reference

These types describe the current public API. This page lists import locations, fields and optionality. Runtime defaults, call order and error handling are defined in the [API reference](api.md) and [configuration reference](configuration.md). Optional fields may be omitted; optionality does not imply that they can be changed at any lifecycle stage.

Related types in signatures can be inferred from their API values. Do not import related types from internal/src/dist when they are not public exports.

## FederationOptions

Vite federation plugin configuration.

Import from: `@fulgurjs/federation`.

| Field | Optional | Type | Contract |
|---|---|---|---|
| `name` | no | `string` | See the owning API for lifecycle and runtime defaults. |
| `filename` | yes | `string` | See the owning API for lifecycle and runtime defaults. |
| `exposes` | yes | `Record<string, string \| ExposeHint>` | See the owning API for lifecycle and runtime defaults. |
| `setup` | yes | `string` | See the owning API for lifecycle and runtime defaults. |
| `remotes` | yes | `Record<string, string \| RemoteEntryConfig \| (() => Promise<any>)>` | See the owning API for lifecycle and runtime defaults. |
| `shared` | yes | `SharedConfig` | See the owning API for lifecycle and runtime defaults. |
| `shareScope` | yes | `string` | See the owning API for lifecycle and runtime defaults. |
| `manifest` | yes | `boolean \| Record<string, unknown>` | See the owning API for lifecycle and runtime defaults. |
| `runtimePlugins` | yes | `string[]` | See the owning API for lifecycle and runtime defaults. |
| `dts` | yes | `boolean \| { dir?: string }` | Remote type generation and sync (see the [configuration reference](configuration.md) and [API · remote types](api.md#remote-types-generation-and-sync)). |
| `devSharedSelf` | yes | `boolean` | See the owning API for lifecycle and runtime defaults. |
| `devCorsOrigins` | yes | `string[] \| "*"` | See the owning API for lifecycle and runtime defaults. |

## PageRouteLike

Host route to remote module mapping.

Import from: `@fulgurjs/federation`, `@fulgurjs/federation/react`, `@fulgurjs/federation/runtime`, `@fulgurjs/federation/vue`.

| Field | Optional | Type | Contract |
|---|---|---|---|
| `route` | no | `string` | See the owning API for lifecycle and runtime defaults. |
| `spec` | yes | `string` | See the owning API for lifecycle and runtime defaults. |
| `name` | yes | `string` | See the owning API for lifecycle and runtime defaults. |

## ShareEntry

One shared dependency provider.

Import from: `@fulgurjs/federation/react`, `@fulgurjs/federation/runtime`, `@fulgurjs/federation/vue`.

| Field | Optional | Type | Contract |
|---|---|---|---|
| `version` | no | `string` | See the owning API for lifecycle and runtime defaults. |
| `get` | no | `() => Promise<any>` | See the owning API for lifecycle and runtime defaults. |
| `from` | no | `string` | See the owning API for lifecycle and runtime defaults. |
| `eager` | no | `boolean` | See the owning API for lifecycle and runtime defaults. |
| `loaded` | yes | `boolean` | See the owning API for lifecycle and runtime defaults. |
| `value` | yes | `any` | See the owning API for lifecycle and runtime defaults. |
| `pendingGet` | yes | `Promise<any>` | See the owning API for lifecycle and runtime defaults. |

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
| `name` | no | `string` | See the owning API for lifecycle and runtime defaults. |
| `entry` | no | `string` | See the owning API for lifecycle and runtime defaults. |
| `shareScope` | yes | `string` | See the owning API for lifecycle and runtime defaults. |
| `timeout` | yes | `number` | See the owning API for lifecycle and runtime defaults. |
| `retries` | yes | `number` | See the owning API for lifecycle and runtime defaults. |
| `fallback` | yes | `string[]` | See the owning API for lifecycle and runtime defaults. |
| `breaker` | yes | `{ threshold?: number; resetMs?: number; }` | See the owning API for lifecycle and runtime defaults. |
| `promise` | yes | `() => Promise<any>` | See the owning API for lifecycle and runtime defaults. |
| `manifestUrl` | yes | `string` | See the owning API for lifecycle and runtime defaults. |

## LoadShareOptions

Version and scope conditions for loading a share.

Import from: `@fulgurjs/federation/react`, `@fulgurjs/federation/runtime`, `@fulgurjs/federation/vue`.

| Field | Optional | Type | Contract |
|---|---|---|---|
| `requiredVersion` | yes | `string \| false` | See the owning API for lifecycle and runtime defaults. |
| `singleton` | yes | `boolean` | See the owning API for lifecycle and runtime defaults. |
| `strictVersion` | yes | `boolean` | See the owning API for lifecycle and runtime defaults. |
| `shareKey` | yes | `string` | See the owning API for lifecycle and runtime defaults. |
| `shareScope` | yes | `string` | See the owning API for lifecycle and runtime defaults. |
| `fallback` | yes | `() => Promise<any>` | See the owning API for lifecycle and runtime defaults. |
| `localVersion` | yes | `string` | See the owning API for lifecycle and runtime defaults. |

## LoadRemoteOptions

Remote loading retry, scope and consumer app options.

Import from: `@fulgurjs/federation/react`, `@fulgurjs/federation/runtime`, `@fulgurjs/federation/vue`.

| Field | Optional | Type | Contract |
|---|---|---|---|
| `shareScope` | yes | `string` | See the owning API for lifecycle and runtime defaults. |
| `retries` | yes | `number` | See the owning API for lifecycle and runtime defaults. |
| `fallbackModule` | yes | `() => any` | See the owning API for lifecycle and runtime defaults. |
| `consumerApp` | yes | `unknown` | See the owning API for lifecycle and runtime defaults. |

## PreloadRemoteOptions

Preload or prefetch remote resources.

Import from: `@fulgurjs/federation/react`, `@fulgurjs/federation/runtime`, `@fulgurjs/federation/vue`.

| Field | Optional | Type | Contract |
|---|---|---|---|
| `mode` | yes | `"preload" \| "prefetch"` | See the owning API for lifecycle and runtime defaults. |

## RuntimePlugin

Named runtime hook plugin.

Import from: `@fulgurjs/federation/react`, `@fulgurjs/federation/runtime`, `@fulgurjs/federation/vue`.

| Field | Optional | Type | Contract |
|---|---|---|---|
| `name` | yes | `string` | See the owning API for lifecycle and runtime defaults. |
| `init` | yes | `(hooks: RuntimeHooks) => void` | See the owning API for lifecycle and runtime defaults. |

## RuntimeHooks

Remote loading and share selection hooks.

Import from: `@fulgurjs/federation/react`, `@fulgurjs/federation/runtime`, `@fulgurjs/federation/vue`.

| Field | Optional | Type | Contract |
|---|---|---|---|
| `resolveShare` | yes | `(shareInfo: { shareKey: string; shareScope: string; requiredVersion?: string \| false; picked?: ShareEntry; available: ShareEntry[]; }) => void \| ShareEntry \| Promise<void \| ShareEntry>` | See the owning API for lifecycle and runtime defaults. |
| `beforeLoadRemote` | yes | `(info: { remote: string; module: string; }) => void` | See the owning API for lifecycle and runtime defaults. |
| `afterLoadRemote` | yes | `(info: { remote: string; module: string; module_ns?: any; }) => void` | See the owning API for lifecycle and runtime defaults. |
| `onRemoteError` | yes | `(info: { remote: string; error: FgError; }) => void` | See the owning API for lifecycle and runtime defaults. |

## RemoteDebugInfo

Remote container diagnostics snapshot.

Import from: `@fulgurjs/federation/react`, `@fulgurjs/federation/runtime`, `@fulgurjs/federation/vue`.

| Field | Optional | Type | Contract |
|---|---|---|---|
| `entry` | no | `string` | See the owning API for lifecycle and runtime defaults. |
| `status` | no | `"idle" \| "loading" \| "loaded" \| "failed"` | See the owning API for lifecycle and runtime defaults. |
| `lastLoadMs` | yes | `number` | See the owning API for lifecycle and runtime defaults. |
| `error` | yes | `string` | See the owning API for lifecycle and runtime defaults. |
| `setup` | yes | `"failed" \| "none" \| "pending" \| "ready"` | See the owning API for lifecycle and runtime defaults. |

## FgRuntime

Framework independent runtime object.

Import from: `@fulgurjs/federation/react`, `@fulgurjs/federation/runtime`, `@fulgurjs/federation/vue`.

| Field | Optional | Type | Contract |
|---|---|---|---|
| `shareScopeMap` | no | `ShareScopeMap` | See the owning API for lifecycle and runtime defaults. |
| `initSharing` | no | `(scopeName?: string) => ShareScopeMap` | See the owning API for lifecycle and runtime defaults. |
| `registerShare` | no | `(scopeName: string, name: string, version: string, get: () => Promise<any>, opts?: { from?: string; eager?: boolean; loaded?: boolean; }) => void` | See the owning API for lifecycle and runtime defaults. |
| `registerRemotes` | no | `(list: RemoteConfig[]) => void` | See the owning API for lifecycle and runtime defaults. |
| `registerRemote` | no | `(remote: RemoteConfig) => void` | See the owning API for lifecycle and runtime defaults. |
| `registerPlugins` | no | `(list: RuntimePlugin[]) => void` | See the owning API for lifecycle and runtime defaults. |
| `loadShare` | no | `(name: string, opts?: LoadShareOptions) => Promise<any>` | See the owning API for lifecycle and runtime defaults. |
| `loadShareSync` | no | `(name: string, opts: LoadShareOptions) => { kind: "ready" \| "local"; value?: any; }` | See the owning API for lifecycle and runtime defaults. |
| `prepareShares` | no | `(requests: { name: string; opts: LoadShareOptions; }[]) => Promise<void>` | See the owning API for lifecycle and runtime defaults. |
| `getLoadedShare` | no | `(name: string, opts?: LoadShareOptions) => any` | See the owning API for lifecycle and runtime defaults. |
| `pinLoadedShare` | no | `(name: string, opts: LoadShareOptions, localVersion: string, instance: unknown) => void` | See the owning API for lifecycle and runtime defaults. |
| `loadRemote` | no | `<S extends string, T = FgRemoteModule<S>>(spec: S & FgStaticEntry<S>, opts?: LoadRemoteOptions) => Promise<T>` | See the API contract (registry semantics under `FgRemoteTypes`). |
| `getContainer` | no | `(name: string) => Promise<any>` | See the owning API for lifecycle and runtime defaults. |
| `preloadRemote` | no | `(spec: string, opts?: PreloadRemoteOptions) => Promise<void>` | See the owning API for lifecycle and runtime defaults. |
| `parseSpec` | no | `(spec: string) => { remote: string; module: string; }` | See the owning API for lifecycle and runtime defaults. |
| `clearSessionState` | no | `() => void` | See the owning API for lifecycle and runtime defaults. |

## RemoteSetupContext

Context passed to setup/onSession.

Import from: `@fulgurjs/federation/react`, `@fulgurjs/federation/runtime`, `@fulgurjs/federation/vue`.

| Field | Optional | Type | Contract |
|---|---|---|---|
| `appContext` | no | `Readonly<Record<string, any>>` | See the owning API for lifecycle and runtime defaults. |
| `sessionKey` | yes | `string` | See the owning API for lifecycle and runtime defaults. |
| `signal` | no | `AbortSignal` | See the owning API for lifecycle and runtime defaults. |

## RemoteSetupModule

Remote setup module and component registration contract.

Import from: `@fulgurjs/federation/react`, `@fulgurjs/federation/runtime`, `@fulgurjs/federation/vue`.

| Field | Optional | Type | Contract |
|---|---|---|---|
| `default` | no | `(ctx: RemoteSetupContext) => void \| Promise<void>` | See the owning API for lifecycle and runtime defaults. |
| `onSession` | yes | `(ctx: RemoteSetupContext) => void \| Promise<void>` | See the owning API for lifecycle and runtime defaults. |
| `globalComponents` | yes | `Record<string, unknown>` | See the owning API for lifecycle and runtime defaults. |

## AppContext

Application and session context supplied by the host.

Import from: `@fulgurjs/federation/react`, `@fulgurjs/federation/runtime`, `@fulgurjs/federation/vue`.

| Field | Optional | Type | Contract |
|---|---|---|---|
| `user` | no | `Record<string, any>` | See the owning API for lifecycle and runtime defaults. |
| `getToken` | yes | `() => string` | See the owning API for lifecycle and runtime defaults. |
| `store` | yes | `unknown` | See the owning API for lifecycle and runtime defaults. |
| `hostApp` | yes | `unknown` | See the owning API for lifecycle and runtime defaults. |
| `locale` | yes | `unknown` | See the owning API for lifecycle and runtime defaults. |
| `events` | yes | `Record<string, any>` | See the owning API for lifecycle and runtime defaults. |
| `sessionKey` | yes | `string` | See the owning API for lifecycle and runtime defaults. |

## PagesOptions

Page table validation options.

Import from: `@fulgurjs/federation/react`, `@fulgurjs/federation/runtime`, `@fulgurjs/federation/vue`.

| Field | Optional | Type | Contract |
|---|---|---|---|
| `deriveSpec` | yes | `(route: string) => string` | See the owning API for lifecycle and runtime defaults. |
| `remotes` | yes | `Record<string, string>` | See the owning API for lifecycle and runtime defaults. |
| `schema` | yes | `Record<string, RemoteSchemaEntry>` | See the owning API for lifecycle and runtime defaults. |
| `strict` | yes | `boolean` | See the owning API for lifecycle and runtime defaults. |

## PageViolation

One page table validation issue.

Import from: `@fulgurjs/federation/react`, `@fulgurjs/federation/runtime`, `@fulgurjs/federation/vue`.

| Field | Optional | Type | Contract |
|---|---|---|---|
| `rule` | no | `"R1" \| "R2" \| "R3" \| "R4" \| "R5"` | See the owning API for lifecycle and runtime defaults. |
| `level` | no | `"error" \| "warn"` | See the owning API for lifecycle and runtime defaults. |
| `message` | no | `string` | See the owning API for lifecycle and runtime defaults. |

## FgRemoteTypes — remote type registry

The **augmentable interface** shared by all three entries (`/runtime`, `/vue`, `/react`). Its single declaration lives in a static shared file inside the package (the `./internal/registry.js` subpath pointing at `types/registry.d.ts`) — the host-generated `src/fulgurjs/types/<remote>/registry.d.ts` augments it with `'<remote>/<expose>': typeof import('<remote>/<expose>')`. Never implement or extend this interface by hand: its members come entirely from the plugin's synced output.

| Type | Meaning |
|---|---|
| `FgRemoteTypes` | Entry string → module namespace type registry. Empty while no types are synced (all literals pass with `unknown` results) |
| `FgStaticEntry<S>` | Static check on string-API parameters (empty-registry/dynamic pass; registered literals narrow to themselves; unregistered literals get an error type carrying the fix text, failing at the call site) |
| `FgRemoteModule<S>` | The module type for an entry: registered → module namespace; unsynced/dynamic → `unknown` |

Framework-entry check types (re-exported by `/vue` and `/react`): `FgComponentEntry<S>` (remoteComponent accepts only exposes whose default export is a component), `FgBridgeEntry<S>` (bridge factories accept only a `defineBridgeApp` default export), `FgBridgeAppProps<S>` (bridge props extracted from the provider's declaration), `FgRemoteVueComponent<S>` / `FgReactRemoteProps<S>` (real remote component/props types), `FgVueBridgeWrapper<S>` (the Vue bridge wrapper component). Semantics and limits: [API reference · string-API entry checks](api.md#entry-checks-for-the-string-apis-type-registry).

## RemoteSchema
Entry

One remote expose declaration.

Import from: `@fulgurjs/federation/react`, `@fulgurjs/federation/runtime`, `@fulgurjs/federation/vue`.

| Field | Optional | Type | Contract |
|---|---|---|---|
| `exposes` | no | `string[]` | See the owning API for lifecycle and runtime defaults. |
| `exists` | yes | `boolean` | See the owning API for lifecycle and runtime defaults. |

## FgRemoteTypes — remote type registry

The **augmentable interface** shared by all three entries (`/runtime`, `/vue`, `/react`). Its single declaration lives in a static shared file inside the package (the `./internal/registry.js` subpath pointing at `types/registry.d.ts`) — the host-generated `src/fulgurjs/types/<remote>/registry.d.ts` augments it with `'<remote>/<expose>': typeof import('<remote>/<expose>')`. Never implement or extend this interface by hand: its members come entirely from the plugin's synced output.

| Type | Meaning |
|---|---|
| `FgRemoteTypes` | Entry string → module namespace type registry. Empty while no types are synced (all literals pass with `unknown` results) |
| `FgStaticEntry<S>` | Static check on string-API parameters (empty-registry/dynamic pass; registered literals narrow to themselves; unregistered literals get an error type carrying the fix text, failing at the call site) |
| `FgRemoteModule<S>` | The module type for an entry: registered → module namespace; unsynced/dynamic → `unknown` |

Framework-entry check types (re-exported by `/vue` and `/react`): `FgComponentEntry<S>` (remoteComponent accepts only exposes whose default export is a component), `FgBridgeEntry<S>` (bridge factories accept only a `defineBridgeApp` default export), `FgBridgeAppProps<S>` (bridge props extracted from the provider's declaration), `FgRemoteVueComponent<S>` / `FgReactRemoteProps<S>` (real remote component/props types), `FgVueBridgeWrapper<S>` (the Vue bridge wrapper component). Semantics and limits: [API reference · string-API entry checks](api.md#entry-checks-for-the-string-apis-type-registry).

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
| `loadingComponent` | yes | `Component` | See the owning API for lifecycle and runtime defaults. |
| `errorComponent` | yes | `Component` | See the owning API for lifecycle and runtime defaults. |
| `retries` | yes | `number` | See the owning API for lifecycle and runtime defaults. |
| `delay` | yes | `number` | See the owning API for lifecycle and runtime defaults. |
| `timeout` | yes | `number` | See the owning API for lifecycle and runtime defaults. |

## HostPagesOptions

Vue host page adapter options.

Import from: `@fulgurjs/federation/vue`.

| Field | Optional | Type | Contract |
|---|---|---|---|
| `beforeLoad` | yes | `() => void \| Promise<void>` | See the owning API for lifecycle and runtime defaults. |
| `loadingComponent` | yes | `Component` | See the owning API for lifecycle and runtime defaults. |
| `errorComponent` | yes | `Component` | See the owning API for lifecycle and runtime defaults. |
| `delay` | yes | `number` | See the owning API for lifecycle and runtime defaults. |
| `pages` | no | `PageRouteLike[]` | See the owning API for lifecycle and runtime defaults. |
| `remotePrefixes` | no | `Record<string, string>` | See the owning API for lifecycle and runtime defaults. |
| `deriveSpec` | yes | `(route: string) => string` | See the owning API for lifecycle and runtime defaults. |
| `schema` | yes | `Record<string, RemoteSchemaEntry>` | See the owning API for lifecycle and runtime defaults. |
| `strict` | yes | `boolean` | See the owning API for lifecycle and runtime defaults. |
| `base` | yes | `string` | See the owning API for lifecycle and runtime defaults. |

## HostPages

Vue page resolution and component factory.

Import from: `@fulgurjs/federation/vue`.

| Field | Optional | Type | Contract |
|---|---|---|---|
| `pages` | no | `PageRouteLike[]` | See the owning API for lifecycle and runtime defaults. |
| `resolve` | no | `(path: string) => ResolvedHostPage` | See the owning API for lifecycle and runtime defaults. |
| `component` | no | `(spec: string) => Component` | See the owning API for lifecycle and runtime defaults. |
| `keepAliveNames` | no | `string[]` | See the owning API for lifecycle and runtime defaults. |

## ResolvedHostPage

Resolved page and extracted path parameters.

Import from: `@fulgurjs/federation/react`, `@fulgurjs/federation/vue`.

| Field | Optional | Type | Contract |
|---|---|---|---|
| `page` | no | `PageRouteLike` | See the owning API for lifecycle and runtime defaults. |
| `remote` | no | `string` | See the owning API for lifecycle and runtime defaults. |
| `spec` | no | `string` | See the owning API for lifecycle and runtime defaults. |
| `params` | no | `Record<string, string>` | See the owning API for lifecycle and runtime defaults. |

## BridgeApp

Remote application mount/unmount contract.

Import from: `@fulgurjs/federation/react`, `@fulgurjs/federation/vue`.

| Field | Optional | Type | Contract |
|---|---|---|---|
| `mount` | no | `(el: HTMLElement, props?: Record<string, unknown>, options?: BridgeMountOptions) => void \| Promise<void>` | See the owning API for lifecycle and runtime defaults. |
| `unmount` | no | `(el: HTMLElement) => void` | See the owning API for lifecycle and runtime defaults. |
| `routing` | yes | `BridgeRoutingProtocol` | See the owning API for lifecycle and runtime defaults. |

## VueBridgeAppFactory

Factory creating an independent Vue application.

Import from: `@fulgurjs/federation/vue`.

```ts
export type VueBridgeAppFactory = ( props: Record<string, unknown>, ctx?: VueBridgeAppContext, ) => VueApp | Promise<VueApp>
```

## VueBridgeAppOptions

Vue host bridge loading and context options.

Import from: `@fulgurjs/federation/vue`.

| Field | Optional | Type | Contract |
|---|---|---|---|
| `loadingComponent` | yes | `Component` | See the owning API for lifecycle and runtime defaults. |
| `errorComponent` | yes | `Component` | See the owning API for lifecycle and runtime defaults. |
| `retries` | yes | `number` | See the owning API for lifecycle and runtime defaults. |
| `timeout` | yes | `number` | See the owning API for lifecycle and runtime defaults. |
| `getContext` | yes | `() => Partial<AppContext> & Record<string, unknown>` | See the owning API for lifecycle and runtime defaults. |

## VueBridgeRouterConnection

Vue child memory router connection, readiness and disposal.

Import from: `@fulgurjs/federation/vue`.

| Field | Optional | Type | Contract |
|---|---|---|---|
| `ready` | no | `Promise<void>` | See the owning API for lifecycle and runtime defaults. |
| `dispose` | no | `() => void` | See the owning API for lifecycle and runtime defaults. |

## BridgeHostRouting

Host navigation port and child route prefix.

Import from: `@fulgurjs/federation/react`, `@fulgurjs/federation/vue`.

| Field | Optional | Type | Contract |
|---|---|---|---|
| `basePath` | no | `string` | See the owning API for lifecycle and runtime defaults. |
| `navigation` | no | `BridgeHostNavigation` | See the owning API for lifecycle and runtime defaults. |

## ReactBridgeAppOptions

React host bridge loading and context options.

Import from: `@fulgurjs/federation/react`.

| Field | Optional | Type | Contract |
|---|---|---|---|
| `fallback` | yes | `ReactNode` | See the owning API for lifecycle and runtime defaults. |
| `error` | yes | `ReactNode \| BridgeErrorFallback` | See the owning API for lifecycle and runtime defaults. |
| `retries` | yes | `number` | See the owning API for lifecycle and runtime defaults. |
| `timeout` | yes | `number` | See the owning API for lifecycle and runtime defaults. |
| `getContext` | yes | `() => Partial<AppContext> & Record<string, unknown>` | See the owning API for lifecycle and runtime defaults. |

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
| `fallback` | yes | `ReactNode` | See the owning API for lifecycle and runtime defaults. |
| `error` | yes | `ReactNode \| RemoteErrorFallback` | See the owning API for lifecycle and runtime defaults. |
| `retries` | yes | `number` | See the owning API for lifecycle and runtime defaults. |
| `timeout` | yes | `number` | See the owning API for lifecycle and runtime defaults. |

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
| `shareScope` | yes | `string` | See the owning API for lifecycle and runtime defaults. |
| `retries` | yes | `number` | See the owning API for lifecycle and runtime defaults. |
| `fallbackModule` | yes | `() => any` | See the owning API for lifecycle and runtime defaults. |

## UseLoadRemoteResult

React hook data, error, loading state and reload.

Import from: `@fulgurjs/federation/react`.

| Field | Optional | Type | Contract |
|---|---|---|---|
| `data` | no | `Module` | See the owning API for lifecycle and runtime defaults. |
| `error` | no | `unknown` | See the owning API for lifecycle and runtime defaults. |
| `loading` | no | `boolean` | See the owning API for lifecycle and runtime defaults. |
| `reload` | no | `() => Promise<void>` | See the owning API for lifecycle and runtime defaults. |

## RemoteErrorBoundaryProps

React rendering error boundary props.

Import from: `@fulgurjs/federation/react`.

| Field | Optional | Type | Contract |
|---|---|---|---|
| `children` | yes | `ReactNode` | See the owning API for lifecycle and runtime defaults. |
| `fallback` | yes | `ReactNode \| ((args: { error: unknown; reset: () => void; }) => ReactNode)` | See the owning API for lifecycle and runtime defaults. |
| `onError` | yes | `(error: unknown, info: ErrorInfo) => void` | See the owning API for lifecycle and runtime defaults. |
| `resetKeys` | yes | `readonly unknown[]` | See the owning API for lifecycle and runtime defaults. |

## ReactHostPagesOptions

React host page adapter options.

Import from: `@fulgurjs/federation/react`.

| Field | Optional | Type | Contract |
|---|---|---|---|
| `beforeLoad` | yes | `() => void \| Promise<void>` | See the owning API for lifecycle and runtime defaults. |
| `fallback` | yes | `ReactNode` | See the owning API for lifecycle and runtime defaults. |
| `error` | yes | `ReactNode \| RemoteErrorFallback` | See the owning API for lifecycle and runtime defaults. |
| `retries` | yes | `number` | See the owning API for lifecycle and runtime defaults. |
| `timeout` | yes | `number` | See the owning API for lifecycle and runtime defaults. |
| `pages` | no | `PageRouteLike[]` | See the owning API for lifecycle and runtime defaults. |
| `remotePrefixes` | no | `Record<string, string>` | See the owning API for lifecycle and runtime defaults. |
| `deriveSpec` | yes | `(route: string) => string` | See the owning API for lifecycle and runtime defaults. |
| `schema` | yes | `Record<string, RemoteSchemaEntry>` | See the owning API for lifecycle and runtime defaults. |
| `strict` | yes | `boolean` | See the owning API for lifecycle and runtime defaults. |
| `base` | yes | `string` | See the owning API for lifecycle and runtime defaults. |

## ReactHostPages

React page resolution and component factory.

Import from: `@fulgurjs/federation/react`.

| Field | Optional | Type | Contract |
|---|---|---|---|
| `pages` | no | `PageRouteLike[]` | See the owning API for lifecycle and runtime defaults. |
| `resolve` | no | `(path: string) => ResolvedHostPage` | See the owning API for lifecycle and runtime defaults. |
| `component` | no | `<P = Record<string, unknown>>(spec: string) => ComponentType<P>` | See the owning API for lifecycle and runtime defaults. |

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
