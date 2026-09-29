# fulgurjs-federation Examples

Pick your framework, copy the host and remote directories, run `npm install`, and you get a full module federation demo. All four projects are standalone: no dependency on this repo's source, the monorepo workspace, or any parent `node_modules` — the plugin dependency is an exact published version from the npm registry.

## Vue (host 5214 / remote 5213)

Full walkthrough: **[vue/README.md](./vue/README.md)** (Chinese).

```bash
cd examples/vue/remote && npm install && npm run dev   # terminal 1: vue-remote, http://localhost:5213
cd examples/vue/host   && npm install && npm run dev   # terminal 2: vue-host,   http://localhost:5214
```

## React (host 5204 / remote 5203)

Full walkthrough: **[react/README.md](./react/README.md)** (Chinese).

```bash
cd examples/react/remote && npm install && npm run dev   # terminal 1: react-remote, http://localhost:5203
cd examples/react/host   && npm install && npm run dev   # terminal 2: react-host,   http://localhost:5204
```

## What each pair demonstrates

- A clickable remote counter component (local state lives inside the remote component; operated on the host page)
- Cross-application plain TS module calls (the host renders real return values)
- A remote home page plus a parameterized detail page (deep links survive refresh)
- Host navigation with route-level lazy loading (the home page never bulk-prefetches unvisited remote pages)
- The plugin's built-in loading/error placeholders and recovery actions (**Retry load** recovers in-page; **Refresh page to retry** recovers via a user-initiated full reload)
- Production build with a minimal Nginx deployment (including SPA fallback)

## Layout

```text
examples/
├── README.md / README.en.md   # this entry (CN/EN)
├── vue/
│   ├── README.md              # guide for the Vue pair
│   ├── host/                  # Vue host (vue-host, 5214)
│   └── remote/                # Vue remote (vue-remote, 5213)
└── react/
    ├── README.md              # guide for the React pair
    ├── host/                  # React host (react-host, 5204)
    └── remote/                # React remote (react-remote, 5203)
```

> `examples/` is for users to copy and run. The repository-root `fixtures/` are internal regression harnesses (source-linked to the plugin workspace) — do not treat them as usage templates.
