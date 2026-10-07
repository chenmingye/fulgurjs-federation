# 错误恢复（examples/demos/errors）

隔离的故障注入与恢复演示：一个「正常远程」+ 一个「故障选择器宿主」，10 张故障卡逐项演示
真实错误码、真实错误对象与真实恢复路径（README §6 错误码总表、§8 remoteComponent 占位语义、
§8.2 桥接错误占位与容器封锁语义、§10 setup 生命周期）。

两个工程互相独立：依赖从 npm registry 安装正式包（`@fulgurjs/federation` 精确 `5.4.3` + lockfile），
不使用 workspace / file: / link: 引用。

| 工程 | 角色 | 端口 | 容器名 | 说明 |
|---|---|---|---|---|
| [remote-good](remote-good) | Vue 远程（先启动） | **5352**（base `/err-good/`） | `err-good` | 7 个 expose（正常组件/工具/桥接契约 ×4/顶层 throw）+ `federation({ setup })` 生命周期 |
| [host](host) | Vue 宿主（单页，无路由） | **5353** | `err-host`（纯宿主） | 10 张故障卡 + 未预期错误监视器；含卡 3 的挂起中间件 |

## 快速开始

```bash
# 远程先起，宿主后起（先 install：两个目录各自独立 npm install）
cd remote-good && npm install && npm run dev   # 终端 1：http://localhost:5352/err-good/
cd host        && npm install && npm run dev   # 终端 2：http://localhost:5353/
```

打开宿主 http://localhost:5353/ 。每张卡一次「**注入 → 展示真实错误 → 恢复 → 验证可用**」循环，
注入后按钮转为一次性（重玩请刷新页面）；建议按卡顺序操作，不要多卡同时点击（卡 9 的注入
窗口内首次触发的 err-good 生命周期会被连带判失败，重试即可恢复，见[已知边界](#边界与已知现象)）。

```bash
# 构建 / 类型检查（两工程均应全过）
cd remote-good && npm run build && npm run typecheck
cd host        && npm run build && npm run typecheck
```

## 页面结构

- **未预期错误监视器（页首常驻）**：统计三条「未预期」通道——`window.onerror`、
  `unhandledrejection`、非 `[fulgurjs` 前缀的 `console.error`。预期故障单独登记、不进未预期计数：
  `fulgurjs:error` 事件（运行时对全部远程/共享错误的显式出口）与 `[fulgurjs` 前缀的插件诊断输出。
  十张卡全部操作完毕后，未预期计数应保持 **0**（卡 10 实时回显该计数）。
- **故障卡 1–10**：每卡含注入原理说明、操作按钮、注入舞台与结果区；桥接卡（6/7/8）使用
  插件**默认错误占位**展示真实占位语义，另以自定义 `errorComponent`（插件契约：只接收
  `error` prop）并列捕获真实错误对象。

## 十张卡：注入原理 / 操作步骤 / 预期错误码 / 恢复

| 卡 | 故障 | 注入原理（真实机制） | 操作 | 预期错误码 | 恢复 | 验证可用 |
|---|---|---|---|---|---|---|
| 1 | 远程不可用（连接拒绝） | `registerRemote` 指向无监听的 `http://localhost:5999/...`（`retries:0`、`timeout:3000`，promise remote 动态地址），`loadRemote` 真实发起请求 → 连接拒绝 | 注入故障 → 读错误对象 | `MFU-001`（根因 Failed to fetch） | 同名远程重复注册改指 `http://localhost:5352/err-good/@fulgurjs-entry.js`（`registerRemote` 重复注册按最新配置刷新） | `sumNumbers(2,3,5) = 10` |
| 2 | 模块不存在 | 对正常远程调 `loadRemote('err-good/no-such-module')`：容器加载成功，dev 容器入口 `get()` 对未 exposes 的键抛带 code 错误，运行时原样穿透 | 注入故障 → 读错误对象 | `MFU-006` | 加载同远程真实存在的 `err-good/utils` | `formatPrice(42) = ¥42.00` |
| 3 | 超时 | 宿主 `vite.config.ts` 的 `configureServer` 中间件让 `/fulgurjs-hang-entry.js` 永不响应；`registerRemote` 指向该地址 `timeout:1500` → 运行时 `withTimeout` 先超时 | 注入故障（约 1.5s 后报错） | `MFU-001`（原因：等待超过 1500 毫秒） | 同卡 1 改指正确 entry | `sumNumbers(1,2,3) = 6` |
| 4 | 模块初始化异常 | expose `./module-error` 模块求值期顶层 throw → `remoteComponent` 渲染进**默认错误占位** | 注入故障 → 「检查默认占位」读 DOM 证据（`data-fulgurjs-error` 错误码 + `data-fulgurjs-retry`/`data-fulgurjs-reload` 按钮存在性）→ 可再点占位上「重试加载」验证仍失败 | 占位错误码 `MFU-001`（底层为模块求值抛错），「重试加载」按钮存在 | 渲染同远程正常组件 `err-good/ClickButton` | 按钮组件渲染并可点击计数 |
| 5 | strictVersion 版本冲突 | `loadShare('err-missing-lib', { requiredVersion:'^9.0.0', strictVersion:true, singleton:true })`：作用域无此键且任何版本不满足 → strictVersion 抛错 | 注入故障 → 读错误对象 | `MFU-003`（不开 strictVersion 时同条件为 `MFU-004`） | 按错误文案修法提供 `fallback` 本地副本再 `loadShare` | 本地副本 `answer = 42` |
| 6 | 非法桥接契约 | `createVueBridgeApp('err-good/bridge-broken')`：该 expose 默认导出 `{}`（非 `defineBridgeApp` 产物，缺函数类型 mount/unmount）→ 契约校验抛错 → 默认占位 | 注入故障 → 默认占位 + 捕获通道双展示 | 占位错误码 `MFU-015` | 切换合法桥接模块 `err-good/bridge-good`（`:key` 同页重建挂载） | bridge-good 挂载，onReady 计数 +1 |
| 7 | 桥接 mount 失败 | expose `./bridge-mount-fail` 用 `defineBridgeApp` 声明合法契约，但工厂在 mount 阶段同步抛错 → 包装为 `MFU-016`（`details.phase=mount`，根因保留原始错误）；容器无半挂残留 | 注入故障 → 默认占位 + 捕获通道双展示 | 占位错误码 `MFU-016`（phase: mount） | 切换 `err-good/bridge-good` | bridge-good 挂载，计数 +1 |
| 8 | 桥接 unmount 异常（容器封锁） | expose `./bridge-unmount-fail` 契约 mount 正常、`app.unmount` 被替换为必抛实现；宿主把受控 `sessionKey` sess-A→sess-B 触发真实卸载 → 插件按 BN09 语义**持久封锁该容器** | 注入（sess-A 挂载）→ 触发卸载 → 「检查封锁占位」读 DOM 证据 → 「换会话再试（sess-C）」验证计数不增 | 占位错误码 `MFU-016`（phase: unmount）；「重试加载」按钮**消失**，只剩「刷新页面重试」 | 整页刷新（占位「刷新页面重试」或卡 8 刷新按钮，唯一恢复路径） | 刷新后重新注入可正常挂载；封锁期间换会话 mount 计数不增 |
| 9 | setup 初始化异常 | err-good 声明 `federation({ setup })`；宿主先把 `globalThis.__FGX_FAIL_SETUP__` 置 true，再经运行时注册的 promise 远程 `err-setup-bad`（指向同一容器入口、生命周期状态按远程名隔离）触发全新 setup → 读取 flag 同步抛错；`finally` 必清 flag 不污染他卡 | 注入故障 → 读错误对象 + `__FULGURJS_INFO__.remotes['err-setup-bad'].setup` 状态 | `MFU-012`，setup 状态 `failed` | 清除 flag 后重试（失败阶段缓存已清，setup 从头重跑） | setup 状态变 `ready`，`DEMO_ANSWER = 42` |
| 10 | 正常对照（无故障基线） | 加载 `err-good/ClickButton` 成功（与故障卡同一条 `loadRemote` 生命周期管线），回显未预期计数 | 加载正常组件 | 无错误 | — | 组件可点击计数；未预期计数 0 |

## 预期 console 噪声清单

以下输出属演示的**预期行为**，均被监视器登记为「预期故障」或属于浏览器网络层日志，不代表回归：

| 来源 | 形态 | 通道 | 出现卡 |
|---|---|---|---|
| 连接拒绝 | `Failed to load resource: net::ERR_CONNECTION_REFUSED @ http://localhost:5999/...` | 浏览器网络层（JS 不可拦截，不计任何计数） | 卡 1 |
| Promise 远程名称告警 | `[fulgurjs] 远程入口自报名称 "err-good" 与宿主配置名称 "err-unreachable / err-hang / err-setup-bad" 不一致... 当前是动态 Promise 远程，继续加载。`（warn，恢复时每个远程加载链最多 2 条） | console.warn | 卡 1/3/9 |
| 模块求值失败页错误 | `Error: module-error 故障注入：模块顶层 throw...`（动态 import 失败的浏览器级记录） | 浏览器错误通道（非 console.error API 调用） | 卡 4 |
| 异步组件加载失败诊断 | `console.error(<FgError 对象>)`，message 以 `[fulgurjs:MFU-001] 无法从远程应用 "err-good" 加载模块 "./module-error"...` 开头 | console.error（`[fulgurjs` 前缀 → 预期登记） | 卡 4 |
| 桥接容器封锁诊断 | `[fulgurjs] 桥接应用卸载失败，该容器已封锁（同页只能刷新恢复）：[fulgurjs:MFU-016] ...` | console.error（预期登记；卡 8 面板同时展示该真实错误对象） | 卡 8 |
| 挂起连接滞留 | 卡 3 的挂起请求在页面存续期保持 pending（import 无法取消，运行时单条 in-flight 复用；注入一次性，不累积） | Network 面板 | 卡 3 |
| Vite dev 提示 | `virtual:fulgurjs-runtime ... The above dynamic import cannot be analyzed by Vite`（插件固有 dev 期提示） | 终端/构建警告 | 全局 |
| dev 冷启动窗口 | 首轮 30~60s 内联邦模块请求可能瞬时 504 / Outdated Optimize Dep（DEV-010，先预热再判断） | 终端 | 全局 |

## API ↔ 源码对照表

| API（README 锚点） | 导出入口 | 本 demo 使用位置 | 插件源码（packages/plugin/src） |
|---|---|---|---|
| `registerRemote`（promise remote / 动态地址、重复注册刷新、timeout/retries） | `@fulgurjs/federation/runtime` | [host/src/cards/Card1Unreachable.vue](host/src/cards/Card1Unreachable.vue)、[Card3Timeout.vue](host/src/cards/Card3Timeout.vue)、[Card9SetupFail.vue](host/src/cards/Card9SetupFail.vue) | `runtime/index.ts`（registerRemotes / assertRemoteParams / acquireContainer） |
| `loadRemote`（spec 解析、带 code 领域错误穿透、重试换 URL） | `@fulgurjs/federation/runtime` | 卡 1/2/3/9/10 | `runtime/index.ts`（loadRemote）+ `virtual.ts`（dev 容器 get 的 MFU-006） |
| `loadShare`（requiredVersion/singleton/strictVersion/fallback） | `@fulgurjs/federation/runtime` | [host/src/cards/Card5StrictVersion.vue](host/src/cards/Card5StrictVersion.vue) | `runtime/index.ts`（selectShareEntry：`MFU-003` / `MFU-004`） |
| `remoteComponent` 默认错误占位（错误码 + 根因 + 重试加载/刷新页面重试） | `@fulgurjs/federation/runtime` | [host/src/cards/Card4ModuleError.vue](host/src/cards/Card4ModuleError.vue)（DOM 证据读取）、Card10Normal.vue | `vue-adapter.ts`（RemoteErrorPlaceholder + createRecoverableErrorPlaceholder） |
| `createVueBridgeApp`（MFU-015 契约校验 / MFU-016 生命周期 / 自定义 errorComponent 只收 error prop） | `@fulgurjs/federation/vue` | Card6BridgeBroken.vue、Card7BridgeMountFail.vue、[Card8BridgeUnmountFail.vue](host/src/cards/Card8BridgeUnmountFail.vue)、[host/src/components/bridge-capture.ts](host/src/components/bridge-capture.ts) | `bridge-host-vue.ts` + `bridge-core.ts`（assertBridgeContract / invalidate 容器封锁 BN09） |
| `defineBridgeApp`（mount 抛错包装 / unmount 抛错包装 / 容器占用） | `@fulgurjs/federation/runtime` | [remote-good/src/exposes/bridge-good.ts](remote-good/src/exposes/bridge-good.ts)、bridge-mount-fail.ts、bridge-unmount-fail.ts | `bridge-app-vue.ts` |
| `federation({ setup })` 生命周期（应用级一次、失败清缓存可重试、debug.setup 状态） | Vite 插件选项 | [remote-good/src/fulgurjs/setup.ts](remote-good/src/fulgurjs/setup.ts)、[remote-good/fulgurjs.config.ts](remote-good/fulgurjs.config.ts)、Card9SetupFail.vue | `runtime/index.ts`（runSetupPhase / ensureLifecycle）+ `virtual.ts`（容器 `__fulgurjsSetup` 元数据） |
| `window.fulgurjs:error` 事件 / `window.__FULGURJS_INFO__` 调试面 | 免配置 | [host/src/error-monitor.ts](host/src/error-monitor.ts)（事件登记）、Card9SetupFail.vue（setup 状态读取） | `runtime/index.ts`（emitError / 调试出口挂载） |
| 挂起中间件（故障注入面） | Vite `Plugin.configureServer` | [host/vite.config.ts](host/vite.config.ts)（createHangEntryPlugin） | —（演示自有代码） |
| `FgError` 错误对象（code/details/cause）与错误码总表 | `@fulgurjs/federation/runtime` | [host/src/components/ErrorView.vue](host/src/components/ErrorView.vue)（真实错误对象渲染） | `runtime/errors.ts`、`bridge-errors.ts` |

## 依赖版本（npm registry 正式包）

| 依赖 | 版本 | 备注 |
|---|---|---|
| `@fulgurjs/federation` | `5.4.3`（精确） | 两工程一致；lockfile 随仓库提交（`npm ci` 复现） |
| `vue` | `^3.5.13` | 两工程（runtime 的 `remoteComponent` 要求页面侧安装 vue） |
| `vite` / `@vitejs/plugin-vue` | `^6.3.5` / `^5.2.1` | |
| `typescript` / `vue-tsc` | `^5.8.0` / `^2.2.10` | `npm run typecheck`（vue-tsc --noEmit） |

## 边界与已知现象

- **每卡一次性注入**：卡 3 的挂起连接与卡 9 的 setup 生命周期天然不可复位（import 无法取消 /
  应用级 setup 成功后不重跑），故注入按钮在故障触发后禁用，重玩请刷新页面。
- **不要多卡同时点击**：卡 9 注入窗口内（flag 为 true 的毫秒级区间）若恰有其他卡首次触发
  err-good 生命周期，该次加载会连带得到 `MFU-012`——与真实「初始化失败影响该远程全部加载」
  语义一致，按错误文案重试或点卡 9 恢复即可。
- **卡 8 封锁是容器级语义**：封锁状态在组件实例内持久（同页重试与换会话都不得重挂），
  页面刷新即恢复；这是插件 BN09 的设计行为，不是缺陷。
- **卡 1/3 恢复的名称告警**：恢复目标是 err-good 的容器（自报名 err-good）挂在
  err-unreachable / err-hang 名下——promise remote 仅 warn 不阻断，属文档化语义。
- **dev 类型生成**：宿主 dev 启动会生成 `src/fulgurjs/types/err-good.d.ts`（插件 dts 直连产物，
  勿手改）；`npm run typecheck` 在生成物存在与否均 0 错误。

## 生产产物演示

先在本场景各工程执行 `npm run build`，再从仓库根运行：

```bash
node examples/scripts/serve-prod.mjs --scenario errors --port 6391
```

打开 `http://localhost:6391/`。宿主和远程都使用该服务器的生产产物，资源不存在时返回真实 404。超时卡由此服务器提供挂起入口；故障注入和恢复都不会连接 dev server。
