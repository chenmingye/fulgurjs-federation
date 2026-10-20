# fulgurjs-federation：AI 接手指南

进入本仓库先读本文件，再读任务涉及目录中的 `AGENTS.md`。以用户本轮明确指令为准；本文提供项目背景与默认流程，不把答疑、排查或写方案自动扩大为实现、发布或部署。

## 1. 这是什么项目

- GitHub 仓库：`chenmingye/fulgurjs-federation`；npm 包：`@fulgurjs/federation`。
- 这是 Vite 模块联邦插件，支持 Vue 和 React 的远程组件、页面、普通模块、共享依赖，以及完整子应用桥接。
- 完整子应用桥接包括 Vue 嵌 React、React 嵌 Vue、同框架嵌套、挂载/卸载、会话和 URL 同步。组件加载与子应用桥接是不同能力，不能用组件演示代替应用级验收。
- 本仓库用 Git。私有业务测试副本可能来自 SVN；它们与插件仓库的版本控制、提交权限分开处理。
- 不在本文件固定“最新版本”、HEAD、测试数量、部署目录或 PID。接手时从源码、Git、registry 和运行环境核实。

## 2. 开始工作前

1. 明确任务属于答疑、只读排查、文档、实现、验收还是发布。用户说“先不要改”时，保留证据并报告，不改代码、依赖、配置或部署。
2. 核对 `pwd`、`git status --short`、当前分支、HEAD 和远端。记录已有的修改与未跟踪文件，保护用户及其他 AI 正在进行的工作。
3. 读 [README.md](README.md)、[CONTRIBUTING.md](CONTRIBUTING.md)，按任务查 [文档中心](docs/README.md)（中文 docs/zh/、英文 docs/en/、维护者 docs/maintainers/）、[示例入口](examples/README.md)。历史任务书和报告只用于追溯（本机 testbed/private-docs/），不能替代当前实现。
4. 从 `packages/plugin/package.json` 核对源码版本、公开导出和脚本；涉及正式包时再核对 `npm view @fulgurjs/federation version`、锁文件和实际安装版本。
5. 涉及已有服务时，先确认端口、PID、启动目录和用途。端口在线不等于运行的是本轮代码。

默认中文交流，先说结论，说明事实、证据和未验证范围。遇到可自行处理的技术细节继续工作，不反复请求确认。

## 3. 去哪里找代码

| 目录/文件 | 用途 |
|---|---|
| `packages/plugin/src/` | 插件与浏览器运行时源码 |
| `packages/plugin/tests/` | 插件 Vitest 单测与构建回归 |
| `packages/plugin/scripts/` | 生成、包内容同步、类型与体积门禁 |
| `fixtures/` | 内部回归工程，通过 `link:` 使用本地插件；不是对外模板 |
| `e2e/` | 浏览器验收、故障注入、生产隔离环境和兼容矩阵脚本 |
| `examples/templates/` | 五个完整、可独立复制的正式包模板 |
| `examples/demos/` | 共享协商、错误恢复、页面/CLI、同框架桥接、React 版本隔离演示 |
| `examples/integrations/` | 大型公开集成，例如 Jeecg 自嵌套 |
| `examples/portal/`、`examples/scripts/` | 展示门户与统一管理脚本 |
| `examples/scenarios.json` | 场景目录、端口、启动顺序、包管理器和安装目录的统一登记表 |
| `docs/diagrams/` | 系统架构双语图源、SVG/PNG 与离线 HTML；维护说明见该目录 README.md |
| `docs/README.md` | 文档中心总入口：zh/ guide+reference+troubleshooting、en/ 镜像、maintainers/（含 API 手册 zh/reference/api.md 与公开类型字段 zh/reference/types.md、错误码 zh/reference/errors.md） |
| `.github/workflows/` | 实际 CI 与正式发布流程 |
| `testbed/` | 本机私有验收目录（Git 忽略）：runs/ 为各轮验收现场，private-docs/ 为任务书/报告/私有规则 |

源码定位：

- 配置/构建/开发接入：`src/index.ts`、`options.ts`、`app-config.ts`、`transform.ts`、`virtual.ts`、`init.ts`、`manifest.ts`、`dts.ts`。
- 共享协商与远程加载：`src/runtime/`、`semver.ts`；运行时代码生成链见 `scripts/gen-runtime*.mjs`。
- Vue/React 组件与页面：`vue-adapter.ts`、`react-adapter.ts`、`host-pages-core.ts`、`pages.ts`。
- 子应用与宿主生命周期：`application-core.ts`（独立/桥接统一启动）、`vue-store.ts`（显式状态归属）、`bridge-core.ts`、`bridge-app-*.ts`、`bridge-host-*.ts`、`bridge-errors.ts`。
- URL 同步：`bridge-router-core.ts`、`bridge-router-sync.ts`、`bridge-router-vue.ts`、`bridge-router-react.tsx`。
- CLI/诊断：`cli.ts`、`init.ts`、`init-plan.ts`（已有工程接线预览、显式写入和中断恢复）、`create.ts`（完整工程创建向导，模板取自包内 `examples/templates/`）、`commands.ts`、`doctor.ts`（站点检查）、`doctor-source.ts`（离线接入预检）、`diagnostics.ts`、`runtime/errors.ts`。

上表源码名均相对于 `packages/plugin/`。公开入口以 package.json 的 `exports` 为准，不根据文件名猜测 API。

## 4. 安装与验证

仓库根不是一个统一的 pnpm workspace。按目标工程自己的 package.json、锁文件、workspace 和 CI 安装，不在仓库根盲目安装整棵依赖树。

插件侧 CI 使用 npm；在仓库根可执行：

```bash
npm --prefix packages/plugin install --no-audit --no-fund
npm --prefix packages/plugin run build
npm --prefix packages/plugin test
npm --prefix packages/plugin run typecheck
npm --prefix packages/plugin run typecheck:latest
npm run test:examples
```

- `build` 包含代码生成、声明生成、体积门禁和错误码一致性门禁；不能删掉或调高门禁来掩盖回归。
- `scripts/check-tree-shaking.mjs` 用实际 dist 检查统一入口的按需裁剪、字节预算和完整桥接正向保留；改顶层工厂绑定时同时检查源码、生成入口和 dev 门面，不给整个包盲设 sideEffects:false。
- 单测只在 `packages/plugin/tests/` 内发现。示例脚本用 Node test runner，Jeecg 自带其他测试框架，不混入插件 Vitest。
- fixture/e2e 安装顺序和链接依赖见 CONTRIBUTING 与 `e2e/scripts/ci-install-fixtures.sh`；本地修改插件后先构建，再启动消费工程。
- dev/prod、Vue/React、桥接及路由项目列表以当前 Playwright 配置和 CI 为准。根 `test:dev` / `test:prod` 的简写不能当作整个 CI 矩阵已跑完。
- 行为修复增加能重现原问题的回归；按实际影响验证浏览器行为。构建通过不能证明页面挂载、路由、错误恢复和卸载正确。
- 修改公开 Jeecg TinyMCE 生命周期时运行 `npm --prefix e2e run test:editor-lifecycle`，并验证真实浏览器快速离开、重进与只读。
- 文档、注释与简单目录说明不机械新增测试，不因纯文档任务重建业务站点。
- 只报告本次实际运行结果，不引用旧报告数量冒充本轮通过。

## 5. 改动时必须守住的语义

- 改导出、签名、默认值或配置前查调用方，同步类型、实现、CLI、受影响示例与文档。新公共用法从公开入口导入，不依赖 `/internal/*`。
- shared 的 `singleton`、版本范围、`strictVersion`、作用域与运行时 hook 都必须按声明执行。不能吞掉协商错误或静默回退，造成页面能显示但语义错误。
- React 与 renderer 必须匹配；验证 React 多版本时检查作用域与真实实例身份，不能只数网络文件。跨版本桥接不跨 renderer 传 ReactElement/Context。
- 修改 Vite 8 同步共享门面、初始化时序或 chunk 分组时，验证循环依赖、异步裁决和 provider 依赖闭包。不能用停用用户合法 `manualChunks` 配置代替插件修复，也不能重新引入消费方的 TLA 互等死锁。
- 子应用挂载、卸载、会话切换、迟到异步任务和卸载失败后的容器封锁均需保留正确行为。错误态不能继续向已卸载实例写数据。
- URL 同步由宿主管理浏览器历史，桥接子应用使用受控 memory 路由。排查重复前缀或意外 `#/` 时，抓到第一次 history/location 写入及调用栈，再判断是插件、业务路由、守卫还是部署问题。
- Vue 桥接工厂优先返回 `{ app, router }` 并声明 `{ routing: true }`，由插件等待初始路由、安装和释放连接；返回前装配业务插件及权限守卫，不提前 app.use(router)。必须在路由就绪后继续初始化时，手动 installVueBridgeRouter 并只返回 app。独立入口正常使用 web history。
- history 模式不应自行添加 `#/`，但业务合法的 hash、query、中文编码、深链刷新和前进后退必须保留。不能把“修掉意外 hash”写成“清除所有 hash”。
- 新增/修改错误码同步源码、`diagnostics.ts` 中的 `CODE_REGISTRY`、中英文 API 错误码表。错误说明包含现象、原因和具体修法。
- `init --plan` 默认只读；`--write` 才应用可证明安全的接线，存在阻断项整批拒绝。不猜业务路由、权限或登录来源；保留已有配置和人工修改。修改自动接线时覆盖幂等、文件冲突、写入失败与中断恢复，不能用一串正则盲改任意项目。
- 确认不用的旧导出、无效配置与旧文档可清理；先查实现和引用，说明迁移影响，不凭名称删除当前能力或生成链。
- **公开使用文档只描述当前推荐用法**：不维护历史 API 教程、旧入口迁移对照、"从旧版本升级"说明或历次任务流水账；版本变更事实记入 CHANGELOG，面向过去的说明随版本发布即清理。当前真实的兼容条件与限制必须保留并用普通语言解释。中英文文档描述同一套当前合同，不允许出现"英文过时，以中文为准"类声明。

### 接入目录与术语

- 新 Vue 组件推荐 `.vue` + `<script setup lang="ts">`；无模板逻辑使用 `.ts`，React JSX 使用 `.tsx`；生成声明不手写。模块级共享状态可以保留普通 script，不机械改写原 defineComponent。
- 文件按职责命名，如 `host/RemoteApplication.vue`、`exposes/FormProviders.vue`；说明中区分宿主/远程/消费方与独立启动/嵌入运行，不用“应用一/应用二”代替实际角色。目录、格式与术语详见 `docs/zh/guide/existing-apps.md`。

### 新增接入文件的统一目录（宿主与远程都适用）

- 新增插件接线集中在 `src/fulgurjs/`：`host/` 管消费、挂载和宿主上下文；`exposes/` 管对外入口及所需装配；`types/` 由插件自动同步。根部只按需保留 `setup.ts`，不散放辅助文件，不创建无用的空目录或空 setup。
- 仅宿主的统一装配用 `host/application.ts(x)`；完整远程应用（包括装配本身也被远程加载的宿主）用 `exposes/application.ts(x)`。运行模式、接收宿主会话等辅助代码与提供方装配放在 `exposes/`，不在 src 根部新建 application/mode/session 或转发壳。
- 框架既有入口、业务页面及根配置保留原位置；main 只调用统一装配，配置引用实际文件。不要为集中目录复制业务树。移动时同步静态/动态 import、别名、exposes、setup、声明生成路径与文档。
- CLI、模板、公开示例和后续私有验收的新增代码采用同一约定；不能只更新目录图，生成结果仍沿用散落路径。新增 Vue 组件优先 `.vue` + `<script setup lang="ts">`，React 组件 `.tsx`，无 JSX 的逻辑 `.ts`。

### 首次接入与避免空壳文件

- 第一次接入完整业务应用从 `docs/zh/guide/first-integration.md` 走单一路径，API手册只用于查询。先列出真实入口、装配、路由、认证来源，不能按记忆猜路径或创建假模块凑import。
- Vue宿主常规会话使用createVueBridgeApp的session身份getter；非敏感随机代次、恢复、换号和登出由插件负责，不在业务登录store手工renew/clear，不用token作身份。必须把登录状态反映为响应式ID/null，初始化未就绪用undefined。
- 不为一行对象创建、纯转发或复制常量新建session/helper文件。有共享职责时归入现有context/装配模块；纯声明setup不写空默认函数。不能按行数删除包含真实业务映射、Provider注入或必要副作用的文件。
- 子应用需要自有认证缓存时保留一次业务映射；请求token通过宿主getter取最新值，不能靠token刷新触发整应用重挂来维持有效凭据。
- “一小时首次接通”与“完整验收交付”分开计时；TS只归因新增/修改接入文件，不擅自全项目清零。明确说不测试时不跑测试、构建、类型检查或业务部署，保留候选和完整验收交接，不发布未验收版本。

### 注释技能与接入代码可读性

- 开始新增或修改接入适配代码前，主动检查当前会话可用技能；涉及 Jeecg/Vue 项目时必须读取并遵循 `comment-convention`，无需用户重复提醒或新开窗口。技能未提供时查找其 `SKILL.md`；仍不可用则明确说明，并落实本节要求。其他技术栈遵循自身约定，不机械套用 Jeecg 文件头或业务格式。
- 新增接入文件须说明文件职责、在接入流程中的位置及与其他文件的关系；保留已有作者和创建时间，新文件按项目作者约定填写。公开模板中的说明保持通用，不写私有业务信息。
- 关键装配函数、公开配置和非直观分支须解释业务目的、参数来源与含义、返回值及生命周期归属。重点讲清独立/桥接模式区别、初始化顺序及原因、路由和状态由谁管理、会话切换与卸载如何处理，以及哪些步骤不能随意调整。
- 修改已有业务文件时，在实际接入或适配位置标明用途与原因，让读者能区分原有业务逻辑与本次插件接线；不要求读者依赖验收报告才能理解代码。不逐行翻译代码，不堆无信息样板，不为补注释重构无关代码。
- 行为、签名、默认值或初始化顺序改变时，同步更新相关注释和受影响使用文档。交付前逐项检查本轮新增/修改的接入文件：说明是否准确、关键约束是否齐全、是否残留过时描述；仅“已读取技能”不算完成，必须在实际代码中落实。

## 6. 公开 Demo 与模板统一管理

- 所有公开示例源码只在 `examples/` 下维护。不重新建根 `demo/`、根 `templates/`，或复制一套基础 Vue/React 工程给门户。
- 五个模板是基础场景的唯一源码，门户直接引用。新增工程更新 `scenarios.json` 和相应指南，保留正确包管理器及 workspace 安装位置。
- 模板生产启动器的规范源为 `examples/scripts/prod-runner.mjs`，同一同步脚本生成各模板 `scripts/prod.mjs`；模板根 `pnpm build` 后 `pnpm prod` 直接服务各 dist，按真实构建 base 挂载。功能 Demo 生产挂载信息在 `scenarios.json.production`，不另维护一份硬编码应用表。
- 模板统一 dev 启动器的规范源是 `examples/scripts/dev-runner.mjs`，经 `examples/scripts/sync-template-scripts.mjs` 同步到各模板 `scripts/dev.mjs`；`check-catalog.mjs` 校验逐字节一致与端口三方一致（dev.config.json ↔ scenarios.json ↔ 子应用 package.json）。改启动器必须走规范源 + 同步，不直接改模板副本。
- 对外示例用 npm registry 正式包，锁文件与 package.json 一致；不能依赖本机插件源码、旧 node_modules、父目录 workspace 或绝对路径。
- 模板必须能整目录复制后独立安装、构建、启动。验收使用排除 node_modules/dist 的干净目录，检查安装退出码、workspace 实际成员和真实插件版本。
- 安装失败不能被脚本吞掉；端口被占用而跳过启动不能算本轮验收成功。
- npm 包仅同步五个模板，见 `packages/plugin/scripts/sync-package-examples.mjs`；大型集成、门户和功能 Demo 从 GitHub 下载。核验打包内容时进入 `packages/plugin/` 执行 `npm pack --dry-run --json`。
- 本机可能为旧进程保留忽略的兼容链接或历史缓存；这些不是第二份公共源码，不提交。是否清理先确认进程归属。

## 7. 本机私有业务验收（所有者专用）

本仓库的固定私有业务验收/部署流程（专用站点、SVN 副本管理、部署复验规则）不写入公开文档，
由仓库所有者本机的私有接手说明维护（本机 `testbed/private-docs/AGENTS-private.md`，不提交 Git）。
公开仓库只保留通用原则：

- 私有业务副本、日志、截图、报告一律放 Git 必略的本机目录，不进公开文档、AGENTS、npm 包。
- 只清理自己启动并确认归属的进程；保留交付站点与用户常驻服务。
- 区分插件、接入层、业务前端、后端与环境问题，用同条件 A/B 或最小复现证明归因。

## 8. 完成、提交与发布

- 用户授权实施或验收后：**发现问题就自主解决问题，持续定位、修复、复测与交付。** 不在第一轮脚本结束、阶段汇报或可处理的失败处停止。
- 所有适用失败、遗漏用例、未闭环缺陷及要求的部署都要完成。真实外部阻塞写出具体证据、影响和需要的条件，同时继续不依赖它的工作。不要靠修改验收标准把失败改成通过。
- 用户指定夜间持续工作窗口时按要求执行，不能擅自把阶段完成当作整项结束；保留检查点，持续处理任务范围内的问题。
- 项目所有者已授权的插件实现任务，验证后按项目流程 commit、push 并正式发布；无需每一步重复询问。当前用户若限制提交、发布或验证范围，以其明确指令为准。
- 只读排查不改文件；纯文档或示例整理不自动发 npm 版本。提交范围必须经过检查，不能 `git add .` 顺带上传安装残留、私有副本、截图或日志。
- 正式发布前核对版本来源、源码版本、锁文件、CHANGELOG、tag 和 CI。发布通过 GitHub Release 触发 `.github/workflows/publish.yml`，核验工作流、npm dist-tag、integrity/provenance 及实际包内容。
- “构建通过”“CI 通过”“已发布”“已部署”“浏览器验收通过”是不同事实，分别提供证据；没有执行的项目明确说明，不写“保证无 bug”。
- 最终交付写清改动、提交 SHA/远端状态、实测结果、版本（若发布）、部署入口（若适用）与真实遗留。纯文档任务无需模拟代码验收。
- 给另一 AI 写执行文案时，一次提供完整、独立、可复制的文本，包含目标、范围、步骤、验收标准、交付内容和限制。修改文案时重写完整版本，不让用户手工拼接。

## 9. 维护本文件

目录、公共入口、管理命令、发布流程或业务验收约束发生变化时，同步更新本文件与实际受影响指南。保持项目规则可执行，不把某次报告、临时绕过、测试数量或旧版本结论永久写成事实。
