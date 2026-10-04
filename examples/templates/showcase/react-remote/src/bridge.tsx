/**
 * examples/templates/showcase/react-remote/src/bridge.tsx — React 子应用桥接契约（exposes './bridge'）。
 * defineBridgeApp(factory, { routing: true }) 声明路由协议（缺失时宿主启用同步即 MFU-031 占位）。
 * 受控路由 = createReactBridgeRouter（memory data router）：工厂返回 RouterProvider 元素；
 * 根路径 / 经 loader redirect 规范化到 /orders，由插件以 replace 同步宿主（无新增历史条目）。
 */
import type { ReactElement } from 'react'
import { redirect } from 'react-router-dom'
import { defineBridgeApp } from '@fulgurjs/federation/react'
import { createReactBridgeRouter } from '@fulgurjs/federation/bridge/router/react'
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
  if (!ctx?.routing) {
    throw new Error('本契约需要宿主启用 URL 同步（mount 第三参数 routing）')
  }
  bindReporter(props)
  const init = ctx.routing.getLocation()
  const conn = createReactBridgeRouter(ctx.routing, routes, { signal: ctx.signal })
  reportInitRedirect(conn.element as ReactElement<{ router?: MemoryRouterProbe }>, init.pathname + init.search + init.hash)
  return conn.element
}, { routing: true })

/** 初始位置上报：createMemoryRouter 同步初始化，'/' 的 loader 重定向在微任务内落定，
 * 下一个宏任务读取即为最终初始位置（订阅式一次性上报会在首个用户导航时才误触发）。 */
function reportInitRedirect(element: ReactElement<{ router?: MemoryRouterProbe }>, initPath: string): void {
  const router = element.props.router
  if (!router) return
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
