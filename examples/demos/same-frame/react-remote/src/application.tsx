import { RouterProvider, createMemoryRouter, createBrowserRouter } from 'react-router-dom'
import { defineApplication } from '@fulgurjs/federation/react'
import { childRoutes } from './routes'
import { BridgePropsContext, type BridgeChildProps } from './bridge-props'
import './demo.css'

// 每次调用创建自己的 router；dispose 与渲染根卸载都由统一入口管理。
export default defineApplication<BridgeChildProps>((props, { mode }) => {
  const router = mode === 'bridge'
    ? createMemoryRouter(childRoutes, { initialEntries: ['/tickets'] })
    : createBrowserRouter(childRoutes, { basename: import.meta.env.BASE_URL })
  return {
    element: <BridgePropsContext.Provider value={props}><RouterProvider router={router} /></BridgePropsContext.Provider>,
    dispose: () => router.dispose(),
  }
})
