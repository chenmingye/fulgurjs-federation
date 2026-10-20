# Deployment guide

> Remote and host build and deploy independently (same-domain subdirectories or separate domains both work). Only four things must be right on the deployment side: base alignment, entry no-cache, SPA fallback that never swallows JS, and CORS pass-through. `fulgurjs doctor` checks some observable endpoint conditions; real pages, sessions, the complete asset graph and business interactions still require browser acceptance.

## Artifacts and endpoints

After `pnpm build` / `npm run build`, the remote dist emits two federation files by default (filename is configurable, manifest may be disabled, and dts resources are additional):

| Environment | Path | Notes |
|---|---|---|
| dev | `/<base>/@fulgurjs-entry.js` | Remote container entry (served directly by plugin middleware, self-contained) |
| dev | `/<base>/@fulgurjs-manifest.json` | Dev manifest (consumed by host type sync / preloadRemote; carries the types descriptor when dts is on) |
| prod | `/<base>/fulgurjs-remoteEntry.js` | Fixed-filename container entry (content changes every build — **must be no-cache**) |
| prod | `/<base>/fulgurjs-manifest.json` | Expose chunk/CSS inventory (consumed by preloadRemote, **no-cache**) |

The host points at them with prod addresses in `fulgurjs.config.ts`:

```ts
import type { FederationOptions } from '@fulgurjs/federation'

export default {
  name: 'host',
  remotes: {
    'remote-a': { dev: 'http://localhost:5174/remote-a', prod: '/remote-a' },
  }
} satisfies FederationOptions
```

For a directory address such as 'http://localhost:5101', dev appends @fulgurjs-entry.js and prod appends the configured filename. A complete .js URL (optionally with query) is used verbatim in either environment. When a remote customizes filename, prefer its complete prod entry URL; the consumer cannot infer the remote build configuration.

## Build targets and existing TLA wrappers

The Rollup build pipeline may retain top-level `await` in asynchronous shared facades. Select an actual supported browser target in Vite (usually `build.target: 'es2022'`), rather than changing only the tsconfig target. See the [Vite build guide](https://vite.dev/guide/build.html).

If an existing project uses a TLA downlevel wrapper, verify its combination with the current Vite and federation output. Preserve parsing errors and compare the same dependency tree with only the wrapper toggled. Supporting older browsers requires testing the entire downlevel pipeline; raising the target does not establish that support.

Federation does not require disabling `build.sourcemap`. For a stack overflow in a large build, retain the failing plugin, chunk and stack, then compare `true` (external maps), `'inline'`, and `false`. Disabling maps temporarily is a workaround with a debugging cost; it does not establish a business-code root cause or a plugin fix.

## base alignment

When the remote is deployed at `/remote-a/`:

- The remote Vite build's `base` should also be `/remote-a/` (so its chunk reference paths are correct);
- The host's `prod` is configured as `/remote-a` (or a full URL);
- For the layering of `--base` and routing see [URL sync · Vite base and routing layering](url-sync.md#vite-base-and-routing-layering-subdirectory-deployment): the host Router base carries the deployment prefix, while the bridge `basePath` only expresses the business path.

## Caching: no-cache is a hard rule

`fulgurjs-remoteEntry.js`, `fulgurjs-manifest.json`, and `index.html` **must all be `Cache-Control: no-cache`** (revalidation cache); immutable/max-age long caching is strictly forbidden:

- The entry filenames are fixed while content changes every build — once a browser holds an old remoteEntry long-term, redeploying cleans up old hashed chunks and the whole site 404s (`fulgurjs doctor` FAILs directly on immutable);
- Only content-hashed `assets/*` chunks deserve long caching (`immutable, max-age=31536000`).

Put this NGINX example inside an existing `server {}`, assuming `root /srv/federation;` and files at `/srv/federation/remote-a/...`. Replace the actual filesystem path and run `nginx -t`; do not combine it with a different alias mapping. A pure consumer host without exposes/setup needs no remoteEntry rules; a host that also provides components still does.

```nginx
root /srv/federation;
location = /remote-a/fulgurjs-remoteEntry.js {
  add_header Cache-Control "no-cache" always;
  try_files $uri =404;
}
location = /remote-a/fulgurjs-manifest.json {
  add_header Cache-Control "no-cache" always;
  try_files $uri =404;
}
location = /remote-a/index.html {
  add_header Cache-Control "no-cache" always;
  try_files $uri =404;
}
# This directory must contain content-hashed assets only.
location ^~ /remote-a/assets/ {
  add_header Cache-Control "public, max-age=31536000, immutable";
  try_files $uri =404;
}
location ~* ^/remote-a/.*\.(?:js|mjs|css|json|map|wasm|woff2?|ttf|png|jpe?g|svg|ico)$ {
  add_header Cache-Control "no-cache" always;
  try_files $uri =404;
}
location /remote-a/ {
  add_header Cache-Control "no-cache" always;
  try_files $uri $uri/ @remote_a_html;
}
location @remote_a_html {
  if ($request_method !~ ^(GET|HEAD)$) { return 404; }
  if ($http_accept !~* "text/html") { return 404; }
  rewrite ^ /remote-a/index.html last;
}
```

## SPA fallback: never serve HTML for a JS request

Deep-link fallback should only apply to **page navigations**. When the fallback is too broad, a missing JS chunk/entry is answered with 200 + HTML, the browser tries to parse it as a module and fails immediately, and checking HTTP 200 alone gives a false success; doctor can detect bad content among the responses it samples. Requirements:

- Add exact matching for static asset directories (`try_files $uri =404` or a dedicated location);
- Serve remoteEntry verbatim as JS via an exact location;
- A missing asset honestly 404s.

## CORS

Cross-origin federation (separate domains, dev dual ports) requires the remote endpoints to carry `Access-Control-Allow-Origin`:

- In dev this is controlled by the plugin's `devCorsOrigins` (default `'*'`; for the allowlist array form see [configuration reference](../reference/configuration.md#devcorsorigins-three-state-examples)); explicit server.cors overrides Vite source-module CORS only; plugin entry/manifest/types endpoints still use devCorsOrigins, so align both allowlists;
- **Prod CORS is the deployment layer's (NGINX etc.) responsibility** — dev configuration never modifies production servers:

```nginx
# Merge into EVERY location serving cross-origin resources:
# remoteEntry, manifest, JS/CSS chunks, and synchronized dts resources.
add_header Access-Control-Allow-Origin "https://host.example.com" always;
add_header Vary "Origin" always;
```

CORS on remoteEntry alone is insufficient: imported JS, CSS and browser-fetched manifests must also be accessible. Merge these headers into the resource locations rather than creating duplicate locations. A child NGINX location declaring its own `add_header` normally does not inherit the parent's full header set; verify actual responses. Enforce/reflect an Origin allowlist at deployment. Use `*` only for genuinely public content without cross-origin credentials; it cannot be combined with credentialed requests.

Same-origin deployment (everything under one site's subdirectories) needs no CORS headers.

## Version skew during release windows

During a release window, old pages still hold the old remoteEntry and keep referencing old hashed chunks. To avoid "old pages suddenly breaking":

1. Upload all new hashed resources first, keeping resources still referenced by old entries, then switch manifests, entries and HTML. A new entry must not reference files that have not arrived.
2. An atomic directory switch prevents server-side file mixing; it **does not clear the ESM module cache in already-open pages**. Keep old chunks reachable at their original URLs, or use versioned resource paths and retain those releases.
3. Do not run `rsync --delete` directly against the active directory if it deletes old chunks. Sync into an inactive release directory, switch with the retention strategy above, and reclaim resources only under a defined retention/active-version policy.
4. no-cache revalidates later requests; it does not force an open page to reload. Prompt users explicitly when an update is necessary rather than automatically refreshing an editing page.

## Deployment checkup: `fulgurjs doctor`

```bash
# Basic usage: --base is the site root; --apps are deployment subdirectories under the site root (a remote at /remote-a/ is written as remote-a)
npx @fulgurjs/federation doctor --base https://your-site --apps my-app,remote-a

# Pure host (no remote entry): skip remoteEntry checks
npx @fulgurjs/federation doctor --base https://your-site --apps my-app --no-entry

# Custom entry filename / legitimately disabled manifest / no page subdirectory
npx @fulgurjs/federation doctor --base https://your-site --apps remote-a --entry my-entry.js --no-manifest --no-html

# Dev container checkup / CI JSON / sample count
npx @fulgurjs/federation doctor --base http://localhost:5174 --apps remote-a --dev --json --chunk-sample 32
```

Check items (each with three-part PASS/FAIL/WARN + symptom/root cause/fix):

- remoteEntry / manifest / index.html: 200, `Cache-Control=no-cache` (immutable is an instant FAIL), content shape (HTML instead of JS is an instant FAIL — the classic symptom of a fallback swallowing JS);
- CORS header presence (required for cross-origin deployments; same-origin gets a WARN hint);
- Hashed chunk sampling reachability (reference surface = index.html above-the-fold references > manifest exposes files > remoteEntry imports, including one hop of transitive imports; default sample 16, adjustable via `--chunk-sample N`);
- Cross-app comparison of same-key versions in manifest.shared (skew rehearsal, WARN);
- `--dev` checks `@fulgurjs-entry.js` serving JS and the dev manifest.

Exit codes: **any FAIL means 1**, usable directly as a CI gate. `--apps` is required and never guessed: entries may be `'.'` (deployed at the site root) or full URLs (multi-origin checks). Full syntax/flags: [CLI reference](../reference/cli.md#fulgurjs-doctor).

## Deployment checklist

- [ ] Remote Vite `base` matches the deployment subdirectory
- [ ] Host `remotes[*].prod` points at the right site path/URL
- [ ] remoteEntry / manifest / index.html are all no-cache (doctor FAILs on immutable)
- [ ] Hashed assets are long-cached
- [ ] SPA fallback does not swallow JS (missing assets stay 404)
- [ ] Cross-origin deployments carry CORS headers on remote endpoints
- [ ] Release windows keep old chunks
- [ ] `npx @fulgurjs/federation doctor --base <URL> --apps <subdirs,...>` finishes with zero FAILs
