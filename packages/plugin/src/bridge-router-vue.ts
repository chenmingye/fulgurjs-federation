/** Vue Router 4 的宿主导航端口与子应用 memory router 接线（按需入口）。 */
import { type Router, type NavigationFailure } from 'vue-router'
import type { BridgeChildRoute, BridgeHostNavigation, BridgeLocation } from './bridge-router-core'
import { connectChildNavigation } from './bridge-router-sync'
import { routingSyncError } from './bridge-errors'

export interface VueBridgeNavigationOptions {
  /** 保留配置兼容；Vue Router fullPath 已剥离 history base，不再二次剥离。 */
  routerBase?: string
}
const locationFromPath = (path: string): BridgeLocation => {
  const raw = new URL(path || '/', 'http://f.invalid')
  return { pathname: raw.pathname, search: raw.search, hash: raw.hash }
}

export function createVueBridgeNavigation(router: Router, _options: VueBridgeNavigationOptions = {}): BridgeHostNavigation {
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
export function connectVueBridgeRouter(routing: BridgeChildRoute, router: Router, options: { signal?: AbortSignal } = {}): VueBridgeRouterConnection {
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
      if (failure && router.currentRoute.value.fullPath !== path) throw routingSyncError('vue-router', '子应用守卫拒绝应用宿主确认的位置；请在宿主侧设置取消守卫。', [])
    }
  }
  const sync = connectChildNavigation(routing, (loc) => ready.then(() => apply(loc)), report)
  const init = routing.getLocation()
  const ready: Promise<void> = push.call(router, init.pathname + init.search + init.hash).then(async (failure) => {
    if (disposed) return
    if (routing.getLocation().pathname + routing.getLocation().search + routing.getLocation().hash !== init.pathname + init.search + init.hash) {
      await apply(routing.getLocation())
      return
    }
    if (failure) throw routingSyncError('vue-router', '子应用初始路由被守卫取消。', [])
    const target = locationFromPath(router.currentRoute.value.fullPath)
    if (router.currentRoute.value.fullPath !== init.pathname + init.search + init.hash) {
      await routing.navigate(target, 'replace')
      await apply(routing.getLocation())
    }
  }).catch((cause) => {
    throw routingSyncError('vue-router', `初始路由准备失败：${cause instanceof Error ? cause.message : String(cause)}`, [], cause)
  })
  const intercept = (native: Router['push'], action: 'push' | 'replace'): Router['push'] => (to) => {
    const task = (async () => {
      let failure: NavigationFailure | void | undefined
      const result = await sync.enqueue(async () => {
        await ready
        failure = await native.call(router, to)
        return failure ? undefined : locationFromPath(router.currentRoute.value.fullPath)
      }, typeof to === 'object' && to.replace ? 'replace' : action)
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
