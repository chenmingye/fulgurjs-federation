import { createRoot } from 'react-dom/client'
import { RouterProvider, createBrowserRouter } from 'react-router-dom'
import { childRoutes } from './routes'
import './demo.css'

// 独立运行入口：单独开发/调试子应用自身（web router 便于直接浏览）。
// 被桥接宿主消费时走 ./bridge 契约（createMemoryRouter），与本文件无关。
const router = createBrowserRouter(childRoutes)
createRoot(document.getElementById('root')!).render(<RouterProvider router={router} />)
