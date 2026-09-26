# 旧 API 清理、正式发版与全新 SVN 双环境验收任务书

> 状态：**待另一位 AI 实施**。本文件是 2026-09-26 对 Git 工作树中 `@fulgurjs/federation@4.3.1` 源码的静态盘点及下一轮执行要求；列出的“候选删除”尚未删除，也不是已通过测试的结论。执行前重新核对 HEAD、文件和引用，若代码已有变化，以现场证据更新清单。

主目标：趁插件尚无外部用户，清掉有证据的历史兼容 API 和无效选项，让公开使用面只描述真实可用能力。代码清理完成后**先发布新的 npm 正式版本，再从全新 SVN 检出测试工程，以正式包做 dev 和 8662 生产形态全量验收**。4.3.1 的中文诊断与故障截图要求继续有效，详见 [4.3.1 验收任务书](4.3.1全新SVN双环境与中文诊断验收任务书.md)。

## 1. 盘点范围与事实分级

### 1.1 明确应清理：4.1.0 聚合配置整条兼容链

当前推荐接法是**每个应用根目录一份** `fulgurjs.config.ts`，默认导出直接满足 `FederationOptions`，各项目 Vite 配置写 `federation(fulgurjsConfig)`。旧链路要求一个共同父目录配置 `root + apps[]`，再套 `defineRepoConfig` / `loadRepoConfig` / `federationOptionsForApp`；这与独立仓库可用、接入简单的目标相反。现源码仍保留：

| 位置 | 已核实的旧表面 | 实施时的同步工作 |
| --- | --- | --- |
| `packages/plugin/package.json` | `exports['./config']`、`typesVersions['*'].config`；build 的 `src/config.ts` 入口 | 删除 `./config` 子路径及其类型映射，移除旧构建入口；检查 npm pack 内确实不再提供该 API |
| `packages/plugin/src/config.ts` | `defineRepoConfig`、`loadRepoConfig`、`federationOptionsForApp` 及 `RepoConfig`、`UserConfig`、`AppConfig`、`HostConfig`、`RemoteConfig`、`DeployConfig`、`RemoteAddress` 等聚合类型 | 删除聚合实现；**`PageEntry` 仍被新 `HostPagesData` 使用，先迁至当前单项目页面契约模块并改引用，不能整文件删除后留下断链** |
| `packages/plugin/src/app-config.ts` | `isAggregateShape`、`kind: 'repo'` 返回分支、`RepoKindLoadResult`、旧 `loadRepoConfig` 调用和旧形态文案 | 加载器只接受单项目配置；旧形态输入要给中文的“当前形状、期望形状、如何迁移”错误，不能静默当作空配置 |
| `packages/plugin/src/commands.ts`、`src/init.ts`、`src/cli.ts` | `explain` / `check-pages` / `init --config` 的 repo 分支、`--app` 旧选择器、按旧聚合配置推导本地 `dist` 的回退、旧多应用 Vite/NGINX 打印模板 | 删除整条聚合分支；保留当前 `init`、`init --config`、`explain`、`check-pages`、`doctor` 及其单项目功能。`check-pages` 显式 `--manifest` 或 `--site` 不可达仍需诚实失败，不能因删旧分支退化 |
| `e2e/scripts/pack-smoke.mjs`、`packages/plugin/tests/*` | pack-smoke 要求 `/config`；聚合配置测试；`exports.test.ts` 把旧子路径视为必需 | 更新为“旧入口确实不可导入、现行入口可导入”的回归；删旧测试时保留同等价值的新行为验证 |

这里的“删除”指**包公开表面、实现、CLI 行为、构建入口、文档和测试一起收敛**。不能只从 README 隐藏，也不能只删 `exports` 留一条继续被 CLI 调用的旧加载路径。`PageEntry` 迁移后不要把它误算成旧 API：页面表本身仍是现行功能。历史报告可留档，当前使用说明不可继续教新用户走聚合链。

### 1.2 明确应清理：没有实际开关效果的选项

`packages/plugin/src/options.ts` 的 `FederationOptions` 目前允许：

- `dataPrefetch`：被接受却没有进入 `NormalizedOptions`；`preloadRemote` 始终可用。用户写 `false` 会以为关闭了预取能力，实际并未关闭。
- `usedExports`、`ignoreUnusedSharedExports`：类型接受，归一化不使用；README 已明确写 `no-op`。
- `automaticAsyncBoundary`：`false` 直接报 `CFG-011`，`true` 与省略等效；归一化结果无此字段。
- `remoteType`：只接受 `'module'`，结果固定写 `'module'`；`library.type` 只允许 `'module'/'esm'`，实际始终输出 ESM。`library.name` 在当前接口中可填但未见用于输出。

删除这些面向用户的配置字段及其“接受但忽略/仅接受唯一值”说明。同步收敛 `normalizeOptions` 中相关校验、`diagnostics.ts` 的 `CFG-011` 标题、README 全部选项表、迁移指南、例子与测试。**保留真实仍生效的 `runtime`、`runtimeChunk`、`manifest`、`setup`、`shared`、`devSharedSelf` 等字段**；名字相似不构成删除理由。先确认未知字段在运行时是否会被忽略：如果会，增加面向这些已删除旧字段的明确中文迁移诊断，避免 JS 配置/`as any` 静默通过；TypeScript 类型层也必须不再允许它们。旧字段传入应非零/失败，错误指出删除字段及替代方式，而不是悄悄恢复旧行为。`CFG-011` 若已无用途，要决定保留为有实际含义的错误码还是从当前错误码表移除；不要留下空壳描述或破坏错误码表、生成脚本、测试的一致性。

### 1.3 有条件清理：确认无调用后再动

| 候选 | 当前证据与边界 | 执行决策 |
| --- | --- | --- |
| `exports['./internal/vue.js']` | `package.json` 暴露它，`packages/plugin/tests/exports.test.ts` 要求它存在；本次搜索没发现 `src/virtual.ts` 生成代码使用它。生成门面当前使用的是 `./internal/context.js`、`./internal/pages.js`、`./internal/vue-adapter.js` | 全仓、生成产物、npm pack 和真实项目引用复查后，若确无消费者，则删除**这个导出键**和专属兼容断言。不能因为导出键无用就删除 `src/vue.ts`：它仍给 `/runtime` 提供 `remoteComponent` / `createHostPages` |
| 旧 `federatedBoot` 手动启动器范式 | README 与迁移指南仍写“继续可用”，但它本质是使用者自行 expose 一个普通 TS 模块，再 `loadRemote` 并调用；并非插件里的同名专门 API。当前推荐 `setup/onSession` | 清掉**把旧启动器当推荐或承诺兼容模式**的文案，改为解释普通 TS expose 的通用语义及 `setup/onSession` 的生命周期。**不得删除通用 `exposes`、`loadRemote` 或普通 TS 模块调用能力** |
| `/runtime` 中的低层函数（`getRuntime`、`shareScopeMap`、`getContainer`、`parseSpec`、`unwrapDefault` 等） | 仅凭名字不能判旧：`getContainer`、`parseSpec`、`unwrapDefault` 已在 fixtures/e2e 使用，且可能是高级用户显式 API | 先列出公开文档、生成代码、测试、fixtures 和真实项目每个调用方，说明是否必要；**本轮默认保留**。若提出删除，需单列替代 API、迁移方法和回归证据，不许批量删除 |

`./internal/context.js`、`./internal/pages.js`、`./internal/vue-adapter.js` 由 `src/virtual.ts` 生成的门面实际引用；`virtual:fulgurjs-runtime` 等虚拟模块是当前构建机制。它们虽像“内部/历史”，也**不是本轮可直接删除的旧 API**。`./runtime` 是现行浏览器入口，`createHostPages`、`remoteComponent`、`provideAppContext`、`requireAppContext`、`preloadRemote`、`setup/onSession` 仍服务核心流程。

## 2. 实施顺序：先收敛代码，再发布，再测正式包

1. **重新现场盘点**：记录 `git status --short`、HEAD/tag、package 版本；查 `AGENTS.md` 与包脚本。对上述每项做全仓 `rg`，覆盖源码、测试、fixtures、e2e、examples、README、迁移指南、`package.json`、构建脚本和发布检查。把“确定删除 / 保留 / 待证实”三类及理由写入实现报告。保护用户同时编辑的最新文件和现有未跟踪证据，不批量清理无关文件。
2. **设计最终公开表面**：主包只用于 `federation` 和其配置类型；`/runtime` 只放运行时 API；各应用独立配置。画出单项目 `init → vite.config.ts → explain/check-pages → dev/build` 链路及旧形态输入的报错路径。先核对所有公开签名调用方，才删除聚合导出/类型。若要做额外的方向性 API 变更，写明必要性和具体替代，不能把“顺手整理”扩大成不相关重构。
3. **同步改实现**：按 §1.1、§1.2 完整删除；`PageEntry` 迁至当前模块；`--app` 不再出现在 CLI help 或 README，若用户仍传则给中文明确错误，不能被忽略；旧聚合配置输入也应指示各项目拆分。仅在 §1.3 复查确认后删除 `./internal/vue.js` 导出键。不能破坏当前 `runtime` 导出、Vite 虚拟模块、远程 exposes、setup/onSession、懒加载以及 dev/prod 构建。
4. **同步改文档和示例**：README 应只教当前 API，完整列出仍可配置的字段、类型、默认值与效果；迁移指南简短交代“旧 API 已删除 → 具体替代”，不再将旧链路称为“继续可用”。更新 `CHANGELOG.md` 与包内复制的 README/迁移指南、CLI help、`fulgurjs init` 输出、examples 和任何会误导使用者的当前文档。旧版本验收报告、任务书作为历史证据保留，不把里面的旧命令当当前指南。全文搜索旧 API 文案并人工区分“历史记录”与“当前用法”。
5. **做有意义的验证**：类型检查、相关单测、包构建、pack-smoke、独立目录安装/CLI 最小接入均要运行。覆盖旧 `/config` 不可导入、旧字段与旧聚合配置给可执行中文迁移错误、当前单项目 TS 配置可加载、`--site` 指定来源严格失败、manifest/页面核对与 dev/build 正常。确认错误码表与手工错误码检查、`exports`/`typesVersions`/产物文件三方一致。测试只报告实际运行结果；不能删除失败用例后宣称通过。若某 gate 客观不可运行，记录原因与风险，不写全绿。
6. **版本与发版**：这是有意破坏公开 API 的更新。以 4.3.1 为现有基线，建议走 **5.0.0**；执行前核对 registry 及仓库当前最新版本，若已变化则依实际 semver 确定新版本，不覆盖已有 tag。代码、类型、README、CHANGELOG 和测试同步提交到本插件 Git、推送远端；**每次提交插件代码都要发版**，不要留下只有 Git 提交、npm 未发布的新代码。创建对应 tag/GitHub Release，等发布工作流成功；核对 npm registry 的版本、tarball、完整 integrity、provenance、dist-tag 与实际包内容。不要以本地 `file:`/`link:`/workspace/tarball 冒充正式包。
7. **发版后才做全量测试**：用户已明确未发版前不跑一轮完整业务验收，以免重复。发布前仍要做第 5 步的代码质量门禁；发布后从 SVN **重新检出** MES-ZC 到 `testbed/mes-zc/`，以 registry 正式包在 admin/BPM/lowcode 三应用精确安装最终版本，然后按下一节完成 dev 与 8662 两轮全量验收。发布后的任何插件代码修复都再次按“提交推送 → 发版 → 正式包重装 → 受影响项及双环境全量重测”闭环。

## 3. 正式包验收：4.3.1 的要求一个也不丢

以 [4.3.1 验收任务书](4.3.1全新SVN双环境与中文诊断验收任务书.md) 第 2—7 节作为**场景清单**，但把其中写死的 `4.3.1`、`v4.3.1`、integrity、证据目录名、报告名都替换为实际发布的最终版本；这些旧值只是 4.3.1 基线，不得出现在最终版本的来源证明里。第 1 节的 4.3.1 改动（中文诊断、MFU-010 减误报、乾坤门控等）仍须回归。新增重点：

- **全新 SVN 副本**：先查真实 SVN URL/Revision/初始 status；只为测试在本地改三项目接入。**永远不执行 `svn commit`、`svn import`、`svnmucc`，不把测试副本提交任何 SVN 分支**。旧副本若尚存在，先辨认来源和用户改动，不能直接覆盖或清空。三项目各一份 `fulgurjs.config.ts`，不得重新引入父目录聚合配置、`/config`、三层转换或手动 `federatedBoot` 作为启动链。
- **正式包来源**：三应用 `package.json` 精确版本、lockfile tarball/integrity、`node_modules` 版本与 registry 完全一致；CLI `explain` / `check-pages --site ... --require-verified` 使用正式包，来源明确为实际在线 manifest。用独立 fixture 反证旧 `/config`、聚合配置、旧选项不会悄悄生效；截取真实中文迁移错误及修正后成功证据。
- **dev 与生产形态都要测**：dev 用实际 admin/BPM/lowcode 端口与后端；生产形态使用专门测试端口 **8662**，先备份当前部署再更换本轮 registry 构建产物，完成 HTTP/缓存头/深链/CLI/页面/业务闭环/账号切换/401/远程故障恢复/懒加载完整验证。两环境都从真实菜单与页面数据建矩阵，不以旧 26/27 数字或“页面有字”替代业务断言。已证实的权限或原项目自身错误可单列，不算插件缺陷；归因必须有日志、网络和复测证据。
- **强制中文错误复现并截图**：按旧任务书 §4，在隔离 fixture/浏览器会话真正触发 `MFU-010`、严格版本 `MFU-003`、远程故障 `MFU-001`、配置错误及乾坤旧行为对照；保留原始 console、终端输出、网络记录、完整可读的页面/DevTools/终端截图，随后恢复并截图。禁止手写假 console 文本或通过停止 8662 制造故障。正常路径也要断言无插件错误。
- **懒加载和布局**：冷缓存量化 dashboard、首次 BPM、第二 BPM、首次 lowcode、重复访问的 expose/chunk 请求数和字节，显式 `preloadRemote` 单独验证；审批详情标签应在内容上方。兼容版多页一次加载的旧问题不能重现。
- **8662 留站**：用户可能自行复测。验收后 nginx、8662 端口、最终部署产物保持运行，不删除、不停止；只关闭本轮启动且已确认归属的临时 dev/fixture 进程。部署旧产物备份保留。

## 4. 完成标准与交付物

最终需提交一份**按最终版本命名**的验收报告及证据索引，至少含：

1. API 清理矩阵：每个旧导出/选项/CLI 参数“原位置、旧行为、删除或保留决定、替代写法、对应提交与回归证据”；`PageEntry`、现行 runtime、内部生成门面明确标注未误删。对新增发现的候选 API 也同样给源码证据，不能仅凭名字删除。
2. 发布链路：Git commit/tag/Release、CI、npm registry version/dist-tag/tarball/integrity/provenance、包文件清单及三应用精确安装证据。若变更代码未发布，任务**未完成**。
3. 开发与 8662 两份完整验收矩阵、真实审批闭环与懒加载量化、故障/恢复证据、中文诊断负向截图索引；每项报告预期、实际、原始 JSON/日志、截图路径、失败归因。失败不能被“复测通过”抹掉，要列首轮现象与复测结果。
4. SVN URL/Revision/初始和最终 `svn status`，明确没有提交；8662 最终 URL、监听、五个以上端点、产物版本与备份位置，明确仍在运行。插件 Git 的相关代码、测试、公开文档和报告推送远端；不把敏感业务数据、token、Cookie 或整个测试副本纳入 Git。

凡是“删除旧 API 后没法正常从独立项目接入”“旧参数仍被静默接受”“README 继续指向旧链路”“只测 dev 或只测 8662”“负向错误未真正复现和截图”“未从 registry 装最终包”“8662 被停止”“SVN 被提交”，均判为**未达标**。客观阻塞须如实列出剩余工作及证据，不写“完美验收”。
