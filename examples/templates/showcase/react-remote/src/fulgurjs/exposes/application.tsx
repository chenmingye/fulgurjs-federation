/** 应用装配入口：main 只调用 start；独立与嵌入复用本工厂，每次挂载的实例和清理由插件管理。 */
// 独立与桥接使用同一套真实业务路由；每次工厂创建自己的 router。
import { createBrowserRouter, RouterProvider, redirect } from 'react-router-dom'
import { defineApplication, createReactBridgeRouter, hasBridgeMount } from '@fulgurjs/federation/react'
import ChildLayout from '../../ChildLayout'
import OrderList from '../../pages/OrderList'
import OrderDetail from '../../pages/OrderDetail'
import Settings from '../../pages/Settings'
import Locked from '../../pages/Locked'
import { createChildReporter, ChildReporterContext, type ChildProps, type ChildReporter } from '../../child-bus'

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

export default defineApplication<ChildProps>((props, ctx) => {
  const reporter = createChildReporter(props, ctx.signal)
  const init = ctx.routing?.getLocation()
  // 工厂上下文只属于当前实例；通过 props 传给布局，不写页面全局模式。
  const instanceRoutes = routes.map(route => route.element
    ? { ...route, element: <ChildLayout bridged={hasBridgeMount(ctx)} /> }
    : route)
  if (ctx.mode === 'standalone') {
    const router = createBrowserRouter(instanceRoutes, { basename: import.meta.env.BASE_URL })
    return { element: <ChildReporterContext.Provider value={reporter}><RouterProvider router={router} /></ChildReporterContext.Provider>, dispose: () => router.dispose() }
  }
  const conn = createReactBridgeRouter(ctx.routing!, instanceRoutes, { signal: ctx.signal })
  // 迟到的就绪回调不得向已卸载实例上报；拒绝由实际挂载链处理。
  void conn.routerReady.then(router => {
    if (!ctx.signal.aborted && init) reportInitRedirect(router, init.pathname + init.search + init.hash, ctx.signal, reporter)
  }, () => {})
  return { element: <ChildReporterContext.Provider value={reporter}>{conn.element}</ChildReporterContext.Provider>, dispose: conn.dispose }

}, { routing: true })

/** 初始位置上报：createMemoryRouter 同步初始化，'/' 的 loader 重定向在微任务内落定，
 * 下一个宏任务读取即为最终初始位置（订阅式一次性上报会在首个用户导航时才误触发）。 */
function reportInitRedirect(router: MemoryRouterProbe, initPath: string, signal: AbortSignal, reporter: ChildReporter): void {
  setTimeout(() => {
    if (signal.aborted) return
    const current = router.state.location.pathname + router.state.location.search + router.state.location.hash
    reporter.reportNav(
      '子应用初始化',
      'init',
      current !== initPath
        ? `根路径规范化 replace → ${current}（无新增历史条目）`
        : `初始位置 → ${current}（与宿主深链一致）`,
    )
  }, 0)
}
