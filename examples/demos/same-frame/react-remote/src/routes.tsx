/** 普通业务路由表；application 工厂按运行模式创建自己的 router。 */
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
