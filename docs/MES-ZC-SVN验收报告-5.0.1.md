# MES-ZC 5.0.1 验收报告 —— 旧 API 清理、正式发版与全新 SVN 双环境验收

> 生成：2026-09-27。主任务书：`docs/旧API清理与最终版完整验收执行任务书.md`；场景基线：`docs/4.3.1全新SVN双环境与中文诊断验收任务书.md` §2–7（其中写死的 4.3.1/tag/integrity/证据目录均为历史基线，本报告全部使用本轮实际发布值）。
>
> **最终版本 = `@fulgurjs/federation@5.0.1`**（5.0.0 发布后验收中发现并修复了一个插件缺陷，按闭环追加 5.0.1；最终验收全部以 registry 5.0.1 正式包出具）。

---

## 1. 结论速览

| 项 | 结果 |
|---|---|
| 旧 API 清理（4.1.0 聚合链 / 无效选项 / 无消费者导出键） | ✅ 完成（§2 矩阵） |
| 代码质量门禁 | ✅ tsc 干净、单测 385/385、构建+gzip 门禁+错误码三方一致 41、pack-smoke 全过（tarball 消费者 + vite build + dev 页面加载） |
| 发布链路 | ✅ 5.0.0 与 5.0.1 两个正式版：Git tag / GitHub Release / publish 工作流 / npm latest / tarball / integrity / provenance 全链核实（§3） |
| 全新 SVN 检出 | ✅ r158467 全新 checkout，初始 status 干净；全程零 `svn commit`/`import`/`svnmucc`（§6） |
| dev 全量验收（5.0.1） | ✅ menus 28/28、tabs 布局 ✓、账号切换 ✓、审批闭环 5/5、懒加载 7/7、韧性 7/7（§4） |
| 8662 生产形态（5.0.1） | ✅ menus 28/28、全套同 dev；check-pages 26/26 来源=线上 manifest；深链刷新 ✓；**留站运行中**（§5） |
| 负向复现（隔离环境真实触发） | ✅ MFU-010 恰 1 条 / MFU-003 真实抛出 / 配置错误 5 项 / dts fsRoot 降级 / 乾坤旧行为对照（§7） |
| 验收中发现并修复的插件缺陷 | ⚠️→✅ DEV-006 误报（dev manifest version 恒 0.0.0）→ 5.0.1 修复+回归测试+重新发布+全量重测（§3.3） |
| 乾坤门控（项目侧接入项） | ⚠️ 全新 SVN 原版无此修正（上轮副本已删）→ 本轮重新实现 → 验证关闭乾坤时 0 请求 0 事件（§8） |

**如实记录的首轮失败与复测**：5.0.1 dev menus 第一轮 `发起流程` 页因 DEV-010 预构建暂态（504 Outdated Optimize Dep，dev 重启后首轮）失败，预热后整轮重跑 28/28 通过；首轮 JSON 已保留（`menus-dev-501.json` 被重跑覆盖，首轮现象见本节文字与本报告历史——首轮完整输出在执行日志，失败页错误为 `504 Outdated Optimize Dep → MFU-001`，属插件 DEV-010 已文档化的暂态，非回归）。其余所有阶段均一轮通过。

---

## 2. API 清理矩阵（v5.0.0，commit `edd8626`）

| 旧 API | 原位置 | 旧行为 | 决定 | 替代写法 | 回归证据 |
|---|---|---|---|---|---|
| `@fulgurjs/federation/config` 子路径 | `packages/plugin/package.json` exports/typesVersions；`src/config.ts` | `defineRepoConfig`/`loadRepoConfig`/`federationOptionsForApp` 与 `RepoConfig` 等聚合类型；CLI 自动识别聚合形状兼容加载 | **删除**（实现+导出+构建入口+类型） | 每应用一份 `fulgurjs.config.ts` 默认导出 `satisfies FederationOptions` | exports.test 断言子路径不可解析；pack-smoke 断言 resolve 失败 + dist/config.* 不随包；`negative-cli/1`、`4` 真实中文迁移报错 |
| 旧聚合形状（`root + apps[]`）输入 | `src/app-config.ts`（原 isAggregateShape → loadRepoConfig 兼容分流） | 静默按 4.1.0 语义加载 | **删除**；识别后报「当前形状→期望形状→迁移写法」三段式中文错误 | 同上 | `negative-cli/1-aggregate.txt` + 终端截图；单测 app-config.test |
| CLI `--app <名>` | `src/cli.ts`、`src/commands.ts` | 聚合配置的应用选择器（explain/check-pages 必填） | **删除**；传入报中文错误、退出码 2 | 应用目录内直接运行 | `negative-cli/2-app-flag.txt`；help 已无 --app |
| check-pages 本地 dist 回退 | `src/commands.ts` fetchRemoteManifestRepo | 聚合形态未指定线上来源时读 `<root>/<app>/dist` | **删除**（单项目形态无本地回退；显式来源失败=无法验证） | `--manifest` / `--site` | check-pages-manifest.test「应用目录存在 dist 形态文件也不作为来源」 |
| `init --config` 聚合输出分支 | `src/init.ts` | 各应用 Vite 粘贴块 + NGINX 样板打印 | **删除**；单项目输出保留 | 通用核对清单第 8 条（NGINX 要点） | commands.test / init 单测 |
| `remoteType` | `src/options.ts` 类型+校验+归一化 | 只接受唯一值 `'module'` | **删除**；传任何值（含 `'module'`）报 CFG-011 迁移错误 | 删除字段即可 | `negative-cli/5`（真实 vite build 硬报错）；setup-feature.test |
| `library` | 同上 | 接受 module/esm 但从不参与输出 | **删除**，同上 | 同上 | setup-feature.test |
| `automaticAsyncBoundary` | 同上 | false 报 CFG-011；true 与省略等效 | **删除**；传任何值报迁移错误 | 同上 | setup-feature.test |
| `dataPrefetch` | 同上 | 接受任意值恒 true（误导：写 false 以为关闭预取） | **删除**；预载能力=`/runtime` 的 `preloadRemote()` | 同上 | `negative-cli/5`（dataPrefetch:false 硬报错，文案给出 preloadRemote 替代） |
| `usedExports` / `ignoreUnusedSharedExports` | 同上 | 接受 no-op | **删除**，同上 | 同上 | setup-feature.test |
| `exports['./internal/vue.js']` | `packages/plugin/package.json` | 无消费者的导出键（生成门面实际用 `./internal/vue-adapter.js`） | **删除导出键**；`dist/vue.js` 文件**保留**（runtime-entry 内核唯一再导出实体，相对路径内部引用不经 exports）；`src/vue.ts` 保留（提供 remoteComponent/createHostPages） | — | exports.test（键不存在 + dist/config.* 不存在 + dist/vue.js 存在） |
| 旧 `federatedBoot` 手动启动器范式 | README/迁移指南文案 | 被描述为「继续可用」的兼容模式 | **改文案**：解释为普通 expose+loadRemote 通用语义（非插件 API、无去重/重试），初始化一律 `setup/onSession`；**通用 exposes/loadRemote 能力未动** | `federation({ setup })` | README §10、迁移指南 §五 |

**明确保留（未误删）**：`/runtime` 全部导出（含 `getRuntime`/`shareScopeMap`/`getContainer`/`parseSpec`/`unwrapDefault` 低层 API——fixtures/e2e 在用，属高级显式 API）；`./internal/context.js`、`./internal/pages.js`、`./internal/vue-adapter.js`（生成门面实际引用）；`PageEntry`（**迁移至 `src/app-config.ts`** 继续服务 `hostPages` 现行契约，原 `src/config.ts` 整文件删除）；`setup`/`onSession`、`preloadRemote`、虚拟模块机制、`runtime`/`runtimeChunk`/`manifest`/`shared`/`devSharedSelf`/`devCorsOrigins`/`devFsRoot`/`dts` 等真实生效字段。

**CFG-011 重定义**：「已删除的 webpack 兼容/无效选项」迁移报错（错误码 41 个不变，`diagnostics.ts` 登记表、README 错误码总表、`check-manual-codes.mjs` 三方一致 ✓）。

---

## 3. 发布链路（两次正式发布，均 Trusted Publishing）

### 3.1 v5.0.0（破坏性清理版）
- Git：commit `edd8626`，tag `v4.3.1`→不覆盖，新 tag `v5.0.0`（远端已推）。
- GitHub Release：https://github.com/chenmingye/fulgurjs-federation/releases/tag/v5.0.0
- publish 工作流：run [36245329654](https://github.com/chenmingye/fulgurjs-federation/actions/runs/36245329654) ✅ success（46s，含 build+gzip 门禁+错误码一致性+单测）。
- npm：`latest: 5.0.0`；tarball `https://registry.npmjs.org/@fulgurjs/federation/-/federation-5.0.0.tgz`；integrity `sha512-XeeWs+W57ipdfh9uDo3VP4j5TK4OO5YbJcDgvePBbq8cQoF3w6q6Y5cfogdRN4iG9Oei1Fra2zNJlA9zpLmitw==`（本地下载重算逐字节一致 ✓）；provenance `https://slsa.dev/provenance/v1` ✓；包内 exports 仅 `.`、`./runtime`、`./package.json`、`./internal/{context,pages,vue-adapter}.js`（dist/config.* 无 ✓）。

### 3.2 v5.0.1（验收中发现缺陷的闭环修复版）
- Git：commit `86489e0`，tag `v5.0.1`；Release https://github.com/chenmingye/fulgurjs-federation/releases/tag/v5.0.1
- publish 工作流：run [36252191814](https://github.com/chenmingye/fulgurjs-federation/actions/runs/36252191814) ✅ success（45s）。
- npm：`latest: 5.0.1`；tarball `…/federation-5.0.1.tgz`；integrity `sha512-DXbdzyACvrvQkwUukm2ZjFTVNVHdWj4L4RcUnDHq5xSuncgYHRYE2fxzhmcyzemGrjQGEOtIJiSSqBGDl3wplA==`（本地重算一致 ✓）；provenance ✓。
- **不存在「只推 Git、未发 npm」状态**：两次提交均等到了 registry 可见后才进入验收。

### 3.3 5.0.1 修复内容（插件缺陷，验收中真实复现）
- **现象**：MES-ZC dev 宿主（admin 5.0.0）对每个远程告警 `DEV-006 版本不一致：宿主 5.0.0，远程 0.0.0`（三应用实际同为 5.0.0）。
- **根因**：`genDevManifest` 的 `version` 查 `pkgDependencies['fulgurjs']`——0.5.0 品牌更名时把旧键 `fulgur`→`fulgurjs` 机械替换，而真实包名是 `@fulgurjs/federation`，该键自 0.5.0 起永不命中 → dev manifest version 恒 `0.0.0`（git 考古确认引入提交 dcf1f1d）。
- **修复**：直接写远程自身 `pluginVersion`；附回归测试（`manifest.test.ts`，385/385）；CHANGELOG 5.0.1。
- **闭环**：三应用重装 registry 5.0.1（精确版本，lockfile integrity 与 registry 一致）→ dev 重启后 DEV-006 零条、bpm dev manifest version=5.0.1 → 三应用串行重建 → 8662 重新部署（运行时 chunk 内嵌 5.0.1 ✓）→ **双环境全量重测**（见 §4/§5）。

---

## 4. dev 全量验收（registry 5.0.1 正式包）

环境：admin `http://localhost:8773/main`、BPM `:4529/flowable`、lowcode `:4669/lowcode`；后台 `localhost:8085/meszc`（HTTP 200）；三应用 package.json/lockfile/node_modules 均精确 `5.0.1` 且 integrity 与 registry 一致；`fulgurjs explain` 三应用全过（单项目形态）。

| 项 | 预期 | 实际 | 证据 |
|---|---|---|---|
| selftest 门禁 | 注入必败页被正确判 FAIL | markedFail=true，exitWillBeNonZero=true | `func-results/…/selftest-dev.json` |
| menus 全量 | 26 条页面记录 × 27 菜单入口逐项业务断言 | **28/28 PASS**（首轮 27/28，失败页为 DEV-010 暂态，复测通过） | `menus-dev-501.json` + `screenshots/…/dev/01~28-*.png` |
| 审批详情标签栏 | header 在 content 上方 | headerTop=151 < contentTop=205，visualOk=true，tabs=[审批详情,流程图,流转记录] | `tabs-dev-501.json` + 截图 |
| 账号切换 A→退出→B | 身份代次变化、零残留、零 MFU-013 | 101→216615790592、noAResidueInB=true、mfu013=0、pageErrors=0 | `switch-dev-501.json` |
| 审批闭环 | 本轮新建实例：发起→待办→办理→通过→进已办 | 5/5（instanceId `1312fb24-…`，todoTaskIds 清空→doneTaskIds 出现） | `tb-todo-closure` 输出 + dev 截图 |
| 懒加载量化 | dashboard 不载远程页文件；首 BPM/首 lowcode 只载所需；重访零下载；显式 preloadRemote 才整远程 | **7/7 verdict 全 true**（P0 expose 0/0；P1 bpm=4；P2 bpm=3；P3 lowcode=6；P4 0；P5 显式预载 18 请求 697KB） | `perf-dev-501.json` |
| 401 | 弹重新登录框、无伪造 refresh-token 请求 | PASS（无 refresh-token 请求 ✓） | `resilience-dev-501.json` |
| MFU-001 故障+恢复 | 拦截 remoteEntry→三段式占位→解除→数据恢复 | PASS（blocked=1；恢复后模型列表 rows=26） | 同上 + `screenshots/…/dev/` |
| check-pages（宿主） | 26 条全核对、来源可见 | 26/26 ✓（来源=两远程 dev manifest 端点；`--site` 相对 prod 推导在 dev 不可达时如实报「无法验证」非零——诚实失败符合预期） | CLI 输出（执行日志） |

## 5. 8662 生产形态验收（registry 5.0.1 构建）与留站

部署：备份 `*.bak-pre5.0.0-20260926-2246`（main/flowable/lowcode 各一份，保留）→ BPM→lowcode→admin 串行构建（admin 含 postBuild 生成 `_app.config.js`）→ 原子替换 → **5.0.1 缺陷修复后重新构建再部署一次**（当前站点=5.0.1）。

| 项 | 实际 | 证据 |
|---|---|---|
| 六端点 | `/main/`、`/main/_app.config.js`、`/flowable/fulgurjs-remoteEntry.js`、`/flowable/fulgurjs-manifest.json`、`/lowcode/fulgurjs-remoteEntry.js`、`/lowcode/fulgurjs-manifest.json` 全 200，**Cache-Control: no-cache 全部正确**；带 hash chunk 长缓存 | §6 终态 curl 记录 |
| 产物版本 | `flowable/static/virtual_fulgurjs-runtime-*.js` 内嵌 **5.0.1** ✓ | node 逐字节检查 |
| CLI 核对（正式包） | `check-pages --site http://localhost:8662 --require-verified` → 26/26 ✓，来源=`http://localhost:8662/flowable|lowcode/fulgurjs-manifest.json`（**线上 manifest**，非本地 dist），exit 0 | CLI 输出 |
| menus 全量 | **28/28 PASS** | `menus-8662-501.json` + `screenshots/…/8662/01~28-*.png` |
| tabs / switch / 闭环 / 韧性 | tabs ✓（151<205）；switch ✓（0 残留 0 MFU-013）；闭环 5/5（instanceId `a851d00c-…` 及 5.0.1 复测新实例）；韧性 7/7（401 无伪造刷新 + MFU-001 三段式 + 恢复 rows=26） | `tabs/switch/resilience-8662-501.json` |
| 懒加载量化 | **7/7**（P0 expose 0/0；首 BPM expose bpm=1；首 lowcode lowcode=1；重访 3 请求 96KB；显式预载 70 请求） | `perf-8662-501.json` |
| 深链刷新 | 登录态下 `/main/flowable/bpm/task/todo` 与 `/main/lowcode/lowdev/formDesign` 强刷后均稳定渲染、零 pageerror、不弹回登录 | `deeplink-refresh-logged.png` |
| 乾坤关闭对照 | 全程 **qiankun/single-spa 网络请求 0、single-spa #1 事件 0、其他 console warn/error 0** | `qiankun-off-8662.json` + `no-qiankun-normal.png` |
| **留站** | nginx（pid 16300 等）继续监听 8662，六端点 + BPM 深链全 200；**未停止、未删除**，供用户复测 | §6 终态 |

## 6. SVN 与终态

- 检出 URL：`https://192.168.2.4/svn/Project/MES_ZC/trunk/mes_zc/cku-mes-serverless`；Repository Root `https://192.168.2.4/svn/Project`；**Revision r158467**（Last Changed Author: chenmy）；检出方式：全新 `svn checkout`（非拷贝旧副本）。
- **初始 `svn status`：空（干净）**。
- 最终 `svn status`：**41 M + 8 ?**——全部为本地测试改动（三份 fulgurjs.config.ts、setup/pages/bridge 接入层、乾坤门控、.env 同步、package.json/pnpm-lock 等 + 未跟踪的生成类型目录）。
- **全程未执行 `svn commit` / `svn import` / `svnmucc`，未向任何 SVN 分支提交**；副本仅供本地接入验证。
- 8662：`servers/30-fulgurjs-test-8662.conf`（未改动站点配置）；webroot `/opt/homebrew/var/www/fulgurjs-test/`（main/flowable/lowcode = 5.0.1 产物；备份 `*.bak-pre5.0.0-20260926-2246` 与历史 bak 均保留）。
- 本轮启动且已收尾的临时进程：dev 三服务（8773/4529/4669）、诊断 fixture（5597/5596/5598/5599）——收尾统一按端口精确清理；**8085 后台、nginx、8662 站点保持运行**。

## 7. 负向复现索引（隔离环境真实触发，无手写文本）

| 场景 | 触发方式 | 真实结果 | 证据 |
|---|---|---|---|
| MFU-010（恰 1 条） | 独立 Vite fixture（`/tmp/fulgur-diag-fixture`，装 registry 5.0.1）浏览器真实执行：scope `diag-incompatible-500` 注册 pinia 2.3.1、要求 `^3.0.0`、singleton、连续两次 loadShare | console 恰 **1 条**插件 `MFU-010`（中文：现象/原因/影响/修法，含要求范围与实际版本/提供方） | `negative/mfu010-003-console-events.json` + `mfu010-003-fixture-page.png` |
| 兼容多版本反证 | 同 fixture：pinia 2.1.7+2.3.1 要求 ^2.1.7（普通+strict 两次）；vue-router 4.4.5+4.6.4 要求 ^4.4.5 | 均正常加载（picked 2.3.1/4.6.4），**零 MFU-010/003** | 同上 JSON `results[0][1]` |
| MFU-003（严格拒绝） | 同 scope `strictVersion: true` | 真实抛出 `FgError code=MFU-003`，`console.error(e)` 原文进 Console | 同上 JSON `results[3]` + consoleEvents |
| 旧聚合配置 | 正式包 CLI `explain --config agg.config.ts` | 三段式中文迁移错误，exit 2 | `negative-cli/1-aggregate.txt` + `…-terminal.png` |
| `--app` 选择器 | `explain --app foo` | 中文「不再支持 --app」+ 根因 + 修法，exit 2 | `negative-cli/2-app-flag.txt` + 截图 |
| 旧 `/config` 子路径导入 | 配置内 `import { defineRepoConfig } from '@fulgurjs/federation/config'` | 中文「已删除的子路径」，exit 2 | `negative-cli/4-old-config-subpath.txt` + 截图 |
| 已删选项 dataPrefetch | 隔离工程真实 `vite build`：`federation({ name, dataPrefetch: false })` | `CFG-011：选项 "dataPrefetch" 已在 5.0.0 删除`（当前值/预期值/修法示例），build 失败 exit 1 | `negative-cli/5-removed-field.txt` + 截图 |
| remotes 缺地址 | 同上 `remotes: { 'remote-a': {} }` | 中文「没有地址（external/dev/prod 至少一个）」+ 修法示例，exit 1 | `negative-cli/3-bad-remotes-federation.txt` + 截图 |
| dts fsRoot 降级 | 隔离宿主 dev + 静态假 manifest（无 fsRoot） | 中文「manifest 未携带 fsRoot…类型映射将降级为 any…」，非英文短句 | `negative-cli/6-dts-fsroot-degrade.txt` + 截图 |
| 乾坤旧行为对照 | 隔离 fixture 静态 import qiankun 不调用 start()，等待 >5s | 真实 `single-spa minified message #1` 出现（明确标记「故意触发的旧行为」，非插件缺陷） | `negative/qiankun-legacy-single-spa-1.png` + `qiankun-legacy-console.json` |
| 正常路径无插件错误 | 8662 全套验收各页面断言 | console/pageerror 参与通过判定，28/28 零联邦错误 | menus/tabs/switch JSON |

**归因说明（单列项，均非插件缺陷）**：`/meszc/websocket`、`/meszc/tab/page` 404（后台无该端点，原版同款，脚本 NOISE_PATTERNS 登记来源）；sass `if()` DEPRECATION WARNING（EP 2.9.1 主题内部）；DEV-010 预构建暂态（插件已文档化的 vite 预构建窗口，首轮复测消除）。上述均有日志来源；无把插件错误归入此类。

## 8. 乾坤门控（项目侧接入项，本轮重新实现）

上轮宿主修正只存在于已删除的 SVN 测试副本，全新检出的原版仍静态导入乾坤链（`main.ts`/`content/index.vue`/`user.ts` → `@/qiankun/*` → `qiankun` 包）。本轮在测试副本重新实现（**只在本地副本，未提交 SVN**）：

- `main.ts`：`registerApps` 静态导入 → `openQianKun==='true'` 门控内 `await import('/@/qiankun/index')`；
- `content/index.vue`：onMounted 门控内动态 `import('/@/qiankun')`；
- `user.ts`：`setToken` 内的 GlobalState 同步与 `refreshApps` 改为门控内动态 import（`setToken` 改 async）。

**修复前对照**（旧 5.0.0 产物，门控未实施）：single-spa #1 ×3 出现。**修复后**（5.0.1 产物）：登录→dashboard→BPM 页→lowcode 页全程 qiankun/single-spa 网络请求 0、#1 事件 0、其他 warn/error 0。开启乾坤的旧模式仍可经门控内动态加载并 `start()`（`win.qiankunStarted` 防重复注册逻辑保持原样）。

## 9. 未完成 / 边界（如实）

1. **testbed 副本的乾坤门控、桥升级（sessionKey=sk_FNV(uid|token)、只写 ACCESS_TOKEN）与 41+8 项本地改动未提交 SVN**——按任务书禁令永不提交；若要落库到真实项目，需用户自行走项目流程。
2. dev menus 5.0.1 首轮 27/28（DEV-010 暂态），复测 28/28——按「失败不能被复测抹掉」要求在本报告 §1 如实并列记录。
3. 本机 `--site` 形态在 dev 环境的「无法验证」非零退出是**设计内诚实失败**（相对 prod 地址在 dev 无站点），非缺陷；8662 站点形态 `--site` 全通过。
4. `_app.config.js` 与各产物 no-cache 均验证；带 hash chunk 的长缓存头本轮以产物结构核对（nginx conf 未改动，沿用 CLI 生成版规则）。
5. lowcode 应用侧遗留（JS/SCSS 增强按钮 prod 不渲染，U-3）为本轮**未涉及的历史应用侧问题**（与 4.2.x 时代结论一致，非 5.x 回归；menus 断言覆盖设计器列表页本身）。

## 10. 证据目录

- 功能结果 JSON：`docs/func-results/5.0.0-svn-r158467-20260926-2142/`（dev 与 8662 各两代：5.0.0 首轮 + 5.0.1 终验；`negative-cli/` 六份真实终端输出）
- 截图：`docs/screenshots/5.0.0-svn-r158467-20260926-2142/{dev,8662,negative,recovery}/`（28 页×2 环境、tabs/切换/闭环/401/MFU-001 恢复、MFU-010/003 fixture、乾坤对照、6 张终端渲染截图——内容为真实执行输出逐字渲染）
- 插件 Git：`edd8626`（5.0.0 清理）、`86489e0`（5.0.1 修复）已推送 `master`；tag `v5.0.0`/`v5.0.1`、Release、publish runs 见 §3。
- 本报告与证据索引随插件 Git 提交推送；`testbed/`（含业务副本与全量截图）不入 Git（.gitignore 既有规则）。
