# 发布流程

> 发布通道：**GitHub Release（Trusted Publishing）**——npmjs.com 包设置绑定本仓库与 `.github/workflows/publish.yml` 后，打 GitHub Release 即自动 `npm publish --provenance`。本地 token 通道保留为回退。

## 触发：GitHub Release → publish.yml

`.github/workflows/publish.yml` 由 `release: published` 触发，步骤：

1. checkout（Node 24，registry npmjs）；
2. `npm install`（packages/plugin）；
3. `npm run build`——**build 即门禁**：gzip 体积红线 + 错误码三方一致性校验，任一失败发布中止；
4. 安装 pnpm 11 并安装 `fixtures/host-vue` 依赖（产物形态用例经 fixtures 解析 vue/vue-router）；
5. `npm test`（单测）；
6. `npm publish`：版本号含 `-`（prerelease）→ `--tag prerelease`；否则正式发布（latest）——均带 `--provenance --access public`。

## 发布前清单

- [ ] 版本号按语义化版本递增：破坏性变更（API 增删、默认值变更、错误码语义变更）至少递增次版本号，并在 CHANGELOG 显式标出；
- [ ] `packages/plugin/package.json` 的 `version` 已更新；
- [ ] [CHANGELOG](../../CHANGELOG.md) 新增本版本条目（面向使用者的行为变化、破坏性变化、修法）；
- [ ] 文档同步：行为/配置项/API/CLI 输出变化已同步[使用指南](../zh/README.md)、[API 参考](../zh/reference/api.md)、[配置参考](../zh/reference/configuration.md)、[CLI 参考](../zh/reference/cli.md)；错误码变化已同步[错误码总表](../zh/reference/errors.md)（build 三方一致性门禁会拦截遗漏）；
- [ ] **模板与锁文件重生成**：`examples/templates/` 五模板的插件依赖升级为本版本（精确版本），`pnpm-lock.yaml` 重生成并验证冻结安装（`pnpm install --frozen-lockfile`）；`npm run test:examples` 通过；
- [ ] 包内模板资产同步：`scripts/sync-package-examples.mjs` 已把 `examples/templates/` 同步进包内（`fulgurjs create` 的模板唯一来源）；
- [ ] CI 全绿：`test`（单测 + 双口径 typecheck + build 门禁）、`e2e`（Vite 6/7/8）、生产、版本隔离、tarball 安装等必跑作业。

## 发布后核验

```bash
# 1) dist-tag 与版本在位
npm view @fulgurjs/federation version          # 应等于刚发布版本
npm view @fulgurjs/federation dist-tags        # latest / prerelease 指向正确版本

# 2) integrity 与 provenance
npm view @fulgurjs/federation dist.integrity
npm view @fulgurjs/federation dist.attestations   # provenance 证明在位（Trusted Publishing 产物）

# 3) 装后可用（干净目录冒烟）
npm pack @fulgurjs/federation                  # 或直接 npx
npx @fulgurjs/federation create --list          # 包内模板资产齐全
npx fulgurjs --help
```

- `npm pack` 安装冒烟对应 e2e 的「装后可用」口径：干净项目 dev + prod 可跑；
- prerelease（版本含 `-`）进入 `prerelease` tag，不污染 latest；正式版确认稳定后再打正式 Release。

## 回退

- npm 不允许复用已发布版本号：内容问题的修法是**发布补丁版本**（`next` 版本 + CHANGELOG 说明），不删除重发；
- 模板依赖钉版本的口径：发布时模板钉「最后已发布验证版本」；若本版本仅改 CLI/文档/示例（运行时无语义差异），在 CHANGELOG 明示该口径。

## 历史时序教训

「先发布、后升模板依赖」的两阶段时序会导致包内模板锁旧版本（可安装但与 npm latest 不一致）——发布同一轮内完成：版本号 → 模板依赖 + 锁文件重生成 → 构建门禁 → Release。
