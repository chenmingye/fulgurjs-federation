/**
 * 子应用内部路由表（memory router 由各工厂调用创建，路由表共用）。
 * 独立抽出的原因：main.tsx（独立运行壳）与 bridge.tsx（桥接契约）都要用这份表；
 * 若从 bridge.tsx 导入，prod 构建会把 expose 实现并进独立壳的 entry chunk，
 * 宿主加载桥接时连带执行 main.tsx 的顶层副作用（createBrowserRouter + render）。
 */
import { Navigate, type RouteObject } from 'react-router-dom'
import ChildLayout from './ChildLayout'
import TicketList from './pages/TicketList'
import TicketDetail from './pages/TicketDetail'
import TicketEdit from './pages/TicketEdit'

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
