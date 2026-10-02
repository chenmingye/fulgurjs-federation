/** 子路由的串行仲裁；外部宿主位置使旧的本地请求失效。 */
import { sameLocation, type BridgeChildRoute, type BridgeLocation, type BridgeNavigationResult } from './bridge-router-core'
import { routingSyncError } from './bridge-errors'

/**
 * 连续同文诊断折叠：完全相同的错误连续发生（宿主守卫回滚期的重复广播竞态）只保留首条；
 * 不同失败事件永不合并（ MFU-033 双诊断修复的一半——另一半是 cancelled 分类，见
 * bridge-router-vue.ts apply()）。
 */
export function collapseConsecutiveReports(report: (error: unknown) => void): (error: unknown) => void {
  let last = ''
  return (error: unknown) => {
    const key = error instanceof Error ? `${error.name}|${error.message}` : String(error)
    if (key === last) return
    last = key
    report(error)
  }
}

export function connectChildNavigation(
  routing: BridgeChildRoute,
  apply: (location: BridgeLocation) => Promise<unknown>,
  onError: (error: unknown) => void,
) {
  // 诊断 spec：宿主创建通道时携带真实远程名（RoutingChannel.spec）；纯 memory 小部件自建通道缺省回退
  const spec = routing.spec ?? 'child-router'
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
          throw routingSyncError(spec, `子应用路由准备或同步失败：${cause instanceof Error ? cause.message : String(cause)}`, [], cause)
        } finally { pending = undefined }
      })
      tail = task.then(() => {}, () => {})
      return task
    },
    dispose() { disposed = true; generation++; unsub() },
  }
}
