# API 参考

> 配置默认值、公开入口与类型以仓库源码及发布包声明核对；版本变更见 [CHANGELOG](../../../CHANGELOG.md)。应用代码只导入四个公开入口，不依赖 `/internal/*`。术语：桥接 =「把子应用挂到宿主提供的 DOM 容器」；作用域 =「共享依赖的分组」。

## 入口总览

| 入口 | 用途 | 导出面 |
|---|---|---|
| `@fulgurjs/federation`（包根） | Vite 配置 | `federation(options)` 插件 + `FederationOptions` 类型（字段全集见[配置参考](configuration.md)） |
| `@fulgurjs/federation/vue` | **Vue 应用唯一入口** | 运行时全量 + `provideAppContext`/`getAppContext`/`requireAppContext`/`clearAppContext` + `definePages`/`validatePages` + `remoteComponent` + `createHostPages` + `defineBridgeApp` + `createVueBridgeApp` + `createVueBridgeNavigation` + `connectVueBridgeRouter` + `remoteSchema` |
| `@fulgurjs/federation/react` | **React 应用唯一入口** | 同一运行时全量 + context + pages（`createReactHostPages`）+ `remoteComponent`/`useLoadRemote`/`RemoteErrorBoundary` + `defineBridgeApp` + `createReactBridgeApp` + `createReactBridgeNavigation` + `createReactBridgeRouter` + `remoteSchema` |
| `@fulgurjs/federation/runtime` | **框架无关** | 运行时全量（loadRemote/loadShare/initSharing/registerRemotes/registerShare/registerRemote/registerPlugins/preloadRemote/getContainer/getLoadedShare/pinLoadedShare/parseSpec/getRuntime/shareScopeMap/unwrapDefault/version/clearSessionState）+ context + pages（`definePages`/`validatePages`）+ `remoteSchema`；零 Vue/React/router 依赖 |

<a id="runtime-api"></a>

## 运行时 API（三个入口通用）

宿主页面、exposes 目标文件（远程页面）**任何文件都直接静态导入**——插件自动保证同一页面只有一个运行时实例（远程页面里的导入会被自动改写为惰性单例委托）：

```ts
// Vue 应用从 /vue，React 应用从 /react，框架无关模块从 /runtime —— 函数同名同义
import { loadRemote } from '@fulgurjs/federation/runtime'
```

> 仍可绕过代理直取全局单例（等价，调试用）：`(globalThis as any).__FULGURJS_RUNTIME__`。
> TS 提示：`/runtime` 的类型随包发布，由包的 `exports` 和 `typesVersions` 直接解析，不需要 `client` 类型垫片。

### 函数总表

| 函数 | 签名 | 用途 / 边界 |
|---|---|---|
| `loadRemote` | `<S extends string, T = FgRemoteModule<S>>(spec: S \| 动态 string, opts?) => Promise<T>` | 加载远程模块，类型来自[远程类型注册表](#字符串-api-的入口检查类型注册表)：已同步字面量获得模块真实类型，拼错报错，动态变量 → `unknown`（显式泛型 `T` 可覆盖）。`spec = '远程名/./Expose键'`（`./` 可省）。远程配置了 `setup` 时，它是初始化生命周期的**统一触发入口**（容器 init 后、返回模块前执行 setup/onSession）；`loadRemote('remote')` 只取容器不执行初始化。opts 见下 |
| `loadShare` | `(name: string, opts?) => Promise<命名空间>` | 共享模块协商（最高版本胜出/已加载优先/singleton 收敛）。opts：`{ requiredVersion?, singleton?, strictVersion?, shareKey?, shareScope?, fallback? }` |
| `preloadRemote` | `(spec: string, opts?: { mode?: 'preload' \| 'prefetch' }) => Promise<void>` | `remote/Expose` 只预载该 expose 的 chunk + CSS；仅传 remote 名则预载全部 exposes。`preload` 等待 CSS load/error；`prefetch` 低优先级并立即返回。**只预取资源不执行模块**，不触发 setup/onSession；失败不阻断业务（`MFU-007`） |
| `getContainer` | `(name: string) => Promise<容器>` | 取远程容器（触发加载 + init），容器协议 `{ name, init, get }`；**不执行 setup/onSession**。直调 `container.get()` 同样不保证初始化——需要生命周期的加载一律走 `loadRemote` |
| `registerRemote` / `registerRemotes` | `(config \| list) => void` | 运行时注册远程（promise remote / 动态地址）。`RemoteConfig`：`{ name, entry, promise?, shareScope?, timeout?, retries?, fallback?, breaker? }`。校验：`timeout` 有限正数、`retries` 0..10 整数、`breaker.threshold/resetMs` 有限正数——非法值**注册当场抛错**；重复注册时 entry/timeout/retries/breaker 按最新配置刷新，熔断计数保留 |
| `registerShare` | `(scope, name, version, get, opts?) => void` | 手工注册共享模块（一般由 init 模块自动完成） |
| `initSharing` | `(scopeName?) => ShareScopeMap` | 初始化共享作用域（一般由 init 模块自动完成） |
| `registerPlugins` | `(plugins: RuntimePlugin[]) => void` | 注册运行时插件（见下）；应用运行后才调用更改策略的边界见「同步与异步裁决」 |
| `getRuntime` | `() => FgRuntime` | 取运行时单例本体（与 `__FULGURJS_RUNTIME__` 同一实例） |
| `version` | `string` | 运行时/插件版本（跨源副本一致性诊断用，配合 DEV-006） |
| `unwrapDefault` | `(ns: any) => any` | ESM/CJS default interop 工具 |

### `loadRemote` 选项

```ts
const Panel = await loadRemote('shop/Panel', {
  shareScope: 'default',       // 覆盖远程声明的 shareScope
  retries: 3,                  // 单次调用覆盖 remote.retries
  fallbackModule: () => import('./PanelFallback'),
  // 失败时返回 fallback 模块；错误事件/console 仍显式发出（不是静默兜底）；不传则抛错
})
```

`consumerApp` 选项由框架适配器自动传入（Vue `remoteComponent` / `createHostPages` 捕获当前渲染 app），业务代码不用手填：远程 setup 声明的 `globalComponents` 会在每次加载时幂等注册到它。手动 `loadRemote`（无组件上下文）不传该选项，跳过注册。

调用时机与生命周期：`spec` 完整解析 → 容器加载（超时/重试/熔断）→ `init(shareScope)`（共享作用域收养）→ setup → onSession → 返回业务模块。setup 模块自身的导入在该阶段完成共享协商。

### 其他已导出的通用函数

Vue 从 `/vue`（或 `/runtime`）、React 从 `/react` 导入。除 `validatePages` 外，主要用于高级诊断或自定义加载，不是普通接入的必做步骤。

| 名称 | 签名 / 值 | 说明 |
|---|---|---|
| `getLoadedShare` | `(name: string, opts?: LoadShareOptions) => any` | 同步读取已就绪实例，不下载模块；未命中返回 undefined，严格版本冲突仍可抛错。有 resolveShare 策略时仅复用已裁决结果 |
| `pinLoadedShare` | `(name, opts: LoadShareOptions, localVersion: string, instance: unknown) => void` | 登记已存在的本地实例；保留版本、首次实例和并发保护，不强制覆盖别人的实例。普通接入交给插件处理 |
| `parseSpec` | `(spec: string) => { remote: string; module: string }` | 拆解远程模块名称；模块部分统一为 `./X`，仅有远程名时 module 为空 |
| `shareScopeMap` | `ShareScopeMap` | 共享依赖注册表；查看诊断可以，普通业务不要直接修改 |
| `clearSessionState` | `() => void` | 作废远程 onSession 信号及去重状态，不删除账号上下文本身；退出通常调用 `clearAppContext`，它会同时清理这些状态 |
| `validatePages` | `(pages: PageRouteLike[], options?: PagesOptions) => PageViolation[]` | 返回页面表的 R1–R5 问题列表，不因违例抛错；通常由 definePages/createHostPages 调用 |

### 运行时插件

配置：`runtimePlugins: ['./src/fulgurjsPlugin.ts']`（相对路径按应用根解析）。

> hook 错误契约：`beforeLoadRemote` / `afterLoadRemote` 是**观测 hook**——自身抛错只告警、不改写加载结果；`resolveShare` 是**决策 hook**——显式抛错向调用方传播（绝不静默回退到另一份共享依赖）。
>
> **resolveShare 与消费路径（5.7.1 起）**：配置了 `runtimePlugins` 的 HTML 入口在执行应用前完成共享裁决与加载；远程容器也会在执行 expose 前完成异步裁决。同步门面复用同一消费条件的决策与实例，异步 hook 可以选择低版本或原表之外的条目，不会被本地副本覆盖。应用与 provider 之间保留动态导入边界，Vite 8 的消费方门面仍无 TLA。
>
> **入口边界**：没有 HTML 入口的 library/自定义入口，或应用运行后才调用 `registerPlugins` 更改策略，需要先 `await loadShare(name, opts)`，再动态导入新的消费者；已经求值的静态绑定无法追溯改写。未准备的同步消费者遇到异步 hook 给出 `MFU-004`（`details.syncUnsupported: true`）并接管其迟到拒绝。`strictVersion` 冲突给出 MFU-003；本地接管的实例按真实版本登记，不借用另一版本槽位绕过检查。需要同时使用 React 18/19 时，为整组 React、renderer 及其消费方设置独立 `shareScope`（见[共享依赖](../guide/sharing.md#sharescope分组隔离react-1819-同页隔离)）。可运行示例：[React 版本隔离与恢复](https://github.com/chenmingye/fulgurjs-federation/blob/master/examples/demos/react-versions/README.md)。

```ts
import type { RuntimePlugin } from '@fulgurjs/federation/runtime'

export default {
  name: 'my-plugin',
  init(hooks) {
    hooks.resolveShare = async ({ shareKey, shareScope, requiredVersion, picked, available }) => {
      // 覆写共享版本裁决：返回 ShareEntry 即生效
    }
    hooks.beforeLoadRemote = ({ remote, module }) => {}
    hooks.afterLoadRemote = ({ remote, module, module_ns }) => {}
    hooks.onRemoteError = ({ remote, error }) => {}   // error.code ∈ 错误码总表
  },
} satisfies RuntimePlugin
```

### 调试面（无需配置，始终存在）

| 出口 | 内容 |
|---|---|
| `window.__FULGURJS_SCOPE__` | share scope 实时协商结果（键 → 版本 → `{ get, from, loaded }`） |
| `window.__FULGURJS_INFO__` | `{ remotes: { [名]: { entry, status, lastLoadMs, error, setup } }, errors: [] }`——`setup` ∈ none/pending/ready/failed |
| `window.__FULGURJS_APP_CONFIG__` | 全局配置镜像（同时是 AppContext 存储本体） |
| `window` 事件 `fulgurjs:error` | `CustomEvent<{ remote, error }>`，所有远程加载/共享错误都会发出 |

<a id="context"></a>

## AppContext — 跨应用传值与方法引用

宿主向子应用传值、子应用向宿主反向注册方法的一等公民通道（带类型与错误契约）——不再各自挂 `window.*` 裸口子。

```ts
// —— 宿主桥（host/src/fulgurjs/host/bridge.ts）：登录态同步（可多次调用，幂等 merge） ——
import { provideAppContext, clearAppContext } from '@fulgurjs/federation/vue'   // /react、/runtime 同名

provideAppContext({
  user,                                  // 宿主登录用户原始形态（当时快照）
  getToken,                              // 取最新 token（拉取式防过期）
  store: piniaInstance,                  // 宿主 pinia：子应用 useUserStore(ctx.store) 共享响应式状态
  hostApp: app,                          // 宿主 Vue App 实例：全局组件/指令注册目标
  locale,                                // UI 配置（如 EP locale）
  sessionKey: 's-101-1730…',             // 非敏感登录代次 ID：每次成功登录/重登生成新值；
                                         // token 刷新但会话未变时沿用。远程 onSession 按它去重，
                                         // 缺失时声明了 onSession 的远程报 MFU-013。不是 token、不做授权凭证
  events: { main: mainEvents },          // 事件/方法池：宿主提供 main；子应用反向注册
  // 只传有真实消费的键。项目自定义键按需自行提供（如 baseUrl: '/demo'）
})

// 退出登录时清理：删 context + 作废远程会话信号/onSession 去重状态
// （不重置远程模块缓存、共享模块图与应用级 setup 注册）
clearAppContext()

// —— 远程 setup/onSession：显式校验消费 ——
import { requireAppContext } from '@fulgurjs/federation/vue'

const { store, user, hostApp } = requireAppContext('store', 'user', 'hostApp')
// 缺任一键 → [fulgurjs:CC-001] 三段式抛错（got / expected / example 指向宿主桥）；
// 页面无运行时单例（独立直开远程页）→ [fulgurjs:CC-002]，修法 = 经宿主联邦加载。

// —— 远程页面读点 ——
import { getAppContext } from '@fulgurjs/federation/vue'
const dict = getAppContext().events?.main?.getDictItems?.('sex')

// —— 子应用反向注册方法给宿主（页面 onUnmounted 时记得摘除） ——
getAppContext().events!.bpm = { formEvent, formSubmitEvent }
```

### 标准字段表

| 字段 | 类型 | 语义 | 写方 |
|---|---|---|---|
| `user` | `Record<string, any>` | 宿主登录用户原始形态（提供时快照） | 宿主桥（只读约定；登录态变化时重新 provide 覆盖） |
| `getToken` | `() => string \| undefined` | **取最新 token**（拉取式调用，永不过期；context 不提供一次性 token 快照字段） | 宿主桥（只读约定） |
| `store` | `unknown`（运行时为宿主 pinia） | 子应用挂载/读取宿主共享响应式状态 | 宿主桥（只读约定） |
| `hostApp` | Vue App 实例（同 realm 直引用） | 全局组件/指令注册目标 | 宿主桥（只读约定） |
| `locale` | `unknown` | UI 配置 | 宿主桥（只读约定） |
| `sessionKey` | `string` | 非敏感登录代次 ID：每次成功登录/重登生成新值；token 刷新但会话未变时沿用。远程 onSession 按它去重（同一代次只执行一次，换代自动重跑）；退出 `clearAppContext` 后必须重跑。生成责任在宿主登录流程；**不得用真实 token 充当**，也不作为授权凭证 | 宿主桥（登录后） |
| `events` | `Record<string, any>` | 事件/方法池：`events.main.*` 宿主提供、其他前缀子应用反向注册 | 宿主桥建池，子应用挂载 |
| （扩展位） | `[key: string]: unknown` | 项目自定义键按需自行提供（模板默认不传） | 宿主桥；远程只增不改宿主键 |

### 变更语义与时序契约

- `provide` = 顶层 merge（后写覆盖，幂等可多次）；约定「宿主先写标准字段，远程只增不改宿主键」；嵌套对象（如 `events`）是**引用共享**，子应用挂属性即时可见（同 realm 直引用）；
- 时序契约：**bridge（provide）→ 远程 setup/onSession（require）→ 页面模块返回**——违反即在初始化处显式失败（CC-001 / MFU-013），不静默；
- 数据语义 = **传输层快照 + 函数引用，非响应式**。「实时」由两条正规通道承担：① `getToken()` / `events.main.*` 函数引用每次调用执行宿主最新闭包；② `context.store` 把宿主 pinia 递给子应用（共享响应式实例）。**同页换账号（退出→B 登录→再打开远程页）不依赖页面刷新**：宿主重新 provide 最新 context + `sessionKey`，远程 `onSession` 检测到新代次自动重跑。context 本体不做 Vue reactive（runtime 框架无关 + gzip 红线 + 跨包 proxy 双份陷阱）；「中途变更需通知」的场景当前无真实需求，不预留空 API；
- 存储说明：context 的存储本体即全局镜像对象 `window.__FULGURJS_APP_CONFIG__`（页面级单例，跨 bundle 副本共享同一份；调试面板可直接查看）。

### 方法引用两条通道

| 通道 | 语义 | 适用 |
|---|---|---|
| **context 携带函数引用** | 同步直调（bridge 先于一切页面加载） | 高频热路径（`getToken`/字典/文件 URL）、子应用反向注册 |
| **exposes 方法模块** | `exposes: { './api': './src/fulgurjs/exposes/api.ts' }` → `const { xxx } = await loadRemote('remote/api')` | 低频/重逻辑跨应用调用；任意 expose 任意消费；远程类型自动覆盖 |

方法模块规范：导出纯函数/服务对象（不挂框架组件）；依赖宿主单例的函数（走 shared 的 http 客户端等）直接写，联邦协商保证同模块图。端到端示例见[组件与模块加载](../guide/components-and-modules.md#方式二loadremote--命令式加载任意框架纯-ts)。

<a id="pages-api"></a>

## `definePages` / `validatePages` / `remoteSchema` — 页面路由表

宿主把「URL 路径 → 远程 exposes 键」的映射表交给它校验，带参路由的静默冲突在启动期报错而不是运行时加载错组件：

```ts
import { definePages, remoteSchema } from '@fulgurjs/federation/vue'   // /react、/runtime 同名

export const PAGES = definePages(
  [
    { route: '/remote-a/home', name: 'RemoteAHome', title: '首页' },
    // 带参路由：缺省推导 spec = 去首段 + 剥 :参 段；与其它条目收敛相同 ERROR，
    // 指向独立 expose 用 spec 显式覆盖
    { route: '/remote-a/detail/:id', name: 'RemoteADetail', spec: 'pages/remote-a/detail', title: '详情' },
  ],
  {
    deriveSpec: (route) => 'pages/' + route.replace(/^\//, '').split('/').filter(s => !s.startsWith(':')).join('/'),
    remotes: { '/remote-a/': 'remote-a' },   // 路由前缀 → 远程名
    schema: remoteSchema,                     // { [remoteName]: { exposes: string[], exists?: boolean } }
    strict: true,                             // ERROR 默认 throw；false 降级 console.error
  },
)
```

- **`definePages(pages, options?)`**：调用时机 = 宿主启动期（模块求值时）。返回经校验的页面表。校验规则 R1–R5 见[远程页面接入](../guide/remote-pages.md#-定义页面表definepages)；R3 依赖 `schema`（dev 探针结果），build 恒为空表（诚实降级）。
- **`validatePages(pages, options?)`**：返回违例清单（`PageViolation[]`，含 `level` 与说明）不抛错，便于自测。
- **`remoteSchema`**：插件 dev 期自动填充的远程 exposes 探针；业务代码只把它透传给 `schema`。
- 同子路径类型：`PageRouteLike`（路由条目形状）、`PagesOptions`（校验选项，含 `deriveSpec`/`remotes`/`schema`/`strict`）、`PageViolation`、`RemoteSchemaEntry`。

## `createHostPages`（Vue）/ `createReactHostPages`（React）— 宿主页面适配器

**导入位置**：`createHostPages` 从 `@fulgurjs/federation/vue`；`createReactHostPages` 从 `@fulgurjs/federation/react`。完整签名、选项、返回成员与行为契约见[远程页面接入](../guide/remote-pages.md#-生成页面适配器)（Vue 与 React 的数据项语义完全一致；React 展示项 `fallback`/`error`/`retries`/`timeout` 与 React 版 `remoteComponent` 一致，另支持 `beforeLoad`）。

调用时机与生命周期要点（两端一致）：

- 页面表创建时零加载副作用；组件在**渲染时**才 `loadRemote(spec)`；
- 加载顺序：`beforeLoad` → 远程可选 `setup`/`onSession` → 页面模块；失败进错误态不静默回退；
- 组件缓存按 spec 与登录代次复用：**仅新的非空 `sessionKey` 到来时重建**（登出变 `undefined` 不重建）——换账号后重新加载触发新代次 `onSession`，模块本体经运行时缓存复用不重复下载；
- Vue 独有 `keepAliveNames` 返回值与 `keepAlive: true` 页面级保活（缓存上限 max=8 LRU、缓存键=页面 spec 清洗名、默认全关的原因）见[远程页面接入](../guide/remote-pages.md#-生成页面适配器)；
- React 侧不提供 `keepAliveNames`（不承诺保活）；路由不是插件运行时依赖——示例用 React Router 7（`path` 在路由表声明、`element` 渲染 `component(spec)` 产物；带参路由经 `useParams`/`useSearchParams` 传给远程页面 props）；
- 跨框架共享 Context：宿主与远程消费方经**同一 expose 实例**拿到同一 Context 对象（远程 `expose './theme-context'` 导出 `createContext` 实例，宿主 `useLoadRemote` 取得后作 Provider，远程组件 `useContext` 读到宿主值）；插件不自动桥接任意 React Context——必须显式共享该对象。

## `remoteComponent` — 远程组件直渲染

### Vue 版（`@fulgurjs/federation/vue`）

```ts
import { remoteComponent } from '@fulgurjs/federation/vue'

const FederatedForm = remoteComponent('remote-a/Form', {
  loadingComponent: MyLoading,   // 可选：加载期组件
  errorComponent: MyError,       // 可选：失败期组件（收到 error prop）
  retries: 2,                    // 可选：透传 loadRemote 单次调用级重试覆盖
})
```

| 选项 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `loadingComponent` | `Component` | — | 加载期间展示 |
| `errorComponent` | `Component` | 内置错误占位 | 加载失败展示（Vue 传入 `error` prop）。自定义时完全接管展示，插件不再注入恢复按钮；默认占位自带「重试加载 / 刷新页面重试」 |
| `retries` | `number` | 远程注册值（默认 2） | 透传 `loadRemote` |
| `delay` | `number` | `200` | 切到 loadingComponent 前的等待（ms） |
| `timeout` | `number` | — | 超时进错误态（ms）；不设由 runtime 容器超时兜底 |

语义与边界：

- 内部 = `defineAsyncComponent({ loader: () => loadRemote(spec, opts).then(m => m.default ?? m) })`，返回标准 Vue 异步组件，`props` 在使用处直接透传；
- **全局注册组件自动安装（6.1.0）**：远程组件渲染在**消费方 app** 上下文里，其模板字符串标签（如 `<a-divider>`）按消费方全局注册表解析——提供方 app 的 `app.use(X)` 全局注册不随组件走。远程在 setup 模块声明 `globalComponents` 后，本工厂加载时自动捕获当前渲染 app 并完成幂等注册（含桥接子应用内消费的场景）；详见 [`federation({ setup })`](#setuponsession-远程初始化生命周期) 的 globalComponents 契约；
- **无任何兜底/降级**（零兜底）：加载失败显式进错误态；不传 `errorComponent` 时渲染内置占位（错误码 + 根因 + 修法 + **重试加载 / 刷新页面重试**），`fulgurjs:error` 事件由 runtime 层照常发出；
- 模块去重沿用 `loadRemote` 内部 Promise 缓存——同 spec 多组件实例只加载一次容器模块；
- 调用时机 = 组件工厂声明时零副作用，渲染时才加载；
- 运行时实例经 `globalThis.__FULGURJS_RUNTIME__` 页面级单例复用，与 `/vue` 导入殊途同归，无需额外接线。

### React 版（`@fulgurjs/federation/react`）

```tsx
import { remoteComponent } from '@fulgurjs/federation/react'

const RemotePanel = remoteComponent<PanelProps>('remote-a/Panel', { fallback, error, retries, timeout })
```

| 选项 | 类型与默认 | 语义 |
|---|---|---|
| `fallback` | `ReactNode`，默认 `null` | 本次加载 pending 时的占位（区别于失败占位） |
| `error` | `ReactNode` 或 `(error, retry) => ReactNode`，默认内置中文占位 | 加载失败或子树渲染错误的展示；渲染函数收到真实错误与可用的重试 |
| `retries` | `number`，沿用 `loadRemote` 默认（2） | 透传重试次数（0–10 整数，非法值工厂调用期抛错） |
| `timeout` | `number`（ms），默认不设适配层超时 | 本次组件加载等待上限；超时只结束本次等待，**不取消**已发出的共享请求；迟到的成功/失败不覆盖终态、不产生未处理 rejection |

- 工厂与页面表声明**零加载副作用**；首次渲染才 `loadRemote`（经容器协商与可选 setup/onSession）。**不用 `React.lazy`**：lazy 实例缓存失败的 Promise，仅重置错误边界无法恢复；本实现的 retry 会重建加载尝试（已成功模块经运行时缓存不重复下载）；
- 组件导出校验：默认导出（或模块本身）必须是函数组件 / class / `memo` / `forwardRef` 等合法组件类型；字符串、数字、空命名空间显式报错（不渲染空白成功页）；
- `ref` 透传：`forwardRef` 导出可正确接收 ref（React 18/19 实测）；普通函数组件传 ref 遵循 React 标准行为；
- 渲染期异常由内置边界捕获并与网络/导出错误**分开记录与展示**（文案区分「加载失败」与「渲染出错」）；ErrorBoundary 不捕获事件处理器与任意异步回调异常；
- 内置默认错误占位包含：错误码（FgError 的 `code`，无码显示 `UNKNOWN`）、真实根因 message、可执行修法，以及两个恢复操作——**「重试加载」**（同页重建加载链）与**「刷新页面重试」**（仅用户点击才整页刷新，保留当前地址）。渲染阶段错误只提供「重试加载」（错误抛自远程代码本身，刷新无法修复）；
- 失败恢复真实穿透浏览器 ESM 失败缓存：运行时对入口 URL 与容器 expose loader 均在失败后的重试上变更 URL（`fulgurjs_retry=N`）；并发加载同一模块失败后重试只推进一个代次；已成功模块的重复访问零重复网络请求；
- **已知边界**：expose 的**静态依赖** chunk（expose chunk 内 `import` 的普通 chunk）失败后，同页重试不可恢复——浏览器 module map 缓存了该依赖 URL 的失败。恢复需整页刷新——默认占位的「刷新页面重试」就是这条路径（用户点击触发，永不自动刷新）。此限制对应当前原生 ESM 加载路径，不能概括为 webpack MF 的共同限制（见[对照说明](../../maintainers/webpack-mf-对照与缺口.md#三使用限制与-webpack-的区别)）。

### `useLoadRemote`（`@fulgurjs/federation/react`）

```ts
const { data, error, loading, reload } = useLoadRemote<Utils>('remote-react/utils')
```

- 返回 `{ data: Module | undefined, error: unknown, loading: boolean, reload: () => Promise<void> }`；`error` 无错误时恒为 `undefined`；
- `options`：`shareScope` / `retries` / `fallbackModule`（透传 `loadRemote`；配置 `fallbackModule` 是显式声明的行为——失败返回兜底值而非写 error）；
- 按字段比较依赖（调用方每次 render 新建 options 对象不会无限重载）；spec/选项变化时清理旧数据进入新请求；
- 每轮 effect 与 `reload` 有独立代次：快速 A→B、慢请求晚返回、连续 reload、卸载后返回、StrictMode 双 effect 都只允许最新有效请求写状态；不宣称重复 effect 从未发生（运行时缓存去重网络与生命周期）；
- `reload` 开始时清空旧 data/error 并设 loading=true；当前尝试成功后写 data，失败后仅写 error，均结束 loading。卸载会作废未完成的 effect/reload，卸载后调用已保存的 reload 不发起请求。已成功缓存的模块不会重新下载；`Promise<void>` 正常结束（按钮 `onClick` 调用不产生未处理拒绝）；
- `AppContext` 不是 React 状态订阅：宿主读到新的非空 `sessionKey` 时由**宿主自身状态/路由**触发重新渲染。

### `RemoteErrorBoundary`（`@fulgurjs/federation/react`）

独立页面级兜底边界。props：`children`、`fallback`（节点或 `({ error, reset }) => ReactNode`）、`onError(error, info)`、`resetKeys`（任一变化重置边界状态，受控重试常用形态 `resetKeys={[retryEpoch]}`）。`reset` 只重置边界状态；子树若持有失败缓存（如外部 `React.lazy`）还需由调用方重建加载尝试——插件自带 `remoteComponent` 的重试已完成两者。内置 `remoteComponent` 的错误边界已消费自身错误，外层 `RemoteErrorBoundary` 看不到内层已处理的异常；想改某个远程组件的占位请用该组件自己的 `error` 选项。

<a id="setuponsession-远程初始化生命周期"></a>

## `federation({ setup })` — 远程初始化生命周期（setup/onSession）

```ts
// 远程 vite.config.ts / fulgurjs.config.ts
federation({ name: 'remote-a', exposes: { /* … */ }, setup: './src/fulgurjs/setup.ts' })
```

```ts
// remote-a/src/fulgurjs/setup.ts —— 只有下面两个函数名有自动生命周期语义
import type { RemoteSetupContext, RemoteSetupModule } from '@fulgurjs/federation/runtime'

export default async function setup(context: RemoteSetupContext) {
  // 应用级一次性注册：全局组件/指令、全局样式、locale 注入、宿主 app 上的插件安装
  // context.appContext = 调用时的 AppContext 快照；context.signal = 生命周期信号
}
export async function onSession(context: RemoteSetupContext) {
  // 会话级同步：当前用户、权限、字典、token 相关缓存
  const data = await fetchUserDicts()
  if (context.signal.aborted) return  // ← await 之后写状态前必须检查：期间可能已换账号/退出
  writeToStores(data)
}

// 6.1.0 可选具名导出：暴露面依赖的「消费方全局注册组件」声明
// （键=注册名，值=组件对象或零参 loader）。
// 适用场景：组件联邦（remoteComponent）把远程组件渲染进消费方 app，其模板里的字符串标签
// （如 <a-divider>）按消费方全局注册表解析——消费方没注册就渲染成无样式死元素。
// 运行时在每次 loadRemote 时把它们幂等注册到当次消费方 app；不声明则零行为。
export const globalComponents: RemoteSetupModule['globalComponents'] = {
  // 推荐零参 loader 形态：setup 模块自身零组件依赖，组件只在本框架消费方真实渲染时
  // 才加载（Vue 适配器注册时自动包 defineAsyncComponent）——跨框架消费方加载本远程
  // 纯 TS 模块时不拖入框架依赖图。
  ADivider: () => import('ant-design-vue').then((m) => m.Divider),
  // 静态组件值同样支持（同框架消费一步到位）：
  // AButton: Button,
}
```

`RemoteSetupContext`：`{ appContext: Readonly<AppContext>, sessionKey?: string, signal: AbortSignal }`。`appContext` 是**调用时**从页面级 AppContext 取得的快照（不保存永不更新的旧引用）；`signal` 在登录代次变化或退出清理时失效。

固定契约：

| 维度 | 语义 |
|---|---|
| 触发入口 | `loadRemote('remote/模块')` 是**统一入口**（`remoteComponent` 与宿主页面适配器同源）。`loadRemote('remote')`、`getContainer()`、`preloadRemote()`、直调 `container.get()` 都**不执行**初始化 |
| 时序 | 取得容器 → `init(shareScope)`（共享作用域收养）→ **setup** → **onSession** → **globalComponents 安装** → 返回业务模块。setup 模块自身的导入在该阶段完成共享协商 |
| 执行次数（setup） | 每容器一次；并发调用共享同一 Promise；成功后不重复。`preloadRemote` 只预取资源不执行 |
| 执行次数（globalComponents） | 声明提取随 setup 一次；**安装随每次 `loadRemote` 执行**（幂等，`app.component` 同名覆盖，后注册生效）——桥接子应用每次挂载新建 app 实例也能拿到注册。Vue `remoteComponent` 和 `createHostPages` 自动捕获消费方 app；手动 `loadRemote` 与 React 侧不自动传入（React 无 Vue 全局注册表）——跳过安装，不报错。注册随消费方 app 生命周期驻留，无独立卸载 API |
| 执行次数（onSession） | 按非敏感 `sessionKey` 去重：同一登录代次一次；新代次先作废旧 `signal`，再按远程**串行**衔接旧调用与新调用（防两账号异步写入交错）；`clearAppContext()` 失效去重状态，下次登录必须重跑。应用级 setup 不因退出/换代重复执行 |
| sessionKey | 宿主登录流程每次成功登录/重登生成新代次（非敏感 ID，禁止用 token）；token 刷新但会话未变时沿用。**有 onSession 却缺 sessionKey → MFU-013**，不凭用户对象引用猜测身份；无 onSession 的远程无需 sessionKey |
| 导出校验 | 必须默认导出函数；具名 `onSession` 可选且必须是函数；`globalComponents` 可选且必须是对象（键=注册名，值=组件）。违反 → MFU-011（报实际类型/预期签名/修法） |
| 失败与重试 | setup/onSession 抛错 → 该次 `loadRemote` 拒绝（MFU-012）；**只清失败阶段的缓存**（setup 失败重试从 setup 开始；onSession 失败只重跑会话段），已成功的阶段不重复。`fallbackModule` 不掩盖初始化失败 |
| 自递归 | setup/onSession 同步段内 `loadRemote(同 remote/…)` → MFU-014（该调用会等待自身形成死锁）。异步段内的同远程递归无法精确归因，表现为挂起——不要在初始化内加载同远程模块 |
| dev/prod 一致 | dev 容器（中间件直出）与 prod 容器（构建产物）携带同一 setup 元数据（容器上的 `__fulgurjsSetup` 字段 + manifest 的 `setup` 字段）；内部 expose 键 `./__fulgurjs_setup__` 不出现在类型产物与公开文档 exposes 清单中 |
| 错误码 | MFU-011 导出非法 / MFU-012 执行失败 / MFU-013 缺 sessionKey / MFU-014 自递归；全部带 remote 名、模块路径/阶段、实际结果、预期与修法，不记录 token |

「`exposes` 一个普通 TS 启动模块 + 宿主手动 `loadRemote` 并调用」只是普通 expose + `loadRemote` 的通用用法，不是插件 API，也无 `setup`/`onSession` 的应用级一次、会话级去重、失败重试语义——初始化一律改用 `federation({ setup })`。

<a id="bridge-api"></a>

## 桥接 API — `defineBridgeApp` / `createVueBridgeApp` / `createReactBridgeApp`

**导入位置**：`defineBridgeApp` 从 `/vue` 与 `/react` 同名双导出；`createVueBridgeApp` 从 `/vue`、`createReactBridgeApp` 从 `/react`。

**产品范围**：整站挂载/卸载的双向嵌入——Vue 3 宿主嵌 React 18/19 子应用、React 宿主嵌 Vue 3 子应用。子应用内部路由与宿主 URL 同步见[桥接 URL 同步 API](#url-sync-api)，显式开启、默认关闭。组件级互转、Angular、SSR/RSC、JS 沙箱、CSS 隔离不在支持面（见[支持范围](../troubleshooting/compatibility.md)）。

**双框架安装合同（必须）**：桥接宿主同时安装 `vue` + `react` + `react-dom`，shared 三键全部 `singleton: true`：

```ts
// 桥接宿主 fulgurjs.config.ts
shared: {
  vue: { singleton: true },
  react: { singleton: true },
  'react-dom': { singleton: true },
}
```

子应用只装并共享自己的框架（Vue 子应用：`vue`；React 子应用：`react` + `react-dom`）。纯 Vue / 纯 React 项目的零对方依赖承诺不受影响。共享子路径（`react/jsx-runtime`、`react/jsx-dev-runtime`、`react-dom/client`）由 shared 机制协商单实例；宿主侧需为 `react`、`react-dom` 配置 shared（子路径协商依赖父键）。缺 singleton 的真实症状（Invalid hook call、双实例）见错误码 `MFU-010`——插件按协商机制如实运行，不拦截配置违例。

### 子应用侧：`defineBridgeApp(工厂, options?)`

远程 expose `./bridge` 的模块**默认导出**契约对象；插件校验 `mount`/`unmount` 均为函数，否则 `MFU-015`。工厂签名 `(props, ctx?) => BridgeApp 产物`；`options: { routing?: true }` 声明 URL 同步协议后，`ctx` 携带 `{ signal, routing }`。完整用法（Vue 返回装配完整的 `createApp` 实例；React 返回元素）与契约语义见[子应用桥接](../guide/app-bridge.md#子应用侧definebridgeapp)。要点：

- `mount(el, props?): void | Promise<void>`——返回 void 表示首次根提交同步完成；返回 Promise 时宿主 pending 到首次根提交后完成（React 由契约内建提交探针兑现，`root.render()` 返回**不**算成功）。首次提交前的失败必须抛错/拒绝（宿主转 MFU-016，`details.phase: 'mount'`）并清理已创建的 app/root；
- `unmount(el): void`——同步使该容器代次失效并清理；未知容器 no-op；pending 时卸载立即作废本轮代次，迟到结果不得复活 DOM 或产生未处理拒绝；unmount 抛错 → MFU-016（`phase: 'unmount'`），该容器被**持久封锁**（同页重试与换会话不再挂载，只能整页刷新恢复）；
- 契约实例按容器 el 分键：同契约多处挂载互不干扰；同容器未卸载再次 mount 拒绝（MFU-016）且不覆盖原实例；
- 首次根提交后的子应用内部错误由**子应用自己的错误边界**负责——宿主 ErrorBoundary/errorCaptured 捕不到跨 root 渲染错误，插件不冒充兜底。

### 宿主侧工厂

```ts
// Vue 宿主（/vue）
import { createVueBridgeApp } from '@fulgurjs/federation/vue'
const RemoteReactApp = createVueBridgeApp<P>('react-remote/bridge', {
  loadingComponent?, errorComponent?, retries?, timeout?, getContext?,
})
// 模板：<RemoteReactApp :session-key="loginKey" :app-props="{ userId, onReady }" />

// React 宿主（/react）
import { createReactBridgeApp } from '@fulgurjs/federation/react'
const RemoteVueApp = createReactBridgeApp<P>('vue-remote/bridge', {
  fallback?, error?, retries?, timeout?, getContext?,
})
// JSX：<RemoteVueApp sessionKey={loginKey} appProps={{ userId, onReady }} />
```

| 项 | `createVueBridgeApp`（Vue 宿主） | `createReactBridgeApp`（React 宿主） |
|---|---|---|
| 工厂选项 | `loadingComponent?` `errorComponent?`（收到 `error` prop，完全接管） `retries?`（0–10 整数） `timeout?`（正有限 ms） `getContext?` | `fallback?`（pending 占位） `error?`（节点或 `(error, retry) => ReactNode`） `retries?` `timeout?` `getContext?` |
| 返回组件 props | `appProps: P`（业务数据）+ `sessionKey?: string \| null`（控制参数，不混入业务 props） | 同左，`ComponentType<{ appProps: P; sessionKey?: string \| null }>` |
| 泛型 | `createVueBridgeApp<P>(spec, options?)`，P 只约束 `appProps` | 同左 |
| spec | 完整 `<remote>/<expose>`，与 `remoteComponent` 同一解析规则；无 remotePrefixes/schema/deriveSpec | 同左 |
| 默认错误占位 | 中文诊断（错误码+根因+修法）+「重试加载 / 刷新页面重试」 | 同左 |

- **`appProps` 快照语义**：挂载时浅拷贝顶层字段传入，嵌套对象/响应式 store/函数保留原引用；之后的顶层替换**不追踪、不重渲染子应用**，需要重置用 `:key`/key 重建。宿主新闭包不会自动传给子应用——实时读取宿主状态请传稳定回调或主动重挂。跨 root 不继承宿主 provide/inject、Pinia、React Context 或路由。
- **`getContext`**：无副作用的**同步** getter，在首次、重试及换会话的实际加载前调用；返回快照对象（拒绝 Promise/thenable 与非对象——`MFU-016`，`phase: 'getContext'`）。桥接层先校验快照 `sessionKey` 与受控值一致（不一致 `MFU-017`，且不写全局），**校验通过后由桥接层调用 `provideAppContext`**——getter 本身不写全局。未提供 getter 时校验现有 `AppContext.sessionKey` 必须与受控值一致。换代时桥接层先 `clearAppContext()` 清旧账号独有字段再写新快照。
- **`sessionKey` 受控语义**：只接受 `undefined`（不启用受控会话）/`null`（登出态：立即卸载、保持空容器、不再 loadRemote）/非空字符串（登录代次）。空字符串、数字等非法值按 `MFU-017` 拒绝挂载。完整触发表见[子应用桥接 · 会话](../guide/app-bridge.md#会话sessionkey与-appcontext)。
- **多实例与页面级单会话**：同页多个同 spec 实例并存合法（按 el 分键）；`AppContext` 是页面级单例——同页所有受控桥接实例必须同一会话，代次不一致按 `MFU-017` 拒绝。不承诺同页同时承载两个账号。
- **DOM 所有权**：包装组件只创建并保持稳定的空挂载容器；宿主重渲染不 patch 子应用 root 内部。React 宿主 StrictMode 双 effect 安全。Vue `<KeepAlive>` 的 deactivate 不是卸载——缓存页中的子应用保有 root 与状态。
- **旧请求不冒充取消**：已进入 `loadRemote` 的工作不因桥接层作废而被取消——迟到的旧结果按代次丢弃；远程 `onSession` 必须遵守 `signal.aborted` 契约。

<a id="url-sync-api"></a>

## 桥接 URL 同步 API

**导入位置**：`createVueBridgeNavigation`/`connectVueBridgeRouter` 从 `/vue`；`createReactBridgeNavigation`/`createReactBridgeRouter` 从 `/react`。路由库为可选 peer（vue-router / react-router-dom 消费者自装；React 端缺依赖仅在实际调用 `createReactBridgeRouter` 时报清晰错误）。

桥接默认 memory 路由；URL 同步让**宿主 URL 表达子应用内部位置**（刷新直达、收藏分享、前进后退）。显式开启、默认关闭。**架构约定**：宿主 Router 是浏览器历史唯一写入方；子应用使用受控 memory 路由；两端经独立路由通道传递位置；同实例内 path/search/hash 变化**不重挂 root、不重建 store、不重新加载远程**。

### API 签名

| 函数 | 签名 | 说明 |
|---|---|---|
| `createVueBridgeNavigation` | `(router: VueRouterLike) => BridgeHostNavigation` | Vue 宿主导航端口。Vue Router fullPath 已是逻辑路径，无需传部署 base。Vue Router 4，history/hash 模式皆可 |
| `createReactBridgeNavigation` | `(navigate, { basename?, canNavigate? }) => BridgeHostNavigation` | React 宿主导航端口。**仅支持 data router**（`createBrowserRouter`/`createHashRouter` + `RouterProvider`）；declarative 模式（BrowserRouter）无取消语义，不支持。React Router ≥ 6.11。`canNavigate` 可选仅作提前拒绝；端口观察真实 blocker 状态，等待 `reset()` 返回 cancelled、`proceed()` 后实际位置提交返回 committed，不能只凭 navigate 的 Promise 落定判成功 |
| `connectVueBridgeRouter` | `(routing: BridgeChildRouting, router: Router, { signal? }) => { ready: Promise, dispose(): void }` | Vue 子应用接线受控 memory 路由；`await …ready` 落定后再 `app.use(router)`（顺序不能反） |
| `createReactBridgeRouter` | `(routing, routes, { signal? }) => { element, dispose(), routerReady }` | React 子应用：返回 `RouterProvider` 元素直接作契约产物。`routerReady: Promise<Router>` 是已接线 memory router 的就绪合同：fast 路径（模块级预热已就绪，常见）返回**同步已 resolve** 的 Promise，resolve 值与 `element.props.router` 等价；slow 路径（预热未落定的罕见竞态）在惰性宿主接线完成时 resolve，缺 react-router-dom 时 reject 清晰错误。宿主内省/断言请优先 `await routerReady`，不要假设 `element.props.router` 同步存在。`dispose()` 幂等销毁接线（signal 触发时自动调用）；已 dispose 后迟到任务不写状态 |

宿主传给桥接组件的通道参数：`routing: BridgeHostRouting = { basePath: '/approval', navigation }`；子应用契约第二参数声明 `{ routing: true }` 后从 `ctx.routing` 接收通道。两端接线第三参数 `{ signal?: AbortSignal }` 默认为空；推荐传 `ctx.signal` 自动 dispose，未传时由子应用显式调用 `dispose()`。自定义 `BridgeHostNavigation.navigate(target, action, { signal })` 应在异步提交前复核可选 signal，已 aborted 时禁止迟到写入。

### 行为契约（完整展开见 [URL 同步指南](../guide/url-sync.md#行为契约与边界)）

- **basePath**：宿主路由视角的静态绝对路径（拒绝空/根/带 query·hash·通配符，`MFU-030`）；按路径段匹配；同页各同步实例前缀不得相同或重叠；`/approval` 对应子应用 `/`，根重定向由子应用路由定义、以 replace 规范化；
- **Vite base 分层**：部署在 `/erp/` 时 Vite base/宿主 Router base 是 `/erp/`，bridge basePath 仍是 `/approval`（Vue Router 已剥离 history base，React 端口传 `basename`）；逻辑路径不含部署前缀；
- **位置三段全等**：search/hash 原样保留（重复 query 键、编码、中文、片段不二次 decode/encode）；仅参数变化也同步且不重挂；
- **取消语义**：Vue Router 4 的 push/replace 落定 `NavigationFailure` 即真实取消；React data router 等待真实 blocker 取消/放行。取消后 URL、历史、子应用位置保持最后确认状态，**绝不自动重试**；
- **导航与错误**：子应用 push/replace 保留原动作，go/back/forward 委托宿主历史；连续请求串行落定，外部导航作废旧的在飞与排队请求；守卫/加载器/端口执行异常拒绝 Promise（MFU-033，保留 cause），不伪装 cancelled；
- **会话与生命周期**：`sessionKey→null` 作废旧通道——旧通道导航一律 cancelled、不写 URL、不复活子应用；unmount 后通道销毁（再订阅得 MFU-031）；KeepAlive 缓存离页实例暂停路由写入（激活重同步）；unmount 抛错的持久封锁不因路由绕过；
- **协议校验**：宿主启用 routing 而子应用未声明 `{ routing: true }` → `MFU-031` 占位，**不静默退回 memory 假装深链成功**；
- **非法导航与循环**：目标越界自身前缀（`../`、跨前缀）、目标已含 basePath（重复前缀）、非法 `go` 参数 → `MFU-032`；连续内部 replace 超过 5 次（重定向环）→ `MFU-033`（附目标链，不静默回入口）；
- **按需加载**：`/vue`、`/react` 默认入口不引入任何路由库；路由同步 API 对路由库仅类型导入 + 模块级按需预热；
- **不承诺**：SSR/RSC、跨浏览器窗口、嵌套多级桥接子应用路由代理、TanStack Router 及其他路由库（可经 `BridgeHostNavigation`/`BridgeChildRoute` 端口自定义扩展）。

<a id="dev-types"></a>

## 远程类型（自动生成与同步）

远程类型默认开启（`dts: true`），链路是**提供方生成可分发声明 → 宿主自动同步 → TypeScript 自动发现**，不要求远程源码在宿主机器上、不要求手工 tsconfig paths：

- **提供方**：dev 后台（vue-tsc / TypeScript，按工程实际 tsconfig）从公开 exposes 出发生成**声明闭包**——默认/具名/类型导出、泛型、函数重载、重导出、Vue SFC 真实 props/events 都按官方工具链产出；源码 alias 重写为声明内相对引用，跨工程源码路径与本机绝对路径绝不外发；闭包内编译错误时**不产出**类型资源（manifest 不携带 `types`，构建给出 TYP-001 诊断）。prod 构建把声明资源（`fulgurjs-types/`）随产物输出，manifest 附带定位与内容摘要。
- **哪些依赖会生成类型**：入口的静态导入、路径别名、`import type` / `import("…")` 类型引用和 Vue 脚本依赖都会检查；手写本地 `.d.ts` 也会保留。纯样式副作用导入不会写入声明。运行时 `import()` 动态装配不属于公开声明闭包；公开 props 等合同应放在入口与实现共用的类型文件中。
- **宿主**：dev 启动后台同步（不阻塞页面服务；远程晚启动有界重试，恢复后自动更新；源码变化按摘要代次自动刷新）。同步做完整性校验（逐文件摘要、路径边界、大小/数量上限），完整下载后**原子替换**——中断/失败保留上一代完整声明并明确陈旧状态。产物写入 `src/fulgurjs/types/`（无 src 布局回退 `.fulgurjs/types`，`dts.dir` 可覆盖）：`<远程名>/modules.d.ts`（环境模块声明）+ `<远程名>/registry.d.ts`（类型注册表）+ `metadata.json`（生成器账本——清理只动账本内自有文件，绝不碰用户文件）。
- **TypeScript 发现**：生成目录默认落在 `src` 下，常规 `include: ["src/**/*"]` 零配置生效；生成代码不含相对导入，宿主 `moduleResolution`（bundler/NodeNext/…）不影响发现。目录被 exclude 或严格 `files` 白名单排除时，dev 与 `fulgurjs types` 给出 TYP-006（含具体配置文件与最小修法）。插件**绝不**在 dev 启动时改写你的 tsconfig。

### 字符串 API 的入口检查（类型注册表）

`loadRemote`、`remoteComponent`、`createVueBridgeApp`、`createReactBridgeApp` 与普通 import 共用同一份注册表类型（`FgRemoteTypes`，由同步产物登记）：

- **已同步的入口字面量**：获得真实模块/组件/桥接类型——参数、返回值、props、`appProps` 全部精确检查；`remoteComponent` 只接受默认导出为组件的暴露项，桥接工厂只接受 `defineBridgeApp` 的默认导出（普通模块冒充会编译报错）；
- **拼错的入口字面量**：注册表非空时在**调用点编译报错**（不再被宽泛 string 重载兜底通过）；
- **动态字符串变量**（业务拼接的入口名）：永远放行，结果类型为 `unknown`——这是诚实边界：运行时仍可加载，但类型系统不知道远程真实形状；需要时可显式泛型 `loadRemote<T>(spec)` 或先用类型化变量收窄；
- **未同步任何类型**（远程旧版本/`dts: false`）：所有字面量放行、结果 `unknown`，页面正常运行；严格类型检查需要升级远程并保持 `dts: true`。

桥接 `appProps`：提供方 `defineBridgeApp<{ userId: string }>(工厂)` 声明的 props 经声明闭包保留到宿主包装组件（Vue 模板/JSX 均可检查）；未声明具体类型的远程得到诚实的 `Record<string, unknown>`——工具不会凭空推导业务字段。

### CI 与离线检查（`fulgurjs types`）

在 typecheck 前运行 `npx @fulgurjs/federation types`（详见 [CLI 参考](cli.md)）：提供方验证声明生成（闭包编译错误 → **非零退出**），宿主按 `--mode dev|prod` 同步声明并校验外部类型依赖可解析（缺失列出包名与安装命令，TYP-005）。全新 clone 的 CI 不需要先启动浏览器或 dev server。`--check` 只核对本地缓存与已记录代次——不联网，不代表远程线上最新已核实。

### 工具要求

声明生成工具只进 Node 侧，不进浏览器运行时与共享依赖图：纯 TS/React 工程需要 `typescript`；含 `.vue` 暴露的提供方需要 `vue-tsc`（模板已内置；缺失时给出当前包管理器的安装命令，TYP-007，不会静默联网安装）。React-only 工程不要求安装任何 Vue 工具。

### 边界与已知限制（如实）

- 声明本身会暴露远程模块的接口结构——介意时可 `dts: false` 关闭发布；
- 外部类型依赖（远程声明引用的第三方包，如组件库）须宿主可解析，缺失时相关类型退化并给出 TYP-005 安装指引；
- 动态注册（`registerRemote`）/promise remote 的入口无法在编译期枚举——按动态边界处理。

生成目录是否提交 Git：默认忽略（CI 在 typecheck 前用 `fulgurjs types` 同步）；对离线可复现要求高的工程（如本仓库模板）可显式提交声明快照——fresh clone 开箱即可 typecheck，dev/CLI 会随远程演进自动更新它。

<a id="project-side"></a>

## 可选的项目侧组合用法：保活、加载提示、预载和诊断页

本节记录项目侧的组合用法。常量、页面及诊断面板需要接入方自己实现，不是安装插件后自动生成的公开 API。`fulgurjs init` 只生成配置起步模板，不生成这些项目文件；插件 runtime 零参与。配置面总览：

| 能力 | 配置项 | 类型 | 默认值 | 配置位置 |
|---|---|---|---|---|
| 页面保活 | `keepAlive` | `boolean` | `false` | 页面路由表条目 |
| 页面加载骨架屏 | —（内置，无配置项） | — | 见下方内置参数 | 页面工厂 |
| 空闲预载 | `PREFETCH_REMOTES` | `string[]` | `[]`（关闭整远程预载，按需加载） | 宿主桥顶部常量 |
| 联邦诊断面板 | —（内置页面） | — | 常驻 | 自定义路由（如 `/fulgurjs-demo`） |

### 10.1 页面保活 — `keepAlive`

页面级布尔开关：开启后该页面切换到其他标签页时**组件实例不销毁**（deactivate），切回时表单输入、筛选条件、滚动位置原样恢复。

```ts
// 页面路由表条目
{ route: '/some/page', name: 'SomePage', title: '页面', keepAlive: true }
// 关闭：不写该字段，或显式 false（二者等价，默认即关）
```

- 缓存上限 `max: 8`（Vue 原生 LRU，超出后最久未访问的页面实例被销毁）；
- 缓存键 = 页面 spec 清洗名（`Fulgurjs_<remote>_<expose键>`），同一路由不同参数（fullPath 不同）各占一个缓存条目；
- **默认全关的原因**：重型组件（复杂表格/表单设计器）的缓存内存成本高，按页面逐个显式开启；
- 开启页面的组件若注册了 `window` 级监听/定时器/context 反向注册，须遵循[卸载清理清单](../guide/remote-pages.md#页面卸载清理清单)（保活页只在真正被 LRU 淘汰时才 unmount）。

### 10.2 页面加载骨架屏 — 内置 `loadingComponent`（无配置项）

页面组件工厂内置加载期占位：联邦页面 chunk 下载/模块执行期间显示渐变动画骨架而非白屏。内置参数：`delay: 200`（ms，超过才显示——快速加载不闪烁）、`errorComponent` 内置错误占位（spec + 错误码 + 根因 + 修法）。如需自定义加载占位，不经页面工厂，改用 `remoteComponent(spec, { loadingComponent })`。

### 10.3 空闲预载 — `PREFETCH_REMOTES`（默认关闭）

**先分清四层（勿把「路由声明多」当成「首屏会执行所有页面代码」）**：

| 层 | 机制 | 时机 | 网络成本 |
|---|---|---|---|
| ① 路由表声明 | `pages.data.ts` 只是**数据映射**，不导入任何远程代码 | 构建期 | 零 |
| ② 页面真实加载 | `createHostPages` 对每页异步组件包装，**渲染时**才 `loadRemote(spec)` | 用户打开该页 | 该页 chunk + CSS（首次该远程还有入口/共享依赖/setup） |
| ③ 单页预取 | `preloadRemote('remote-a/pages/home', { mode: 'prefetch' })` | 项目主动调用 | 该 expose 的 chunk + CSS（**只下载不执行**） |
| ④ 整远程预取 | `preloadRemote('remote-a', { mode: 'prefetch' })` | 项目显式开启 | manifest 全部 expose 的 chunk + CSS（**只下载不执行**） |

预取是**下载**（`modulepreload`/`stylesheet` 链接，`fetchPriority=low` 只是降低优先级、不等于不下载），**不等于执行页面代码**——`container.get()`、组件实例化、`setup/onSession` 都只由真实页面的 `loadRemote` 触发。已加载模块有 Promise 缓存：重复打开同页复用模块，换账号重做会话初始化但不重新下载 JS。

```ts
// 宿主桥顶部常量；默认关闭整远程预载（按需加载）
const PREFETCH_REMOTES: string[] = []
// 显式预热整个远程（下载完整 expose 清单；确有真实使用路径再开启）
// const PREFETCH_REMOTES: string[] = ['remote-a', 'remote-b']
// 单页预取（推荐：只预取明确下一步页面，低优先级只下载不执行）
// idle(() => preloadRemote('remote-a/pages/home', { mode: 'prefetch' }))
```

> 插件配置面（`FederationOptions`）**没有** `host.prefetch` 字段——旧文档曾声称该配置存在，属错误描述，已订正。预载名单就是宿主桥里的常量，改名单只改这一个地方。

行为与边界：预载失败**不阻断业务**（runtime 按 MFU-007 语义发出 `fulgurjs:error` 事件并 console 警告）；预载注入 `<link rel="modulepreload">` 与 `<link rel="stylesheet">`，不执行模块；`preload` 等待样式 load/error，`prefetch` 低优先级后台加载；触发时机为宿主桥每次页面加载同步执行（幂等），实际预取发生在浏览器空闲回调中。

### 10.4 联邦诊断面板（免登录页，无配置项）

项目可自建运行时诊断页（路由 `meta.ignoreAuth`），六块信息实时读取运行时注册表：

| 块 | 内容 |
|---|---|
| ① 方法模块调用演示 | 按钮实调 `loadRemote('remote/api')` 并显示结果（方法引用通道的活样例） |
| ② remotes 状态 | 各 remote 的 entry / 加载状态（idle/loading/loaded/failed）/ 容器加载耗时 |
| ③ shared 协商 | 共享键 → version ← 提供方（多版本并存可见） |
| ④ context 快照 | AppContext 每个键的值形态（函数引用 / 对象 / 字符串，含 events 池） |
| ⑤ fulgurjs:error 历史日志 | window 事件累积（时间戳 + remote + 错误消息），零错误显示"无错误" |
| ⑥ 远程资源加载耗时 | performance resource 中 fulgurjs / remoteEntry / chunk 相关条目与耗时 |

## 相关文档

- 插件选项字段全集与省略语义：[配置参考](configuration.md)
- CLI 命令全集：[CLI 参考](cli.md)
- 48 个错误码：[错误码总表](errors.md)
- 产物端点与部署规则：[部署指南](../guide/deployment.md)
- 完整可运行工程：[examples](../../../examples/README.md)

## 完整公共类型

[公共类型参考](types.md) 按当前入口列出全部公开类型及字段。
