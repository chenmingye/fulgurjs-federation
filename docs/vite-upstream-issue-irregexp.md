# 草稿：vitejs/vite 上游 issue（P1 irregexp）——按指示仅存档于 docs/，不实际提交

> 状态：草稿（2026-09-14）。证据链来自 `docs/待办问题与迁移方案.md` P1 节（2026-09-13 分步实验，
> commit fed5）。若实际提交需先在干净仓库构造最小可复现（large-app 模板 + inline sourcemap 压出
> 27MB 单行），下面 Reproduction 一节按此预期编写。

---

## Title

`vite:build-import-analysis`: `Maximum call stack size exceeded` when a chunk contains a very long
single-line `//# sourceMappingURL=data:` comment (V8 irregexp backtrack-stack exhaustion inside the
build process)

## Describe the bug

On a very large production build (real-world app, main entry chunk ≈ 38.8 MB containing a
**single-line 27 MB** inline source map appended by rollup due to `sourcemap: 'inline'`), the build
crashes with:

```
RangeError: Maximum call stack size exceeded
    at String.replace (<anonymous>)
    at Object.generateBundle (node_modules/vite/dist/node/chunks/dep-*.js:…)
```

The crash is inside `vite:build-import-analysis`'s `generateBundle`, where the plugin runs a
`String.replace` with a regex over every chunk's code.

Notably, the same regex over the same 38 MB file **succeeds offline** (a standalone Node script,
even with `--stack-size=200`), but **consistently throws inside the build process**. Repeated
experiments ruled out every other candidate:

| Hypothesis | Experiment | Result |
|---|---|---|
| Regex shape (greedy/lazy) | both variants | both crash |
| Rope/cons-string representation | `code.split('\n').join('\n')` flattening | still crashes |
| JS call-stack exhaustion | probe shows ~63,529 frames of headroom at crash time | not the JS stack |
| Content of the chunk | same file + same regex offline, `--stack-size=200` ladder | passes offline |
| The regex engine itself | — | **V8 irregexp backtrack stack in the build's process state** |

Conclusion from experiments: the only reliable bypass is to **avoid the regex engine entirely** for
this replacement.

## Reproduction

1. `pnpm create vite large-app --template vue-ts`
2. Generate enough code so that `vite build` with `build.sourcemap: 'inline'` produces a main chunk
   of tens of MB (the inline `sourceMappingURL=data:` comment ends up as one giant single line —
   rollup appends it last, on a single line).
3. `vite build` → crash in `vite:build-import-analysis` (`String.replace` in `generateBundle`).
4. Same file + same regex in a standalone script → passes.

(the crashing build had a 38.8 MB entry chunk / 27 MB single-line inline map; total 29,776 modules,
3m08s of transform before the bundle phase)

## Suggested fix

`vite:build-import-analysis` rewrites imports in chunk code during `generateBundle`. The inline
source-map comment is always a single line appended at the end of the chunk, so the plugin can
pre-strip/protect it **without a regex**, e.g. split off lines starting with `//# sourceMappingURL=`
before running its import-rewriting replace, then re-append. In our build this exact replacement
(an unconditional no-regex line filter) fixed the crash while keeping output byte-identical:

```
// before (crashes on 27MB single line)
code = code.replace(RE, ...)

// after (no regex over the giant line)
const lines = code.split('\n')
// ... rewrite only lines that are not the sourceMappingURL comment, re-append afterwards
```

Alternatively, `vite:build-import-analysis` could skip chunks whose inline sourcemap line exceeds a
size threshold and handle the comment separately.

## System Info

- `vite`: 6.4.3 (build-import-analysis unchanged in this area since 5.x; verified present in 6.x line)
- Operating System: macOS 15 (arm64), Node 20/24
- Package manager: pnpm 11

## Any additional comments

- The offline-vs-in-build discrepancy is the interesting part: identical input + identical regex +
  identical Node flags, only the enclosing process differs. That points at V8 irregexp's regexp
  stack (separate from the JS stack) being sensitive to the memory state of the build process —
  which makes this hard to reproduce in a small repo, and all the more worth fixing defensively by
  not running regexes over multi-MB single-line strings.
- Related: any plugin hook that runs `String.replace`/`.match` over whole chunk sources is exposed
  to this; a defensive size guard in core would benefit ecosystem plugins too.
