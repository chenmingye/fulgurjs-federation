# MES-ZC 全新 SVN 工程验收报告（@fulgurjs/federation 4.0.0）

> 测试时间：2026-09-24 19:30 ~ 21:10（本轮一次性完成检出、接入、双环境测试、问题处理与文档同步）
> 结论：**验收通过**（27 页中 25 页直接通过，2 页为占位参数的数据依赖、已用真实数据双环境补验通过；交互、审批闭环、故障恢复 dev/prod 全过；未发现插件缺陷，无需补丁版本）

## 1. 版本与来源凭证

| 项目 | 值 |
| --- | --- |
| 插件版本 | `@fulgurjs/federation@4.0.0`（npm `latest` dist-tag，未发补丁，最终版本即 4.0.0） |
| Git tag / commit | `v4.0.0` → `d23566d583cf284c9033bb547c1c894155690fab`（master） |
| tarball URL | https://registry.npmjs.org/@fulgurjs/federation/-/federation-4.0.0.tgz |
| integrity | `sha512-dbfBPtQjCyXFEzhil/71UeL+dnBkjv3Lm6q5NUQkjRV9su+OcQOEyqCYk/v95YnLQms6NDxD94e0c13MVkh95g==` |
| provenance | SLSA v1（`dist.attestations` 带 predicateType `https://slsa.dev/provenance/v1`） |
| SVN URL | `https://192.168.2.4/svn/Project/MES_ZC/trunk/mes_zc/cku-mes-serverless` |
| Repository Root / UUID | `https://192.168.2.4/svn/Project` / `3cfaac41-aba1-7845-b053-718a3bf6ea46` |
| SVN Revision | **r158467**（全新 `svn checkout`，非工作副本拷贝；初始 `svn status` = 0 项改动） |
| 工具版本 | Node v24.19.0 / pnpm 12.5.1 / nginx 1.31.4（本轮独立实例） |

三应用（`cku-mes-admin` / `cku-mes-bpm` / `cku-mes-lowcode`）均通过 `pnpm add @fulgurjs/federation@4.0.0` 从 npm registry 安装：package.json 精确声明 `4.0.0`，三应用锁文件 specifier 均为 `4.0.0`、integrity 与 registry 一致、实际 `node_modules/@fulgurjs/federation/package.json` 均为 4.0.0；锁文件零 `file:`/`link:`/`workspace:` 解析。SVN 原版零联邦痕迹（fulgurjs 关键字全源码 0 命中），由本地集成器完成接入（48 项：生成 13 / 补丁 33 / 跳过 2，零锚点未命中；复跑 85 项全 skip 幂等）。集成后 SVN 工作副本共 42 项改动（36 修改 + 6 新增），全部为联邦接入所需文件，保留未提交供检查。

## 2. 插件包级与负向契约（release tag 源码 + 已发布 tarball）

| 检查 | 结果 |
| --- | --- |
| `pnpm --dir packages/plugin test` | **287/287 通过**（28 文件） |
| `typecheck`（pinned）/ `typecheck:latest`（用户 IDE 视角） | 双口径 **0 错误**（latest 含"旧 client types 按预期报可读错误"） |
| `pnpm run build` 双门禁 | gzip **6100B ≤ 6144B**；错误码三方一致 **35 = 35** |
| `node e2e/scripts/pack-smoke.mjs` | **PASS**（tarball exports 解析 `.`/`./config`/`./runtime`、ESM import + bundler/node10 双类型解析、Vite build、dev 页面加载、宿主 schema 拆分 + expose 内部门面、旧子路径已删除断言） |
| 负向：`virtual:fulgurjs-api` | `tests/virtual.test.ts` 实跑断言 `resolveId` 返回 null（插件不再解析旧入口） |
| 负向：包根导出 `loadRemote` | exports 断言根入口无该名（仅 `./runtime` 提供） |
| 负向：`/runtime` CJS `require()` | `exports["./runtime"]` 无 `require` 条件（tests/exports.test.ts 实跑拒绝） |
| 负向：tsconfig 残留 `@fulgurjs/federation/client` | typecheck:latest 输出"报可读错误 ✓" |

## 3. 迁移静态门禁（全新 SVN 工程）

1. **统一正式包**：见 §1，三应用同版本 registry 解析。✅
2. **运行时 API 全部 `@fulgurjs/federation/runtime` 静态具名导入**：宿主桥（`provideAppContext`/`getAppContext`/`preloadRemote`）、宿主页面表（`definePages`/`loadRemote`/`remoteSchema`）、远程 boot（`requireAppContext`/`getAppContext`）、expose 组件页（`loadRemote`/`remoteComponent`）逐类核对；Vite 插件从包根 `import { federation }`。✅
3. **旧 API 零残留**：全源码/配置/类型搜索 `virtual:fulgurjs-api`、`virtual:fulgurjs-runtime`、`/client`、`/context`、`/pages`、`/vue`、`virtual:fulgurjs-remote-schema` = **0 命中**（含注释：bridge.ts 模板注释里一处旧 `/context` 表述已修正并同步集成器模板）。✅
4. **Vite 转换结果实证**（抓取 dev server 转换产物）：宿主 `pages.ts` 中 `remoteSchema` 被拆写至 `virtual:fulgurjs-remote-schema`（保住等待 dev 探针语义）、`loadRemote`/`definePages` 解析至真实 `node_modules/.vite/deps/@fulgurjs_federation_runtime.js`；bpm expose `federatedBoot.ts` 的运行时导入改写为内部惰性门面 `virtual:fulgurjs-api-facade`。✅
5. **迁移足迹**：`svn status` 42 项清单已存档于本报告证据目录。✅

## 4. dev 环境（三 dev server：admin 8773/main、bpm 4529/flowable、lowcode 4669/lowcode）

- 三 manifest 就绪（`/@fulgurjs-manifest.json` 全 200）约 30 秒；登录一次建立本轮全新浏览器会话（未复用历史状态）。
- **27 路由矩阵：25 OK + 2 数据依赖**。每页以真实内容断言（table/inputs/buttons 计数 + 关键文案 + 错误词扫描），空白页不算过；20 条 bpm 路由覆盖后台 21 个 bpm 菜单（create/update/copy 共用 model/form 设计器），6 条 lowcode 路由逐页确认（表单设计/报表设计/图形报表/模块设计各 table=3 真实行，报表测试/外部表单见下）。
- **数据依赖 2 页的定性与补验**：矩阵占位参数（`reportTest/t1`、`form/external/1/1`）下后端明确返回 `reportEntity is null` / `desformEntity is null`（code 500，响应体已取证）；改用后端真实数据（报表码 `problemReport`、表单 id `2069295925677170689`）后两页在 **dev 与 prod 均真实渲染**（报表测试 inputs=5/buttons=8、外部表单 inputs=14/buttons=6，零 pageerror）。结论：页面功能正常，占位参数无对应数据。
- **修改流程页**：首轮矩阵 URL 写错（`update/1/1` 多一段，未命中 `:type/:id` 路由形态）——已修正为 `update/1`（矩阵 OK，inputs=20）；另做真实业务流验证：模型列表（26 行）行操作「修改」→ `/model/update/<真实uuid>` → 设计器完整加载（基本信息 + 18 inputs，**零 pageerror**）。
- **交互套件 14/14**：待办列表 API 双验、模型新建导航、行操作全量存在（修改/复制/发布/更多/工艺）、复制操作无错误反馈、跨页跳转（详情→已办）、菜单真实点击导航（配置中心>流程管理>流程模型）、lowcode 设计器全链——设计器打开（5133 DOM 节点）、**JS 增强**（+671 节点、Monaco 13 实例）、**SCSS 增强**（+496、Monaco 13）、**预览表单**（+293）、**签署认证弹窗 z=5000 顶层**（> 预览层 2024，`certIsTopmost=true`）。
- **审批闭环 5/5（本轮自建实例）**：实例 `e0ff6f5c-b810-11f1-a9ac-96d848c31a95`（defKey=qdlc 请个假审批流程）→ 待办出现（taskId `e1134592-b810-11f1-…`，instanceStatus=1）→ 从该行进入详情（工具栏 通过/拒绝/转办/委派…）→ 真实提交审批通过 → 该任务从待办消失、进入已办（doneTaskIds 含该 id）→ 实例状态 **2（结束）**。全程以该实例/任务 ID 的接口结果核对。
- **远程入口故障与恢复（仅本轮浏览器网络拦截，未动服务）**：正常态（待办页正常）→ 拦截 `mes-bpm` 远程入口 → 页面出现 `MFU-001 failed to load remote "mes-bpm"` 三段式错误 + console `federatedBoot 初始化失败…MFU-001` → 解除拦截刷新 → 完整恢复（待办重新渲染）。三态截图与 `error-evidence.json` 齐备。

## 5. prod 环境（本轮独立 NGINX 实例，端口 8663，未触碰用户 8662）

- 三应用从本迁移源码全新构建：admin（含内联 `postBuild`，`dist/main/_app.config.js` 存在）327M、bpm 31M、lowcode 77M，全部 EXIT=0。
- **五端点全 200**：`/main/`、`/flowable/fulgurjs-remoteEntry.js`、`/flowable/fulgurjs-manifest.json`、`/lowcode/fulgurjs-remoteEntry.js`、`/lowcode/fulgurjs-manifest.json`；后端代理 `/meszc/` 200。构建产物 `remoteSchema` 空表为约定降级行为（未误判为探针结果）。
- **深链刷新**：bpm/lowcode 远程页深链 F5 后表格组件与数据行完整重渲染（表单设计 10 行，零 pageerror）。
- **27 路由矩阵：25 OK + 2 数据依赖**（同 dev，真实参数补验通过，见 §4）。
- **交互套件 14/14**（同 dev 全项：三按钮、z=5000 顶层、跨页、菜单导航、模型行操作）。
- **审批闭环 5/5（prod 自建实例）**：实例 `724f9254-b814-11f1-a9ac-96d848c31a95` / 任务 `725d751a-b814-11f1-a9ac-96d848c31a95`，同样五步全过、实例状态 2。
- **MFU-001 故障与恢复**：浏览器拦截 → 三段式错误 → 解除恢复，三态证据齐备。

## 6. 本轮发现的问题与处理（均无插件包缺陷）

| # | 问题 | 定性 | 处理 |
| --- | --- | --- | --- |
| 1 | 集成器模板给三应用写入依赖 `^2.1.0`（过时，与 4.0.0 模板不同步） | 本地集成工具缺陷 | 模板改为 `^4.0.0` 并重编 `integrate.mjs`；应用侧以 registry 安装覆盖，最终声明/锁文件/实装均为精确 4.0.0 |
| 2 | 集成器 bridge.ts 模板注释引用旧 `@fulgurjs/federation/context` | 注释滞后（代码本身已用新入口） | 模板与现场注释同步改为 `/runtime`，旧 API 搜索归零 |
| 3 | 矩阵脚本修改流程 URL `update/1/1` 多一段，未命中 `:type/:id` 路由 | 本地验证资产缺陷 | 修正为 `update/1` 重跑矩阵；另补真实 id 全业务流验证 |
| 4 | 本轮独立 nginx 配置缺 `mime.types`，`.js` 以 `text/plain` 下发致模块加载失败 | 部署配置问题 | 配置补 `include mime.types` 后 `application/javascript` 恢复 |
| 5 | `pnpm add --save-exact` 在项目 `.npmrc`/pnpm 行为下写出 `^4.0.0` | 环境行为 | 手动精确为 `4.0.0` 并重装同步三应用锁文件 specifier |
| 6 | 报表测试/外部表单占位参数无后端数据 | 数据依赖（非缺陷） | 已取证后端响应，真实参数双环境补验通过 |
| 7 | 应用级噪音：Monaco worker `Unexpected usage`（dev/prod）、dev 冷启动一次性 `504 Outdated Optimize Dep`、后台无 `/meszc/websocket` 端点的 WS 404、dev 下 avue `text.forEach`（lowcode 组件自身） | 均非联邦/插件问题，不阻断验收 | 记录在案，未处理（应用侧历史行为） |

**未发布补丁版本的依据**：以上问题没有一个来自 `@fulgurjs/federation` 包本身（源码或产物），全部是本地工具/验证脚本/部署配置/数据条件；插件在双环境全部验收项中零缺陷表现，故按计划无需 semver 补丁发布。

## 7. 测试数据与服务收尾

- 两个自建流程实例均已审批通过并**结束**（instanceStatus=2，位于已办历史，非待办）；收尾复核待办列表 rows=0，无遗留待办。
- 本轮自启服务已全部关闭并复核：dev 8773/4529/4669（PID 核实为 testbed node 进程）、自建 nginx 8663（PID 95767）。
- 用户既有服务未动：8085 java 后端（PID 72357）、8662 常驻 NGINX（PID 10824）。
- MES-ZC 的 SVN 工作副本改动（42 项）保留未提交，供检查；如需提交将另用中文提交信息。

## 8. 本轮证据索引（全部为本轮全新 SVN 工程 + 4.0.0 正式包 + 本轮浏览器会话采集）

- dev 截图与 JSON：`docs/screenshots/tb-svn-4.0.0-r158467-20260924-dev/`（51 项：27 页矩阵 `tb-svn-dev-*.png`、交互 14 步、闭环 5 步 `todo-closure-*.png`、故障三态 `error-{normal-before,mfu001-fault,restored-after}.png` + `error-evidence.json`、真实参数页/真实修改流程补验）
- prod 截图与 JSON：`docs/screenshots/tb-svn-4.0.0-r158467-20260924-prod/`（54 项：27 页矩阵 `tb-svn-prod-*.png`、交互 14 步、闭环 5 步 + `todo-closure.json`、故障三态、深链刷新 `prod-深链刷新-*.png`、真实参数页 `prod-真实数据-*.png`、真实修改流程 `prod-交互-修改流程-真实导航.png`）
- 矩阵机器可读结果：`/tmp/tb-svn-dev-report.json`、`/tmp/tb-svn-prod-report.json`（27 页逐页 status/detail/errs/failed）
- 截图目录按 `.gitignore` 约定留在本地，不入库。
