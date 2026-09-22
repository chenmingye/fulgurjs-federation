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

## 回退

- GitHub Release 发布失败时：本地 `cd packages/plugin && npm publish --access public`（token 通道）即可，两条通道产物等价（provenance 有无差异仅体现在 npm 页面徽章）。

## 涉及文件

- `.github/workflows/publish.yml` —— release published 触发（id-token: write + `npm publish --provenance`）
- `.github/workflows/ci.yml` —— push/PR 门禁（单测 + 双口径 typecheck + build/gzip）
