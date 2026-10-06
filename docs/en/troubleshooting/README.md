# Find problems by symptom

> Match the symptom first, then jump to the error code and fix. For the full three-part entry of every error code see the [error code table](../reference/errors.md); for the supported scope and version boundaries see [compatibility](compatibility.md).

## Remote loading failures

| Symptom | Check first | Go deeper |
|---|---|---|
| Dev first load reports a manifest fetch failure (`DEV-001`) | Is the remote dev server running; `remotes[*].dev` address and port | Dev-mode checkup: `npx fulgurjs doctor --base http://localhost:<remote port> --apps <subdir> --dev` |
| Dev says a port has no listener (`DEV-005`) | The remote changed ports but the host was not synced | [The fixed checklist for changing ports](../guide/examples.md#the-fixed-checklist-for-changing-ports) |
| Prod load failure (`MFU-001`) | remoteEntry: 200? JS shape? CORS? no-cache? | `npx fulgurjs doctor --base <site> --apps <subdirs,...>`; [deployment guide](../guide/deployment.md) |
| Self-reported name mismatch (`MFU-002`) | The remotes key vs the container's self-reported name | Explicit rename with the string `'selfName@url'` form |
| Unknown remote (`MFU-008`) | The spec prefix vs the remotes key spelling | For dynamic remotes, `registerRemote` first |
| Module not exposed (`MFU-006`) | Does `remoteName/exposes key` correspond | `npx fulgurjs check-pages` (per-page hosts) to batch-verify |
| Loads but has no exports (`MFU-009`) | The expose target file's exports | Add exports |
| Retry/breaker behavior | The `timeout`/`retries`/`fallback`/`breaker` configuration | [Configuration reference · remotes](../reference/configuration.md#the-four-forms-of-remotes) |
| A static dependency once failed and still fails after the service recovers | The browser cached the failure for that dependency URL | The default error placeholder's "Refresh page" (a full refresh keeping the current address); [known boundary](../reference/api.md#vue-version-fulgurjsfederationvue) |

## White screen / broken rendering

| Symptom | Check first | Go deeper |
|---|---|---|
| Dev white screen, errors like `Cannot destructure property 'node'` | A UMD/CJS dependency was moved out of pre-bundling | Put it back into `optimizeDeps.include` (`DEV-004`) |
| Pages render with old logic / facade 404 (`DEV-009`) | `.vite` cache drift (common after plugin upgrades) | `rm -rf node_modules/.vite` + restart the dev server + switch browser profile |
| Transient 504/"ce"/page reloads in the first 30–60s (`DEV-010`) | The Vite cold-start pre-bundling window (transient, not a failure) | Warm the page up before asserting |
| Double Vue/double React crashes (Invalid hook call / 'ce') | shared missing `singleton: true`; or multiple versions not isolated | [Shared dependencies](../guide/sharing.md); React 18/19 split into scopes (`MFU-010`) |
| Host/remote plugin version mismatch (`DEV-006`) | The @fulgurjs/federation version of each app | Unify versions |
| Remote page opened standalone shows a white screen (`CC-002`) | The page was accessed bypassing the host | Load it through the host federation |
| JS requests answered with HTML (doctor FAIL) | The nginx deep-link fallback is too broad | Add exact matching for static assets; [deployment guide · SPA fallback](../guide/deployment.md#spa-fallback-never-serve-html-for-a-js-request) |
| A kept-alive page remounts on every visit / loses state | The keepAlive include name mismatches the resolved component name (fixed in Vue 3.5) | Upgrade to 5.9.3+; verify keepAliveNames usage |

## Shared version conflicts

| Symptom | Check first | Go deeper |
|---|---|---|
| `MFU-003` strictVersion throws | Negotiated version vs `requiredVersion` | Align dependency versions, or relax explicitly (after confirming compatibility) |
| `MFU-010` singleton version warning | The finally selected version vs some consumer's requirement | Unify versions; confirm the warning is acceptable; otherwise split shareScopes |
| `MFU-004` shared missing and no fallback | Does the provider declare that shared key; load order | In custom entries `await loadShare` before importing the consumer |
| Two component library versions' CSS clobbering each other | A later-loaded `:root` variable override | Harmless if mainstream versions share the same variables; watch during upgrades; [sandbox boundary audit (Chinese)](../../maintainers/沙箱边界审计.md) |
| React 18/19 on the same page | singleton cannot make 18/19 compatible | Split shareScopes to isolate the whole dependency group plus its consumers; [version isolation example](../guide/sharing.md#sharescope-group-isolation-react-1819-on-the-same-page) |
| doctor reports a shared version skew WARN | Cross-app comparison of same-key versions in manifest.shared | Unify dependency versions; for singleton, confirm the warning is acceptable |

## URL prefixes / route sync

| Symptom | Check first | Go deeper |
|---|---|---|
| Detail navigation unmounts the sub app | Host routes lack suffix matching for sub paths | Declare `/approval/:pathMatch(.*)*` (Vue) or `/approval/*` (React) in host routes; [URL sync](../guide/url-sync.md) |
| After refresh the sub app is back at its home page | The sub app did not declare `{ routing: true }` (`MFU-031`) | Configure both ends: the host passes `routing`, the child app declares the protocol and wires it |
| `/erp/erp/...` double prefix produced | Deployment base and bridge basePath layering confused | Vite base/Router base carry the deployment prefix; `basePath` only carries the business path |
| After a guard rejection the URL changed / the sub app jumped | Cancellation semantics not in effect | The port observes the real NavigationFailure/blocker; `canNavigate` is only an early rejection |
| `MFU-030` illegal basePath / overlapping prefixes | basePath empty/root/with query·hash·wildcard; same-page overlap | Static absolute paths; same-page instance prefixes must not overlap |
| `MFU-032` illegal navigation | The sub app navigated outside its own prefix | The sub app only navigates locations inside its own basePath |
| `MFU-033` sync failure / redirect loop | Guard errors or cyclic redirects in the sub app's routes | Fix the guards; audit the sub app's route definitions |
| query/hash parameters lost | The adapter double decoded/encoded | Three-part location equality is a built-in contract; a custom navigation port must not double decode/encode |

## Cache / stale versions after deploy

| Symptom | Check first | Go deeper |
|---|---|---|
| After a redeploy old hashed chunks 404 and the site fails | remoteEntry configured with immutable long caching | Switch the three files (remoteEntry/manifest/index.html) to `no-cache`; doctor FAILs on immutable |
| Occasional partial asset 404s | The release window wiped old chunks | Keep chunks still referenced by old pages; `rsync -a --delete` whole-directory consistent deploys |
| Asset is 200 but its content is HTML | The fallback swallowed JS (the status code illusion) | doctor's chunk shape check catches it; fix the nginx fallback rules |
| `Cannot find module '@fulgurjs/federation'` after a pnpm tarball install | Broken symlinks | Reinstall and verify the directory resolves |

## Type fetching failures / IDE issues

| Symptom | Check first | Go deeper |
|---|---|---|
| `remote-a/X` imports have no type hints | Is `dts` disabled; is the generated directory inside tsconfig include | `dts` is on by default; artifacts live in `src/fulgurjs/types/` (`.fulgurjs/types` without a src layout) |
| The remote source is not on this machine and types are any | `devFsRoot: false` or cross-machine | This is honest degradation: resolvable but without source completion; once reachable again, restart the host dev to regenerate |
| ts(2307) cannot find `@fulgurjs/federation/*` | The IDE TS service cached the old package | `Restart TS Server` (⌘⇧P) or reopen the window |
| VSCode shows walls of red squiggles in `src/fulgurjs/types/*.d.ts` | Volar checks cross-project files with an inferred project | An editor-only display issue (command-line checks and builds report 0 errors); cure it with `dts: { mode: 'shim' }`; [IDE notes](../reference/api.md#ide-notes-red-squiggles-in-the-srcfulgurjs-directory) |
| React precise types not working | The host tsconfig lacks paths | Configure `paths` per the `_paths.d.ts` instructions; [React dev types](../reference/api.md#react-dev-types-dual-track) |
| Older versions: `loadRemote<typeof import('remote-a/X')>(...)` fails at runtime with `"remote-a/X".then is not a function`, or `type M = typeof import('remote-a/X')` fails the build with esbuild `Expected ";" but found "("` | The plugin mistook a **dynamic import in a TS type position** for a real import and rewrote it (a runtime call got inserted into the type grammar) | Fixed (the rewriter now skips `typeof import(...)`); upgrade the plugin version — documented form in [getting started](../guide/getting-started.md) |

## Bridge / session

| Symptom | Check first | Go deeper |
|---|---|---|
| `MFU-015` illegal contract | Is `./bridge` default-exported via `defineBridgeApp` | [Sub app bridge](../guide/app-bridge.md#child-app-side-definebridgeapp) |
| `MFU-016` mount/unmount failure | `details.phase`; the child app's original error | On mount failure clean up before throwing; a container whose unmount threw is persistently locked out — recover with a full page refresh |
| `MFU-017` session inconsistency | The three-state sessionKey usage; generations across same-page instances | [Session trigger table](../guide/app-bridge.md#session-sessionkey-and-appcontext) |
| `MFU-013` missing sessionKey | The remote declared onSession but the host gave no login generation | The host provides a non-sensitive sessionKey (never a token) |
| Changing props does not update the sub app | appProps is a mount snapshot (by design) | Stable callbacks / a shared store / remount with a new key; [snapshot semantics](../guide/app-bridge.md#appprops-snapshot-semantics-important) |
| The sub app lingers after logout | `sessionKey→null` not passed, or cached private pages not removed | null unmounts immediately; the host calls `clearAppContext()` and removes cached pages |
| Timers/listeners duplicated after the sub app unmounts | Page global side effects not cleaned up | [Unmount cleanup checklist](../migration.md#6-page-unmount-cleanup-checklist) |

## General troubleshooting tools

```bash
npx fulgurjs explain          # Config stage: role/remotes/exposes/shared/load chain
npx fulgurjs check-pages      # Per-page hosts: page table ↔ remote exposes
npx fulgurjs doctor --base <URL> --apps <subdirs,...>   # Deployment-side checkup (exit code 1 usable in CI)
```

Browser side: `window.__FULGURJS_INFO__` (per-remote status/duration/setup stage), `window.__FULGURJS_SCOPE__` (shared negotiation), `window.__FULGURJS_APP_CONFIG__` (the AppContext mirror), and the `fulgurjs:error` event.
