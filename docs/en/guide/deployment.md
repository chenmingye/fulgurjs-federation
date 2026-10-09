# Deployment guide

> Remote and host build and deploy independently (same-domain subdirectories or separate domains both work). Only four things must be right on the deployment side: base alignment, entry no-cache, SPA fallback that never swallows JS, and CORS pass-through. All of it can be machine-checked with `fulgurjs doctor`.

## Artifacts and endpoints

After `pnpm build` / `npm run build`, a remote app's dist contains two extra fixed files compared with ordinary Vite output:

| Environment | Path | Notes |
|---|---|---|
| dev | `/<base>/@fulgurjs-entry.js` | Remote container entry (served directly by plugin middleware, self-contained) |
| dev | `/<base>/@fulgurjs-manifest.json` | Dev manifest (consumed by host type sync / preloadRemote; carries the types descriptor when dts is on) |
| prod | `/<base>/fulgurjs-remoteEntry.js` | Fixed-filename container entry (content changes every build — **must be no-cache**) |
| prod | `/<base>/fulgurjs-manifest.json` | Expose chunk/CSS inventory (consumed by preloadRemote, **no-cache**) |

The host points at them with prod addresses in `fulgurjs.config.ts`:

```ts
remotes: {
  'remote-a': { dev: 'http://localhost:5174/remote-a', prod: '/remote-a' },
}
```

With the single-address-string form `'http://localhost:5101'`: dev appends `/@fulgurjs-entry.js` automatically, prod appends the filename automatically; addresses ending in `.js` are used verbatim in prod.

## base alignment

When the remote is deployed at `/remote-a/`:

- The remote Vite build's `base` should also be `/remote-a/` (so its chunk reference paths are correct);
- The host's `prod` is configured as `/remote-a` (or a full URL);
- For the layering of `--base` and routing see [URL sync · Vite base and routing layering](url-sync.md#vite-base-and-routing-layering-subdirectory-deployment): the host Router base carries the deployment prefix, while the bridge `basePath` only expresses the business path.

## Caching: no-cache is a hard rule

`fulgurjs-remoteEntry.js`, `fulgurjs-manifest.json`, and `index.html` **must all be `Cache-Control: no-cache`** (revalidation cache); immutable/max-age long caching is strictly forbidden:

- The entry filenames are fixed while content changes every build — once a browser holds an old remoteEntry long-term, redeploying cleans up old hashed chunks and the whole site 404s (`fulgurjs doctor` FAILs directly on immutable);
- Only content-hashed `assets/*` chunks deserve long caching (`immutable, max-age=31536000`).

NGINX snippet (including SPA fallback, below):

```nginx
# Remote subdirectory (one per app; the host is similar but has no remoteEntry)
location /remote-a/ {
  # Federation entry and manifest: revalidation cache
  location = /remote-a/fulgurjs-remoteEntry.js { add_header Cache-Control "no-cache"; }
  location = /remote-a/fulgurjs-manifest.json  { add_header Cache-Control "no-cache"; }
  location = /remote-a/index.html              { add_header Cache-Control "no-cache"; }

  # Long cache for hashed chunks
  location /remote-a/assets/ { add_header Cache-Control "public, max-age=31536000, immutable"; }

  # SPA fallback: only catches HTML navigations, never swallows JS
  try_files $uri $uri/ /remote-a/index.html;
}
```

## SPA fallback: never serve HTML for a JS request

Deep-link fallback should only apply to **page navigations**. When the fallback is too broad, a missing JS chunk/entry is answered with 200 + HTML, the browser tries to parse it as a module and fails immediately, and neither `doctor` nor the browser status code reveals the miss (the 200 illusion). Requirements:

- Add exact matching for static asset directories (`try_files $uri =404` or a dedicated location);
- Serve remoteEntry verbatim as JS via an exact location;
- A missing asset honestly 404s.

## CORS

Cross-origin federation (separate domains, dev dual ports) requires the remote endpoints to carry `Access-Control-Allow-Origin`:

- In dev this is controlled by the plugin's `devCorsOrigins` (default `'*'`; for the allowlist array form see [configuration reference](../reference/configuration.md#devcorsorigins--devfsroot-three-state-examples)); a user-configured `server.cors` always wins;
- **Prod CORS is the deployment layer's (NGINX etc.) responsibility** — dev configuration never modifies production servers:

```nginx
location /remote-a/fulgurjs-remoteEntry.js {
  add_header Access-Control-Allow-Origin "*";
  add_header Cache-Control "no-cache";
}
```

Same-origin deployment (everything under one site's subdirectories) needs no CORS headers.

## Version skew during release windows

During a release window, old pages still hold the old remoteEntry and keep referencing old hashed chunks. To avoid "old pages suddenly breaking":

- Keep chunks still referenced by old artifacts (do not wipe the whole assets directory on deploy, or keep N historical versions);
- Or use atomic switching + a no-cache entry so old pages naturally converge onto the new version after their next navigation;
- For full deployments use `rsync -a --delete dist/<app>/` (whole-directory consistency) to avoid a mix of new and old files.

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
