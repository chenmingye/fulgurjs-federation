# MES-ZC 验收报告 — @fulgurjs/federation 4.1.0（宿主接入简化与桥接修正）

> 验收时间：2026-09-24 17:00 ～ 2026-09-25 03:50
> 验收对象：**npm registry 正式包 @fulgurjs/federation@4.1.0**（非本地包、非 tarball）
> 结论：**双环境（dev / 8662 生产形态）全部验收通过，零插件缺陷、无补丁版**；8662 保持运行供复测。

## 一、发布版本与来源

| 项 | 值 |
|---|---|
| 发布版本 | **4.1.0**（npm `latest`） |
| 发布提交 | `e0129cd`（tag `v4.1.0`，GitHub Release 同名；Release notes 取自 CHANGELOG 4.1.0 节） |
| 发布链路 | GitHub Release → publish.yml（OIDC Trusted Publishing）→ **build + gzip 门禁（7585B ≤ 8192B）+ 错误码三方一致（41=41）+ 单测门禁全过** → `npm publish --provenance` |
| provenance | `https://slsa.dev/provenance/v1` ✓（npm attestations 可查） |
| registry integrity | `sha512-DGRE9C8DyLPq…xdfBw==`（与三应用 pnpm-lock resolution **逐字一致**） |
| 产物 gitHead | `e0129cd`（registry dist 元数据核对一致） |
| master 终态 | `c42500e`，CI 全绿（test / e2e×3 / prod-e2e / tarball 全 success） |
| tag→HEAD 插件源码 diff | **零**（`git diff v4.1.0..HEAD -- packages/plugin/src packages/plugin/scripts` 为空——发布后 CI 兜出的 4 个 commit 全部是测试/fixture 层修复，不改插件产物行为） |

**发布后 CI 波折（如实记录）**：首发 run 因 `runtime-entry-graph` 批准清单未含新导出而挂（门禁抓真问题，补清单后重建 Release）；其后 CI 相继兜出 fixture `src/fulgurjs/` 被 .gitignore 整目录忽略（setup.ts 未入库）、prod 交互用例缺会话步骤、`/multi` fixture 容器 init 竞速。四笔修复均为测试/fixture 层，插件产物零变化。

## 二、实际安装证据（全部来自 npm registry）

| 消费方 | 声明 | 实装 | registry 解析证据 |
|---|---|---|---|
| cku-mes-admin | `"@fulgurjs/federation": "4.1.0"`（精确） | 4.1.0 | lockfile integrity 与 registry dist.integrity 一致；dist 目录 `@fulgurjs+federation@4.1.0` |
| cku-mes-bpm | 同上 | 4.1.0 | 同上 |
| cku-mes-lowcode | 同上 | 4.1.0 | 同上 |
| e2e fixtures | `link:` 本地构建（= HEAD，插件源码与 4.1.0 零差异） | 4.1.0 等价 | pack-smoke 另以 npm pack tarball 全链验证（exports/类型/build/dev 加载 PASS） |

## 三、4.1.0 交付面（对应实施方案 §1–10 与 §12.1–12.6）

- **`federation({ setup })` 远程初始化**：默认导出 `setup(ctx)` 应用级一次 + 可选具名 `onSession(ctx)` 按宿主 `sessionKey` 去重；`loadRemote` 统一触发（容器 init 后、模块返回前）；`preloadRemote`/`getContainer`/`loadRemote('remote')` 无副作用；错误码 MFU-011~014；内部 expose `./__fulgurjs_setup__` 不进 dts/公开清单（实测 dts 生成 23/24、7/8——skip 的正是内部键）。
- **`createHostPages`**：MES 27 页表唯一来源；URL 解析（base 剥离/深链/参数解码容错）、最长前缀归属、R1–R5 校验、组件缓存（**会话切换自动重建**）、骨架/错误占位、保活名称。admin `pages.ts` 从 239 行通用样板收缩为纯数据 + 一处适配器调用。
- **`federationOptionsForApp`**：三应用 vite.config 全部改为 `fulgurjs.config.ts` 单配置驱动（name/remotes/exposes/setup/shared/devSharedSelf 唯一来源）；`HostConfig.pages` 可选 + `deriveSpec`；`fulgurjs explain` / `fulgurjs check-pages` CLI 实测输出正确。
- **桥接修正（阶段 A）**：`bridged` 布尔闩锁改为按登录代次同步；**不再伪造 REFRESH_TOKEN**；`clearAppContext()` 退出清理；bpm 401 走其既有 handleAuthorized 路径。
- **文档**：README 三条接入路径（普通模块 / createHostPages / setup+AppContext）+ 错误码总表 41 + 执行时机总表；迁移指南改 setup 为推荐、旧 federatedBoot 为兼容形态。
- **§12.4** devSharedSelf 角色推断（双角色默认 true）；**§12.6** 不支持互操作选项 CFG-011 硬报错；**§12.2/12.3** explain/check-pages 落地。

## 四、开发环境验收（8773/4529/4669，registry 4.1.0）

| 项 | 结果 | 证据 |
|---|---|---|
| 27 页矩阵 | **27/27**（25 直接 + 报表测试/外部表单 2 页真实参数补验，零 pageerror） | `docs/screenshots/tb-dev-4.1.0/`（29 文件） |
| 交互套件 | **14/14**：模型 26 行行操作（修改/复制/发布/更多）、三按钮（JS+671/SCSS+496/预览+293 节点、Monaco 渲染）、**签署认证 z=5000 > 预览 2024 顶层**、跨页导航、菜单点击链 | `docs/screenshots/tb-4.1.0-dev-interactions/` |
| 待办审批闭环 | **5/5**：自建实例（qdlc 定义）→ 待办 1 行 → 详情工具栏（通过/拒绝/抄送/转办/委派/加签）→ 审批通过 → 已办可见、实例结束 | 脚本输出留档 |
| 故障恢复 | 杀 bpm dev server → **MFU-001 三段式**（错误码+URL+修法）→ 恢复 → 26 行恢复 | 脚本输出留档 |
| 同页换账号（T5） | **18/18**：admin(fg-101) → 退出（context/token 清理）→ fulgurjs_b（**fg-925765836800 新代次**）→ BPM/lowcode 页面按 B 重建、**应用级 setup 保持 ready 不重复** | `docs/screenshots/tb-dev-4.1.0/` |
| 401 诚实失败 | **4/4**：网络注入 yudao 形态 401 → bpm handleAuthorized 重新登录框弹出、**全程零 refresh-token 请求**、REFRESH_TOKEN 无残留 | `tb-dev-4.1.0/dev-401-relogin-dialog.png` |
| dev 专有能力 | dts 类型直连生成（23/24+7/8，内部 setup 键被排除）；DEV-010 冷启动提示；remoteSchema 探针工作 | dev server 日志留档 |

## 五、生产环境验收（8662，生产形态）

部署：webroot `/opt/homebrew/var/www/fulgurjs-test`（main/flowable/lowcode + admin `_app.config.js`），构建时间 main 02:58 / flowable 02:28 / lowcode 02:39（2026-09-25）。

| 项 | 结果 | 证据 |
|---|---|---|
| 端点 | 主入口 / 两个 remoteEntry / 三个 manifest / _app.config.js 全 **200**，content-type 正确（js/json），联邦入口 **no-cache** | 本报告生成前实测 |
| 27 页矩阵 | **27/27**（25 直接 + 2 页真实参数补验） | `docs/screenshots/tb-prod-4.1.0/`（29 文件） |
| 交互套件 | **14/14**（同 dev 口径；签署 z=5000 顶层、三按钮全绿、模型 26 行） | `docs/screenshots/tb-4.1.0-prod-interactions/` |
| 待办审批闭环 | **5/5**（实例 5da9127e 发起→审批→已办、状态 2 结束） | 脚本输出留档 |
| 深链刷新 | 模型 26 行 → F5 → 26 行；表单设计 10 行 → F5 → 10 行；零 pageerror | `tb-prod-4.1.0/prod-深链刷新-*.png` |
| 同页换账号（T5） | **18/18**（8662 上 A→退出→B 新代次，同 dev 口径） | 脚本输出留档 |
| 401 诚实失败 | **4/4**（同 dev 口径） | 截图留档 |
| 故障恢复 | flowable 目录改名（404 注入，nginx 服务未动）→ **MFU-001 三段式** → 恢复 → 26 行 | 脚本输出留档 |
| 已知噪音（非联邦） | Monaco `Unexpected usage`（dev/prod 三按钮弹窗照常）——与 4.0.0 轮相同的应用级噪音 | — |

## 六、8662 复测信息（交付后保持运行，未清理）

- **复测 URL**：`http://localhost:8662/main/`（登录 admin / P@ssw0rd；联邦页深链如 `/main/flowable/bpm/manager/model`）
- **部署目录**：`/opt/homebrew/var/www/fulgurjs-test/`（main / flowable / lowcode；admin 含 `_app.config.js`）
- **服务**：Homebrew 主 NGINX（`/opt/homebrew/etc/nginx/nginx.conf`，站点 conf `servers/30-fulgurjs-test-8662.conf`），监听 8662；**验收后未停止、未改动、产物未删除**
- **构建版本**：@fulgurjs/federation **4.1.0**（registry 包）构建的三应用产物（manifest buildInfo 时间见上）
- **验证时间**：2026-09-25 03:46 最终复核（五端点 200 + no-cache）

## 七、未验证项与残留（如实）

- 后台 `/meszc/websocket` 404 自动重连噪音（后端无该端点，原版同款）——不阻断。
- dev 矩阵首轮低代码设计器 DOM 计数 5133 vs prod 4888——同页面不同环境噪声，三按钮断言均过。
- `docs/screenshots/tb-4.1.0-{dev,prod}-4.0.0` 两个目录是 4.1.0 验收中途脚本硬编码后缀的历史残留（内容为本轮交互截图，已另立规范命名目录），留作过程证据。
- 测试实例已全部闭环/取消（后台待办 rows=0）；本任务启动的 dev server（8773/4529/4669）与 e2e 临时 NGINX（9000/9001）已全部停止复核；8085 后台与 8662 用户站未动。
