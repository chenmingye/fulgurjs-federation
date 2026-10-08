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
- [ ] **模板与锁文件**：按「模板依赖与两阶段发布」执行——基础版本 B 发布前模板维持现行钉版（其锁/冻结安装已验证）；模板升钉与最终交付版本 C 在 B 发布后完成（见下节）；
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
npx @fulgurjs/federation --help
```

- `npm pack` 安装冒烟对应 e2e 的「装后可用」口径：干净项目 dev + prod 可跑；
- prerelease（版本含 `-`）进入 `prerelease` tag，不污染 latest；正式版确认稳定后再打正式 Release。

## 模板依赖与两阶段发布

冻结锁文件引用的是 **registry 上已存在的版本**，所以「模板钉当前正发布的版本」在一次发布内做不到。标准流程是**同一轮内的两阶段发布**：

1. **基础版本 B**：包含全部代码/文档/CLI 变更，正常走发布前清单与 Release（此时模板仍钉上一个已发布版本 A）。
2. **模板升钉**：B 在 registry 可见后，五个模板的插件依赖升钉 **B**（精确版本），`minimumReleaseAgeExclude` 同步，锁文件用 registry 实际解析重新生成（禁止手改 integrity、禁用冻结安装或忽略安装退出码），逐模板验证冻结安装与构建。
3. **最终交付版本 C**（= B 的下一个 patch）：包内模板与 GitHub 模板同源（都钉 B），发布 C。

交付事实表述：

- 最终 CLI 包版本 = **C**；模板实际依赖版本 = **B**；
- C 与 B 的**插件运行时代码零差异**（C 不得改变 B 的 API、运行时行为或推荐用法；模板资产和文档同步可以变化），公开能力一致；
- GitHub 模板 = 包内模板 = 钉 B，`scripts/sync-package-examples.mjs` 同步后逐字节一致（`check-catalog` 校验）；
- 若一轮内没有任何代码变更、只有文档：只改仓库文档不发布；模板钉不因文档轮变化。

发布前清单中「模板依赖升级为本版本」按上述 B/C 拆分执行，不再存在「必须本版本」与「允许旧版本」并存两种口径。

## 回退

- npm 不允许复用已发布版本号：内容问题的修法是**发布补丁版本**（+ CHANGELOG 说明），不删除重发。

若模板升钉后又调整公共 API 或运行时，原 B/C 关系失效：先发布包含这些调整的新基础版本，再完成模板升钉和交付包核验。不得用更早版本的一致性证明后续发布。
