/** Explicit ownership for Pinia-like store definitions; no Pinia dependency or global switching. */
// Variadic arguments are only the generic constraint: the public result remains the exact T.
// A never[] contextual signature erases inline defineStore inference in consumer projects.
export function bindStoreToApp<T extends (...args: any[]) => any>(
  useStore: T,
  pinia: NoInfer<Parameters<T>[0]> | (() => NoInfer<Parameters<T>[0]>),
): T {
  return new Proxy(useStore, {
    apply(target, receiver, args) {
      if (args[0] == null) {
        args[0] = typeof pinia === 'function' ? (pinia as () => Parameters<T>[0])() : pinia
        if (args[0] == null) throw new Error('本应用的 Pinia 尚未创建。先在应用装配中创建/安装 Pinia，再调用绑定的 store。')
      }
      // Proxy preserves $id, HMR properties and the original call/return types.
      return Reflect.apply(target, receiver, args)
    },
  })
}
