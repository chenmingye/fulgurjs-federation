import { createRoot } from 'react-dom/client'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { Dashboard, NotFound, OrderDetail, Orders, Settings } from './pages'
import { Shell, ShellPropsContext } from './Shell'

// 独立运行入口：单独开发/调试 React-C 自身时使用（本地 memory 路由直开预览）。
// 被桥接宿主消费时走 fulgurjs-remoteEntry.js 容器入口与 ./bridge 契约，与本文件无关。
const router = createMemoryRouter(
  [
    { path: '/', element: <Orders /> },
    { path: '/orders', element: <Shell><Orders /></Shell> },
    { path: '/orders/:id', element: <Shell><OrderDetail /></Shell> },
    { path: '/settings', element: <Shell><Settings /></Shell> },
    { path: '/dashboard', element: <Shell><Dashboard /></Shell> },
    { path: '*', element: <Shell><NotFound /></Shell> },
  ],
  { initialEntries: ['/orders'] },
)

createRoot(document.getElementById('root')!).render(
  <ShellPropsContext.Provider value={{ host: '独立预览' }}>
    <RouterProvider router={router} />
  </ShellPropsContext.Provider>,
)
