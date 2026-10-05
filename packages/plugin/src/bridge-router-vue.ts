/** Vue Router 4/5 的宿主导航端口与子应用 memory router 接线（统一入口 /vue 提供）。 */
// 仅类型导入：/vue 统一入口静态携带本模块，纯 Vue 组件工程（未安装 vue-router）导入
// /vue 时不得被强制解析 vue-router。运行期所需的唯一值语义（cancelled 失败判定）以内联
// 常量等价替代：NavigationFailureType.cancelled 在 vue-router 4.x/5.x 公开枚举均为 8
// （本仓 4.6.4 与 5.3.1 实测一致）；bridge-router 测试以真实 vue-router 覆盖该分支。
import type { BridgeChildRoute, BridgeHostNavigation, BridgeLocation, BridgeHostRouting, VueRouterLike } from './bridge-router-core'
import { collapseConsecutiveReports, connectChildNavigation } from './bridge-router-sync'
import { routingSyncError } from './bridge-errors'

/** 宿主桥接组件 routing prop 的类型（宿主启用 URL 同步时传入；README §8.3） */
export type { BridgeHostRouting }

export interface VueBridgeNavigationOptions {
  /** 保留配置兼容；Vue Router fullPath 已剥离 history base，不再二次剥离。 */
  routerBase?: string
}
/** NavigationFailureType.cancelled 的公开枚举值（vue-router 4.x/5.x 一致；见文件头说明） */
const NAVIGATION_FAILURE_CANCELLED = 8
const isCancelledNavigationFailure = (failure: unknown): boolean =>
  !!failure && typeof failure === 'object' && (failure as { type?: number }).type === NAVIGATION_FAILURE_CANCELLED

const locationFromPath = (path: string): BridgeLocation => {
  const raw = new URL(path || '/', 'http://f.invalid')
  return { pathname: raw.pathname, search: raw.search, hash: raw.hash }
}

export function createVueBridgeNavigation(router: VueRouterLike, _options: VueBridgeNavigationOptions = {}): BridgeHostNavigation {
  const toLogic = () => locationFromPath(router.currentRoute.value.fullPath)
  return {
    getLocation: toLogic,
    subscribe(listener) {
      return router.afterEach((_to, _from, failure) => { if (!failure) listener(toLogic()) })
    },
    async navigate(target, action, options) {
      if (options?.signal?.aborted) return { status: 'cancelled', location: toLogic() }
      // 最后一个守卫复核代次；宿主的异步守卫等待期间离页/卸载不能迟到提交。
      const removeGuard = router.beforeResolve(() => options?.signal?.aborted ? false : undefined)
      try {
        const to = target.pathname + target.search + target.hash
        const failure = action === 'replace' ? await router.replace(to) : await router.push(to)
        return { status: failure ? 'cancelled' : 'committed', location: toLogic() }
      } finally { removeGuard() }
    },
    go(delta) { router.go(delta) },
  }
}

export interface VueBridgeRouterConnection {
  /** 必须 await ready 后再 app.use(router)，初始错误会拒绝此 Promise。 */
  ready: Promise<void>
  dispose(): void
}

/** 接线限子应用自己的 memory router；dispose 恢复原始导航方法。 */
export function connectVueBridgeRouter(routing: BridgeChildRoute, router: VueRouterLike, options: { signal?: AbortSignal } = {}): VueBridgeRouterConnection {
  // 诊断 spec：宿主创建通道时携带真实远程名（RoutingChannel.spec）；自建通道缺省回退
  const spec = routing.spec ?? 'vue-router'
  const push = router.push
  const replace = router.replace
  const go = router.go
  const back = router.back
  const forward = router.forward
  let disposed = false
  const report = (error: unknown) => console.error('[fulgurjs] 子应用 Vue 路由同步失败：', error)
  const apply = async (loc: BridgeLocation) => {
    const path = loc.pathname + loc.search + loc.hash
    if (router.currentRoute.value.fullPath !== path) {
      const failure = await replace.call(router, path)
      if (failure && router.currentRoute.value.fullPath !== path) {
        // cancelled：子应用自己的新导航取代了本次广播应用——子应用自洽（通道稍后广播权威
        // 位置），属正常取消而非失步，不报 MFU-033（宿主守卫回滚期的连续广播曾产生重复的
        // 误导性同步失败诊断）。
        if (isCancelledNavigationFailure(failure)) return
        // 目标位置入诊断：不同目标的失步事件文本不同，连续同文折叠不会误吞不同失败
        throw routingSyncError(spec, `子应用守卫拒绝应用宿主确认的位置（目标 ${path}）；请在宿主侧设置取消守卫。`, [])
      }
    }
  }
  const sync = connectChildNavigation(routing, (loc) => ready.then(() => apply(loc)), collapseConsecutiveReports(report))
  const init = routing.getLocation()
  const ready: Promise<void> = push.call(router, init.pathname + init.search + init.hash).then(async (failure) => {
    if (disposed) return
    if (routing.getLocation().pathname + routing.getLocation().search + routing.getLocation().hash !== init.pathname + init.search + init.hash) {
      await apply(routing.getLocation())
      return
    }
    if (failure) throw routingSyncError(spec, '子应用初始路由被守卫取消。', [])
    const target = locationFromPath(router.currentRoute.value.fullPath)
    if (router.currentRoute.value.fullPath !== init.pathname + init.search + init.hash) {
      await routing.navigate(target, 'replace')
      await apply(routing.getLocation())
    }
  }).catch((cause) => {
    throw routingSyncError(spec, `初始路由准备失败：${cause instanceof Error ? cause.message : String(cause)}`, [], cause)
  })
  const intercept = (native: VueRouterLike['push'], action: 'push' | 'replace'): VueRouterLike['push'] => (to) => {
    const task = (async () => {
      let failure: unknown
      const result = await sync.enqueue(async () => {
        await ready
        failure = await native.call(router, to)
        return failure ? undefined : locationFromPath(router.currentRoute.value.fullPath)
      }, (typeof to === 'object' && (to as { replace?: boolean } | null)?.replace) ? 'replace' : action)
      if (failure) return failure
      if (result.status === 'cancelled') {
        const remove = router.beforeEach(() => false)
        try { return await native.call(router, to) } finally { remove() }
      }
    })()
    void task.catch(report)
    return task
  }
  router.push = intercept(push, 'push')
  router.replace = intercept(replace, 'replace')
  router.go = (delta) => { if (!disposed) routing.go(delta) }
  router.back = () => router.go(-1)
  router.forward = () => router.go(1)
  const connection: VueBridgeRouterConnection = {
    ready,
    dispose() {
      if (disposed) return
      disposed = true
      options.signal?.removeEventListener('abort', connection.dispose)
      sync.dispose()
      router.push = push; router.replace = replace; router.go = go; router.back = back; router.forward = forward
    },
  }
  options.signal?.addEventListener('abort', connection.dispose, { once: true })
  if (options.signal?.aborted) connection.dispose()
  return connection
}
