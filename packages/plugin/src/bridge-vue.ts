/**
 * Vue 宿主桥接推荐入口（/bridge/vue）：只携带 Vue 宿主适配器，零 React
 * （dev 原生 ESM 与生产摇树均不提前执行 React 宿主适配器；BR01/BR12）。
 * dist/bridge-vue.js 由 scripts/gen-runtime-entry.mjs 生成为本文件的再导出壳。
 */
import { loadRemote } from './runtime/index'
import { createVueBridgeAppWithLoader } from './bridge-host-vue'

export type { BridgeApp } from './bridge-core'
export type { VueBridgeAppOptions } from './bridge-host-vue'
export type { AppContext } from './context'

/** Vue 宿主桥接工厂：返回 `{ appProps: P; sessionKey?: string | null }` 形态的包装组件 */
export const createVueBridgeApp = createVueBridgeAppWithLoader(loadRemote)
