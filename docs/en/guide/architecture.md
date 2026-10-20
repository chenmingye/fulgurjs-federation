# System architecture: from integration to browser execution

These figures help choose an integration shape and understand execution boundaries. Components, per-page integration and full-app bridging are parallel paths; none requires all three. Consult the [configuration reference](../reference/configuration.md), [API reference](../reference/api.md) and individual guides for parameter/error contracts.

[Download the offline HTML atlas](../../diagrams/architecture.en.html) · [中文](../../zh/guide/architecture.md)

## 1. Overview and recommended paths

![System architecture: local tools, resource serving and browser execution with three parallel integration paths](../../diagrams/overview.en.svg)

[Open full SVG](../../diagrams/overview.en.svg) · [High-resolution PNG](../../diagrams/overview.en.png)

| Need | Recommended entry | Ownership |
|---|---|---|
| Reuse another app’s component/function | exposes + remoteComponent / loadRemote | Components render in their own framework; no page table or full-app bridge required |
| Host owns routes for a remote page collection | createHostPages / createReactHostPages | Host owns the page table, menus and routing; adapters load the mapped expose |
| Full app retains its navigation/state | defineApplication + host bridge factory | One standalone/embedded assembly; child owns its root/router/stores |
| Bridge-only contract | defineBridgeApp + host bridge factory | Factory runs per mount; no extra standalone entry is required |

Hosts and remotes register the plugin, develop and build in their own Vite projects. One plugin node represents common capabilities, not a plugin instance shared across processes. serve supplies development endpoints; production artifacts are served over HTTP/CDN. Remote code executes in the consuming browser; the plugin provides neither hosting nor a business backend.

The browser page shares a runtime core, share registry and AppContext. Components and bridged apps are not all singletons. Contract modules can be cached, while mounted instances are keyed by DOM container and generation. shared negotiates libraries; business-store ownership, sharing and isolation require explicit assembly.

Providers, global components/directives and Pinia ownership do not automatically transfer from the provider’s original app root. Prefer federation exposes for fixed form interfaces; use business getContext loaders when different hosts supply implementations to the same child. See [component decision rules](components-and-modules.md#providing-host-components-to-a-child-recommendation-and-decision-rules).

These paths execute in the same browser realm, without a JS/CSS sandbox; styles and global variables can affect one another. Use full-app bridging for cross-framework UI: ordinary component loading does not convert Vue components into React components or vice versa. See [compatibility and limitations](../troubleshooting/compatibility.md).

## 2. Module loading, initialization and session deduplication

![Module flow: parallel resource preparation, setup, onSession validation/deduplication, environment delivery, cache and rendering](../../diagrams/loading.en.svg)

[Open full SVG](../../diagrams/loading.en.svg) · [High-resolution PNG](../../diagrams/loading.en.png)

This flow uses a complete module entry, loadRemote('remote/expose'). Bare loadRemote('remote') retrieves the container without setup/onSession. Explicit preloadRemote prepares resources without business-module execution or initialization.

- A default setup function runs once per successfully initialized **remote container**—the remote entry’s container, not a DOM mounting element. Environment declarations can be read without a default function; absent setup metadata skips the initialization phase.
- Declared onSession requires a valid non-empty sessionKey. Missing/invalid values produce MFU-013 and fail this load, rather than silently skipping initialization.
- A successful/in-flight generation reuses its result/Promise. New generations rerun session work, and failed phases can retry. Cached-module accesses still check the session; they do not rerun successful same-generation onSession each time.
- Runtime installs Vue globals for the actual consumer and delivers Provider declarations; component adapters resolve/wrap required Providers before rendering. Manual loadRemote does not wrap a component tree. Applications still own framework compatibility, permissions and business data.
- prefetch does not automatically schedule idle time, and injected stylesheets can affect the current page. Module load, first root commit and business API completion are distinct stages.

## 3. Full application mount, generation change and unmount

![Full-app lifecycle: define contract, invoke factory inside mount, first commit, invalidation and actual unmount, logout empty state and new-generation remount](../../diagrams/lifecycle.en.svg)

[Open full SVG](../../diagrams/lifecycle.en.svg) · [High-resolution PNG](../../diagrams/lifecycle.en.png)

defineApplication(factory) / defineBridgeApp(factory) defines a contract without immediately invoking the business factory. Hosts load the contract and call mount; standalone application.start enters the corresponding standalone mount internally. **The factory runs inside mount**, creating this app/root, router, stores and plugins; the plugin does not automatically rewrite business stores into isolated instances.

The session-change/logout branches apply to host bridges with session control enabled. Public applications may omit session configuration; standalone applications are unmounted explicitly by business code.

First root commit establishes mounting success, not completion of all API requests, lazy pages or authorization data. Leaving during initialization invalidates the generation too; late results cannot revive the DOM. Business async writes must still observe their own signal/instance state.

| Trigger | Behavior |
|---|---|
| Same-identity token rotation or ordinary top-level appProps replacement | Neither automatically remounts; appProps is a mount snapshot, while live data needs stable getters/subscriptions |
| Logout sessionKey=null or host view removal | Invalidate and actually unmount; remain empty without loading or automatic remount |
| Valid new generation while the host still needs the app | Unmount the old instance first; after successful cleanup initialize/load and mount the new generation, reusing successful modules |
| unmount throws | Lock that DOM container; same-page retry/generation changes cannot bypass it. Fix cleanup and refresh the page to recover |

Normal Vue login bridges should use a reactive session identity getter, with plugin-managed generations. React or explicit-control integrations supply sessionKey. Do not combine both modes. Same-page controlled bridges share one session; distinct storage keys do not isolate multiple simultaneous accounts. See [session contracts](app-bridge.md#session-sessionkey-and-appcontext).

URL sync is optional: the host owns browser history and the embedded child uses a controlled memory router, with both sides wired. Standalone mode uses ordinary web/hash routing. The plugin does not convert arbitrary web routers to memory. See [URL sync](url-sync.md).

## 4. Implementation and maintenance

| Responsibility | Source |
|---|---|
| Dev/build integration, virtual modules and import transforms | [index.ts](../../../packages/plugin/src/index.ts), [virtual.ts](../../../packages/plugin/src/virtual.ts), [transform.ts](../../../packages/plugin/src/transform.ts) |
| Remote containers, sharing, setup/onSession, module cache and preload | [runtime/index.ts](../../../packages/plugin/src/runtime/index.ts) |
| Public entries and assembly of the three consumption paths | [vue.ts](../../../packages/plugin/src/vue.ts), [react.ts](../../../packages/plugin/src/react.ts), [host-pages-core.ts](../../../packages/plugin/src/host-pages-core.ts) |
| Page-level snapshot context | [context.ts](../../../packages/plugin/src/context.ts) |
| Unified application, contracts and host lifecycle | [application-core.ts](../../../packages/plugin/src/application-core.ts), [bridge-app-vue.ts](../../../packages/plugin/src/bridge-app-vue.ts), [bridge-app-react.ts](../../../packages/plugin/src/bridge-app-react.ts), [bridge-host-vue.ts](../../../packages/plugin/src/bridge-host-vue.ts), [bridge-host-react.ts](../../../packages/plugin/src/bridge-host-react.ts) |
| Automatic sessions and optional routing channels | [bridge-session-auto.ts](../../../packages/plugin/src/bridge-session-auto.ts), [bridge-router-core.ts](../../../packages/plugin/src/bridge-router-core.ts) |

See [figure maintenance](../../diagrams/README.md) for source, regeneration and export rules. Images and offline HTML use one source, without private business code, credentials or acceptance environments. These mechanism diagrams show normal and marked failure branches; they do not replace compatibility, recovery or deployment acceptance in a real application.
