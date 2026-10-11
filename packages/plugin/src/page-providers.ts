/**
 * pageProviders（祖先 Provider）的框架无关解析（Vue/React 适配器共用）。
 *
 * 提供方 setup 声明 pageProviders（组件数组，每项=组件对象或零参 loader）后，运行时经
 * consumerApp 协议把声明数组原样交付消费方适配器；本模块负责逐项解析为零参 loader 已
 * await 的组件值。与 globalComponents 的零参判定同口径：length === 0 的函数 = loader，
 * 其余函数 = 函数式组件，对象 = 选项组件（Vue）/ memo·forwardRef 等（React）。
 *
 * 组件的「包裹渲染」是框架行为，分别在 vue-adapter / react-adapter 内实现。
 */

/** 解析结果缓存：按声明数组引用（setup 生命周期持有的同一数组）——setup 失败重跑换新数组，缓存自然失效 */
const resolvedCache = new WeakMap<unknown[], Promise<unknown[]>>()

export function resolvePageProviderEntries(list: unknown[] | undefined): Promise<unknown[] | undefined> {
  if (!list || list.length === 0) return Promise.resolve(undefined)
  let cached = resolvedCache.get(list)
  if (!cached) {
    cached = Promise.all(list.map(async (entry, index) => {
      // 项校验在解析层完成（与 globalComponents 值透传的分工同口径）：
      // 零参函数 = loader（await 取组件），其余函数 = 函数式组件，对象 = 选项/memo 组件
      if (typeof entry === 'function' && entry.length === 0) {
        const mod = await (entry as () => Promise<any>)()
        const comp = mod?.default ?? mod
        if (!comp || (typeof comp !== 'object' && typeof comp !== 'function')) {
          throw new Error(
            `[fulgurjs] pageProviders 第 ${index + 1} 项的 loader 返回值不是组件（当前 ${comp === null ? 'null' : typeof comp}）；` +
            'loader 应返回组件，或以组件为 default 导出的模块。',
          )
        }
        return comp
      }
      if (entry === null || (typeof entry !== 'object' && typeof entry !== 'function')) {
        throw new Error(
          `[fulgurjs] pageProviders 第 ${index + 1} 项类型为 ${entry === null ? 'null' : typeof entry}，应为组件对象、函数式组件或零参 loader。`,
        )
      }
      return entry
    }))
    resolvedCache.set(list, cached)
  }
  return cached
}
