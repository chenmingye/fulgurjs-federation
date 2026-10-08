# CLI reference: `fulgurjs`

> All commands run purely locally (of `explain`/`check-pages`/`doctor`, only doctor and check-pages access site URLs per their arguments); none read tokens/environment secrets. Single-project shape: `fulgurjs.config.ts` sits in the application root, and commands read `./fulgurjs.config.ts` by default.
>
> Entry selection mnemonic (for application code imports): Vue apps `@fulgurjs/federation/vue` | React apps `/react` | framework-agnostic modules `/runtime` | Vite config uses the package root (`federation(options)`).

## Command table

| Command | Purpose | Exit code 0 condition |
|---|---|---|
| `fulgurjs create` | New project: scaffold a runnable federation project from a full template | Creation + installation succeeded |
| `fulgurjs init` | Existing project: generate a starter config / validate a config | Template written or validation passed |
| `fulgurjs explain` | Explain this app's effective federation shape and load chain | Explanation succeeded |
| `fulgurjs check-pages` | Host page table ↔ remote manifest contract verification | No deterministic errors and verified |
| `fulgurjs doctor` | Deployment/config layer checkup | No FAILs |
| `fulgurjs port` | Unified port change across a template project | Plan generated or write succeeded |
| `fulgurjs --help` | Help | — |

Exit code convention: `0` success; `1` deterministic failure within the command's semantics (check-pages verification failed, doctor has FAILs — usable as a CI assertion); `2` usage error/exception (missing arguments, illegal config, unwritable target, etc.).

---

## `fulgurjs create`

Full project creation wizard (**the entry for new projects**). Copies a complete template project (workspace + child apps + lockfile + dev scripts) from the installed npm package and runs `pnpm install --frozen-lockfile` by default.

### Syntax

```bash
fulgurjs create [--list]                                  # interactive template selection (TTY)
fulgurjs create <template> [--dir <path>] [--no-install] [--force] [--json]
```

### Flags

| Flag | Default | Notes |
|---|---|---|
| `<template>` | Interactive selection on TTY; on non-TTY, omitting it errors | `vue-vue` / `react-react` / `vue-host-react-remote` / `react-host-vue-remote` / `showcase` |
| `--dir <path>` | A directory named after the template under the current directory | Target directory |
| `--no-install` | Installs by default | Skips `pnpm install --frozen-lockfile` |
| `--force` | Non-empty directories are refused | Reuse a non-empty directory: only adds missing files; name conflicts are listed item by item and **your versions are kept** (existing content is never rewritten/deleted) |
| `--json` | Human-readable output | stdout carries only the result JSON; progress and install logs go to stderr |
| `--list` | — | Lists the template catalog and exits |

### Side effects and validation

- Writes the target directory (template file copy); runs the pnpm install by default;
- Validates Node against the template's `engines.node` before creation (≥ 20.19.0, failing without **writing any files**); pre-checks pnpm before install (fix: `corepack enable` or `npm i -g pnpm`);
- After copying, verifies key files are present (`package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `scripts/dev.mjs`, `scripts/dev.config.json`);
- Copy excludes `node_modules`/`dist`/`.vite`/`.run`/`*.log`;
- App names and ports are not rewritten (for the four-place port checklist see [examples and templates](../guide/examples.md#the-fixed-checklist-for-changing-ports)).

### Exit codes

`0` success; `2` failure (unknown template / target path is a file / non-empty directory without --force / environment validation failed / copy interrupted / install failed). When the copy fails midway or the install fails, the **already generated project is kept** for inspection.

### Examples

```bash
# Success: created and installed
$ npx @fulgurjs/federation create vue-vue --dir my-federation
[fulgurjs:create] Created the full project /path/my-federation (template vue-vue, plugin dependency 6.1.8)
Next steps:
  cd "/path/my-federation"
  pnpm dev                # starts every app in launch order; any failure exits the whole group with the reason
Access entries (remote ready before host):
  http://localhost:5213/    vue-remote
  http://localhost:5214/    vue-host
...

# Failure: non-empty directory
$ npx @fulgurjs/federation create vue-vue --dir existing
[fulgurjs:create] Target directory is not empty, refusing to overwrite: /path/existing
  Cause: a silent merge could hide conflicts with your existing files.
  Fix: pick another directory (--dir), or add --force to reuse it (only adds missing files; name conflicts are listed item by item and your versions are kept — nothing is ever rewritten)
(exit code 2)
```

---

## `fulgurjs init`

Existing project: generates a **single-project** `fulgurjs.config.ts` starter template in the application root (a minimal valid config), or validates an existing config and prints the integration snippet. **Only generates a config starter template** — not a full project (use `create` for new projects), no bridge/router/launcher/NGINX files, and it never rewrites any project file.

### Syntax

```bash
fulgurjs init [--out <path>] [--framework vue|react] [--role consumer|provider|dual] [--force]
fulgurjs init --config <path>
```

### Flags

| Flag | Default | Notes |
|---|---|---|
| `--out <path>` | `./fulgurjs.config.ts` | Output path |
| `--framework vue\|react` | Detected from package.json dependencies | When both frameworks are present or neither is, it does not guess: asks interactively on TTY; on non-TTY it errors demanding an explicit value (exit code 2) |
| `--role` | `dual` | `consumer` pure consumer (remotes example + hostPages comment) / `provider` pure provider (exposes example) / `dual` both roles (generates both) |
| `--force` | Existing files are refused | Overwrite an existing template |
| `--config <path>` | — | Validation mode: load and validate the config (three-part CFG errors) + print the `federation(fulgurjsConfig)` integration snippet and a role-specific integration checklist (print only; no files written) |

### Side effects

- Template mode: writes one file (the target path); refuses if it exists without `--force` (exit code 2);
- `--config` mode: zero writes, print only.

### Exit codes

`0` success; `2` usage error (unknown framework/role, non-TTY framework detection impossible, target exists, config validation failed).

### Examples

```bash
# Success: React consumer starter config
$ npx @fulgurjs/federation init --framework react --role consumer
[fulgurjs:init] Generated the React pure-consumer starter template fulgurjs.config.ts
Next steps:
  1. Edit fulgurjs.config.ts: fill in the container name/remotes/shared (the default export is directly federation() options)
  2. Wire it into vite.config.ts (only two federation lines):
       import federation from '@fulgurjs/federation'
       import fulgurjsConfig from './fulgurjs.config'
       // plugins: [ ...existing plugins, federation(fulgurjsConfig) ]
  3. npx @fulgurjs/federation explain
  4. After deployment: npx @fulgurjs/federation doctor --base <URL> --apps <deployment subdir>
...

# Failure: non-TTY framework detection impossible
$ npx @fulgurjs/federation init
[fulgurjs:init] Cannot detect the framework from package.json (vue/react dependencies missing or both present).
  Fix: specify explicitly, fulgurjs init --framework vue|react (--role consumer|provider|dual optional, default dual)
(exit code 2)
```

---

## `fulgurjs explain`

Config explainer: **purely local, no network, reads no tokens/environment secrets**. Explains this app's effective federation shape and load chain.

### Syntax

```bash
fulgurjs explain [--config <path>] [--json]
```

### Flags

| Flag | Default | Notes |
|---|---|---|
| `--config <path>` | `./fulgurjs.config.ts` | Config file path |
| `--json` | Human-readable | JSON output (for CI) |

### Output

- The app's role (**judged from the actual federation options** — `remotes` configured means consuming, `exposes`/`setup` configured means providing, both means dual role);
- Effective remotes (dev/prod addresses), public exposes, internal setup, shared, page spec mappings with their data source, the final `devSharedSelf` value and its source, and the load chain;
- **Bridge completeness WARN** (heuristic hint, produces no error code): a child app exposing `./bridge` must set its own framework key to `singleton: true` (a React child app needs both react+react-dom); a bridge host whose shared contains both vue and react must have all three keys `singleton: true`.

### Exit codes

`0` success; `2` config load/validation failure. Passing the removed `--app` reports a migration error (exit code 2).

### Examples

```bash
$ npx @fulgurjs/federation explain
[fulgurjs:explain] demo-host (host + remote (dual role), single-project config, directory /path/demo-host)
  Consumes remote remote-a → dev http://localhost:5174/remote-a / prod /remote-a
  exposes (1): ./api
  ...
```

---

## `fulgurjs check-pages`

Page contract verification: the host page table (the `hostPages` named export) ↔ remote manifest exposes. **Run by per-page hosts**; projects without `hostPages` configured get an explicit "not applicable" — no fake verification is produced.

### Syntax

```bash
fulgurjs check-pages [--config <path>] [--site <URL>]
                     [--manifest <remote>=<path|URL>]... [--require-verified] [--json]
```

### Flags

| Flag | Default | Notes |
|---|---|---|
| `--config <path>` | `./fulgurjs.config.ts` | Config file path |
| `--site <URL>` | None | Site address; derives remote manifests from consumers' prod addresses |
| `--manifest <remote>=<path\|URL>` | None, repeatable | Explicitly set each remote's manifest source (file path or URL) |
| `--require-verified` | Off | Strict CI mode: "cannot verify" also exits non-zero (avoids a pass with zero checks) |
| `--json` | Human-readable | JSON output (for CI) |

Manifest source precedence: **`--manifest` (repeatable, file path or URL) > `--site`/derived from consumers' prod addresses**. An explicit source failing **does not fall back** (no local dist fallback), and the actually hit source is printed per remote (preventing a stale local dist from standing in for the live check).

### Side effects and output

Zero writes. Reports: unknown remotes, mappings to unconsumed remotes, missing exposes, route conflicts (R1–R5); an unreachable remote reports "cannot verify".

### Exit codes

`0` no deterministic errors and verified; `1` deterministic errors (verification failed); with `--require-verified`, "cannot verify" is also non-zero; `2` config/usage problems.

### Examples

```bash
# Success
$ npx @fulgurjs/federation check-pages --site http://your-site
[fulgurjs:check-pages] remote-a: manifest source https://your-site/remote-a/fulgurjs-manifest.json
  Page /remote-a/home → pages/remote-a/home  ✓
...
(exit code 0)

# Failure: missing expose (exit code 1)
[fulgurjs:check-pages] remote-a: expose pages/remote-a/missing does not exist in the manifest
  Symptom: ... Cause: ... Fix: ...

# hostPages not configured
[fulgurjs:check-pages] This config does not export hostPages (per-page pages not in use); check-pages is not applicable
```

---

## `fulgurjs doctor`

Deployment/config layer automatic checkup. Checks the 200/no-cache/JS-shape of remoteEntry/manifest/index.html under `<base>/<app>/`, CORS, hashed chunk sampling reachability, and a version skew rehearsal.

### Syntax

```bash
fulgurjs doctor --base <URL> --apps <a,b,c> [--entry <filename>] [--no-entry]
                [--no-manifest] [--no-html] [--dev] [--json] [--chunk-sample N]
```

### Flags

| Flag | Default | Notes |
|---|---|---|
| `--base <URL>` | **Required** | Site root address, e.g. `http://your-site` |
| `--apps <a,b,c>` | **Required, never guessed** | **Deployment subdirectories** under the site root (a remote at `/remote-a/` is written as `remote-a`, not the container name); `'.'` = site root; entries may be full URLs for multi-origin checks |
| `--entry <filename>` | `fulgurjs-remoteEntry.js` | Custom remote entry filename (for deployments with a custom `filename`) |
| `--no-entry` | Off | Pure host / no remote entry deployment: skips remoteEntry checks (no silent guessing, no false missing report) |
| `--no-manifest` | Off | Deployments that legitimately disable the manifest: skips manifest checks |
| `--no-html` | Off | No site pages (a pure remote entry subdirectory etc.): skips the index.html check |
| `--dev` | Prod semantics | Checks the dev container entry (`@fulgurjs-entry.js` serving JS); no no-cache checks in dev mode |
| `--chunk-sample N` | `16` | Sampling cap for chunks in the remoteEntry/manifest/index.html reference chain |
| `--json` | Human-readable | JSON output (CI assertions) |

### Check items (each with three-part PASS/FAIL/WARN + symptom/root cause/fix)

- remoteEntry / manifest / index.html: 200, `Cache-Control` no-cache (**immutable is an instant FAIL**), content shape (HTML instead of JS is an instant FAIL — the symptom of a deep-link fallback swallowing JS);
- remoteEntry CORS (`Access-Control-Allow-Origin`, required for cross-origin federation);
- Manifest contract validation (schemaVersion support / field completeness);
- Hashed chunk sampling reachability (reference surface = index.html above-the-fold references > manifest exposes files > remoteEntry imports, including one hop of transitive imports; GET distinguishes shape so fallback masking is caught);
- Cross-app comparison of same-key versions in manifest.shared (skew rehearsal WARN).

### Side effects

Zero writes, HTTP requests only (8s timeout per request).

### Exit codes

`0` no FAILs; `1` any FAIL (usable directly as a CI gate); `2` usage error (missing `--base`/`--apps`).

### Examples

```bash
# Success (no FAILs)
$ npx @fulgurjs/federation doctor --base http://your-site --apps my-app,remote-a
[fulgurjs:doctor] PASS [remote-a] fulgurjs-remoteEntry.js — 200, Cache-Control: no-cache, JS shape
...
[fulgurjs:doctor] Summary: 18 PASS / 1 WARN / 0 FAIL
(exit code 0)

# Failure: immutable caching (exit code 1)
[fulgurjs:doctor] FAIL [remote-a] fulgurjs-remoteEntry.js
  Symptom: fulgurjs-remoteEntry.js Cache-Control=public, max-age=31536000, immutable: ...
  Cause: the filename is fixed while content changes every build — browsers hold the old version long-term, and once a redeploy cleans old hashed chunks everything 404s
  Fix: switch nginx to Cache-Control "no-cache" (revalidation cache); only hashed assets get long caching

# Usage error (exit code 2)
$ npx @fulgurjs/federation doctor --base http://your-site
[fulgurjs:doctor] Missing --apps <subdirs,...> — doctor never guesses default app names.
  Fix: pass deployment subdirectories under the site root to --apps (... deployed at the site root is written as "."; multi-origin uses full URLs directly)...
```

---

## `fulgurjs port`

Unified port change across a template project. **Preview only** by default (`--write` to write).

### Syntax

```bash
fulgurjs port <app> <new-port> [--write]
```

### Flags

| Flag | Default | Notes |
|---|---|---|
| `<app>` | Required | The `name` or `dir` in `scripts/dev.config.json` |
| `<new-port>` | Required | Pure digits |
| `--write` | Preview mode | Actually write to disk |

### The four places previewed/written

1. The app's `package.json` `dev` and `preview` scripts (`--port`);
2. The dev address of that remote in the host `fulgurjs.config.ts` (multi-app templates locate the host subdirectory automatically);
3. That app's `port` in `scripts/dev.config.json` (the launcher's pre-check/probing both use it);
4. The port table at the top of the template README.

Replacements use **word-boundary matching** (`5333` never hits `15333`) and touch no other ports or production addresses; only files with hits>0 are written. **Side effect**: `--write` modifies the files above (revert with `git checkout <file>`); when the README cannot be located safely, a manual-confirmation hint is printed instead of a blind write.

### Exit codes

`0` preview/write succeeded; `2` usage error / not a `create`-generated project (missing `scripts/dev.config.json`) / unknown app / old and new ports identical / the old port does not appear in any affected file (the project may have been edited by hand).

### Examples

```bash
# Preview (default)
$ npx @fulgurjs/federation port vue-remote 6213
[fulgurjs:port] Plan: vue-remote (directory remote) port 5213 → 6213
  rewrite remote/package.json (2 hits)
  rewrite scripts/dev.config.json (1 hit)
  rewrite host/fulgurjs.config.ts (1 hit)
  rewrite README.md (3 hits)
Preview mode; nothing written. Add --write to execute. Revert with git checkout <file>.
(exit code 0)

# Write
$ npx @fulgurjs/federation port vue-remote 6213 --write
[fulgurjs:port] Wrote 4 files (vue-remote 5213 → 6213). Revert: git checkout <file>
```

---

## `fulgurjs --help`

Prints help (all commands, flags, and examples). `fulgurjs` (no subcommand), `-h`, and `help` are equivalent. An unknown command prints help and exits with code 2.
