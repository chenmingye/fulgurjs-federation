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
- [ ] **模板与锁文件**：与插件修复在同一次正式发布内规划并验证；禁止再发模板同步专用版本（见下节）；
- [ ] 包内模板资产同步：`scripts/sync-package-examples.mjs` 已把 `examples/templates/` 同步进包内（`fulgurjs create` 的模板唯一来源）；
- [ ] 修改默认开发类型生成时，在正式发布前，用当前候选生成五个模板所有提供方的真实合同，必须观察类型就绪并验证精确参数；仅模板build或运行页面通过不能替代dev合同验收。默认函数/类、JSX返回签名与SDK应用工厂属于必测，不能等正式发布后才首次检查。
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
npx @fulgurjs/federation --help
```

- `npm pack` 安装冒烟对应 e2e 的「装后可用」口径：干净项目 dev + prod 可跑；
- prerelease（版本含 `-`）进入 `prerelease` tag，不污染 latest；正式版确认稳定后再打正式 Release。

## 插件与模板同次交付

每轮实现只规划一个正式版本。插件代码、随包模板、模板依赖与锁文件、文档在这一次发布中一起准备；不得发布修复版后，再发布运行时代码相同的模板同步版。Release 标题只写 tag（例如 `v6.16.16`），变更说明放正文。

1. 核对五模板实际使用的公开API，选择支持这些API的已发布正式依赖版本并精确钉住，使用 registry 生成真实锁文件。模板的依赖版本与CLI包版本是两个事实，报告必须分别写明，不能因包版本较新就宣称模板装了同一版。
2. 发布前打候选tarball，在隔离测试副本中安装候选，验证新代码、五模板提供方类型、构建及dev/prod。测试用覆盖配置和本地tarball路径不得进入对外模板。候选验证不能替代正式包验证。
3. 同步包内模板并核对与GitHub源码逐字节一致，执行冻结安装及模板浏览器检查。若新API尚未正式发布，先用候选完成可审查实现与验证；不虚构registry版本或integrity，不宣称未跑的冻结安装成功。
4. 一次正式Release完成后，核对npm版本、integrity/provenance，并用**相同版本的正式npm包**替换候选，重新验证受影响项目和模板。正式包、源码、锁文件、类型revision与实际HTTP产物共同组成交付证据。

纯文档变化不发npm；测试专用修正不自动发npm。需要发布的产品修复与本轮模板更新一次交付，不能以模板验证为由追加一个同步专用版本。

## 回退

- npm 不允许复用已发布版本号：内容问题的修法是**发布补丁版本**（+ CHANGELOG 说明），不删除重发。
