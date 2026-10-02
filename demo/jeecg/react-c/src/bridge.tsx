/**
 * React-C 桥接契约（./bridge expose 的默认导出）。
 *
 * 受控 memory data router = createReactBridgeRouter（/bridge/router/react，5.4.0）：
 * - 导航全部经 Link/useNavigate 真实入口进入同步协议；
 * - 子应用自身不写浏览器历史（宿主是唯一写入方）；
 * - 根路径以 replace 规范化重定向到 /orders（不凭空制造历史条目）。
 * 独立开发（npm run dev 直开）时走 main.tsx 的本地 memory router，与本文件无关。
 */
import { createElement } from 'react'
import { Navigate } from 'react-router-dom'
import type { RouteObject } from 'react-router-dom'
import { defineBridgeApp } from '@fulgurjs/federation/react'
import { createReactBridgeRouter } from '@fulgurjs/federation/bridge/router/react'
import { Dashboard, NotFound, OrderDetail, Orders, Settings, type ShellProps } from './pages'
import { Shell, ShellPropsContext } from './Shell'

export default defineBridgeApp((props, ctx) => {
  if (!ctx?.routing) {
    throw new Error('react-c 桥接契约需要宿主 routing 通道（未启用 URL 同步请改用独立入口）')
  }
  const shellProps = (props ?? {}) as ShellProps
  const withShell = (node: React.ReactNode) =>
    createElement(ShellPropsContext.Provider, { value: shellProps }, createElement(Shell, null, node))
  const routes: RouteObject[] = [
    { path: '/', element: <Navigate to="/orders" replace /> },
    { path: '/orders', element: withShell(<Orders />) },
    { path: '/orders/:id', element: withShell(<OrderDetail />) },
    { path: '/settings', element: withShell(<Settings />) },
    { path: '/dashboard', element: withShell(<Dashboard />) },
    { path: '*', element: withShell(<NotFound />) },
  ]
  const conn = createReactBridgeRouter(ctx.routing, routes, { signal: ctx.signal })
  ;(globalThis as any).__RC_ROUTER__ = (conn.element as any).props.router
  ;(props as { onReady?: () => void } | undefined)?.onReady?.()
  return conn.element
}, { routing: true })
