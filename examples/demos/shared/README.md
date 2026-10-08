# 共享依赖与运行时能力（examples/demos/shared）

一个宿主 + 两个远程的「shared 版本协商 + 运行时 API 全景」演示场景。
三方都依赖真实第三方小包 **nanostores** 并以同一份 shared 配置参与协商（remote-b 故意固定旧版本），
宿主页面用 11 张卡片逐项演示运行时能力的真实行为——每个按钮都是真实调用，结果与错误均为运行时真实返回。

三个工程互相独立：依赖从 npm registry 安装正式包（`@fulgurjs/federation` 精确 `6.4.2` + lockfile），
不使用 workspace / file: / link: 引用。

| 工程 | 角色 | 端口 | 容器名 | nanostores 声明版本 |
|---|---|---|---|---|
| [remote-a](remote-a) | 远程（先启动） | **5343** | `sh-remote-a` | `0.11.4`（与宿主相同，最新 0.x） |
| [host](host) | 宿主 | **5344** | `sh-host` | `0.11.4`（最新 0.x） |
| [remote-b](remote-b) | 远程（先启动） | **5345** | `sh-remote-b` | `0.6.0`（真实的旧版本，协商演示用） |

## 快速开始

```bash
# 先远程后宿主
cd remote-a && npm install && npm run dev   # 终端 1：http://localhost:5343
cd remote-b && npm install && npm run dev   # 终端 2：http://localhost:5345
cd host      && npm install && npm run dev   # 终端 3：http://localhost:5344
```

打开宿主 http://localhost:5344 即见 11 张卡片（自上而下编号 ①–⑪）。
remote-a / remote-b 的独立首页是自检页（显示容器名与声明依赖），联邦消费方是宿主页面。

## 共享协商方案（shared 配置原文）

三端 `fulgurjs.config.ts` 的 shared 配置完全一致：

```ts
shared: {
  vue: { singleton: true },
  nanostores: { singleton: true, requiredVersion: false },
},
```

### 逐字段说明

| 字段 | 取值 | 语义（对齐 webpack MF） |
|---|---|---|
| `singleton` | `true` | 全页只允许一个实例。裁决规则：**忽略 requiredVersion 的过滤作用**（无论消费方要求什么版本都用作用域中的版本），候选里**已加载版本优先**、其余取最高版本——保证宿主/remote-a/remote-b 拿到同一份 nanostores |
| `requiredVersion` | `false` | 接受作用域中任意版本（不参与匹配过滤）。false 时它只影响两件事：singleton 告警（MFU-010）与 strictVersion 抛错（MFU-003）的「要求」文案。缺省时插件会从各端 package.json 推断（本场景显式写 false，让 remote-b 的 0.6.0 也能无冲突注册） |
| （隐含）`import` | 缺省 = 键名 `nanostores` | 本地副本模块 specifier；三方都真实安装并提供自己的副本 |
| （隐含）`version` | 缺省读本机安装版本 | host/remote-a 注册 `0.11.4`，remote-b 注册 `0.6.0` |
| （隐含）`shareScope` | 缺省 `default` | 共享作用域名 |
| （隐含）`strictVersion` | 缺省 false（singleton 时） | 版本不满足时是否抛错；卡片⑧用 loadShare 单次调用级覆盖演示 true 的行为 |

### 协商实际结果（宿主页实测）

- 宿主 init 先注册 `nanostores@0.11.4`（from `sh-host`，dev 宿主标记 `loaded: true`）；
- remote-a 容器 init 注册同版本 `0.11.4` → **first-wins（已注册版本永不替换）被跳过**；
- remote-b 容器 init 注册 `0.6.0`（from `sh-remote-b`，未加载）→ 成为第二候选；
- singleton 裁决：已加载优先 → 命中 **0.11.4 ← sh-host**。remote-b 组件虽然声明 0.6.0，实际也被收敛到这份。
- 等价调试出口：`window.__FULGURJS_SCOPE__`（与 `getRuntime().shareScopeMap` 是同一对象）。

## 演示卡片操作步骤与预期结果（实测记录）

以宿主 http://localhost:5344 为例。以下全部为浏览器真实操作的结果。

### ① 实例身份一致：nanostores 单例（三方同 atom）

- **操作**：页面加载后直接看三栏（宿主组件 / remote-a 组件 / remote-b 组件）；点 remote-a 栏的「+1」。
- **预期**：三栏计数同时变为 1（任意一处改、三处同步）；三处「实例标识」都打印
  `Symbol(nanostores)`（共享模块 `src/shared/counter.ts` 用 `globalThis.__NS_INSTANCE__ ??= Symbol`
  做求值标识，字符串相同 = 同一模块实例）；三处「自己 import 的 atom === store 导出工厂」都显示
  **一致**（各端 import 的 nanostores 经 singleton 协商收敛到同一份）；「store 模块本页求值次数：1」。
- **API**：`loadRemote('sh-remote-a/store')`、`remoteComponent`、shared singleton。
- **源码**：`remote-a/src/shared/counter.ts`、`host/src/cards/Card1Instance.vue`。

### ② 共享作用域观测：shareScopeMap 实时快照

- **操作**：展开 `<details>` 面板（每 1.5s 自动刷新）。
- **预期**：`default.nanostores` 下两个候选：`0.11.4`（from `sh-host`，`loaded: true`）与
  `0.6.0`（from `sh-remote-b`，`loaded: false`）；remote-a 的同版本注册因 first-wins 不重复出现。
  面板同时列出三端 package.json 声明版本。快照对 `get` 函数与模块实例 value 做了裁剪
  （函数不可 JSON 序列化、vue 命名空间有循环引用），仅保留协商元数据 from/loaded/eager/hasValue。
- **API**：`getRuntime().shareScopeMap` / `window.__FULGURJS_SCOPE__`。
- **源码**：`host/src/demo/scope.ts`、`host/src/cards/Card2Scope.vue`。

### ③ 运行时插件 hooks

- **操作**：点「加载远程模块（sh-remote-a/utils）」；展开日志表。
- **预期**：表格按时间倒序记录 `beforeLoadRemote` → `afterLoadRemote`（含 remote/module），
  以及此前页面加载已经产生的 `resolveShare` 记录（`picked: "3.5.43 ← sh-host"` 等真实裁决结果）。
  卡片⑧的 strictVersion 冲突与卡片⑪的兜底也会进入 `onRemoteError` 日志。「清空日志」后重新触发可重看。
- **API**：`registerPlugins([{ name, init(hooks) }])`，日志载体 `globalThis.__HOOK_LOG__`。
- **源码**：`host/src/main.ts`（注册）、`host/src/demo/hooksPlugin.ts`（插件本体）。
- **hook 契约**：beforeLoadRemote / afterLoadRemote 为观测 hook（自身抛错只告警不改写结果）；
  resolveShare 为决策 hook（显式返回 ShareEntry 才覆写裁决，本演示只记录返回 void）。

### ④ 动态远程注册：registerRemote + loadRemote

- **操作**：输入框保持默认 `sh-remote-b/RemoteCounter`（或改 `sh-remote-a/utils`），点「注册并加载」；
  再点「错误 spec（未注册远程）」。
- **预期**：前者展示模块导出键（如 `default`）；后者捕获真实运行时错误——
  错误码 **MFU-008**（未知远程应用 "no-such-remote"）+ 完整消息。重复注册同名远程是合法操作
  （entry/timeout/retries/breaker 按最新配置刷新，熔断计数状态保留）。
- **API**：`registerRemote({ name, entry })`、`loadRemote(spec)`、`parseSpec`。
- **源码**：`host/src/cards/Card4DynamicRemote.vue`。

### ⑤ 预载：preloadRemote 的 preload / prefetch 两种模式

- **操作**：点「preload 模式预载 sh-remote-b/info」（或 prefetch 按钮）。
- **预期**：表格列出 performance 资源时间线**新增**条目，至少包含
  `http://localhost:5345/src/exposes/info.ts`（真实下载，约几 ms）。
  预载目标 `./info` 是默认页面不消费的模块，所以每次冷加载后首次点击都能看到新增；
  另一模式再点同一资源时显示「无新增资源条目」的诚实提示（浏览器与运行时都会去重）。
  预载只下载不执行（注入 `<link rel="modulepreload">`，不初始化容器）。
- **API**：`preloadRemote('sh-remote-b/info', { mode: 'preload' | 'prefetch' })`。
- **源码**：`host/src/cards/Card5Preload.vue`、`remote-b/src/exposes/info.ts`。

### ⑥ parseSpec / unwrapDefault / getRuntime

- **操作**：三个小节各点一次按钮。
- **预期**：parseSpec 输出 `{ remote: 'sh-remote-b', module: './RemoteCounter' }` 结构；
  unwrapDefault 展示「有 default 取 default / 无 default 返回原命名空间 / undefined 原样返回」；
  getRuntime 面板展示单例方法面（`loadShare`/`loadRemote`/`registerShare`/…，冻结对象）、
  `version: 5.4.1`（真实运行时导出值）与 `__FULGURJS_INFO__.remotes` 状态表
  （entry / status / lastLoadMs / setup）。
- **API**：`parseSpec` / `unwrapDefault` / `getRuntime` / `version`；调试面 `window.__FULGURJS_INFO__`。
- **源码**：`host/src/cards/Card6ApiUtils.vue`。

### ⑦ 别名共享 shareKey：宿主本地模块注册为 'lib-alias'

- **操作**：点「经 remote-a 消费 lib-alias」。
- **预期**：展示 remote-a 消费模块 `loadShare('lib-alias')` 的结果——
  `LIB_ALIAS_VERSION: "1.0.0"`、`PROVIDED_BY: "sh-host（宿主本地模块 lib/greeting.ts）"`、
  `greet(...)` 的返回值——拿到的就是宿主 main.ts `registerShare` 注册的那一份。
- **API**：`registerShare('default', 'lib-alias', '1.0.0', get, { from: 'sh-host' })` / `loadShare('lib-alias')`。
- **源码**：`host/src/main.ts`（注册）、`host/src/lib/greeting.ts`（模块本体）、
  `remote-a/src/exposes/demoConsumer.ts`（消费）。

### ⑧ loadShare 选项与 strictVersion 版本冲突

- **操作**：点「冲突加载（^9.0.0 + strictVersion）」；再点「正常 loadShare（对照）」。
- **预期**：冲突侧捕获真实运行时错误 **MFU-003**，消息为三段式——
  「应用要求 ^9.0.0，作用域中有 0.11.4、0.6.0；为保证全页只使用一个实例，最终复用 sh-host 提供的 0.11.4…」；
  对照侧正常命中 0.11.4（`typeof ns.atom === 'function'`），与卡片①同一实例。
  冲突错误同时经 onRemoteError hook 与 `window` 的 `fulgurjs:error` 事件发出（卡片③可见）。
- **API**：`loadShare('nanostores', { requiredVersion: '^9.0.0', strictVersion: true, singleton: true })`。
- **源码**：`host/src/cards/Card8StrictVersion.vue`。

### ⑨ 运行时 registerShare：动态注册 demo-share

- **操作**：先点「注册 demo-share」，再点「经 remote-a 消费 demo-share」；可连续点两次消费。
- **预期**：消费结果 `{ ok: true, shareKey: 'demo-share', data: { value: <时间戳>, from: 'host-runtime' } }`；
  再次消费 `value` 不变——共享条目首次 `get()` 后实例被缓存（「已加载版本永不替换」）。
  注册后可在卡片②的 shareScopeMap 中看到 `default.demo-share@1.0.0`。
- **API**：`registerShare('default', 'demo-share', '1.0.0', get, { from: 'sh-host' })` / `loadShare('demo-share')`。
- **源码**：`host/src/cards/Card9RegisterShare.vue`（注册）、`remote-a/src/exposes/demoConsumer.ts`（消费）。

### ⑩ AppContext：跨应用传值与函数引用

- **操作**：直接看面板 → 点「登出（clearAppContext）」→ 点「重新提供（provideAppContext）」。
- **预期**：初始面板显示 `requireAppContext('user')` 的用户快照 JSON，且
  `api.hello('sh-remote-a')` 返回宿主闭包字符串（**函数引用同 realm 直调**）；
  登出后面板显示 **CC-001** 三段式报错（缺少必需字段 "user"、当前字段、预期、示例、修法）；
  重新提供后恢复初始展示。
- **API**：`provideAppContext` / `requireAppContext` / `getAppContext` / `clearAppContext`（README §9）。
- **源码**：`host/src/demo/appContextBridge.ts`（宿主桥）、
  `remote-a/src/exposes/ContextPanel.vue`（远程消费面板）。
- **语义**：数据 = 传输层快照 + 函数引用（非响应式，与乾坤 props 同语义）；
  存储本体即 `window.__FULGURJS_APP_CONFIG__`。

### ⑪ fallbackModule：单次调用的显式降级

- **操作**：点「加载不存在的模块（触发兜底）」。
- **预期**：`loadRemote('sh-remote-a/no-such-module', { fallbackModule })` **不抛错**，返回宿主本地
  兜底模块（`实际服务方: sh-host/src/fallbacks/storeFallback.ts` + headline + `fallbackGreet` 返回值）。
  同时浏览器控制台出现**一条** runtime 打印的 console.error（原始 MFU-006），且 fulgurjs:error 事件照发
  （卡片③可见 onRemoteError 记录）——**显式兜底不是静默兜底**；不传 fallbackModule 时同样的加载直接抛错。
- **API**：`loadRemote(spec, { fallbackModule: () => import('../fallbacks/storeFallback') })`。
- **源码**：`host/src/cards/Card11Fallback.vue`、`host/src/fallbacks/storeFallback.ts`。

## API ↔ 源码对照表

| API（README 锚点） | 导出入口 | 本 demo 使用位置 | 插件源码（packages/plugin/src） |
|---|---|---|---|
| shared 协商（singleton/requiredVersion） | fulgurjs.config.ts | 三工程 `fulgurjs.config.ts` | `options.ts`（normalizeShared）+ `runtime/index.ts`（selectShareEntry/loadShare） |
| `loadRemote(spec, opts)` | `@fulgurjs/federation/runtime` | 卡片①④⑪ | `runtime/index.ts` |
| `loadShare(name, opts)` | 同上 | 卡片⑦⑧⑨ + remote-a demoConsumer | `runtime/index.ts` |
| `preloadRemote(spec, { mode })` | 同上 | 卡片⑤ | `runtime/index.ts`（inject/manifest） |
| `registerRemote` / `parseSpec` | 同上 | 卡片④ | `runtime/index.ts` |
| `registerShare` | 同上 | main.ts（lib-alias）+ 卡片⑨ | `runtime/index.ts`（first-wins 注册） |
| `registerPlugins` / RuntimePlugin hooks | 同上 | main.ts + `src/demo/hooksPlugin.ts` | `runtime/index.ts`（RuntimeHooks） |
| `getRuntime` / `version` / `unwrapDefault` | 同上 | 卡片⑥ | `runtime/index.ts` |
| `provideAppContext` / `requireAppContext` / `clearAppContext` | 同上 | `src/demo/appContextBridge.ts` + remote-a ContextPanel | `context.ts` |
| `remoteComponent(spec)` | `@fulgurjs/federation/vue` | 卡片①⑩ | `vue.ts`（vue-adapter） |
| 调试面 `__FULGURJS_SCOPE__` / `__FULGURJS_INFO__` | window | 卡片②⑥ | `runtime/index.ts`（attachDebug） |

## 构建 / 类型检查

```bash
# 每工程独立执行
npm run typecheck   # vue-tsc --noEmit --skipLibCheck（三工程全部 0 错误）
npm run build       # vite build（三工程全部通过）
```

生产构建：remote-a / remote-b 产物分别在 `/sh-remote-a/`、`/sh-remote-b/` 子路径
（各工程 vite.config 按 base 区分 dev/prod），宿主 fulgurjs 配置 `prod` 已按根相对写法指向对应子路径。
部署时对各 `fulgurjs-remoteEntry.js`、`fulgurjs-manifest.json`、`index.html` 设置 no-cache。

## 边界声明（如实）

- 卡片②的 JSON 是裁剪快照而非原始 `JSON.stringify(shareScopeMap)`：ShareEntry 的 `get` 是函数、
  `value` 是模块命名空间（vue 的命名空间含循环引用），直接序列化会丢函数或抛错——面板保留
  from / loaded / eager / hasValue 四项协商元数据；
- 卡片⑨的 `demo-share` get 每次返回新时间戳，但共享语义下只有首次 `get()` 生效——重复消费值不变，
  这是「已加载永不替换」的正确演示而非缺陷；
- 卡片⑪点击后浏览器控制台会有一条 runtime 主动打印的 console.error（原始 MFU-006）——
  插件「零静默兜底」纪律的设计行为，除此之外正常操作全程无 console.error / warning；
- dev 冷启动首轮有 30~60s 的 vite 预构建窗口（DEV-010，插件提示语），首轮打开后自行恢复，非故障；
- 三端各自首页/入口只是独立开发态入口；被宿主消费时走 `@fulgurjs-entry.js`（dev）或
  `fulgurjs-remoteEntry.js`（prod），与独立入口无关。

## 生产产物演示

先在本场景各工程执行 `npm run build`，再从仓库根运行：

```bash
node examples/scripts/serve-prod.mjs --scenario shared --port 6391
```

打开 `http://localhost:6391/`。宿主和远程都使用该服务器的生产产物，资源不存在时返回真实 404。
