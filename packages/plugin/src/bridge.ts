/**
 * 桥接聚合入口（/bridge）：createVueBridgeApp + createReactBridgeApp（任务书 §3.4 D2）。
 *
 * dist/bridge.js 由 scripts/gen-runtime-entry.mjs 生成为再导出壳（聚合两个宿主适配器）。
 * 注意加载代价：dev 原生 ESM 下本入口会同时执行 Vue 与 React 两个宿主适配器——
 * 按宿主框架分离的推荐入口是 /bridge/vue 与 /bridge/react（零对向适配器，BR01/BR12）；
 * 生产构建可经摇树剥离未用适配器，但推荐用法仍以分离入口为准。
 */
import { loadRemote } from './runtime/index'
import { createVueBridgeAppWithLoader } from './bridge-host-vue'
import { createReactBridgeAppWithLoader } from './bridge-host-react'

export type { BridgeApp } from './bridge-core'
export type { VueBridgeAppOptions } from './bridge-host-vue'
export type { ReactBridgeAppOptions, BridgeErrorFallback } from './bridge-host-react'
export type { AppContext } from './context'

/** Vue 宿主桥接工厂：返回 `{ appProps: P; sessionKey?: string | null }` 形态的包装组件 */
export const createVueBridgeApp = createVueBridgeAppWithLoader(loadRemote)
/** React 宿主桥接工厂：返回 `ComponentType<{ appProps: P; sessionKey?: string | null }>` */
export const createReactBridgeApp = createReactBridgeAppWithLoader(loadRemote)
