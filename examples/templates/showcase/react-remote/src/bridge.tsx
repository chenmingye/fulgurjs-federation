/**
 * examples/templates/showcase/react-remote/src/bridge.tsx — React 子应用桥接契约（exposes './bridge'）。
 * defineBridgeApp(factory, { routing: true }) 声明路由协议（缺失时宿主启用同步即 MFU-031 占位）。
 * 受控路由 = createReactBridgeRouter（memory data router）：工厂返回 RouterProvider 元素；
 * 宿主未提供路由通道时由插件统一抛 MFU-034（工厂无需手写守卫）；根路径 / 经 loader
 * redirect 规范化到 /orders，由插件以 replace 同步宿主（无新增历史条目）。
 */
import { redirect } from 'react-router-dom'
import { defineBridgeApp, createReactBridgeRouter, hasBridgeMount } from '@fulgurjs/federation/react'
import ChildLayout from './ChildLayout'
import OrderList from './pages/OrderList'
import OrderDetail from './pages/OrderDetail'
import Settings from './pages/Settings'
import Locked from './pages/Locked'
import { bindReporter, reportNav } from './child-bus'

/** 初始位置读取用的最小 data router 结构面（避免耦合 react-router 内部类型路径） */
interface MemoryRouterProbe {
  state: { location: { pathname: string; search: string; hash: string } }
}

const routes = [
  { path: '/', loader: () => redirect('/orders') },
  {
    element: <ChildLayout />,
    children: [
      { path: '/orders', element: <OrderList /> },
      { path: '/orders/:id', element: <OrderDetail /> },
      { path: '/settings', element: <Settings /> },
      { path: '/locked', element: <Locked /> },
    ],
  },
]

export default defineBridgeApp((props, ctx) => {
  bindReporter(props)
  const init = ctx!.routing!.getLocation()
  // 工厂上下文只属于当前实例；通过 props 传给布局，不写页面全局模式。
  const instanceRoutes = routes.map(route => route.element
    ? { ...route, element: <ChildLayout bridged={hasBridgeMount(ctx)} /> }
    : route)
  const conn = createReactBridgeRouter(ctx!.routing!, instanceRoutes, { signal: ctx!.signal })
  // 冷加载（模块级预热未落定的慢路径）时 element 是 LazyRouterProviderHost 包装、无 router
  // prop——同步读 props.router 会静默跳过初始位置上报。routerReady 是就绪合同：fast 路径
  // 同步已 resolve、slow 路径在惰性接线完成时 resolve，两条路径行为一致。
  void conn.routerReady.then((router) => reportInitRedirect(router, init.pathname + init.search + init.hash))
  return conn.element
}, { routing: true })

/** 初始位置上报：createMemoryRouter 同步初始化，'/' 的 loader 重定向在微任务内落定，
 * 下一个宏任务读取即为最终初始位置（订阅式一次性上报会在首个用户导航时才误触发）。 */
function reportInitRedirect(router: MemoryRouterProbe, initPath: string): void {
  setTimeout(() => {
    const current = router.state.location.pathname + router.state.location.search + router.state.location.hash
    reportNav(
      '子应用初始化',
      'init',
      current !== initPath
        ? `根路径规范化 replace → ${current}（无新增历史条目）`
        : `初始位置 → ${current}（与宿主深链一致）`,
    )
  }, 0)
}
