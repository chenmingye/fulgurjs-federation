import { defineApplication } from '@fulgurjs/federation/react'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import Layout from './Layout'
import HomePage from './pages/HomePage'
import AboutPage from './pages/AboutPage'
import BridgeVuePage from './pages/BridgeVuePage'
import { initBridgeRouting } from './routing'
import { installPopStateLogger } from './demo-log'

export default defineApplication((_props, { signal }) => {
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
  ], { basename: import.meta.env.BASE_URL })

  initBridgeRouting(router)
  installPopStateLogger(signal)

  return { element: <RouterProvider router={router} />, dispose: () => router.dispose() }
})
