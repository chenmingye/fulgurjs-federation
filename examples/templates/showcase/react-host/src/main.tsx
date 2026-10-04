/**
 * examples/templates/showcase/react-host/src/main.tsx — 宿主入口。
 * data router（createBrowserRouter + RouterProvider）是 URL 同步的前提（declarative 模式无取消语义）；
 * catch-all 路由（/br-vue/* 单条记录渲染同一组件）保证子应用内部导航不重挂宿主组件。
 * 注意：刻意不包 StrictMode——桥接契约工厂在每次 mount 时执行，StrictMode 的双 effect
 * 会让子应用挂载计数翻倍，干扰「mount 次数恒为 1」演示（生产语义不受影响）。
 */
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import Layout from './Layout'
import HomePage from './pages/HomePage'
import AboutPage from './pages/AboutPage'
import BridgeVuePage from './pages/BridgeVuePage'
import { initBridgeRouting } from './routing'
import { installPopStateLogger } from './demo-log'

const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'about', element: <AboutPage /> },
      // catch-all：子应用挂载在 /br-vue 前缀下，内部导航全部命中同一条路由记录
      { path: 'br-vue/*', element: <BridgeVuePage /> },
    ],
  },
])

initBridgeRouting(router)
installPopStateLogger()

createRoot(document.getElementById('root')!).render(<RouterProvider router={router} />)
