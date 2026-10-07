# 页面清单、类型与 CLI（examples/demos/pages-cli）

`createHostPages` 页面适配器 + `definePages`/`validatePages` 页面表校验 + `fulgurjs` CLI
（init / explain / check-pages / doctor）的一站式演示（README 路径②、§3、§4、§5、§9、§10）。

三个工程互相独立：依赖从 npm registry 安装正式包（`@fulgurjs/federation` 精确 `5.4.3` + lockfile），
不使用 workspace / file: / link: 引用。`negative/` 是负向校验工程——**不启动、不构建**，由
`npm run verify` 管理（详见[下文](#负向工程-negative长期预期编译失败)）。

| 工程 | 角色 | 端口 | 容器名 | 说明 |
|---|---|---|---|---|
| [remote](remote) | Vue 远程（先启动） | **5363**（base `/pc-remote/`） | `pc-remote` | exposes 3 个联邦页面 + 1 个普通组件 + setup/onSession 生命周期 |
| [host](host) | Vue 宿主（vue-router 4） | **5364** | `pc-host`（纯宿主，无 exposes） | definePages + createHostPages 完整接线，7 块诊断面板 |
| [negative](negative) | 负向校验（不启动不构建） | — | — | 预期编译失败 × 3，`npm run verify` 断言错误关键字 |
| [scripts/run-cli-checks.sh](scripts/run-cli-checks.sh) | CLI 检查脚本 | — | — | 5 个 CLI 命令真实采样 + remoteSchema 语义断言，输出 tee 到 `scripts/last-run.log` |

## 快速开始

```bash
# 远程先起，宿主后起（先 install：三个目录各自独立 npm install）
cd remote && npm install && npm run dev   # 终端 1：http://localhost:5363/pc-remote/
cd host   && npm install && npm run dev   # 终端 2：http://localhost:5364/
```

打开宿主 http://localhost:5364/ ，顶部导航：

| 导航 | 路由 | 内容 |
|---|---|---|
| 诊断面板 | `/` | 7 块面板（页面表/校验/remoteSchema/AppContext/契约/时序/远程组件） |
| 订单列表（远程） | `/pc/orders` | 普通远程页 + `requireAppContext` 显式校验 |
| 订单详情 :id（远程） | `/pc/orders/42?tab=basic` | 参数页（显式 spec），params/query 经 attrs 透传 |
| 数据看板 keepAlive（远程） | `/pc/dashboard` | `keepAlive: true` 保活页，计数/输入切走再回不丢 |

```bash
# CLI 检查（不需要 dev server；有 dev server 时 4/5 步输出更全）
cd host && npm install && bash ../scripts/run-cli-checks.sh

# 负向校验（独立工程；verify 退出码 0 = 三类「预期编译失败」全部如期发生且关键字齐全）
cd negative && npm install && npm run verify
```

## 演示操作步骤与预期结果

以宿主 http://localhost:5364/ 为例（面板编号即页面上的 ①–⑦）：

1. **① 页面表与路由解析**：`src/fulgurjs/pages.data.ts` 的 3 条记录原样展示（definePages 校验后
   返回原表，不改写任何字段），每行附 `hostPages.resolve(route)` 解析出的 spec；
   `resolve('/pc/orders/42')` 实时显示 `{ page, remote, spec, params }`；`keepAliveNames` 显示
   KeepAlive include 白名单（`Fulgurjs_pc-remote_pages_dashboard`）。
2. **② 页面表校验（validatePages）**：真实页面表显示「校验通过（0 条违例）」+ R1–R5 逐项计数
   （全 0）。点「**注入违规演示**」——内存里构造一份坏页面表（无显式 spec 的参数页收敛 R1、
   dashboard 重复 R2/R4/R5、ghost 的 spec 不在远程 exposes R3），同一个 `validatePages` 渲染出
   真实违例清单；真实页面表不受影响（数据源是两个独立的数组）。
3. **③ remoteSchema**：`import { remoteSchema } from '@fulgurjs/federation/runtime'` 的具名静态
   导入经 dev 插件探针填充，JSON 视图展示真实内容：

   ```json
   { "pc-remote": { "exposes": ["./pages/orders", "./pages/orders-detail", "./pages/dashboard",
     "./widgets/stat-card", "./setup", "./__fulgurjs_setup__"], "exists": true } }
   ```

   Node 直导入 / build 场景未经插件转换时如实为空表 `{}`（CLI 脚本第 6 步对该语义做了真实断言）。
4. **首次进入任一远程页 → 观察生命周期**：远程 `src/fulgurjs/setup.ts` 声明在
   `federation({ setup })`，宿主首次 `loadRemote` 自动执行——④ 面板的 `globalThis.__PC_SETUP_LOG__`
   出现 `setup` 一条（应用级一次）+ `onSession` 一条（当前代次）。⑥ 面板同时记录真实时序：
   路由进入 → beforeLoad →（超过 delay 200ms 时）骨架屏显示 → 远程页面 mounted。
5. **切换会话（onSession 去重）**：④ 面板点「切换会话」生成新 sessionKey → 再进入任一远程页
   （组件缓存按代次重建，重新走 beforeLoad → loadRemote）→ `__PC_SETUP_LOG__` 追加一条
   `onSession`，`setup` 不重复。
6. **清空上下文（CC-001 / MFU-013）**：④ 面板点「清空上下文」（`clearAppContext`）→
   重新进入「订单列表」：页面内 `requireAppContext('user', 'getToken', 'sessionKey')` 显式抛
   **CC-001**（got/expected/example 三段式），页面面板捕获渲染错误码；首次加载一个未打开过的
   远程页则得到 **MFU-013** 占位（声明了 onSession 却缺 sessionKey）。点「恢复上下文」后再
   「重试加载」即恢复。
7. **保活对照**：进入「数据看板」计数 +1、输入文字 → 切到「订单列表」再切回 → 计数与输入原样
   保留（KeepAlive include 按 `keepAliveNames` 匹配）；「订单列表」未保活，同样操作会重新挂载
   （并重新执行 requireAppContext 校验）。
8. **⑤ 契约面板**：逐条对照宿主页面表 spec ↔ 远程 dev manifest exposes（正是
   `fulgurjs check-pages` 自动化的核对）；远程 dev server 未启动时如实展示「不可达」，
   对应 CLI 的「无法验证（unverified）」语义。
9. **⑦ 远程组件直渲染**：`remoteComponent('pc-remote/widgets/stat-card')` 普通组件通道
   （页面走 createHostPages、组件走 remoteComponent，两条通道互补）。

## CLI 检查脚本与真实输出

`scripts/run-cli-checks.sh`（`set -uo pipefail`，每步分隔标题；「预期失败采样」不中断，
断言失败才 exit 1）。以下输出摘自真实运行（5.4.3，macOS，dev server 运行中）。

### 1) `fulgurjs --help`（退出码 0）

```text
fulgurjs — Vite Module Federation CLI (@fulgurjs/federation)

用法（单项目 fulgurjs.config.ts 在应用根目录；命令默认读 ./fulgurjs.config.ts）：
  fulgurjs init [--template <path>] [--force]      生成单项目 fulgurjs.config.ts 起步模板
                                                   （默认导出直接是 federation() 选项）
  fulgurjs init --config <path>                    校验配置；输出 federation(fulgurjsConfig) 接入块
                                                 与接入核对清单
  fulgurjs explain [--config <path>] [--json]      解释本应用有效联邦形态与加载链（纯本地，无网络）
  fulgurjs check-pages [--config <path>] [--site <URL>]
                        [--manifest <remote>=<路径|URL>]... [--require-verified] [--json]
                                                 核对宿主页面表与远程 exposes（宿主项目运行；
                                                 manifest 来源优先级 --manifest > --site/prod 推导，
                                                 显式指定来源失败不回退；确定性错误非零退出；
                                                 --require-verified 时无法验证也非零）
  fulgurjs doctor --base <URL> --apps <a,b,c> [--dev] [--json] [--chunk-sample N]
  fulgurjs --help
```

### 2) `fulgurjs init`（mktemp 临时目录；二次运行退出码 2）

```text
$ fulgurjs init
[fulgurjs:init] 已生成单项目起步模板 /var/folders/.../tmp.XXX/fulgurjs.config.ts
后续步骤：
  1. 编辑 fulgurjs.config.ts：填入容器名/exposes/remotes/shared（默认导出直接是 federation() 选项）
  2. vite.config.ts 接入（仅两行联邦相关代码）：...
$ fulgurjs init
[fulgurjs:init] /var/folders/.../fulgurjs.config.ts 已存在，拒绝覆盖（--force 强制覆盖）   ← 退出码 2
```

脚本同时 `cat` 生成的模板全文并采样 `--force` 覆盖（退出码 0）。

### 3) `fulgurjs explain`（cd host；人读 + `--json`，退出码 0）

```text
应用 pc-host（宿主，单项目配置，目录 .../examples/demos/pages-cli/host；base/dev 端口由 vite.config.ts 管理）
消费远程：
  pc-remote → dev http://localhost:5363/pc-remote / prod /pc-remote
公开 exposes（0）：（空）
内部 setup：（未配置——无初始化生命周期）
shared：
  vue [singleton] requiredVersion=false
devSharedSelf：false（来源：按角色推断——提供 exposes/setup 的应用为 true，纯宿主为 false）
页面 spec 映射（3）——来源：fulgurjs.config.ts 的 hostPages 具名导出（3 条；运行时真源为应用内同一数据模块）：
  /pc/orders → pc-remote/pages/orders（订单列表）
  /pc/orders/:id → pc-remote/pages/orders-detail（订单详情）
  /pc/dashboard → pc-remote/pages/dashboard（数据看板）
加载链：
  · 宿主提供 AppContext（provideAppContext，含 sessionKey）→ 加载 remoteEntry/共享依赖 →
    首次 loadRemote 执行该远程可选 setup/onSession → 取得页面模块 → 宿主布局渲染
  · 本应用未配置 setup：无初始化生命周期，loadRemote 直接返回模块（普通 expose 语义）
```

`--json` 输出同一信息的结构化形态（`app/role/remotes/pages/pagesSource/chain`），脚本完整采样。
远程工程同命令显示「远程」角色与 exposes（5）；两侧 explain 的页面 spec 映射一致即「同源」。

### 4) `fulgurjs check-pages --manifest pc-remote=http://localhost:5363/fulgurjs-manifest.json`

退出码语义（脚本注释说明后 continue）：「无法验证（unverified）」不是确定性错误——默认退出码 0
（远程 dev server 未启动时同此输出）；加 `--require-verified` 才非零（CI 严格模式）。

```text
[fulgurjs:check-pages] 应用 pc-host：核对 3 条页面，error 0 / warn 0 / 无法验证 1

[UNVERIFIED] 远程 "pc-remote" 的 manifest 不可得（--manifest pc-remote=http://localhost:5363/fulgurjs-manifest.json
 不可达或非有效 manifest）——该远程的 spec 存在性无法核对。
  修法: --manifest pc-remote=<已构建产物路径或 https://…/fulgurjs-manifest.json>，或 --site <部署站点>
```

脚本 4b 采样 `--require-verified`（退出码 1 符合预期）；4c 在远程 dist 已构建时改用本地 prod
manifest 真实核对（退出码 0）：

```text
[fulgurjs:check-pages] 应用 pc-host：核对 3 条页面，error 0 / warn 0 / 无法验证 0
manifest 来源（优先级：--manifest > --site/prod 推导；显式指定来源失败不回退、以实际命中的来源为准）：
  pc-remote ← .../examples/demos/pages-cli/remote/dist/fulgurjs-manifest.json
全部页面 spec 与远程 exposes 一致 ✓
```

### 5) `fulgurjs doctor --base http://localhost:5364 --apps pc-host,pc-remote --dev`

本 demo 是「双独立 dev origin + 纯宿主」形态：doctor 按「单站点根 + 应用路径段」探测
`<base>/<app>/…`，pc-host 无容器入口、pc-remote 入口在另一 origin——FAIL 属 doctor 的诚实结论
（退出码 1，脚本 continue）；面向 nginx 单站点聚合部署形态时同一命令逐应用 PASS。

```text
[fulgurjs:doctor] FAIL [pc-host] fulgurjs-remoteEntry.js
  现象：fulgurjs-remoteEntry.js 返回的是 HTML 而非 JS：http://localhost:5364/pc-host/fulgurjs-remoteEntry.js
  根因：nginx try_files/深链回退把入口请求兜到了 index.html（联邦宿主会把它当模块解析直接失败）
  修法：为 remoteEntry/入口增加精确 location 原样返回 JS
...
[fulgurjs:doctor] 汇总：0 PASS / 0 WARN / 6 FAIL
```

脚本 5b 补充 per-origin 采样 `doctor --base http://localhost:5363 --apps pc-remote --dev`：
即便远程 dev server 在运行也退出码 1——doctor 即便 `--dev` 也探测 prod 形态端点
（`fulgurjs-remoteEntry.js` / `fulgurjs-manifest.json`），Vite dev 不提供这两个文件（SPA 回退
200 HTML）→ 如实 FAIL；`@fulgurjs-entry.js`（dev 容器入口）探测通过（doctor 对 PASS 项不单独打印）。

### 6) 附加断言：Node 直导入 `remoteSchema === {}`

```text
remoteSchema = {}
[ok] Node 直导入 remoteSchema 为空对象（诚实降级语义成立）
```

## API ↔ 源码对照表

| API（README 锚点） | 导出入口 | 本 demo 使用位置 | 插件源码（packages/plugin/src） |
|---|---|---|---|
| `definePages` / `validatePages`（§3） | `@fulgurjs/federation/runtime` | [host/src/fulgurjs/pages.data.ts](host/src/fulgurjs/pages.data.ts)（数据源）、ValidatePanel.vue（违例渲染） | `pages.ts` |
| `createHostPages`（§10.1） | `@fulgurjs/federation/runtime` | [host/src/fulgurjs/host/pages.ts](host/src/fulgurjs/host/pages.ts)（beforeLoad/loadingComponent/delay/schema 全参接线）、[host/src/main.ts](host/src/main.ts)（路由注册） | `vue-adapter.ts` + `host-pages-core.ts` |
| `remoteSchema`（§路径②） | `@fulgurjs/federation/runtime` | [host/src/fulgurjs/host/pages.ts](host/src/fulgurjs/host/pages.ts)（R3 数据源）、RemoteSchemaPanel.vue（JSON 视图） | `remote-schema.ts` + `virtual.ts` |
| `provideAppContext` / `clearAppContext` / `getAppContext`（§9） | `@fulgurjs/federation/runtime` | [host/src/fulgurjs/host/bridge.ts](host/src/fulgurjs/host/bridge.ts)、ContextPanel.vue | `context.ts` |
| `requireAppContext`（§9，CC-001） | `@fulgurjs/federation/runtime` | [remote/src/pages/Orders.vue](remote/src/pages/Orders.vue)（缺键捕获展示） | `context.ts` |
| `federation({ setup })` + `onSession`（§10.2） | Vite 插件选项 + 生命周期约定 | [remote/src/fulgurjs/setup.ts](remote/src/fulgurjs/setup.ts)（记录到 `globalThis.__PC_SETUP_LOG__`）、[remote/fulgurjs.config.ts](remote/fulgurjs.config.ts) | `transform.ts` + runtime 生命周期段 |
| `keepAlive`（§9.1.1） | 页面表条目字段 | [host/src/App.vue](host/src/App.vue)（`<KeepAlive :include="hostPages.keepAliveNames">`）、[remote/src/pages/Dashboard.vue](remote/src/pages/Dashboard.vue) | `host-pages-core.ts`（keepAliveNames） |
| `loadingComponent` + `delay`（§9.1.2） | `createHostPages` 选项 | [host/src/components/PcSkeleton.vue](host/src/components/PcSkeleton.vue) + TracePanel.vue（loading→ready 时序） | `vue-adapter.ts` |
| `remoteComponent`（§8） | `@fulgurjs/federation/runtime` | WidgetPanel.vue（`pc-remote/widgets/stat-card` 直渲染） | `vue-adapter.ts` |
| `hostPages` 具名导出（§4，CLI 数据源） | `fulgurjs.config.ts` 具名导出 | [host/fulgurjs.config.ts](host/fulgurjs.config.ts)、[remote/fulgurjs.config.ts](remote/fulgurjs.config.ts)（远程侧同构对照） | `app-config.ts` + `commands.ts` |
| `fulgurjs init/explain/check-pages/doctor`（§5） | `fulgurjs` bin | [scripts/run-cli-checks.sh](scripts/run-cli-checks.sh)（真实采样） | `cli.ts` / `init.ts` / `commands.ts` / `doctor.ts` |

## 负向工程 negative/（长期「预期编译失败」）

**本工程长期处于预期编译失败状态**：`npm run build` / 直接 `tsc --noEmit` **失败才是对的**。
失败本身不受 CI 欢迎，所以由 `npm run verify` 管理——它运行 `tsc --noEmit` 并断言两类事实：

- tsc **如期失败**（意外通过 = 负向用例失效，verify 报 FAIL）；
- 错误输出**包含三类预期关键字**（缺任一 = 报错形态漂移，verify 报 FAIL 并摘录输出）。

| 用例（[src/negative.ts](negative/src/negative.ts)） | 预期关键字 |
|---|---|
| 引用不存在的远程模块类型 `pc-remote/pages/ghost` | `TS2307` / `Cannot find module` |
| 引用存在 expose 上不存在的导出 `fetchOrderss` | `TS2305`/`TS2724` / `has no exported member` |
| `definePages([{ route: 404 }])`、`validatePages([], { remotes: '/pc' })` 非法结构 | `not assignable` / `TS2322` |

类型桩在 [negative/types/pc-remote.d/pages/orders.d.ts](negative/types/pc-remote.d/pages/orders.d.ts)
（经 tsconfig `paths` 把 `pc-remote/*` 映射过来），只声明真实存在的 `fetchOrders`——与插件 dev dts
生成物的消费方式一致（README §9.1.5）。真实运行摘录（`npm run verify`，退出码 0）：

```text
[negative:verify] PASS——引用不存在的远程模块类型（pc-remote/pages/ghost）
[negative:verify] PASS——引用存在 expose 上不存在的导出（fetchOrderss）
[negative:verify] PASS——definePages 传非法结构（route: 404 / remotes: 字符串）
[negative:verify] tsc 退出码（预期非 0）：2
  src/negative.ts(14,34): error TS2307: Cannot find module 'pc-remote/pages/ghost' ...
  src/negative.ts(18,10): error TS2724: '"pc-remote/pages/orders"' has no exported member named 'fetchOrderss' ...
  src/negative.ts(24,40): error TS2322: Type 'number' is not assignable to type 'string'.
  src/negative.ts(25,47): error TS2322: Type 'string' is not assignable to type 'Record<string, string>'.
[negative:verify] 全部负向断言通过：编译如预期失败，且三类错误关键字齐全（verify 退出码 0 = 负向验证通过）。
```

## 依赖版本（npm registry 正式包）

| 依赖 | 版本 | 备注 |
|---|---|---|
| `@fulgurjs/federation` | `5.4.3`（精确） | 三个工程一致；lockfile 随仓库提交 |
| `vue` / `vue-router` | `^3.5.13` / `^4.5.0` | host 双装；remote 仅 vue |
| `vite` / `@vitejs/plugin-vue` | `^6.3.5` / `^5.2.1` | |
| `typescript` / `vue-tsc` | `^5.8.0` / `^2.2.10` | negative 仅 typescript |

## 边界与已知现象

- **dev 冷启动预构建窗口（DEV-010）**：首轮 30~60s 内联邦模块请求可能瞬时 504/"Outdated Optimize
  Dep"，先真实打开一次页面预热再下结论（remote 启动横幅会打印该提示）。
- **Vite dev 期 warning**：`virtual:fulgurjs-runtime ... The above dynamic import cannot be analyzed
  by Vite`——插件 runtime 虚拟模块固有的 dev 期提示（源码已带 `/* @vite-ignore */`），非本 demo
  代码产生，dev/build 功能不受影响。
- **host dev 启动生成 `src/fulgurjs/types/pc-remote.d.ts`**：插件 dts 直连生成物（勿手改）；
  `tsconfig.json` 的 include `src` 已覆盖，`npm run typecheck`（vue-tsc）在生成物存在时仍 0 错误。
- **`./setup` 公开 expose**：远程额外 exposes 了 setup 文件本身（`loadRemote('pc-remote/setup')`），
  用于演示「模块可加载 ≠ 生命周期执行」——初始化只由 `federation({ setup })` 声明驱动（README §10）。
- 除 `npm run verify` 的预期编译失败外，两工程 `npm run build` / `npm run typecheck` 全过；
  CLI 脚本退出码 0（其中「无法验证」「doctor FAIL」为被注释说明的预期语义采样）。

## 生产产物演示

先在本场景各工程执行 `npm run build`，再从仓库根运行：

```bash
node examples/scripts/serve-prod.mjs --scenario pages-cli --port 6391
```

打开 `http://localhost:6391/`。宿主和远程都使用该服务器的生产产物，资源不存在时返回真实 404。
