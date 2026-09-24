/**
 * Vue 生态层：remoteComponent() 远程组件直渲染。
 *
 * 定位：runtime.js 保持框架无关（不 import vue，gzip 红线守卫），
 * Vue 封装按需引入——独立文件、零 runtime 体积增量。
 *
 * 语义（用法与选项见 README §8）：
 * - 内部 = defineAsyncComponent({ loader: () => loadRemote(spec, opts).then(m => m.default ?? m) })；
 * - H3 零兜底：加载失败显式进错误态（fulgurjs:error 事件由 runtime 层照常发出），
 *   不传 errorComponent 时渲染内置默认错误占位（文案含错误码+根因+修法，显式非静默）；
 * - 模块去重沿用 loadRemote 内部 Promise 缓存（同 spec 不重复加载）；
 * - 返回标准 Vue 异步组件，props（如 form-params）在使用处透传，不改分发机制。
 */
import { loadRemote } from './runtime/index'
import { createRemoteComponent } from './vue-adapter'

export type { RemoteComponentOptions } from './vue-adapter'
export const remoteComponent = createRemoteComponent(loadRemote)
