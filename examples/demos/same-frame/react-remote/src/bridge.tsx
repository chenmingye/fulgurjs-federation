/**
 * 同框架 React 子应用桥接契约（expose './bridge' 的默认导出，README §8.2）。
 *
 * createMemoryRouter 自包含 memory 路由（不与宿主 URL 同步）；RouterProvider 渲染。
 * appProps 经 BridgePropsContext 下发（RouterProvider 隔断了 props 直传，页面 useContext 读取）。
 * 每次挂载都新建 router 实例：不复用、不注册任何全局单例（控制台纪律）。
 * createRoot/首次提交探测/unmount 由 defineBridgeApp 契约负责（react-dom/client 实际 mount 时按需加载）。
 */
import { createContext, useContext } from 'react'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { defineBridgeApp } from '@fulgurjs/federation/react'
import { childRoutes } from './routes'
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

export default defineBridgeApp((props) => {
  const router = createMemoryRouter(childRoutes, { initialEntries: ['/tickets'] })
  return (
    <BridgePropsContext.Provider value={props as BridgeChildProps}>
      <RouterProvider router={router} />
    </BridgePropsContext.Provider>
  )
})
