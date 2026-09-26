# 最新 API：全新 Git 克隆、全新 SVN 副本、dev 与 8662 从零复验任务书

> **交给另一位 AI 直接执行。** 编写日期：2026-09-27。此前 5.0.1 报告只能当作“已知问题线索”，不能当作本轮通过证据，也不能复用它的浏览器 profile、测试副本、构建产物、JSON 或截图。本轮从空目录获取源码，按执行当时实际发布的**最新正式 API**重新接入和测试。这里的“从零”包含插件 Git 工作区与 MES-ZC SVN 测试副本两个独立来源。

## 0. 任务目标、边界与完成定义

1. 从 `https://github.com/chenmingye/fulgurjs-federation.git` **新克隆**插件仓库；从已核实的 MES-ZC SVN 地址**新检出**测试工程。两个目录都不能从旧工作区复制、移动或软链接源码、`node_modules`、`dist`、`.vite`、生成类型或测试结果。用户会处理旧项目的删除；执行者**不要自行删除仍存在的旧目录或覆盖用户文件**。若目标目录仍被占用，选择一个新的并列目录并在报告中记录其绝对路径。
2. 在执行当时核实 npm registry 的 `@fulgurjs/federation` `latest`、tarball、完整 integrity、provenance，以及 Git 对应 release/tag/commit。**真实 MES 接入和两环境测试只能安装 registry 的最终正式包**，禁止 `file:`、`link:`、`workspace:`、本地 tarball、Git 安装或把源码工作区的产物复制到三个应用。开始时的已知基线是 5.0.1，但不能预设执行时仍为最新版。Git HEAD 若比最新 tag 多出插件代码，先查清是否有未发布代码；不得把旧 npm 包的测试结论写成新 HEAD 的结论。
3. 三个 MES 应用只使用当前 README 和正式包类型声明里的 API：每应用根目录各一份 `fulgurjs.config.ts`，默认导出直接符合 `FederationOptions`；本应用 `vite.config.ts` 明确写 `federation(fulgurjsConfig)`；业务运行时只从 `@fulgurjs/federation/runtime` 导入公开 API；远程初始化使用配置里的 `setup` 和其可选 `onSession`，宿主先 `provideAppContext`，退出时 `clearAppContext`。宿主页面表只维护一份，供 `createHostPages` 和配置的 `hostPages` 具名导出共用。以实际源码、当前文档和类型签名确定字段与路径，下面只是形态说明，不能直接复制成假配置。
4. **没有历史包袱**：新接入代码、配置、测试 fixture 不依赖任何共同父目录配置、旧包装函数、手动启动器、已删选项或包的 `internal/*` 子路径。旧入口是否已从正式包消失，可以通过 `package.json` exports、类型声明和 npm 包清单做**静态核对**；不要为了“兼容性测试”在三应用重新写旧 API。旧报告、旧业务 ID、旧菜单数量、旧截图、旧浏览器缓存都不能充作本轮结果。
5. dev 与 **8662 生产形态**都做完整业务验收，且按正式包版本各自留证。8662 是用户保留的复测站：替换前备份当前产物；结束后**不停止 nginx、不关闭或删除 8662、不删除最终产物和回退备份**。MES-ZC SVN 工作副本从头到尾**绝不执行 `svn commit`、`svn import`、`svnmucc` 或向任何 SVN 分支提交**。

> 任务的终点不是“脚本显示全绿”，而是用户能从报告逐条打开原始结果、真实截图、发布来源和终态证据，确认最新 API 在干净项目的首次使用、dev、8662 均有效。任一场景失败必须先保留首次证据，查明归因，再修复或单列边界；不准重跑覆盖失败记录后宣称首轮通过。

## 1. 新克隆与发布源核实

### 1.1 插件仓库

- 在空目录运行 `git clone https://github.com/chenmingye/fulgurjs-federation.git <新目录>`。记录命令、clone 目标、`git remote -v`、`git rev-parse HEAD`、当前分支与 tag、`git status --short`（新克隆预期为空）。不得把旧工作区打包后解压，也不得从旧 `testbed/` 拷文件。
- 读新克隆的 `AGENTS.md`（若有）、根 README、`packages/plugin/README.md` 的实际来源关系、`packages/plugin/package.json`、`CHANGELOG.md`、`examples/`、当前导出类型和 e2e 脚本。历史任务书仅用来查漏，**当前公开 API 以最新版源码与正式 npm 包为准**。如果历史文档与当前 API 冲突，记录冲突并按当前 API 执行，必要时修正文档。
- 分清两个版本状态：`git HEAD` 可以因为文档提交领先发布 tag；只有插件代码或包内容领先 npm 时才构成“未发布代码”。比较 tag 到 HEAD 的实际差异，不凭提交数量猜。记录包 `version`、Git tag、release commit 与 registry package 的关系。
- 新克隆不含旧机器的未跟踪根 `pnpm-lock.yaml`。检查**实际被 Git 跟踪**的锁文件；已知插件包有 `packages/plugin/pnpm-lock.yaml`，e2e 有 `e2e/pnpm-lock.yaml`。按各子工程已有 package manager/锁文件安装，优先 frozen lockfile；不要从旧工作区复制根锁文件或依赖目录来“修复”安装问题。记录 Node、pnpm、npm、系统版本与安装命令。

### 1.2 正式包

- 现场查询 `npm view @fulgurjs/federation version dist.tarball dist.integrity dist.attestations --json` 与 dist-tag；核实对应 GitHub Release、publish 工作流成功以及 npm 包的真实 exports、README、CLI。把完整 tarball URL、integrity、provenance、查询时间放进报告。安装后的三个应用必须精确锁定同一个最终版本，`package.json`、各自 lockfile resolution/integrity、`node_modules/@fulgurjs/federation/package.json` 三处逐项一致。
- 先在插件新克隆运行当前仓库支持的包级 `typecheck`、单测、build、pack-smoke，以及必要的独立目录 npm 包最小接入检查；记录实际命令与退出码。此处是质量门禁，**不在新版本发布前额外跑完整 MES 业务验收**。若本轮发现需修改插件代码：补有意义的回归验证，更新版本、README/CHANGELOG、提交并推送 Git，创建 tag/Release，确认 publish 工作流与 npm registry 正式包，再用**新正式版本**开始或重新开始 MES dev 与 8662 全量测试。不能只提交代码不发版。仅改验收报告或测试证据，不因此人为发一个插件代码版本。

## 2. 全新 SVN 检出与当前 API 接入

历史核实的 SVN 地址如下，执行时先对地址重新 `svn info`，不能把历史修订号当作当前状态：

```text
https://192.168.2.4/svn/Project/MES_ZC/trunk/mes_zc/cku-mes-serverless
```

在**新克隆**内的 `testbed/mes-zc/` 做全新 `svn checkout`；若目标路径已存在，先查来源和改动，改用新路径，不执行删除。保存 SVN URL、Repository Root、Revision、Last Changed Author、检出后初始 `svn status`（预期为空）和三项目目录清单。SVN 凭据只走正常交互，不进入命令行明文、报告、截图或 JSON。测试副本完全保持本地用途，最终 `svn status` 的 `M`/`?` 要逐类解释，但不提交。

按新检出的真实源码重新实施 admin、BPM、lowcode 联邦接入：

当前 API 的最小形态如下；`my-app`、URL 和 expose 路径只是说明字段位置，执行者必须换成新 SVN 项目的真实容器名、地址与文件路径，不能把这段示意代码原样当成验收成果：

```ts
// 每个应用自己的 fulgurjs.config.ts
import type { FederationOptions } from '@fulgurjs/federation'

export default {
  name: 'my-app',
  exposes: { './pages/home': './src/views/Home.vue' },
  remotes: { 'remote-a': { dev: 'http://localhost:5174/remote-a', prod: '/remote-a' } },
  setup: './src/fulgurjs/setup.ts',
  shared: { vue: { singleton: true } },
} satisfies FederationOptions

// 同一应用的 vite.config.ts（其余已有 Vite 配置原样保留）
import federation from '@fulgurjs/federation'
import fulgurjsConfig from './fulgurjs.config'
// plugins: [ ...原有插件, federation(fulgurjsConfig) ]
```

纯宿主没有对外模块时可不写 `exposes/setup`；远程不反向消费别的应用时可不写 `remotes`。宿主的页面表通过配置文件**具名导出** `hostPages` 供 CLI 读取，并与业务里 `createHostPages` 使用同一份页面数据。浏览器侧的联邦函数从 `/runtime` 导入，`setup.ts` 默认导出应用级 `setup(context)`，可选具名导出会话级 `onSession(context)`；它们的最新签名以本轮正式包类型声明为准。

| 项目 | 最新 API 接入与业务要求 |
| --- | --- |
| admin 宿主 | 项目根配置只描述本应用 `name/remotes/shared` 等当前字段；`hostPages` 具名导出与运行时 `createHostPages` 取同一份页面数据；桥提供真实用户、token 获取函数、store、权限/字典/事件及非敏感 `sessionKey`；退出调用 `clearAppContext`；从真实菜单注册页面路由。关闭乾坤时不能静态加载 qiankun/single-spa 运行时，也不出现 #1 告警。 |
| BPM 远程 | 根配置声明真实 `exposes` 与 `setup` 文件；`setup(context)` 完成应用级注册，可选 `onSession(context)` 随宿主登录代次同步身份、权限和数据；页面/流程操作从现有源码选择并按需加载。 |
| lowcode 远程 | 同样独立配置 `exposes/setup/onSession`；使用宿主当前真实身份，不写死管理员；设计器与表单页面按需加载。 |

Vite 插件列表保留各项目原有插件、base、代理、端口、postBuild 和环境规则，只在真实需要的位置加入一次 `federation(fulgurjsConfig)`。根配置是**本应用的配置**，不可引用相邻应用源码或共同父目录。普通 TS expose 只负责导出模块，加载它不等于自动调用函数；应用生命周期只由 `setup/onSession` 承担。若 `fulgurjs init` 可帮助生成起步配置，可使用它，但要核对产物是否符合项目实际，不得让自动生成的示例覆盖真实业务文件。

验收前在三应用做当前 API 静态扫描：业务侧联邦导入只来自包根或 `/runtime`；无已删除字段、旧聚合形状、用户手写的 `internal/*` 导入、父目录配置依赖或手动启动器。`fulgurjs explain` 在各应用目录无需额外应用选择器；宿主 `check-pages` 用显式真实 manifest 来源和 `--require-verified`。输出中的所有 remote 必须映射到真实线上或 dev manifest；指定来源不可达时必须诚实报无法验证，不能回退旧 dist 冒充成功。

## 3. 证据管理：先建目录，失败先封存

- 在插件 Git 克隆目录**外**建立本轮独立证据根，例如 `/Users/Admin/Desktop/ai_project/Plugin_Workshop/fulgurjs-validation-evidence/<日期时间>-<正式包版本>/`。即使用户以后再次删除插件克隆，证据也能存活。目录含 `baseline/`、`source/`、`dev/`、`prod-8662/`、`negative/`、`release/`、`final/`；每次尝试使用新的 `attempt-01/02/...`，**绝不覆盖原 JSON、日志、截图或 HAR/网络摘要**。报告写明绝对路径、文件索引和每个关键文件的 SHA-256；保存失败后才能修复/预热/重试。
- 每个结果至少记录：执行命令/脚本版本、Git HEAD、npm 包版及 integrity、SVN revision、环境地址、时间、浏览器 profile、真实 URL、断言/接口状态、console warn/error、pageerror、网络请求、退出码、截图路径。页面截图应包括能识别业务内容的主体，不能只靠 HTTP 200、空白页或页面有字判 PASS。报告中的计数必须能由 JSON 重新计算。
- **真实截图，不做文字转图片**：浏览器诊断需截实际页面与打开的 DevTools Console，让完整中文错误码、现象、原因、影响/修法可读；过长时分多张截图并记录顺序。终端诊断需截图**实际运行该命令的终端窗口**，保留原始 stdout/stderr 文本、命令和退出码。禁止把 `.txt` 渲染成黑底图片、手写 HTML、`console.warn` 模拟插件输出、截图后覆盖文字，或只截被横向裁断的一行 JSON。当工具无法控制 DevTools/终端截图时，如实报告“截图门禁未完成”，不能用合成图片代替。
- 不在证据中写 token、Cookie、密码或带凭据 URL；业务数据、人员信息按现行规则脱敏。**所有测试截图一律不提交 Git**，包括所谓“脱敏后可公开”的截图；`.gitignore` 已统一忽略 `docs/screenshots/` 等测试截图目录，也不允许 `git add -f` 强行加入。公开 Git 仓库只提交不含敏感信息的报告、必要脚本与非图片的脱敏摘要；完整截图与 HAR 保存在上述仓库外证据根，附索引与哈希。不要因截图未被 Git 跟踪就宣称“远端已保存全部证据”。

## 4. dev 从冷启动开始完整验收

先记录 dev 端口占用与 PID 归属，历史端口是 admin 8773、BPM 4529、lowcode 4669；以新检出工程当前配置为准。用户进程与后端 8085 不擅自停止。先清理**本次新克隆和新 SVN 副本自己产生**的缓存，再启动服务，使用新的浏览器 profile，记录三端点与 manifest 状态。

**首次访问必须单独留证。** 首次登录、dashboard、首次 BPM 页面、首次 lowcode 页面在未预热状态下分别记录网络与页面结果。若出现 `504 Outdated Optimize Dep`、`DEV-010`、`MFU-001` 或白屏，立刻把本次失败 JSON、网络、console、截图保存到 `attempt-01/`，并确认是 Vite 预构建窗口、联邦集成还是业务项目原因；然后才能预热或重启并跑 `attempt-02/`。不能因第二轮全绿就把首轮失败写成“首次通过”，也不能只凭 README 的“已知暂态”判定不是插件问题。若冷启动失败稳定可复现且由插件接入引起，先修插件、发新版本，再重新验收。

随后在 dev 独立完成下列矩阵。脚本可参考仓库现有 e2e，但先检查硬编码路径、旧版字段、业务 ID、浏览器 profile、输出路径与断言，必要时在**新工作区**调整或重写；禁止导入旧工作区的脚本和结果。

1. 从当前真实菜单接口与运行时页面表重建映射：记录每个菜单入口、目标路由、远程 spec、manifest expose、是否覆盖。历史的“26 页面记录、27 菜单、28 检查”只是参考，不作为固定通关数字；当前多或少都要解释。每页断言真实业务标题、关键控件/表格/设计器、核心接口状态与数据内容、console/pageerror，并保存独立截图。带参数的模型编辑/复制/定义、流程详情、审批操作、报表测试、外部表单等路由，必须从本轮真实列表或本轮实例获取有效参数，不能填占位 ID。
2. 审批业务闭环以**本轮新实例**核对发起→待办出现→从该待办行办理→通过→待办消失→已办出现/实例结束。各步记录相同 instanceId/taskId、接口、列表与截图；不能只看按钮存在。
3. A 账号登录→打开远程页→退出→B 账号登录：`sessionKey` 改变、`onSession` 按新代次同步、lowcode 身份与权限属于 B，无 A 数据残留、无用户可见 `MFU-013`。检查退出时桥的清理、401 时是否诚实要求重登，不能伪造 refresh token。
4. 审批详情的标签栏位于内容上方；记录同一视口截图和 header/content 实测几何位置。检查流程图、流转记录、业务表单/AMIS 的实际可用性。
5. 用冷缓存 Network 测懒加载：dashboard 不下载两个远程的页面 expose；首次 BPM 页只下载所需页面模块；第二 BPM 页增量；首次 lowcode 仅下载所需子集；重复访问已看过的页无不必要重复下载。单独调用当前 `/runtime` 的 `preloadRemote` 验证显式预载可工作。区分 remoteEntry、manifest、expose、共享 chunk、CSS、文档请求，记录文件数、字节与耗时；不能仅用“7/7”结论代替原始请求清单。
6. 从浏览器会话单独拦截远程入口制造 `MFU-001`，看到真实中文错误占位；解除拦截后页面业务数据恢复。401 场景同样用隔离浏览器会话做受控注入，不改变后端全局状态。不通过停止远程 dev server 来制造故障。
7. 关闭乾坤的正常模式，登录→dashboard→BPM→lowcode 全程记录 qiankun/single-spa 网络请求与 console 事件，目标都是 0；若原 SVN 应用侧仍有静态导入，只在测试副本修正并重新测，不把它误归为插件包缺陷。

## 5. 8662 生产形态：重新构建、备份部署、完整复验

dev 完成后，串行构建 BPM、lowcode、admin（含 admin postBuild），确保构建使用同一版 registry 正式包。并行大构建可能造成内存竞争，不据此误判代码。先从实际 `nginx -T` 核对 8662 的站点配置和真实 webroot；历史位置 `/opt/homebrew/var/www/fulgurjs-test/` 仅作线索。备份当前 `main/`、`flowable/`、`lowcode/` 产物并记录路径、时间、哈希，再替换为本轮构建产物。不要修改其他站点；需要改 nginx 时先 `nginx -t`，只 reload，不 stop。

生产形态至少检查六端点：`/main/`、`/main/_app.config.js`、`/flowable/fulgurjs-remoteEntry.js`、`/flowable/fulgurjs-manifest.json`、`/lowcode/fulgurjs-remoteEntry.js`、`/lowcode/fulgurjs-manifest.json` 的 HTTP 状态、Content-Type、Cache-Control 与产物版本；固定入口及 `_app.config.js` 应 `no-cache`，对带内容哈希的 chunk 另查缓存头。登录态强刷一个 BPM、一个 lowcode 深链，确认可恢复业务页面。运行正式包的 `check-pages --site http://localhost:8662 --require-verified`，结果必须明确列出 **8662 在线 manifest URL** 和核对数量、退出码。

**在 8662 完整重做 §4 的菜单/参数页、审批闭环、账号切换、401、MFU-001 故障恢复、详情标签、懒加载和乾坤关闭检查。** dev 的通过结果不能代替 prod。全部使用本轮新的浏览器 profile、测试实例和证据目录；不能引用之前部署在 8662 的截图/JSON。生产测试期间用浏览器级拦截做故障注入，绝不停止 8662 或污染其他用户会话。最终再核对 nginx 监听、六端点、一个 BPM 深链、一个 lowcode 深链与最终产物，**保留 8662 正常运行供用户复测**。

## 6. 当前 API 的负向诊断与中文截图

在隔离 fixture 中从 registry 精确安装**本轮最终版本**。负向用例只操作当前仍公开的 API/选项；不把已删除 API 写回三个 MES 应用，不搭旧聚合配置或旧手动启动器。至少覆盖：

| 场景 | 真正触发方式 | 必须断言与留证 |
| --- | --- | --- |
| 共享依赖兼容 | 当前 `/runtime` 的 `initSharing/registerShare/loadShare`；注册满足要求的两个版本并用普通和 `strictVersion` 读取 | 实际选择的版本满足范围、零 `MFU-010/003`，浏览器 console 原始 JSON 与页面状态 |
| 共享依赖真实冲突 | 独立 shareScope，只注册不满足要求的版本，重复两次 `loadShare`；再在隔离 scope 中设 `strictVersion:true` | 插件真实输出恰一条中文 `MFU-010`，严格拒绝真实抛 `MFU-003`；实际 DevTools Console 截图能读全四段说明，JSON 留事件类型与次数 |
| 远程不可用与恢复 | dev、8662 分别在独立浏览器 context 拦截当前远程入口；然后解除拦截 | 页面真实 `MFU-001` 中文占位及 Console 截图；网络被拦请求、恢复后接口和业务数据截图 |
| 当前配置输入错误 | 在临时工程对当前 `FederationOptions.remotes` 提供缺地址等非法形状，运行真实 CLI 或 Vite build | 真实中文错误含当前值、预期、修法示例，非零退出；**实际终端窗口**截图 + 原始 stdout/stderr；修正后成功 |
| 类型降级 | 在隔离可信 fixture 用当前 `dts` 机制消费缺 `fsRoot` 的 manifest | 中文降级原因与行为清楚，原始日志及实际终端截图；不将故障 manifest 用于 8662 |

错误截图必须能让用户在**不打开 JSON**的情况下直接看到错误码和完整中文解释。需要多张就多张；不能把一行超长 JSON 横向截断后算通过。CLI 与 DevTools 两类截图都必须是实际运行时 UI 的捕获。原始机器输出仍需保存，以证明截图对应真实事件。

## 7. 归因、修复与重测规则

- 插件缺陷：提供最短复现、根因、受影响源码、回归测试，按既有 Git 推送和正式发布流程出**新版本**；三应用重装这个版本并从 dev、8662 的冷启动与全量矩阵重新测。不能把旧版通过结果转记到新版本，也不能用补丁过的本地 `node_modules` 代替发布。
- MES 项目侧接入缺陷：只改新 SVN 本地测试副本并重建/重测受影响两环境；**不提交 SVN**。如果需要真实项目长期保留这类改动，在最终报告列出文件和迁移说明，由用户另行安排项目流程。本测试任务不能通过提交 SVN 解决。
- 权限、后台接口、原项目自身或第三方告警：只在有源码、请求、调用栈或对照复测证据时单列为外部问题；符合用户口径时可不作为插件阻断，但不能隐藏，也不能把插件引起的错归入白名单。首次访问失败即使之后通过，也保留独立记录与根因判断。
- 浏览器/系统资源不足、网络抖动、工具不可用：记录原始日志和时间、调整顺序再试；没有完成的测试写“未验证”，不写 PASS。遇到无法采集真实 Console/终端截图时不可用文字渲染图代替。

## 8. 最终交付与通过标准

在新克隆的 `docs/` 新写**本轮独立验收报告**，并给用户一个仓库外证据根的绝对路径与索引。报告首页写：Git clone 目录/HEAD/tag、registry 正式包与 integrity/provenance、SVN URL/revision/初始及最终 status、三项目安装来源、dev/prod 地址、8662 监听与备份、首次尝试和重试次数。正文按 dev 与 8662 分表列每页/菜单、业务闭环、账号切换、韧性、懒加载、负向诊断、截图与原始 JSON；结果应可由证据重新计算。失败和复测**分别成行、分别链接**。附插件缺陷和项目侧问题归因，列任何未测项。

提交并推送**可公开的报告及必要脚本/非图片脱敏摘要**到插件 Git；**所有测试截图**、完整 HAR、令牌相关数据放仓库外证据根，不推公开仓库。若本轮只是测试与文档提交，不为此单独发布代码版本。最终报告必须给出用户可打开的本机截图路径，不能说“证据已上传 Git”而实际只在被删除的工作树中。只有下列条件同时成立，才可以写“本轮完整验收通过”：

1. 新 Git clone、新 SVN checkout 可核实，未借旧产物；三个项目只用当时最新的正式 API 与同一 registry 正式包。
2. 插件质量门禁、dev 全量、8662 全量、当前 API 负向诊断、中文真实截图均完成；失败有首次证据、复测有独立证据、归因有来源。
3. `check-pages` 来源为真实 dev/8662 manifest；业务页断言不是“有字就过”；懒加载有网络量化；账号与审批闭环使用本轮真实数据。
4. SVN 从未提交；8662 已备份并保持运行；Git 报告可读，仓库外完整证据仍存在且路径/哈希明确。

如果任何条件缺失，报告应明确“核心功能已通过，但完整验收未完成”并列剩余工作；**不允许用“28/28”或“全部完成”概括尚缺的首访失败证据、真实 Console/终端截图和归档状态**。
