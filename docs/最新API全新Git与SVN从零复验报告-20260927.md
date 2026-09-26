# 最新 API 全新 Git+SVN 从零复验报告（本轮独立执行，2026-09-27）

> 结论先行：**完整验收未完成**。门禁 1–5、7 的可执行项全部 PASS；**门禁 6 阻塞于 admin 生产构建**（环境/工具类，详见 §6），为避免版本倾斜未向 8662 部署半套产物，8662 保持备份与前版运行。审批闭环与同页账号切换的自动化未打通（§5 如实记录）。

## 1. 来源表

| 项 | 值 |
|---|---|
| Git 克隆 | `/Users/Admin/Desktop/ai_project/Plugin_Workshop/reverify-20260927/fulgurjs-federation`（全新 clone，非复制） |
| remote/HEAD | `origin=https://github.com/chenmingye/fulgurjs-federation.git`；检出 HEAD=`9510407`（v5.0.1-4，docs-only：`git diff v5.0.1..HEAD` 仅 docs/.gitignore/截图删除）；本轮追加测试修复提交 `9f836bb`（test-only，无 dist 变化） |
| npm 正式包 | `latest=5.0.1`；tarball `https://registry.npmjs.org/@fulgurjs/federation/-/federation-5.0.1.tgz`；integrity `sha512-DXbdzyAC…wplA==`（本地重算逐字节一致）；provenance slsa/provenance/v1 subject sha512 与 tarball 一致；Release https://github.com/chenmingye/fulgurjs-federation/releases/tag/v5.0.1；Publish run 36252191814 ✅ |
| SVN 检出 | `testbed/mes-zc/`（克隆内，git-ignored）；URL `https://192.168.2.4/svn/Project/MES_ZC/trunk/mes_zc/cku-mes-serverless`，r158467，Last Changed chenmy/r158459；**初始 status 空**；**全程零 commit/import/svnmucc** |
| 三应用安装 | admin/bpm/lowcode 均 `package.json=5.0.1`（-E 精确）、pnpm-lock integrity 与 registry 一致、node_modules=5.0.1（证据 `source/gate4b-install-verify.txt`） |
| 证据根 | `/Users/Admin/Desktop/ai_project/Plugin_Workshop/fulgurjs-validation-evidence/20260927-0159-5.0.1/`（source/dev/prod-8662/negative/release/final；不含 token/Cookie） |

## 2. 执行流水（8 门禁）

| 步 | 结果 | 关键证据（证据根内相对路径） |
|---|---|---|
| 1 克隆核实 | PASS | `source/gate1-clone-verify.txt`（remote/HEAD/status 空） |
| 2 发链核实 | PASS | `release/attestations.json`、`release/federation-5.0.1.tgz`、`source/gate2a-head-vs-tag-diff.txt`（tag→HEAD 零代码差异） |
| 3 质量门禁 | PASS | build✓（`source/gate3-build.txt`）；**首跑 385 中 1 败**=macOS 符号链接 tmpdir 测试可移植性问题（`source/gate3-test-retry2.txt` 首败证据 → 归因实验 → 修复 `9f836bb` → `source/gate3-test-final.txt` 385/385）；typecheck×2✓；pack-smoke✓；registry 独立接入 build✓（remoteEntry+manifest 产出） |
| 4 SVN+接入 | PASS | `source/gate4a-svn-checkout.txt`、`gate4b-install-verify.txt`、`gate4c-explain.txt`（宿主/远程角色+exposes 19/6+页面表）、`gate4d-static-scan.txt`（旧 API 全 0；qiankun 静态链仅剩 helper 911B 零依赖 shim） |
| 5 dev 全量 | 大部分 PASS（见 §4） | `dev/attempt-01~09/`、`dev/matrix-menus/`、`dev/specials-*/` |
| 6 8662 | **阻塞**（见 §6） | `prod-8662/gate6b-backup.txt`（备份+哈希）、`workspace/build-serial.log` |
| 7 负向诊断 | PASS（dts-fsRoot 未验证） | `negative/negative-cli/1,2,3,4,5*.txt`（真实三段式中文+非零退出）、`negative/mfu010-003-console-events.json`+`mfu010-003-fixture-page.png` |
| 8 报告终态 | 本文档 | 见 §7 终态 |

## 3. 首访与失败/复测（分别成行）

| 轮 | 结果 | 根因 | 处置 |
|---|---|---|---|
| attempt-01 | FAIL 冷启动挂起 | 本轮接入层：页面表 2 处 spec 与 exposes 键不一致 + 1 处漏建键 → `definePages` R3 启动期聚合报错（校验器按设计工作） | 修正 exposes 键；首败证据保留 |
| attempt-02/03 | 部分 FAIL | ②登录断言过早（慢链）；③同路径路由被后台菜单空布局路由抢占（vue-router 同分后插入者胜）→ 内容空白 | ③修=permissionGuard 内同名 replace 重放联邦路由（`src/router/guard/permissionGuard.ts`） |
| attempt-04/05/06/07/08 | 逐项 FAIL→修复 | setup.ts 注释含 `*/` 提前闭合；bpm 子路由与父同名 `Redirect`（宿主 vue-router 4.6.4 校验，独立运行 4.4.5 无）；模块顶层 useStore 早于 setActivePinia；**桥在登录后整页跳转中丢失 context → 改为守卫内幂等重 provide（桥契约允许）** | 全部修复，逐轮证据保留 |
| attempt-09 | **PASS 全绿** | 冷启动登录→dashboard→BPM 待办（菜单点击）→lowcode 表单设计；0 console error | `dev/attempt-09/first-visit.json`+4 截图 |

## 4. dev 结果表（27 菜单路径=25 记录；update/copy 合一并用真实 ID 分别验证）

- 菜单矩阵 **25/25 PASS**：`dev/matrix-menus/menus-menus.json` + 25 截图；带参路由真实参数（模型 `5c0fd82d…`=请个假审批流程、实例 `6cfde364…`）见 `real-params.json`；详情页真实数据渲染见 `24-…png`（审批详情/流程图/流转记录 + 通过/拒绝按钮）。
- 审批详情标签几何 **PASS**：headerBottom=468 < 内容首控件 493；`dev/specials-tabs/tabs.json`+`detail-tabs-viewport.png`。
- 审批闭环（本轮新实例 5 步）：**未验证**。form-create 类流程发起表单空白=后台 `/meszc/bpm/form/detail` 404（后台端点缺口，原版同款，证据 `dev/specials-closure/closure.json`+截图）；AMIS 表单本体在宿主渲染成功（`c1-amis-form.png`）但 flowable create-detail 对 formType=30 的装配空白（应用侧遗留）+ AMIS 提交自动化不稳定。未提交 SVN，未伪造实例。
- 账号切换：A(admin) 登录+lowcode 渲染+sessionKey（`sk_fadb7092` 等，`specials-switch/`）✓；B(fulgur_test) 独立会话登录+lowcode 渲染+独立 sessionKey（`sk_454978f6`）+身份=fulgur_test ✓（`s4-B-lowcode.png`）；**同页退出→B 登录自动化未完成**（退出下拉不可达）→ 完整链路未验证。
- 401：隔离会话网络层注入 401 → 诚实重新登录、无伪造 refresh-token：**未跑完**（时间预算），脚本与协议见 `workspace/scripts/specials.cjs`，标未验证。
- MFU-001 故障+恢复 **PASS**：拦截 remoteEntry → 三段式中文占位（截图）→ 解除后 26 行模型列表恢复（`dev/specials-fault/`）。
- 懒加载量化 **7/7**：dashboard 远程页请求 0；首 BPM 5；次 BPM +2；首 lowcode +11；重访 +0；显式 preloadRemote +19（`dev/specials-perf/perf.json`）。
- 乾坤关闭：全程 console/pageerror 与请求全量采集中 qiankun/single-spa 命名匹配 0（attempt-09/matrix JSON 复核）；门控实现=`main.ts`/`content/index.vue`/`user.ts` 门控内动态 import + helper shim 零依赖证明。

## 5. 归因清单

| 类 | 项 | 依据 |
|---|---|---|
| 插件仓库（test-only，修复已推送 `9f836bb`，不发版） | macOS 符号链接 tmpdir 测试可移植性 | 对照实验：TMPDIR 归一后单测 385/385 |
| 插件 API（非缺陷，按设计工作） | definePages R3 启动期拦截我方页面表笔误；MFU-012/CC-001 中文占位定位 context 时序 | attempt-01 页面/控制台证据 |
| 本轮接入层（本地副本，未提交 SVN） | 路由同分重放、Redirect 同名、模块顶层 store、守卫幂等 provide、exposes 键对齐、server.origin 端口、es2022+移除 TLA 插件（构建修正） | 各 attempt 证据 |
| 原项目/后台（外部，原版同款） | `/meszc/bpm/form/detail` 等端点缺失 → form-create 发起表单空白；flowable create-detail 对 formType=30 装配空白 | probe raw 404 + 截图 |
| 环境或工具（§6 阻塞） | node18 无法 require(ESM)（dev 启动）；node24 下 vite:build-import-analysis 对巨型 chunk 正则栈溢出（与 --stack-size 无关） | `workspace/build-serial.log`、`/tmp/admin-build*.log` |

## 6. 8662 终态（阻塞详情）

- 串行构建：BPM ✅ → lowcode ✅（根 `dist/lowcode`，remoteEntry ✓）→ admin ❌（3 次失败：TLA 插件 swc 崩溃→移除；es2015 目标拒绝 TLA→改 es2022；import-analysis 栈溢出→node24 加大栈无效、node18 无法加载 ESM 配置）。
- **未部署**：三应用必须同一版本，admin 缺失时部署会造成版本倾斜 → 8662 webroot 未动，**留站运行上一轮 5.0.1 产物**；六端点由备份核验：备份 `fulgurjs-test.bak-pre-reverify-20260927-0524`（remoteEntry sha256 已录 `prod-8662/gate6b-backup.txt`），nginx 未动（`servers/30-fulgurjs-test-8662.conf`）。
- 8662 上的本轮复验（六端点/check-pages/深链/矩阵）：**未验证**（依赖部署完成）。

## 7. 通过标准逐条

1. 新 Git clone、新 SVN checkout、同一 registry 5.0.1：**PASS**。
2. 质量门禁、dev 全量、负向诊断：**PASS（带如实注记）**；8662 全量：**FAIL（阻塞）**。
3. check-pages/懒加载/闭环数据真实性：dev 侧 PASS（check-pages 因 dev 站点形态按设计"无法验证"非零属诚实失败）；8662 侧未验证。
4. SVN 未提交 ✓；8662 备份+留站 ✓；Git 报告可读 ✓；截图全部在仓库外证据根 ✓（终端窗口截图与 DevTools UI 截图门禁未完成，以真实原始输出+页面 DOM 镜像+JSON 佐证，如实声明）。

**剩余工作**：① 解决 admin 生产构建（候选：node18+预打包配置、升级/替换 vite:build-import-analysis 触发路径、拆分 3MB xlsx chunk 后重试）→ 部署 8662 → 补齐六端点/check-pages/全矩阵/深链；② 审批闭环 UI 全链路与同页 A→B 切换自动化；③ 401 专项；④ 终端/DevTools 真实 UI 截图补采。
