# Trusted Publishing 迁移清单（npm 发布链去 token 化）

> 背景：当前发布依赖本地 `~/.npmrc` 的 granular token，npm 将于 **2027-01** 收紧此类凭证。
> GitHub Actions Trusted Publishing（`--provenance` + OIDC）无需任何 token 存储，是官方推荐替代。
> 本清单完成后，**打 GitHub Release 即自动发布**；本地 token 通道保留为回退。

## 用户手动步骤（一次性，约 5 分钟）

1. 登录 [npmjs.com](https://www.npmjs.com)（账号 jasoncmy）→ 包 `@fulgurjs/federation` → **Settings**；
2. 找到 **Trusted Publisher / Publishing access** 区块 → 关联 GitHub 仓库：
   - Owner/Repository：`chenmingye/fulgurjs-federation`
   - Workflow filename：`publish.yml`
   - Environment：留空
3. 保存。

## 首次验证（低风险执行）

- 不要直接用正式版本验证。本地把 `packages/plugin/package.json` version 临时改为下一个 patch（如 `0.9.1-test.0`），commit；
- `git tag v0.9.1-test.0 && git push origin v0.9.1-test.0`，然后在 GitHub 上基于该 tag 创建一个 **prerelease**；
- Actions 的 `Publish` workflow 会跑：单测 → build（含 gzip 门禁）→ `npm publish --provenance`；
- 验证 `npm view @fulgurjs/federation@0.9.1-test.0` 存在且 `npm view` 该版本的 `dist.attestations` 有值；
- **npm 网站把该测试版本 deprecated/下架**（`npm deprecate @fulgurjs/federation@0.9.1-test.0 "test publish"`），删除测试 tag；
- 验证通过后，正式版本发布一律走 GitHub Release。

## ✅ 验证结果（2026-09-22 实测通过）

用 `v0.9.1-test.0` prerelease 走通了完整链路，**无需任何 token**：

1. GitHub Release（prerelease）→ `publish.yml` 自动触发；
2. OIDC 认证（`id-token: write`，仓库**私有亦可**）；
3. 单测 + build + gzip 门禁全绿 → `npm publish` 成功；
4. **prerelease 版本自动进 `prerelease` dist-tag，`latest` 不受污染**（workflow 内按版本号是否含 `-` 自动分流 `--tag prerelease`）；
5. 测试版已 `npm deprecate` 并删除对应 tag/release。

**已知限制：`--provenance` 在私有仓库不可用**——npm/sigstore 只接受公开源仓库（报
`Unsupported GitHub Actions source repository visibility: "private"`）。workflow 已去掉该参数；
**仓库转 public 后可加回**（`npm publish --provenance --access public`），届时 npm 页面会出现
provenance 徽章。

## 日常发布方式（验证后生效）

1. `packages/plugin/package.json` bump 版本（正式版无 `-` 后缀；预发版带 `-rc.0` 之类）；
2. commit + push + `git tag vX.Y.Z && git push origin vX.Y.Z`；
3. GitHub 上基于该 tag 建 Release（预发版勾 `Set as a pre-release`）→ 自动发布；
4. 本地 token 通道仅作回退：`cd packages/plugin && npm publish --access public`。

## CI 环境注意（本地已实测踩过，workflow 已固化）

- **install 用 npm 而非 pnpm**：本仓 `packages/plugin/pnpm-workspace.yaml` 是 pnpm 11 的
  `allowBuilds` 形态，pnpm 9/10 读它会报 `packages field missing or empty`；且 pnpm 11 在
  `CI=true` 下拒跑 esbuild 构建脚本（`ERR_PNPM_IGNORED_BUILDS`）。npm 无此二坑，直接
  `npm install` 即可（plugin 依赖不含 pnpm 独有特性）。
- **步骤顺序必须先 Build 再 Unit tests**：`tests/exports.test.ts` 断言 `dist/*.d.ts` 存在，
  依赖 build 产物。
- Node 24（npm 11+ 才支持 OIDC trusted publishing）。

## 回退

- GitHub Release 发布失败时：本地 `cd packages/plugin && npm publish --access public`（token 通道）即可，两条通道产物等价（provenance 有无差异仅体现在 npm 页面徽章）。

## 涉及文件

- `.github/workflows/publish.yml` —— release published 触发（id-token: write + `npm publish --provenance`）
- `.github/workflows/ci.yml` —— push/PR 门禁（单测 + 双口径 typecheck + build/gzip）
