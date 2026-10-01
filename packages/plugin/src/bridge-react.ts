/**
 * React 宿主桥接推荐入口（/bridge/react）：只携带 React 宿主适配器，零 Vue
 * （dev 原生 ESM 与生产摇树均不提前执行 Vue 宿主适配器；BR01/BR12）。
 * dist/bridge-react.js 由 scripts/gen-runtime-entry.mjs 生成为本文件的再导出壳。
 */
import { loadRemote } from './runtime/index'
import { createReactBridgeAppWithLoader } from './bridge-host-react'

export type { BridgeApp } from './bridge-core'
export type { ReactBridgeAppOptions, BridgeErrorFallback } from './bridge-host-react'
export type { AppContext } from './context'

/** React 宿主桥接工厂：返回 `ComponentType<{ appProps: P; sessionKey?: string | null }>` */
export const createReactBridgeApp = createReactBridgeAppWithLoader(loadRemote)
