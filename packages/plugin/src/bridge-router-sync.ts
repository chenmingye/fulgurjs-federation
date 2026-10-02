/** 子路由的串行仲裁；外部宿主位置使旧的本地请求失效。 */
import { sameLocation, type BridgeChildRoute, type BridgeLocation, type BridgeNavigationResult } from './bridge-router-core'
import { routingSyncError } from './bridge-errors'

export function connectChildNavigation(
  routing: BridgeChildRoute,
  apply: (location: BridgeLocation) => Promise<unknown>,
  onError: (error: unknown) => void,
) {
  let disposed = false
  let generation = 0
  let tail: Promise<unknown> = Promise.resolve()
  let confirmed = routing.getLocation()
  let pending: BridgeLocation | undefined
  const restore = () => apply(routing.getLocation())
  const unsub = routing.subscribe((location) => {
    if (disposed) return
    const changed = !sameLocation(location, confirmed)
    confirmed = location
    if (pending && sameLocation(location, pending)) return
    if (changed) generation++
    // 应用广播也排入本地队列，避免旧的异步守卫在它之后覆盖权威位置。
    tail = tail.then(() => disposed ? undefined : restore()).catch(onError)
  })
  return {
    enqueue(prepare: () => Promise<BridgeLocation | undefined>, action: 'push' | 'replace'): Promise<BridgeNavigationResult> {
      const version = generation
      const cancelled = (): BridgeNavigationResult => ({ status: 'cancelled', location: routing.getLocation() })
      const task = tail.then(async () => {
        if (disposed || version !== generation) return cancelled()
        try {
          const target = await prepare()
          if (disposed) return cancelled()
          if (version !== generation) { await restore(); return cancelled() }
          if (!target) return cancelled()
          pending = target
          const result = await routing.navigate(target, action)
          if (!disposed) await restore()
          return result
        } catch (cause) {
          if (!disposed) {
            try { await restore() } catch (restoreError) { onError(restoreError) }
          }
          throw routingSyncError('child-router', `子应用路由准备或同步失败：${cause instanceof Error ? cause.message : String(cause)}`, [], cause)
        } finally { pending = undefined }
      })
      tail = task.then(() => {}, () => {})
      return task
    },
    dispose() { disposed = true; generation++; unsub() },
  }
}
