# 最新 API 单目录从零全量复验任务书

> 交给另一位 AI 执行。制定于 2026-09-27。本文件是**新一轮独立复验**的唯一执行依据；此前的从零任务书、续做任务书及 5.0.1/5.0.2 报告只作问题线索，不能当作本轮结果。本轮要从全新 Git 克隆、全新 SVN 检出开始，并在**最终正式 npm 包和最终接入代码冻结后**，完整跑完 dev 与 8662。不要把上轮几次中断后的结果拼接为本轮通过。

## 1. 目标、范围和不可违反的边界

1. 判断 `@fulgurjs/federation` 执行时的**最新正式 npm 包**能否在全新 MES-ZC 副本中，用当前公开 API 完成接入、开发环境运行、生产构建、8662 部署和两环境全量业务测试。实际版本现场查询，**不要写死 5.0.2**。
2. 查找真正由插件、MES 接入、原项目或后台分别引起的问题。插件问题必须修复、发布新版本、重装并重新跑最终全套；项目或权限问题只有拿到同版本对照证据，才可作为“不阻断插件验收的外部问题”单列。业务未通过仍要明确写“业务未通过”，不能说业务全绿。
3. 所有本轮工作资料只放在现有插件工坊主仓库的 **`testbed/runs/<本轮唯一编号>/`** 下。工坊根目录 `/Users/Admin/Desktop/ai_project/Plugin_Workshop/` **不得新增任何测试目录、证据目录、并列克隆、软链接或缓存目录**。不要删除、移动或改写现有 `testbed/reverify-20260927/`、它的证据和旧报告。
4. MES-ZC 只作本地测试副本：**绝不运行 `svn commit`、`svn import`、`svnmucc`，也不向任何 SVN 分支提交**。8662 是用户留站复测的专用端口：部署前备份，结束后保留最新产物、备份、nginx 服务和 8662 监听，不能停止、删除或换作别的端口。
5. 不从旧测试副本复制接入源码、依赖、构建产物、浏览器 profile、业务 ID、JSON、截图或缓存；旧报告只帮助列出风险和检查点。源码从 Git/SVN 获取，应用只安装 registry 正式包，禁止 `file:`、`link:`、`workspace:`、本地 tgz、Git 依赖或手改 `node_modules` 冒充正式包。
6. 先查仓库和本机实际状态，再动手。不得删除主仓库、旧工作区、用户进程、8085 后台或 nginx。不得把受控故障注入施加给共享服务或其他用户会话。

### 1.1 唯一目录布局

本机已存在的主仓库是 `/Users/Admin/Desktop/ai_project/Plugin_Workshop/fulgurjs-federation`。先读本任务书，再在该主仓库**已被 Git 忽略**的 `testbed/` 内创建唯一新目录；先用 `git check-ignore -v testbed/runs/<编号>/` 验证忽略规则。建议布局：

```text
fulgurjs-federation/                  # 已存在的主仓库；本轮不把它当“新克隆”
  testbed/                            # 主仓库已忽略；不要 git add -f
    reverify-20260927/               # 上轮归档，保持原样
    runs/
      <YYYYMMDD-HHMM>-full-retest/    # 本轮唯一目录，不复用旧编号
        plugin/                       # 从 Git 远端新克隆的插件仓库
        mes-zc/                       # 从 SVN 新检出的测试工程
        evidence/                     # 原始 JSON、截图、日志、HAR 摘要和索引
        work/                         # 本轮脚本、隔离 fixture、临时文件、checkpoint
```

`plugin/` 是独立 Git 仓库，`mes-zc/` 是独立 SVN 工作副本，彼此不复制源码。`evidence/` 和 `work/` 都不进入公开 Git。`/tmp` 可以用于短时隔离构建，但**结束前必须把需要的原始日志和结果复制回本轮 `evidence/`**，不能只交一个可能消失的 `/tmp` 路径。主仓库的 `testbed/` 是忽略目录；若用户日后要删除主仓库，须先提醒用户备份本轮本地证据和未提交的 SVN 测试改动，不能声称 Git 已保存它们。

## 2. 开始前的来源核查和防失忆记录

### 2.1 一开始就固定本轮身份

在 `work/checkpoint.md` 和 `work/checkpoint.json` 写入本轮编号、开始时间、四个绝对路径、操作者、当前步骤、Node/pnpm/npm/系统版本、预定端口和 Git/SVN/npm 来源。每完成下表一步，**立即**追加执行时间、命令或 UI 操作、真实退出码、原始证据绝对路径、SHA-256、结果（PASS/FAIL/未验证）、下一个动作。原始文件和失败尝试只追加 `attempt-01/02/...`，绝不覆盖。不要把“AI 自己说过完成”当作通过证据。

如任务因上下文、浏览器、构建或会话中断：先读本任务书和 checkpoint，现场重查 Git HEAD、npm latest、三应用锁定版本、SVN revision/status、服务 PID、8662 部署哈希以及每个已完成步骤的原始文件。**文件缺失、版本变化、结论无法从原件重算的步骤一律重跑**；从最后一个真实已完成门禁继续。最终冻结后的 dev+8662 全量验收若中断，只能保留先前原件并补完同一代码/版本下缺失的步骤；若代码或版本发生变化，重新开始完整最终轮。不得靠摘要“恢复记忆”。

### 2.2 必须按顺序通过的门禁

| 门禁 | 实际工作 | 关门前必须有的证据 |
| --- | --- | --- |
| G0 | 建唯一目录、记录系统/端口/进程、做真实 DevTools Console 和真实终端窗口截图能力预检 | 路径布局、初始 checkpoint、两张可读预检图、截图原始输出 |
| G1 | 新 Git 克隆、新 SVN 检出，核 Git/npm/SVN 来源 | clone 命令、remote/HEAD/tag/status；SVN URL/revision/初始空 status；npm latest、tarball、integrity、provenance、Release/发布作业 |
| G2 | 核当前 API、插件自身质量门禁、三应用从零接入与最小联通；处理发现的问题 | 实际类型/exports、静态引用扫描、build/test/typecheck/pack-smoke 真实退出码；三项目安装和接入清单 |
| G3 | **冻结最终插件正式版和 MES 接入代码**，新 profile、冷缓存完成 dev 全量 | 冻结快照；首次访问原件；菜单/页面逐项表；专项 JSON、截图和网络记录 |
| G4 | 三应用串行生产构建、备份并成组部署 8662，完成 8662 全量 | 原生构建退出码、产物哈希、备份、六端点、在线 manifest、独立 prod 全套结果 |
| G5 | 最终正式包当前 API 的负向诊断与中文真实截图 | 受控复现、真实 Console/终端截图、原始输出、退出码和恢复证据 |
| G6 | 归因、核终态、写独立报告和交付 | 每项 PASS/FAIL/未验证及原件索引；Git/SVN/8662 终态；目录树无新增根目录 |

若 G3 后改动插件源码或测试源码，先按 §7 发布新正式版，再**重新冻结并从 G3 到 G5 全量重跑**。若改动 MES 接入或构建配置，为了本轮“从头到尾”的可信度，也在最终代码固定后用新的 attempt 和浏览器 profile 把 G3、G4 的全套重新跑一遍。修复探索期的零散 PASS 不能拼接成最终结果。

## 3. G1：从零取源并核对正式包

1. `git clone https://github.com/chenmingye/fulgurjs-federation.git <本轮>/plugin`；记录 `git remote -v`、分支、HEAD、最新 tag、`git status --short`。不要把工坊主仓库或上轮克隆称作本轮新克隆。读新克隆的 `AGENTS.md`（若有）、README、包 `package.json`/exports/类型、CHANGELOG、examples、CI、当前 e2e；本任务书不代替当前 API 源码。
2. 先 `svn info` 核实地址，再把 `https://192.168.2.4/svn/Project/MES_ZC/trunk/mes_zc/cku-mes-serverless` 全新 `svn checkout` 到 `<本轮>/mes-zc`。记录 Repository Root、URL、Revision、Last Changed Author、初始 `svn status`（应为空）、admin/BPM/lowcode 的实际项目根。若地址或目录结构变化，以现场为准，记差异；不要从旧副本拷贝。SVN 凭据不写入日志、命令行明文或报告。
3. 现场查询 `npm view @fulgurjs/federation version dist.tarball dist.integrity dist.attestations --json`、dist-tags、npm tarball 内容、对应 GitHub tag/Release/publish 工作流。记录查询时间和完整 integrity/provenance。检查 Git HEAD 相对发布 tag 的**实际文件差异**：纯报告提交可领先 tag；源码/测试源码若有未发布提交，先处理发布缺口，不能用旧正式包代表新源码。
4. 查实际 CI/package scripts 后运行插件自身构建、单测、有效项目 tsconfig 的类型检查、pack-smoke；记录完整命令和**进程真实退出码**。管道输出不能掩盖失败。独立隔离 fixture 从 registry 装正式包做最小 API/CLI 接入；本地源码构建只能作插件质量检查，不能代替正式包测试。**完整 MES dev/prod 只在发版结束后跑一次最终轮**。

## 4. G2：全新 SVN 副本只用当前公开 API 接入

先对照当前正式包 `exports`、类型声明、README 与真实项目源码设计接入，再修改 SVN 本地副本。每个应用**自己的项目根目录**放 `fulgurjs.config.ts`，`vite.config.ts` 直接引入本应用配置并调用一次 `federation(fulgurjsConfig)`；字段、默认值以最终正式包为准。不要使用共同父目录配置、`loadRepoConfig`、`federationOptionsForApp`、`--app`、已删除选项、手写启动器或应用侧 `@fulgurjs/federation/internal/*`。运行时只用公开 `/runtime` 入口。普通 TS expose 是模块导出，**不会因暴露而自动调用**；应用级初始化由 `setup`，会话变化由可选 `onSession` 承担。

逐项目明确以下责任并写入接入清单：

| 应用 | 必须看见的实际接线 |
| --- | --- |
| admin 宿主 | 项目根配置、真实 `remotes`、同一份页面表供 `hostPages` 具名导出与 `createHostPages` 使用；真实菜单到路由映射；桥提供当前用户/token/权限/字典/事件与非敏感 `sessionKey`；登录/退出分别提供与清理上下文；乾坤关闭时相关模块延迟导入，不静态加载 qiankun/single-spa。 |
| BPM | 项目根配置中的真实 `exposes`/`setup`，可选 `onSession` 同步账号与权限；流程页面按需加载；原有插件、base、代理与业务路径保留。 |
| lowcode | 独立的 `exposes`/`setup`/会话同步；使用宿主当前真实身份和权限；设计器/表单页面按需加载。 |

上轮 5.0.2 报告提供**待复核风险清单**，不是可直接复制的补丁：admin `sourcemap:'inline'` 大 chunk 构建溢出、生产 `manualChunks` 与共享门面初始化循环（曾由合适的 `eager` 配置解决）、发起表单需要 `form-create` 注册、乾坤门控静态导入、401 桥不应伪造 `REFRESH_TOKEN`、双 `/main` 路径、审批详情标签位置。先查新 SVN 当前源码是否仍存在相同条件，再用对照证据决定最小修改；不能盲加配置、删业务功能或复制旧构建产物。

三应用精确安装**同一最终 registry 正式版**，逐一核对 `package.json`、锁文件 resolution/integrity、`node_modules/@fulgurjs/federation/package.json`；留下安装命令和输出。扫描新接入文件与项目内联邦引用，列出所有现行公开 API、任何旧 API/已删字段/内部路径引用，旧引用为 0 才进入 G3。每个项目跑实际可用的 `explain`；宿主 `check-pages` 指定真实 dev manifest、加 `--require-verified`，指定来源不可达不能悄悄回退本地旧 dist。

## 5. G3：dev 最终冻结轮（必须独立完整）

冻结前记录 Git HEAD/tag、正式包版本/integrity、SVN diff 与三应用本地改动清单、锁文件、脚本哈希、页面表、菜单快照。由本轮启动且已确认归属的 dev 进程、缓存和浏览器 profile 可以重置；用户进程与 8085 后台不可动。新 profile、冷缓存、未预热地记录首次登录、dashboard、首 BPM 页、首 lowcode 页。任何 504、DEV-010、MFU 错误、白屏、接口失败先保存 `attempt-01` 原件，再定位并另开 `attempt-02`；复测成功不能抹掉首次失败。

**dev 必测清单，每项独立 JSON/截图/网络或接口证据：**

1. 从本轮真实菜单接口和本轮页面表生成**完整菜单→路由→远程 expose→manifest** 映射，每个当前入口逐项打开；历史“25/26/27/28”都不是固定通过数。每页断言真实标题、关键控件、核心接口状态与有效数据、console warn/error、pageerror；“HTTP 200”“页面有字”“脚本标绿”均不足以通过。参数页从本轮真实模型/定义/实例/报表/表单数据获取 ID；无有效数据则标未验证并说明，不填占位 ID。
2. 用本轮新实例完成真实 UI 的发起→待办→从行内办理→通过所有必要节点→待办消失→已办出现/实例结束；每一步关联同一 instanceId 和实际 taskId。不能只调用创建 API 代替 UI 发起。若某流程缺候选人等后台数据，记录错误原文和同 SVN 版本原应用对照，另选真正可发起流程完成插件闭环；原失败仍列业务问题。
3. 同一浏览器会话中 A 登录、开 BPM 与 lowcode、真实 UI 退出、B 登录再开两者：记录 `sessionKey` 代次、上下文清理、远程用户/权限/缓存变化、无 A 残留及用户可见 MFU-013。两个互不相关会话分别登录不算通过。
4. 受控浏览器会话注入 401，核真实请求/响应、重登提示、**没有伪造 refresh token 或失败刷新链**、恢复；再单独拦远程入口触发真实 MFU-001 中文错误并解除拦截恢复。不能关共享远程服务制造故障。
5. 审批详情截图及几何测量：标签栏在业务内容上方，流程图、流转记录、表单/AMIS 按当前真实可达路径工作；不要把旧版截图充当证据。
6. 冷缓存 Network 量化懒加载：dashboard 的远程页面 expose 下载数、首次 BPM 页、第二 BPM 页增量、首次 lowcode、复访新增字节、显式 `preloadRemote`；分别列 remoteEntry、manifest、expose、共享 chunk、CSS/字体/文档的请求与字节。不能只写“7/7”。
7. 乾坤关闭状态下完整走登录、dashboard、BPM、lowcode：qiankun/single-spa 网络请求数和相关 warning/event **均为 0**；如果有，先定位应用静态导入还是插件行为。MFU-010 等真实共享版本告警记录出现位置、版本需求、实际选择和去重次数，不强行消音或把每条告警都当作失败。

## 6. G4：8662 独立生产形态全量验收

先查三项目**真实构建脚本**，串行构建 BPM、lowcode、admin，admin 必须跑完整原生 build（含 postBuild）。每次保存完整 stdout/stderr、真实退出码、产物路径和哈希；并行构建造成的内存竞争不算代码根因，也不能用半套 dist 部署。若构建失败，保留原件，做最小 A/B 对照定位插件与原应用责任；修复后重新构建全部最终产物。

现场核 `nginx -T`、监听 PID、8662 实际 webroot、当前三目录和哈希；历史 `/opt/homebrew/var/www/fulgurjs-test/` 仅作线索。先备份 `main/`、`flowable/`、`lowcode/` 到**同一个本轮编号的备份组**，核可回退，再成组部署最终产物；不替换其他站点。若需调 nginx，仅在 `nginx -t` 通过后 reload，**不停止 8662**。

部署后逐项记状态、Content-Type、Cache-Control、版本和本地/线上哈希：`/main/`、`/main/_app.config.js`、`/flowable/fulgurjs-remoteEntry.js`、`/flowable/fulgurjs-manifest.json`、`/lowcode/fulgurjs-remoteEntry.js`、`/lowcode/fulgurjs-manifest.json`。固定入口、manifest 与 `_app.config.js` 检查 `no-cache`；带哈希 chunk 另查缓存策略。最终正式包运行 `check-pages --site http://localhost:8662 --require-verified`，结果须写出**实际命中的 8662 在线 manifest URL**、逐项数量和真实退出码。新浏览器 profile 强刷 BPM、lowcode 深链。

随后在 8662 **重新执行 §5 的全部 7 类检查**：动态菜单与参数页、真实 UI 审批闭环、同会话 A→B、401、MFU-001 故障恢复、详情布局、懒加载、乾坤门控与共享告警。prod 的 JSON、截图、网络记录必须与 dev 分目录；不能把 dev PASS 复制成 prod PASS。故障注入只用隔离浏览器上下文，不停 nginx/后端/其他会话。完成后复查 8662 六端点和深链，保留站点、最终产物、旧及本轮备份供用户复测。

## 7. G5：当前 API 负向诊断；缺陷修复与版本规则

在 `<本轮>/work/fixture/` 从 registry 安装最终正式包，**只测当前公开 API**。至少真实触发并留原始输出、次数、真实退出码、恢复结果、可读中文截图：共享版本兼容时零误报；真实不兼容时 MFU-010 告警去重；`strictVersion` 的 MFU-003 拒绝；远程不可用 MFU-001 与恢复；当前合法配置字段的非法值（如 remote 缺地址）的 CLI/Vite 中文报错；`dts` 缺 `fsRoot` 的真实降级。已删旧 API 只做 exports、类型与应用静态扫描，**不得在 MES 应用中重加它们，也不得把旧 API 报错算作当前 API 负向验收**。

截图要捕获**实际浏览器 DevTools Console**和**实际运行命令的终端窗口**，让完整中文错误码、当前情况、原因及处理办法可读；太长分多张。保留相应机器原始 stdout/stderr、console JSON、网络记录。禁止用文字转图、HTML 假终端、手写 `console.warn`、图片覆盖字或剪掉关键文本。截图能力在 G0 已预检；若仍不可用，标“未验证”并说明，不能声称完整通过。

缺陷处理顺序：保存首次失败原件→做最短复现与同版本对照→归因→改责任层→回归验证→按门禁重跑。插件源码或测试源码改动：检查调用方、补有意义回归测试和相关 README/CHANGELOG，按仓库现行发布工作流提交推送、tag、GitHub Release、publish、npm latest/tarball integrity/provenance 与包内容全部核实；三应用重装**同一个新正式版**，从 G3 开始完整重跑。纯报告/任务书提交不人为发版。MES 侧只改本地 SVN 副本，**不提交 SVN**。原项目、权限、后台或第三方问题只有源码、请求、调用栈及必要的同 SVN 版本非联邦对照足以证明时，才标外部问题；归因不明就写“未定”，不能白名单化。

## 8. 证据、报告、终态和完成标准

`evidence/` 内按 `source/`、`release/`、`dev/attempt-*`、`prod-8662/attempt-*`、`negative/`、`final/` 分区。原始 JSON/日志/截图/HAR 摘要不得覆盖；每条结果至少带本轮编号、时间、Git HEAD、SVN revision、包版/integrity、脚本哈希、URL、断言/接口状态、console/pageerror、请求、真实退出码、截图路径。生成索引与关键文件 SHA-256，结果计数能由 JSON 重算。凭据、token、Cookie、人员敏感信息不得进入公开报告或截图。完整截图/HAR/本地 SVN 改动全在被忽略的 `testbed/`，**绝不 `git add -f`**。

在本轮新 Git 克隆 `plugin/docs/` 写一份独立最终报告，可公开的报告与必要脱敏脚本按项目 Git 流程提交、推送；推送前检查暂存清单，确保没有截图、凭据、SVN 副本或安装副产物。报告应有：

1. 来源表：新 Git/SVN 路径、remote/HEAD/tag、SVN URL/revision/初始和终态 status、npm latest/tarball/完整 integrity/provenance、三应用锁文件和 node_modules 版本。
2. G0—G6 流水表：每一门禁的开始结束时间、操作、真实退出码、结果、原始证据；首次失败与复测分行，不能覆盖。
3. **dev 与 8662 两张独立逐项表**：所有当前菜单/页面及参数页的 URL、真实业务断言、接口/console/pageerror、首次/最终结果、JSON/截图路径。专项表分别列审批同一实例、账号切换、401、MFU-001、布局、懒加载请求数/字节、乾坤门控和负向诊断。
4. 问题归因表：插件、MES 接入、原项目/权限/后台/第三方、环境工具；每项给最短复现、首次原件、定位或对照、修复位置、最终复测或未解决状态。插件结论与 MES 业务结论分开写。
5. 终态：本轮最终 npm 版本及 release/工作流、Git 提交/推送、`svn info/status` 且零提交、8662 nginx/六端点/深链/部署哈希和备份、本轮已启动的临时进程按 PID 收尾；8085、nginx、8662 仍在。列 `Plugin_Workshop` 根目录清单，证明本轮未新增测试目录。

只有**最终同一正式包与同一接入代码**下，G0—G6 均有可复算证据，dev 与 8662 的插件必测项全 PASS，负向真实复现和截图完成，8662 留站、SVN 零提交，才能写“插件完整验收通过”。外部业务问题可单列且不阻断插件结论，但**对应业务项必须保留 FAIL/外部问题**。任一插件必测项或证据缺失，写“完整验收未完成”及可执行的剩余步骤；不得用“基本全绿”“上轮通过”或“脚本标绿”代替。
