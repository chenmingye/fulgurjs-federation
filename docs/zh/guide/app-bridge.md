# 子应用桥接：完整子应用嵌入（Vue ↔ React）

**已有应用优先保留原独立入口，用 `defineBridgeApp` 复用已有业务初始化并提供桥接。** 项目主动选择由插件管理两种启动时，再采用 `defineApplication`。两者都不要求重复注册业务依赖；先读[首次接入](first-integration.md)与[已有应用参考](existing-apps.md)。

> 场景：把一个**完整子应用**（自带 Router/store/菜单）挂进另一框架的宿主——Vue 3 宿主嵌 React 18/19 子应用，或反向。嵌入的是子应用：子应用创建自己的组件树，宿主只提供 DOM 容器；**不做组件类型转换**（Vue 的 `remoteComponent` 不能直接渲染 React 组件）。
>
> 导入入口：子应用 `defineBridgeApp` 从 `@fulgurjs/federation/vue` 或 `@fulgurjs/federation/react` 导入；宿主工厂 `createVueBridgeApp`/`createReactBridgeApp` 同样从 `/vue`、`/react` 导入。

## 产品范围

- 支持：整站挂载/卸载的双向嵌入；子应用内部路由与宿主 URL 同步（显式开启，见[URL 同步](url-sync.md)，默认不建立同步通道；子应用工厂应自行创建 memory 路由）；受控会话（切换/登出）；嵌套（同页多个桥接实例、A→B→C 多层）。
- 不支持：组件级互转、Angular、SSR/RSC、JS 沙箱、CSS 自动隔离（见[支持范围](../troubleshooting/compatibility.md)与[沙箱边界审计](../../maintainers/沙箱边界审计.md)）。

<a id="双框架安装合同桥接宿主必须"></a>

## 框架依赖怎么安装：同框架与跨框架分开

**同框架桥接只需要本框架**：Vue 套 Vue 不必安装 React，React 套 React 不必安装 Vue。

下面是跨框架模板采用的推荐配置：**由宿主统一提供两套框架运行时**，所以宿主安装 `vue` + `react` + `react-dom`，在同一共享作用域配置三键 `singleton: true`。这是此供给方案的依赖要求，不是桥接工厂无条件导入另一框架。若由子应用自行提供另一框架运行时，需明确该作用域的提供方/消费方及 fallback，不能只删依赖却保留消费配置。

```ts
// 桥接宿主 fulgurjs.config.ts
import type { FederationOptions } from '@fulgurjs/federation'

export default {
  name: 'bridge-host',
  remotes: {
    'react-remote': { dev: 'http://localhost:5303/react-remote', prod: '/react-remote' },
  },
  shared: {
    vue: { singleton: true },
    react: { singleton: true },
    'react-dom': { singleton: true },
  },
} satisfies FederationOptions
```

子应用只装并共享自己的框架（Vue 子应用：`vue`；React 子应用：`react` + `react-dom`）。共享子路径（`react/jsx-runtime`、`react/jsx-dev-runtime`、`react-dom/client`）由 shared 机制协商单实例；宿主侧为 `react`、`react-dom` 配置 shared 是子路径协商的前提。纯 Vue/纯 React 项目的零对方依赖承诺不受影响。缺少所需实例一致性可能表现为 Invalid hook call 或状态不互通；`MFU-010` 专门表示最终单例版本不满足消费范围，并不是“缺少 singleton”的通用检测码。同页有多个 React 大版本时，singleton 不能把不兼容版本变成兼容，需按[版本隔离](sharing.md#sharescope分组隔离react-1819-同页隔离)分 scope。

## 子应用侧：`defineBridgeApp`

远程 expose `./bridge` 的模块**默认导出**契约对象。插件校验 `mount`/`unmount` 均为函数，否则 `MFU-015`。

**Vue 子应用**（`@fulgurjs/federation/vue`）：

```ts
// src/bridge.ts —— fulgurjs.config.ts: exposes: { './bridge': './src/bridge.ts' }
import { createApp } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { defineBridgeApp } from '@fulgurjs/federation/vue'
import App from './App.vue'
import { routes } from './routes'
import { setupRouterGuard } from './permission'

export default defineBridgeApp((props) => {
  const app = createApp(App, props)
  const router = createRouter({ history: createMemoryHistory(), routes })
  setupRouterGuard(router)
  // 在这里安装本项目的 Pinia、i18n 等业务插件；不要提前 app.use(router)。
  return { app, router }
}, { routing: true })
```

返回 `{ app, router }` 后，插件校验宿主通道、等待初始深链经过业务守卫、安装 router，再挂载 app；卸载和初始化失败时自动释放路由连接。工厂可为 async，异步业务装配完成后再返回。缺少宿主通道报 `MFU-034`，必须声明 `{ routing: true }`。

不需要 URL 同步时返回 app（可自行 `app.use(memoryRouter)`），省略 `{ routing: true }`。同一项目的独立入口仍用 web history 并正常 `app.use(router)`，桥接入口用 memory history；两者可共用业务初始化函数，无需手写全局运行模式开关。需要在路由就绪后继续执行逻辑时，使用 `installVueBridgeRouter(app, router, ctx)` 并返回 app；不能再返回同一个 router，避免重复接线。

**React 子应用**（`@fulgurjs/federation/react`；`react-dom/client` 实际 mount 时才加载）：

```tsx
// src/bridge.tsx
import { MemoryRouter } from 'react-router-dom'
import { defineBridgeApp } from '@fulgurjs/federation/react'
import App from './App'

export default defineBridgeApp((props) => (
  <MemoryRouter>
    <App {...props} />
  </MemoryRouter>
))
```

**布局与标题感知**：Vue 组件在 setup 中捕获 `getCurrentInstance()?.appContext.app`，然后调用 `hasBridgeMount(app)`；React 工厂调用 `hasBridgeMount(ctx)` 并通过 props 或 Context 传给业务组件。标记属于具体 app/工厂上下文，不影响同页宿主或其他应用。静态模块初始化不要判断页面运行模式；独立入口创建 web router，桥接工厂创建 memory router。

契约语义（`BridgeApp` 接口，`/vue` 与 `/react` 共享同一类型定义）：

- `mount(el, props?): void | Promise<void>`——返回 `void` 表示首次根提交已同步完成（Vue 同步 mount）；返回 Promise 时宿主保持 pending 直到首次根提交后完成（React 由契约内建提交探针兑现，`root.render()` 返回**不**算成功）。首次提交前的失败必须抛错/拒绝（宿主转 `MFU-016`，`details.phase: 'mount'`）并清理已创建的 app/root。
- `unmount(el): void`——同步使该容器代次失效并清理；未知容器为 no-op。pending 时卸载立即作废本轮代次，迟到的成功/失败不得复活 DOM、改写宿主状态或产生未处理拒绝。unmount 抛错由宿主捕获报 `MFU-016`（`phase: 'unmount'`），该容器清理状态不确定，插件会**持久封锁该容器**：同页「重试加载」与换会话都不会在此容器重新挂载（默认占位移除「重试加载」按钮），只能整页刷新恢复；残留资源（事件订阅/定时器/全局副作用）需如实排查修复。
- 契约实例**按容器 el 分键**：同一契约多处挂载互不干扰；同一容器未卸载再次 mount 拒绝（`MFU-016`，容器已被占用）且不覆盖原实例。
- 首次根提交后的子应用内部错误由**子应用自己的错误边界**负责——宿主 ErrorBoundary/errorCaptured 捕不到跨 root 的渲染错误，插件不冒充兜底。

`defineBridgeApp(工厂, { routing: true })` 的第二参数声明 URL 同步协议，见[URL 同步](url-sync.md)。

## 先选会话方式，再创建宿主组件

| 场景 | 推荐方式 | 宿主需要做什么 |
|---|---|---|
| Vue 宿主，登录状态可从响应式业务 store 读取 | 工厂选项 `session: getIdentity` | getter 返回稳定非敏感 ID / null / undefined；不再传 sessionKey prop，不在登录 store 手动 renew/clear |
| React 宿主，或业务必须显式控制登录代次 | 组件 prop `sessionKey` | 用宿主状态提供非敏感代次；登录/重新认证更新、token 轮换保持、退出置 null；同页多个桥接实例共用同一代次 |
| 无登录/会话依赖的公开应用 | 两者都省略 | 不为满足示例创建假身份、空 session 文件或无用 context |

Vue 常规接线见[首次接入的完整代码](first-integration.md#4-有登录依赖才增加业务上下文)。**下方宿主代码演示显式模式**：`loginKey` 来自已有认证状态，不能照抄一个固定字符串；若改用自动模式，配置 `session` 并删除模板的 `:session-key`，二者不能并用。`getLatestHostContext`、加载/错误组件均代表项目已有实现，按需替换或省略可选配置。

## 宿主侧：`createVueBridgeApp` / `createReactBridgeApp`

**Vue 宿主**（`@fulgurjs/federation/vue`）：

```vue
<script setup lang="ts">
import { createVueBridgeApp } from '@fulgurjs/federation/vue'
import { getLatestHostContext } from './host-context'   // 宿主自有的同步纯 getter

const RemoteReactApp = createVueBridgeApp<{ message: string }>('react-remote/bridge', {
  loadingComponent: MyLoading,
  errorComponent: MyError,     // 收到 error prop，完全接管展示
  retries: 1,                  // 0–10 整数
  timeout: 15000,              // 正有限 ms
  getContext: () => getLatestHostContext(),
})
</script>

<template>
  <RemoteReactApp :session-key="loginKey" :app-props="{ message: '来自 Vue 宿主' }" />
</template>
```

**React 宿主**（`@fulgurjs/federation/react`）：

```tsx
import { createReactBridgeApp } from '@fulgurjs/federation/react'
import { getLatestHostContext } from './host-context'

const RemoteVueApp = createReactBridgeApp<{ message: string }>('vue-remote/bridge', {
  fallback: <Spinner />,
  error: (err, retry) => <ErrorBox error={err} onRetry={retry} />,
  getContext: () => getLatestHostContext(),
})

export default function BridgePage() {
  return <RemoteVueApp sessionKey={loginKey} appProps={{ message: '来自 React 宿主' }} />
}
```

两端对照：

| 项 | `createVueBridgeApp`（Vue 宿主） | `createReactBridgeApp`（React 宿主） |
|---|---|---|
| 工厂选项 | `loadingComponent?` `errorComponent?`（收到 `error` prop，完全接管） `retries?`（0–10 整数） `timeout?`（正有限 ms） `getContext?` `session?` `sessionStorageKey?` | `fallback?`（pending 占位） `error?`（节点或 `(error, retry) => ReactNode`） `retries?` `timeout?` `getContext?` |
| 返回组件 props | `appProps: P`（业务数据）+ `sessionKey?: string \| null`（控制参数，不混入业务 props） | 同左，`ComponentType<{ appProps: P; sessionKey?: string \| null }>` |
| 泛型 | `createVueBridgeApp<P>(spec, options?)`，P 只约束 `appProps` | 同左 |
| spec | 完整 `<remote>/<expose>`，与 `remoteComponent` 同一解析规则；无 remotePrefixes/schema/deriveSpec | 同左 |
| 默认错误占位 | 中文诊断（错误码+根因+修法）+「重试加载 / 刷新页面重试」 | 同左 |

## `appProps` 快照语义（重要）

**挂载时顶层字段浅拷贝传入**；嵌套对象/响应式 store/函数保留原引用。之后的顶层替换**不追踪、不重渲染子应用**——需要重置用 `:key`/key 显式重建。

宿主闭包不会自动传给子应用。实时数据三条通道按需选择：

| 场景 | 用什么 | 代价 |
|---|---|---|
| 子应用需要宿主实时值（token、用户名等） | 传**稳定回调**（如 `getToken: () => store.token`），子应用调用时取最新值 | 无重挂；适合「读」 |
| 两边共享一块状态 | 把宿主 store 实例经 `appProps` 或 AppContext 传过去，双方订阅同一实例 | 同一 Vue 运行时可追踪显式传入的同一响应式对象；React/跨框架使用明确的订阅适配，不自动互转响应式 |
| 必须以新 props 重新初始化 | 宿主给桥接组件换 `key` 显式重挂（卸载→重走完整加载链） | 全部状态重置；不要频繁触发 |

跨 root 不继承宿主 provide/inject、Pinia、React Context 或路由——需要的数据经 `appProps`、AppContext、共享实例或子应用自装。

## 会话（sessionKey）与 AppContext

`sessionKey` 受控语义——只接受三种值，语义完全不同：

| 值 | 语义 |
|---|---|
| 省略（`undefined`） | 不启用受控会话；仍可提供快照或复用现有 AppContext；远程声明 `onSession` 时按运行时既有规则（无 sessionKey → `MFU-013`） |
| `null` | 登出态：立即卸载、保持空容器、不再 loadRemote；宿主随后 `clearAppContext()` 并移除/禁用缓存的私有页面 |
| 非空字符串 | 登录代次。首次渲染走：getContext（若提供）→ 校验快照/现有 context → 桥接层 `provideAppContext` → loadRemote → 契约校验 → `contract.mount(el, appProps 快照)`；远程 `onSession` 用同一代次 |

空字符串、数字等非法值按 `MFU-017` 拒绝挂载。

### Vue 宿主推荐：自动会话

在 `createVueBridgeApp` 选项中配置 `session` 同步身份 getter，返回稳定非敏感用户标识。返回 `undefined` 表示用户资料恢复中（不加载、不删除恢复记录）；返回 `null` 表示明确退出。插件内部生成随机代次、持久化、补入 AppContext、换号重挂、登出清理，不需要额外 session.ts、sessionKey prop 或登录流程里的 renew/clear。

`session` 必须读取响应式状态；仅更新 localStorage 不会通知 Vue。标识不能使用token/密码/敏感资料，sessionStorage保存的是非敏感身份及随机代次；同身份token轮换不重挂。缺省不启用自动会话，普通无登录远程按原方式加载。自定义缓存命名空间用 `sessionStorageKey`，同一宿主多个远程用相同键。显式 sessionKey prop 与自动模式同时配置会报错；getContext 若手填不同 sessionKey 仍报 MFU-017，不会被自动覆盖。

完整接线见[首次接入](first-integration.md#4-有登录依赖才增加业务上下文)与[Vue 宿主模板](../../../examples/templates/vue-host-react-remote/vue-host/src/App.vue)。插件无法猜测未体现在响应式状态里的同账号重新认证事件；需要区分时把业务认证批次纳入身份，或使用显式受控模式。

### 显式控制（Vue / React）

需要自行指定代次的场景仍可使用 sessionKey prop。Vue 的 `createBridgeSession()` 提供非敏感随机ID和 renew/clear；将它放在已有认证/上下文模块，不为一行实例创建单独文件，不在token刷新时renew。React 宿主继续通过状态/hook显式提供代次，不能使用Vue自动session getter。

`getContext` 是**无副作用的同步 getter**：在首次、重试及换会话的实际加载前调用；返回快照对象（拒绝 Promise/thenable 与非对象——`MFU-016`，`phase: 'getContext'`）。桥接层先校验快照 `sessionKey` 与受控值一致（不一致 `MFU-017` 且不写全局），**校验通过后由桥接层调用 `provideAppContext`**——getter 本身不写全局。未提供 getter 时校验现有 `AppContext.sessionKey` 必须与受控值一致。换代时桥接层先 `clearAppContext()` 清旧账号独有字段再写新快照，保证零旧账号残留。

会话变化触发表：

| 触发 | 行为 |
|---|---|
| 首次渲染，`sessionKey` 非空字符串 | 完整加载链（见上） |
| 首次渲染，`sessionKey` 省略 | 不启用受控校验；远程 onSession 缺 sessionKey 报 `MFU-013` |
| `sessionKey` A→B | 推荐宿主先置 `null` 等卸载、`clearAppContext()` 后再更新；直接 A→B 时包装组件先作废并卸载 A、确认完成后才写 B 的 context 并挂载 |
| `sessionKey` → `null` | 立即作废旧加载并卸载；保持空容器不再请求 |
| 同会话重渲染 / 只换 `appProps` 引用 | 不重挂、不重复 loadRemote；业务数据仍是上次挂载快照 |
| 点错误占位「重试加载」 | 同页重建尝试（成功模块走运行时缓存；失败入口按现有机制换 URL 重取） |

**多实例与页面级单会话**：同页多个同 spec 实例并存合法（契约按 el 分键）；`AppContext` 是页面级单例——同页所有受控桥接实例必须同一会话，后挂实例与活跃实例代次不一致按 `MFU-017` 拒绝。不承诺同页同时承载两个账号。

**旧请求不冒充取消**：已进入 `loadRemote` 的工作不因桥接层作废而被取消——迟到的旧结果按代次丢弃（不 mount、不覆盖、无未处理拒绝）；远程 `onSession` 必须遵守既有 `signal.aborted` 契约（异步等待后、写私有状态前检查信号）。

## DOM 所有权与生命周期边界

- 包装组件只创建并保持稳定的空挂载容器；pending/error 占位是它的兄弟节点，宿主重渲染不 patch 子应用 root 内部；
- 挂载容器默认 `width:100%; height:100%` 占满宿主提供的挂载区——子应用普遍按 `height:100%` 组织布局，无尺寸的容器会让高度链塌陷为 0（内容被滚动容器定位到视口外）；需要异形尺寸时由宿主在容器外层再包一层并自行约束；
- React 宿主 StrictMode 双 effect（mount→cleanup→mount）安全；
- Vue `<KeepAlive>` 的 deactivate 不是卸载——缓存页中的子应用保有 root 与状态；需要离页即销毁就别缓存该页，登出流程应同时移除缓存的私有页面；
- 子应用内的 `window` 级监听/定时器/反向注册须自行清理（见[远程页面接入 · 页面卸载清理清单](remote-pages.md#页面卸载清理清单)）。

## 嵌套

- 同页多实例：同 spec 多处挂载合法，按容器分键互不干扰；不同 spec 的多个桥接实例并存同样合法；
- 多层嵌套（A→B→C）：每层各自是一对「宿主工厂 + 子应用契约」；**桥接路由不做多级自动代理**——C 的 URL 同步由 B 自己作为宿主配置，见[URL 同步 · 不承诺范围](url-sync.md#不承诺范围)；
- 可运行示例：模板 [vue-host-react-remote](https://github.com/chenmingye/fulgurjs-federation/tree/master/examples/templates/vue-host-react-remote) / [react-host-vue-remote](https://github.com/chenmingye/fulgurjs-federation/tree/master/examples/templates/react-host-vue-remote) / [showcase](https://github.com/chenmingye/fulgurjs-federation/tree/master/examples/templates/showcase)（双向 + URL 同步 + 多远程并存）。

## 错误速查

| 错误码 | 触发 | 处理 |
|---|---|---|
| `MFU-015` | `./bridge` 默认导出缺 `mount`/`unmount` 或非函数 | 改用 `defineBridgeApp` 构造契约对象 |
| `MFU-016` | 桥接准备/挂载/卸载失败（`details.phase` 区分 getContext/mount/unmount；根因含子应用原始错误） | 按 phase 排查子应用初始化代码；unmount 抛错的容器被持久封锁，整页刷新恢复 |
| `MFU-017` | 会话参数与 AppContext 不一致（受控 sessionKey 与全局会话矛盾、非法值、页面级单会话冲突） | 统一同页受控会话；非法值改为合法字符串/null/省略 |
| `MFU-013` | 远程声明 onSession 但宿主缺 sessionKey | 宿主登录流程 provide 非敏感登录代次 ID（禁止用 token） |
| `MFU-010` | 选中的单例版本不满足某消费方要求 | 对齐版本/准确配置 requiredVersion；必须拒绝则 strictVersion:true；多 React 大版本分 scope |
