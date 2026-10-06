# URL 同步：子应用路由 ↔ 宿主浏览器地址

> 桥接默认 **memory 路由**：子应用内部跳转不改浏览器地址、刷新不能恢复子应用内部页面。URL 同步让**宿主 URL 表达子应用内部位置**——刷新直达、收藏分享、前进后退、宿主菜单跳转全部一致。显式开启，**默认关闭**（不开同步时子应用内部跳转不影响宿主地址，这是正常行为）。
>
> 6.0.0 入口：`createVueBridgeNavigation`/`connectVueBridgeRouter`/`createReactBridgeNavigation`/`createReactBridgeRouter` 全部从 `@fulgurjs/federation/vue` 或 `@fulgurjs/federation/react` 导入。旧 `/bridge/router/vue`、`/bridge/router/react` 已删除。路由库是可选 peer：`/vue` 不要求安装 vue-router，`/react` 不要求安装 react-router-dom——只在真正调用路由同步 API 时才需要对应库（React 端缺依赖时报清晰错误）。

## 效果

```text
宿主地址 /approval/list        → 子应用 /list
宿主地址 /approval/detail/42   → 子应用 /detail/42
刷新 /approval/detail/42       → 子应用直达详情页（深链）
浏览器前进/后退                 → 子应用位置跟随
宿主守卫拒绝                    → URL/历史/子应用位置全部不变
```

## 架构约定

- 宿主 Router 是浏览器历史的**唯一写入方**；子应用使用受控 memory 路由；
- 两端经独立路由通道传递位置（不进 appProps、不进 AppContext）；
- 同实例内 path/search/hash 变化**不重挂 root、不重建 store、不重新加载远程**；
- 子应用内部路由库照常自装（vue-router/react-router-dom），与联邦的 shared 协商互不干扰。

## ① 宿主端（Vue Router 4，history/hash 模式皆可）

**第一步：宿主路由声明后缀匹配**（缺它详情导航会卸载子应用）：

```ts
// main.ts
import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL), // hash 模式用 createWebHashHistory
  routes: [
    { path: '/', component: Home },
    // 接住 /approval 下所有子路径，交桥接页渲染
    { path: '/approval/:pathMatch(.*)*', component: ApprovalBridgePage },
  ],
})

// 真实权限守卫：拒绝 → 通道收到 cancelled，URL/历史/子应用位置全部不变
router.beforeEach((to) => (to.path.startsWith('/approval/secret') ? false : undefined))
```

**第二步：桥接页创建导航端口并传给桥接组件**：

```vue
<!-- ApprovalBridgePage.vue：routing prop = 独立控制通道 -->
<script setup lang="ts">
import { createVueBridgeApp, createVueBridgeNavigation, type BridgeHostRouting } from '@fulgurjs/federation/vue'

const navigation = createVueBridgeNavigation(router) // Vue Router fullPath 已是逻辑路径，无需传部署 base
const routing: BridgeHostRouting = { basePath: '/approval', navigation }
const RemoteApp = createVueBridgeApp('react-remote/bridge', { /* 工厂选项同桥接篇 */ })
</script>

<template>
  <RemoteApp :session-key="sess" :routing="routing" :app-props="props" />
</template>
```

## ② 宿主端（React Router，仅 data router 模式）

`createReactBridgeNavigation(router, { basename, canNavigate })` 只支持 **data router**（`createBrowserRouter` / `createHashRouter` + `RouterProvider`）；declarative 模式（`BrowserRouter`）无取消语义，不支持。React Router 要求 ≥ 6.11（`createMemoryRouter`）。

```tsx
// main.tsx
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { ApprovalBridgePage } from './ApprovalBridgePage'

const router = createBrowserRouter([
  { path: '/', element: <Home /> },
  { path: '/approval/*', element: <ApprovalBridgePage /> },
])

export function App() {
  return <RouterProvider router={router} />
}
```

```tsx
// ApprovalBridgePage.tsx
import { useNavigate } from 'react-router-dom'
import { createReactBridgeApp, createReactBridgeNavigation } from '@fulgurjs/federation/react'

export function ApprovalBridgePage() {
  const navigate = useNavigate()
  const navigation = createReactBridgeNavigation(navigate, { basename: '/' })
  const routing = { basePath: '/approval', navigation }
  const RemoteApp = createReactBridgeApp('vue-remote/bridge', { /* 工厂选项同桥接篇 */ })
  return <RemoteApp sessionKey={sess} routing={routing} appProps={props} />
}
```

`canNavigate` 可选，仅作提前拒绝；端口观察真实 blocker 状态——等待 `reset()` 返回 cancelled、`proceed()` 后实际位置提交返回 committed，**不能只凭 navigate 的 Promise 落定判成功**。

## ③ 子应用端（声明协议 + 接线受控路由）

**Vue 子应用**：`defineBridgeApp(工厂, { routing: true })`——工厂第二参数拿到 `{ signal, routing }`：

```ts
// src/bridge.ts（Vue 子应用）
import { createApp, h } from 'vue'
import { createRouter, createMemoryHistory, RouterView } from 'vue-router'
import { defineBridgeApp, connectVueBridgeRouter } from '@fulgurjs/federation/vue'

export default defineBridgeApp(async (props, ctx) => {
  if (!ctx?.routing) throw new Error('本契约需要宿主启用 URL 同步')
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/list', component: List },
      { path: '/detail/:id', component: Detail },
    ],
  })
  // 初始 push 落定后再 install（顺序不能反）
  await connectVueBridgeRouter(ctx.routing!, router, { signal: ctx.signal }).ready
  const app = createApp({ setup: () => () => h(RouterView) }, props)
  app.use(router)
  return app
}, { routing: true })
```

**React 子应用**：`createReactBridgeRouter` 返回 `{ element, dispose(), routerReady }`，`element` 是直接可用的 `RouterProvider` 元素：

```tsx
// src/bridge.tsx（React 子应用）
import { createReactBridgeRouter } from '@fulgurjs/federation/react'
import { defineBridgeApp } from '@fulgurjs/federation/react'

export default defineBridgeApp((_props, ctx) => {
  if (!ctx?.routing) throw new Error('本契约需要宿主启用 URL 同步')
  return createReactBridgeRouter(ctx.routing, [
    { path: '/list', element: <List /> },
    { path: '/detail/:id', element: <Detail /> },
  ], { signal: ctx.signal }).element
}, { routing: true })
```

`routerReady: Promise<Router>` 是已接线 memory router 的就绪合同：fast 路径（模块级预热已就绪，绝大多数情况）返回**同步已 resolve** 的 Promise，值与 `element.props.router` 等价；slow 路径（预热未落定的罕见竞态）在惰性宿主首次渲染接线完成时 resolve；缺 react-router-dom 时以清晰错误 reject。宿主/测试需要内省 router 实例（如断言当前 location）时 `await routerReady`，不要假设 `element.props.router` 同步存在。卸载（`dispose()`/`signal` abort）后迟到的 router 操作不再写导航状态。

两端接线的第三参数 `{ signal?: AbortSignal }` 默认为空；推荐传 `ctx.signal` 自动 dispose，未传时由子应用显式调用连接的 `dispose()`。

## 行为契约与边界

### basePath

- 宿主路由视角的**静态绝对路径**；拒绝空/根/带 query·hash·通配符（`MFU-030`）；
- 按路径段匹配：`/approval` 命中 `/approval/detail/1`，不命中 `/approval-old`；
- 同页各同步实例前缀不得相同或重叠；
- `/approval` 对应子应用 `/`；根重定向由子应用路由定义、以 replace 规范化（不凭空多一条历史）。

### Vite base 与路由分层（子目录部署）

部署在 `/erp/` 时：Vite base 与宿主 Router base 是 `/erp/`，bridge `basePath` 仍是 `/approval`（Vue Router 已自动剥离 history base；React 端口传 `basename`）。适配器输出的逻辑路径不含部署前缀，不会拼出 `/erp/erp/...`。

### 子应用逻辑路径不得包含 basePath

子应用只使用自身逻辑路径（`/approval` 对应子应用 `/`）。若子应用把宿主整段地址当成自身路径导航（如 `router.push('/approval/list')`），宿主 URL 会叠加成 `/approval/approval/list`，且此后子/宿两侧自洽地保持错误前缀。这类目标会在**第一次宿主写入之前**被拒绝（`MFU-032`，错误信息附去掉前缀后应使用的目标），宿主历史零污染；子应用停留在上一确认位置。地址栏手工粘贴的 `/approval/approval/list` 仍以宿主为准广播（子应用收到 `/approval/list`），不会回弹。

### 位置三段全等

search/hash **原样保留**：重复 query 键、编码、中文、片段不二次 decode/encode；仅参数变化也同步，且不重挂。

### 取消语义

- Vue Router 4：push/replace 落定 `NavigationFailure` 即真实取消；
- React Router data router：等待真实 blocker 的取消/放行；`canNavigate` 仅为可选提前拒绝；
- 取消后 URL、历史、子应用位置保持最后确认状态，**绝不自动重试**（`router.push` 的函数返回不冒充提交成功）；
- 守卫/加载器/端口执行异常拒绝 Promise（`MFU-033`，保留 cause），不会伪装 cancelled。

### 导航与错误

- 子应用 push/replace 保留原动作；go/back/forward 委托宿主历史；
- 连续请求串行落定；外部导航作废旧的在飞与排队请求；
- 自定义 `BridgeHostNavigation.navigate(target, action, { signal })` 应在异步提交前复核可选 signal，已 aborted 时禁止迟到写入。

### 会话与生命周期

- 换账号/登出（`sessionKey→null`）作废旧通道——旧通道的导航一律 cancelled、不写 URL、不复活子应用；
- unmount 后迟到通知失效（通道销毁，再订阅得 `MFU-031`）；
- KeepAlive 缓存离页的实例暂停路由写入（不抢占 URL、不销毁通道，激活重同步）；
- 同一容器 unmount 抛错的持久封锁不因路由绕过。

### 协议校验与错误码

| 错误码 | 触发 | 表现 |
|---|---|---|
| `MFU-030` | basePath 非法（空/根/带 query·hash·通配）或同页重叠前缀 | 配置期拒绝 |
| `MFU-031` | 子应用未声明 `{ routing: true }` 却被宿主要求同步；或通道销毁后复用 | 占位报错，**不静默退回 memory 假装深链成功** |
| `MFU-032` | 子应用导航目标越界自身前缀（`../`、跨前缀）、目标已含 basePath（重复前缀）、非法 `go` 参数、失效通道的请求 | 拒绝该次导航（宿主历史零污染） |
| `MFU-033` | 路由准备/同步失败（重定向超限或导航异常，附目标链/cause） | 显式报错，不静默回退 |

连续内部 replace 超过 5 次（重定向环）按 `MFU-033` 报告（附目标链，不静默回入口）。

### 按需加载与体积

- `/vue`、`/react` 默认入口不引入任何路由库；路由同步 API 对 vue-router/react-router-dom 仅类型导入 + 模块级按需预热——未用路由同步的纯组件工程零路由库依赖；
- React 端缺 react-router-dom 时，仅在实际调用 `createReactBridgeRouter` 时报清晰错误。

## 不承诺范围

SSR/RSC、跨浏览器窗口、嵌套多级桥接子应用的路由自动代理、TanStack Router 及其他路由库的内置适配（可经 `BridgeHostNavigation`/`BridgeChildRoute` 端口自定义扩展）。

## 完整可运行示例

[showcase 模板](https://github.com/chenmingye/fulgurjs-federation/tree/master/examples/templates/showcase)：Vue/React 双宿主 × 双远程，深链刷新、前进后退、守卫取消、中文/编码参数、部署 base（子目录 + hash 模式内层片段见仓库 `fixtures/host-bridge-*/` 可运行参考实现）。
