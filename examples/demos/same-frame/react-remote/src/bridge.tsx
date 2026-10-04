/**
 * 同框架 React 子应用桥接契约（expose './bridge' 的默认导出，README §8.2）。
 *
 * createMemoryRouter 自包含 memory 路由（不与宿主 URL 同步）；RouterProvider 渲染。
 * appProps 经 BridgePropsContext 下发（RouterProvider 隔断了 props 直传，页面 useContext 读取）。
 * 每次挂载都新建 router 实例：不复用、不注册任何全局单例（控制台纪律）。
 * createRoot/首次提交探测/unmount 由 defineBridgeApp 契约负责（react-dom/client 实际 mount 时按需加载）。
 */
import { createContext, useContext } from 'react'
import { Navigate, RouterProvider, createMemoryRouter, type RouteObject } from 'react-router-dom'
import { defineBridgeApp } from '@fulgurjs/federation/react'
import ChildLayout from './ChildLayout'
import TicketList from './pages/TicketList'
import TicketDetail from './pages/TicketDetail'
import TicketEdit from './pages/TicketEdit'
import './demo.css'

/** appProps：宿主传入的业务 props（label + 稳定回调 onReady/onGone，供宿主诊断计数）；
 * 索引签名用于承接宿主快照的 Record<string, unknown> 形状 */
export interface BridgeChildProps {
  label?: string
  onReady?: () => void
  onGone?: () => void
  [key: string]: unknown
}

const BridgePropsContext = createContext<BridgeChildProps>({})

/** 子应用页面读取宿主 appProps 的唯一入口 */
export function useBridgeProps(): BridgeChildProps {
  return useContext(BridgePropsContext)
}

/** 子应用内部路由表（memory router 由各工厂调用创建，路由表共用） */
export const childRoutes: RouteObject[] = [
  {
    path: '/',
    element: <ChildLayout />,
    children: [
      { index: true, element: <Navigate to="/tickets" replace /> },
      { path: 'tickets', element: <TicketList /> },
      { path: 'tickets/:id', element: <TicketDetail /> },
      { path: 'tickets/:id/edit', element: <TicketEdit /> },
      { path: '*', element: <Navigate to="/tickets" replace /> },
    ],
  },
]

export default defineBridgeApp((props) => {
  const router = createMemoryRouter(childRoutes, { initialEntries: ['/tickets'] })
  return (
    <BridgePropsContext.Provider value={props as BridgeChildProps}>
      <RouterProvider router={router} />
    </BridgePropsContext.Provider>
  )
})
