# Remote page integration (per-page pages)

> Scenario: the host has a set of routes, and each route's content is a page component exposed by some remote app. Corresponds to the 6.0.0 entries: Vue imports `definePages`/`createHostPages`/`remoteSchema` from `@fulgurjs/federation/vue`; React imports `definePages`/`createReactHostPages`/`remoteSchema` from `@fulgurjs/federation/react`.
>
> The boundary first: **per-page pages are an optional capability**. Loading ordinary components needs no page table; full sub app bridging also does not register internal pages — business menus and the business Router stay app-owned (see the end of this document).

## Overall structure: one dataset, two consumers

The page table is a **pure data module** (e.g. `src/fulgurjs/host/pages.data.ts`) consumed in two places:

1. Runtime: `createHostPages`/`createReactHostPages` use it to generate page components and the resolver;
2. CLI: `fulgurjs.config.ts` references the same data through the `hostPages` named export, for `check-pages`/`explain` to verify.

The single hand-maintained location is this data module; runtime and CLI always see the same table.

```ts
// src/fulgurjs/host/pages.data.ts — pure data, imports no remote code (zero build-time cost)
export const remotePrefixes = { '/remote-a/': 'remote-a' }

export const pages = [
  { route: '/remote-a/home', name: 'RemoteAHome', title: 'Home' },
  { route: '/remote-a/detail/:id', name: 'RemoteADetail', spec: 'pages/remote-a/detail', title: 'Detail' },
]
```

<a id="define-pages"></a>

## ① Define the page table: `definePages`

`definePages(pages, options?)` validates the "URL path → remote exposes key" mapping at **startup**, so silent conflicts of parameterized routes fail at startup instead of loading the wrong component at runtime:

```ts
import { definePages, remoteSchema } from '@fulgurjs/federation/vue'   // React: same names from /react

export const PAGES = definePages(
  [
    { route: '/remote-a/home', name: 'RemoteAHome', title: 'Home' },
    // Parameterized route: by default spec is derived as drop the first segment + strip :param segments;
    // when the derivation collapses onto another entry that is an ERROR; point at a dedicated expose with an explicit spec
    { route: '/remote-a/detail/:id', name: 'RemoteADetail', spec: 'pages/remote-a/detail', title: 'Detail' },
  ],
  {
    deriveSpec: (route) => 'pages/' + route.replace(/^\//, '').split('/').filter(s => !s.startsWith(':')).join('/'),
    remotes: { '/remote-a/': 'remote-a' },   // route prefix → remote name
    schema: remoteSchema,                    // { [remoteName]: { exposes: string[], exists?: boolean } }
    strict: true,                            // ERROR throws by default; false downgrades to console.error
  },
)
```

`remoteSchema` is the remote exposes probe result that the plugin fills in automatically during dev; in build it is always an empty table (honest degradation — the build does not know the remote's exposes and skips the R3 check).

Validation rules (R1–R5):

| Rule | Level | Content |
|---|---|---|
| R1 | ERROR | A parameterized route (without an explicit spec) derives a spec that collapses onto another entry — would silently load the wrong component |
| R2 | WARN | Multiple entries have an identical effective spec (intentional menu aliases can be ignored) |
| R3 | ERROR | The spec is not in that remote's exposes list (checked in dev when a schema exists; honestly skipped when the remote is unreachable) |
| R4 | ERROR | A static route is shadowed by an earlier parameterized route (first match wins) / routes fully duplicate |
| R5 | WARN | Duplicate name (ambiguous named navigation) |

`validatePages(pages, options?)` is a standalone export: it returns the violation list without throwing, useful for self-testing.

<a id="page-adapters"></a>

## ② Generate the page adapters

**Vue: `createHostPages(options)`** (`@fulgurjs/federation/vue`):

```ts
import { createHostPages, type PageEntry } from '@fulgurjs/federation/vue'
import { pages, remotePrefixes } from './pages.data'

export const hostPagesRuntime = createHostPages({
  pages,
  remotePrefixes,                    // required; longest-prefix match
  base: '/main',                     // optional; site base prefix stripped during resolve
  beforeLoad: () => { /* runs before each actual page module load; the host provides the latest context here */ },
  loadingComponent: MySkeleton,      // optional; no skeleton by default
  errorComponent: MyError,           // optional; default = built-in three-part error placeholder
  delay: 200,                        // optional; skeleton delay in ms
})
```

Returned members:

| Member | Description |
|---|---|
| `pages` | The original page records (unmodified; use directly for host route registration) |
| `resolve(path)` | `{ page, remote, spec, params } \| null` — aware of the base prefix and deep links; a param decoding failure only fails that match (console hint), never throws |
| `component(spec)` | Async page component (full `<remote>/<exposes key>` spec); reused per spec; **session-aware**: when `AppContext.sessionKey` changes, the component is rebuilt automatically and the next render goes through `beforeLoad → loadRemote` again, triggering a new `onSession` generation (the module itself is reused from cache, no re-download) |
| `keepAliveNames` | Component names of pages with `keepAlive: true`, bind directly to `<keep-alive :include>` |

Behavior contract:

- The page table is validated by `definePages` (R1–R5), same behavior as standalone use;
- `remotePrefixes` uses **longest-prefix-first**; a page route without a matching prefix errors at creation (fail fast);
- The component is a local wrapper component (stable name for KeepAlive matching) and does not modify the component object exported by the remote module; attrs/slots are passed through in full;
- Load order: `beforeLoad` → optional remote `setup`/`onSession` → page module; failures enter the error state (explicit error code/root cause/fix) with no silent fallback;
- Page-level keep-alive: add `keepAlive: true` to a page entry (off by default, cache cap max=8 LRU); if a kept-alive page registers window-level listeners/timers/context back-registrations, it must clean them up inside the component (a kept-alive page only unmounts when evicted by the LRU).

**React: `createReactHostPages(options)`** (`@fulgurjs/federation/react`):

```tsx
import { createReactHostPages } from '@fulgurjs/federation/react'
import { pages, remotePrefixes } from './pages.data'

const hostPages = createReactHostPages({
  pages,
  remotePrefixes,
  // Data items (pages/remotePrefixes/deriveSpec/schema/strict/base) are identical to Vue
  fallback: <Spinner />,             // display items share remoteComponent's semantics
  error: (err, retry) => <ErrorBox error={err} onRetry={retry} />,
  beforeLoad: () => { /* runs before each actual load attempt so the host can refresh context; not run at page-table creation */ },
})

// The routing layer creates the routes itself (the plugin ships no Router): React Router 7 example
// <Route path="/remote-a/home" element={createElement(hostPages.component('pages/remote-a/home'))} />
// Parameterized routes read params via useParams/useSearchParams and pass them as props to the component(spec) output
```

- Shares the same page-table data and the same `definePages` R1–R5 validation as the Vue side; `resolve(path)` behaves identically (base stripping, longest prefix, param decoding, query/hash, returns `null` on no match);
- `component(spec)` returns a React component type; the routing layer renders it with JSX/`createElement` (no `.element()` alias is provided);
- Component cache is reused per spec and login generation; rebuilt **only when a new non-empty `sessionKey` arrives** (logout to `undefined` does not rebuild); no `keepAliveNames` (no keep-alive promise).

## ③ Hand the page table to the CLI: the `hostPages` named export

In `fulgurjs.config.ts`, reference the same data module via a named export (this is not a parameter of `federation()`; only the CLI reads it):

```ts
import type { FederationOptions } from '@fulgurjs/federation'
import { pages, remotePrefixes } from './src/fulgurjs/host/pages.data'

export default {
  name: 'demo-host',
  remotes: { 'remote-a': { dev: 'http://localhost:5174/remote-a', prod: '/remote-a' } },
  shared: { vue: { singleton: true } },
} satisfies FederationOptions

// ── The named exports below are read only by CLI explain/check-pages ──
export const hostPages = { pages, remotePrefixes }
```

Then verify the page contract:

```bash
npx fulgurjs check-pages --site https://your-site
# Or specify each remote's manifest source explicitly (repeatable):
npx fulgurjs check-pages --manifest remote-a=./dist/remote-a/fulgurjs-manifest.json
npx fulgurjs check-pages --manifest remote-a=https://cdn.example.com/remote-a/fulgurjs-manifest.json
```

- What is checked: host page table ↔ remote manifest exposes; reports unknown remotes, mappings to unconsumed remotes, missing exposes, and route conflicts (R1–R5);
- Manifest source precedence: `--manifest` (repeatable, file path or URL) > `--site`/derived from the consumer's prod address; **an explicit source failing does not fall back** (no local dist fallback), and the actually hit source is printed per remote, preventing a stale local dist from standing in for the live check;
- Projects without `hostPages` configured get an explicit "not applicable" message from check-pages — no fake verification is produced; an unreachable remote reports "cannot verify";
- Exit codes: deterministic errors are 1; with `--require-verified`, "cannot verify" is also non-zero (strict CI mode, avoiding a zero-check pass); `--json` for CI.

## Business menus and business routers belong to the app itself

This boundary decides "do I need a page table":

| Integration form | Page table / hostPages / check-pages | Who owns routing |
|---|---|---|
| Loading ordinary components/modules (`remoteComponent`/`loadRemote`) | Not needed | The app itself |
| Per-page pages (host route table → remote pages) | **Needed** (this document) | The host owns the route table, mapped one by one to remote exposes |
| Full sub app bridge (`createVueBridgeApp`/`createReactBridgeApp`) | **Not needed** | The child app keeps its own Router and business menus; the host only configures the mount prefix (`basePath`) and the entry; see [sub app bridge](app-bridge.md) and [URL sync](url-sync.md) |

Decision rule: if the remote is a **collection of pages** (the host controls menus and routes one by one) → per-page pages; if the remote is a **complete app** (with its own navigation/router/store) → bridge it, and **do not register its internal pages** — under bridge mode `check-pages` is not a mandatory step.

Complete runnable example: [examples/demos/pages-cli](https://github.com/chenmingye/fulgurjs-federation/tree/master/examples/demos/pages-cli) (Vue; covers definePages/createHostPages/remoteSchema/requireAppContext and all CLI commands).
