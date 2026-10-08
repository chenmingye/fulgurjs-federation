# Supported scope and real limitations

> "Tested and passing" does not mean "guaranteed for every project". This page states the current support surface, the real limitations, and the cross-framework boundaries, so tested scenarios are never inflated into universal promises. For the full capability comparison against webpack MF see [maintainers · webpack MF comparison (Chinese)](../../maintainers/webpack-mf-对照与缺口.md).

## Version support

| Dimension | Supported range | Notes |
|---|---|---|
| Vite | The 5 / 6 / 7 / 8 series from 5.1 up | Full fixture matrix tested: 5.1.4 / 5.2.12 / 6.4.3 / 7.3.6 / 8.3.0 dev+prod e2e passing; Vite 8 (Rolldown) dev 73/73 + prod 33/33 is a permanent CI matrix entry. A project must satisfy both its Vite's and the framework plugin's version requirements |
| Node.js | Plugin itself ≥ 18; **Vite 7/8 requires 20.19+ or 22.12+** | Node cannot be chosen by the plugin's minimum version alone; template projects validate against `engines.node` (≥ 20.19.0) |
| Vue | 3.2+ (browser side) | Ordinary projects have zero vue-router dependency; URL sync references vue-router on demand |
| vue-router | 4.1 – 5.x | Used only by URL sync (`createVueBridgeNavigation`/`connectVueBridgeRouter`); history and hash modes both work |
| React | 18 / 19 (browser side) | Ordinary projects have zero react-router-dom dependency; react-dom and React versions must be compatible |
| react-router-dom | 6.11 – 7.x | Used only by URL sync; **the host supports the data router only** (`createBrowserRouter`/`createHashRouter` + `RouterProvider`); declarative mode (BrowserRouter) is not supported; ≥ 6.11 (`createMemoryRouter`) |
| Browser baseline | Chrome 108+ | Needs the corresponding ESM, dynamic import, and top-level await support |
| Build target | `es2022` or newer | Lower targets fail the build with `BLD-002` (TLA needs it) |
| Platform scope | macOS and Linux (CI) tested | The template launcher has Windows fallback paths but they are unverified |

## Supported capability surface

- Browser-side component/module/page federation (Vue↔Vue, React↔React, pure TS consumed across frameworks);
- **Sub app level** bidirectional bridging: Vue 3 host ↔ React 18/19 child app, React host ↔ Vue 3 child app;
- Sub app routes ↔ host URL sync (explicit opt-in);
- Shared version negotiation (singleton/requiredVersion/strictVersion/eager/shareKey/multiple shareScopes);
- Dynamic remotes (registerRemote / promise remote), timeout/retries/breaker/explicit fallback;
- dts type passthrough, manifest preloading, the setup/onSession lifecycle, and CLI project assistance.

## Explicitly not provided

| Capability | Notes |
|---|---|
| SSR / RSC / Node server-side federation / Next.js full stack | Browser client only |
| Interop with webpack `script`/`var` containers | Artifacts are always ESM remotes; `remoteType`/`library` were removed (passing them reports CFG-011) |
| Direct mixed rendering of Vue/React components | No component type conversion layer — **components can load across frameworks** (a Vue app can loadRemote a pure TS module, and so can a React app), but **Vue↔React component mixed rendering is not supported**: Vue's `remoteComponent` cannot render a React component and vice versa. Cross-framework goes through the sub app bridge (each side manages its own component tree) |
| JS sandbox / automatic CSS isolation | Same-realm coexistence + dependency-level isolation (see the [sandbox boundary audit (Chinese)](../../maintainers/沙箱边界审计.md)); global styles and `:root` variables can still affect each other |
| A standalone browser DevTools extension | The `window.__FULGURJS_SCOPE__` / `__FULGURJS_INFO__` debug surfaces are provided |
| React page KeepAlive | No component state keep-alive promise (module reuse is not state keep-alive); Vue's `keepAlive` is an optional page-level capability |
| Built-in adapters for other frameworks and router libraries | URL sync has built-in Vue Router / React Router data router support; other libraries can implement the `BridgeHostNavigation`/`BridgeChildRoute` ports |

## Real limitations (counterintuitive points)

| Limitation | Boundary | Handling |
|---|---|---|
| Same-page retry cannot recover after a static dependency chunk of an expose fails | The browser's module map cached the failure for that dependency URL; entry/dynamic-load boundaries under plugin control can retry via URL changes, but arbitrary dynamic dependencies are not guaranteed | The default error placeholder provides "Refresh page" (user click, keeping the current address, never automatic); no site-wide dependency graph recursive rewriting. This is a limitation of the current native ESM loading path, not a limitation shared with webpack MF |
| Vite 8 downloads extra files in some shared scenarios | The synchronous consumer facade may pull an unadopted local copy into the module graph (tested dual-version scenario ≤2 copies; not an upper bound for every app graph) | Distinguish network file counts from runtime instance counts; instance identity within the same singleton scope is still unified |
| Dev cold-start pre-bundling window | New dependency discovery may trigger re-pre-bundling + full reload (DEV-010, transient in the first 30–60s) | Warm the page before asserting; not a production limitation |
| singleton does not convert framework ABIs | React 18's renderer is not made compatible with React 19 by singleton negotiation | Align versions, or split shareScopes to isolate the whole dependency group plus its consumers |
| Synchronous consumers meeting async shared arbitration | With runtimePlugins configured and async hooks, an unprepared synchronous facade reports MFU-004 | In custom entries `await loadShare` before dynamically importing the consumer; already-evaluated static bindings cannot be rewritten retroactively |
| Bridge appProps is a mount snapshot | Top-level fields are shallow-copied; later top-level replacements do not re-render the child app | Stable callbacks / a shared store / an explicit remount with a new key |
| A bridge host's error boundary cannot catch child app internal errors | Render errors across roots belong to the child app's own error boundary | The child app builds its own error handling |
| Multi-level bridge routing does not auto-proxy | With A→B→C, C's URL sync is configured by B acting as a host itself | Each level is configured independently; no multi-level route proxying |

## How to verify

For any "is X supported" question, the fastest verification path:

1. Check [webpack MF comparison · capabilities currently not provided (Chinese)](../../maintainers/webpack-mf-对照与缺口.md);
2. Check whether a demo covers it ([examples and templates](../guide/examples.md));
3. Test with a minimal fixture (the fixtures/e2e infrastructure is reusable inside the repository; see [maintainers · testing (Chinese)](../../maintainers/testing.md)).
