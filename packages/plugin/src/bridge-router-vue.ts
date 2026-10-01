/**
 * Vue Router 4 路由适配（/bridge/router/vue 按需入口；URL 同步任务书 §3.1/§3.3）。
 *
 * 宿主侧：createVueBridgeNavigation(router) 把 Vue Router 实例包装为宿主导航端口——
 * push/replace 落定 NavigationFailure | undefined，failure 即真实取消（守卫拒绝），
 * 不以「函数返回」冒充提交成功。
 *
 * 子应用侧：connectVueBridgeRouter(routing, router) 把子应用自己的 memory router
 * 接到通道上——RouterLink/router.push 等真实入口经 afterEach 桥为通道请求（宿主仲裁，
 * 取消时回滚最后确认位置）；通道广播 replace 应用到本地 router。
 * 初始位置已由通道就绪；`ready` 落定前 afterEach 不发起请求（原型实证：install 的
 * 初始导航竞态，见任务书 §1 原型结论 1）。
 *
 * 本入口按需导入 vue-router（peerDependenciesMeta.optional）；默认 /bridge、/runtime、
 * /react 不加载本模块。
 */
import type { NavigationFailure, Router } from 'vue-router'
import type { BridgeChildRoute, BridgeHostNavigation, BridgeLocation } from './bridge-router-core'

/** Vue Router base（createWebHistory/createWebHashHistory 的 base 参数）；逻辑路径 = 实际路径去 base */
export interface VueBridgeNavigationOptions {
  routerBase?: string
}

/** 宿主侧：把 Vue Router 实例包装为宿主导航端口（宿主 Router 是唯一历史写入方） */
export function createVueBridgeNavigation(router: Router, options: VueBridgeNavigationOptions = {}): BridgeHostNavigation {
  const routerBase = options.routerBase && options.routerBase !== '/' ? options.routerBase.replace(/\/$/, '') : ''
  const toLogic = (): BridgeLocation => {
    const raw = new URL(router.currentRoute.value.fullPath || '/', 'http://f.invalid')
    const pathname = routerBase && raw.pathname.startsWith(routerBase) ? raw.pathname.slice(routerBase.length) || '/' : raw.pathname
    return { pathname, search: raw.search, hash: raw.hash }
  }
  return {
    getLocation: toLogic,
    subscribe(listener) {
      return router.afterEach(() => listener(toLogic()))
    },
    async navigate(target, action) {
      const to = target.pathname + target.search + target.hash
      try {
        const failure: NavigationFailure | void | undefined = action === 'replace' ? await router.replace(to) : await router.push(to)
        if (failure) return { status: 'cancelled', location: toLogic() }
        return { status: 'committed', location: toLogic() }
      } catch {
        return { status: 'cancelled', location: toLogic() }
      }
    },
    go(delta: number) {
      router.go(delta)
    },
  }
}

export interface VueBridgeRouterConnection {
  /** 初始位置就绪（含初始 push 与首次广播应用）；ready 前后的清理都必须可用 */
  ready: Promise<void>
  /** 清理本接线（通道订阅与本地监听；通道本身由宿主生命周期销毁） */
  dispose(): void
}

/**
 * 子应用侧：把子应用自己的 memory router 接到通道。
 *
 * ```ts
 * export default defineBridgeApp((props, ctx) => {
 *   const router = createRouter({ history: createMemoryHistory(), routes })
 *   const conn = connectVueBridgeRouter(ctx.routing, router)
 *   const app = createApp(App, props)
 *   app.use(router)
 *   return app
 * }, { routing: true })
 * ```
 */
export function connectVueBridgeRouter(routing: BridgeChildRoute, router: Router): VueBridgeRouterConnection {
  let syncing = false
  let disposed = false
  let started = false

  // 通道 → router（宿主权威位置；取消/外部变化时 replace 到确认位置）
  const unsub = routing.subscribe((loc) => {
    if (disposed) return
    const next = loc.pathname + loc.search + loc.hash
    if (router.currentRoute.value.fullPath !== next) void router.replace(next)
  })

  // router → 通道（RouterLink/router.push 等真实入口；宿主取消则回滚）。
  // fullPath 经 URL 解析取三段——原样保留 search 编码/重复键/hash，不二次 decode/encode。
  const stopWatch = router.afterEach((to) => {
    if (disposed || syncing || !started) return
    const chan = routing.getLocation()
    const toFull = to.fullPath
    if (toFull === chan.pathname + chan.search + chan.hash) return
    const raw = new URL(toFull, 'http://f.invalid')
    syncing = true
    void routing
      .navigate({ pathname: raw.pathname, search: raw.search, hash: raw.hash }, 'push')
      .then((result) => {
        syncing = false
        if (result.status === 'cancelled' && !disposed) {
          const c = result.location
          const cur = c.pathname + c.search + c.hash
          if (router.currentRoute.value.fullPath !== cur) void router.replace(cur)
        }
      })
  })

  // 初始位置落定后才开始桥接（install 初始导航竞态防护，原型结论 1）
  const init = routing.getLocation()
  const ready = router
    .push(init.pathname + init.search + init.hash)
    .then(() => {
      started = true
    })
    .catch(() => {
      started = true
    })

  return {
    ready,
    dispose() {
      if (disposed) return
      disposed = true
      stopWatch()
      unsub()
    },
  }
}
