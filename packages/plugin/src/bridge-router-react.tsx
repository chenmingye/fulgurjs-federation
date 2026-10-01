/**
 * React Router 路由适配（/bridge/router/react 按需入口；URL 同步任务书 §3.1/§3.3）。
 *
 * 实际支持模式（原型实证，任务书 §1 结论 2）：
 * - 宿主：data router（createBrowserRouter / createHashRouter + RouterProvider）。
 *   router.navigate 被 blocker 拦截时静默返回 void（dist 源码核实）——取消用
 *   「与 useBlocker 同一取消策略预判」：canNavigate(target) 返回 false 即 cancelled，
 *   URL/历史零副作用；菜单/POP 等其他来源仍由树内 useBlocker 真实拦截。
 * - 子应用：createMemoryRouter（RR 6.11+）受控路由——Link/useNavigate 全兼容，
 *   通道广播与本地导航双向桥接，取消时乐观回滚。
 * - declarative 模式（BrowserRouter）无 blocker/提交语义，不支持 URL 同步（文档声明）。
 */
import type { ReactElement } from 'react'
import { createElement } from 'react'
import { RouterProvider, createMemoryRouter, type RouteObject } from 'react-router-dom'
import type { BridgeChildRoute, BridgeHostNavigation, BridgeLocation } from './bridge-router-core'

/** 宿主取消策略（与树内 useBlocker 共用同一谓词，单一事实源） */
export type ReactBridgeCancelPolicy = (next: BridgeLocation) => boolean

/** data router 的最小结构面（避免耦合 RR 内部类型版本） */
export interface ReactDataRouterLike {
  state: { location: { pathname: string; search: string; hash: string } }
  subscribe(cb: () => void): () => void
  navigate(to: string | number, opts?: { replace?: boolean }): void | Promise<void>
}

/**
 * 宿主侧：把 RR data router 包装为宿主导航端口。
 *
 * ```tsx
 * const router = createBrowserRouter(routes, { basename })
 * const navigation = createReactBridgeNavigation(router, {
 *   basename, // = createBrowserRouter 的 basename（含它；RR location.pathname 不剥 basename）
 *   canNavigate: (next) => !next.pathname.startsWith('/approval/secret'), // 与 useBlocker 同一谓词
 * })
 * ```
 */
export function createReactBridgeNavigation(
  router: ReactDataRouterLike,
  options: { canNavigate?: ReactBridgeCancelPolicy; basename?: string } = {},
): BridgeHostNavigation {
  // RR 的 location.pathname 含 basename（useLocation 同款语义）；端口输出逻辑路径必须剥掉，
  // 否则前缀匹配与去前缀全部错位（§2.3：部署 base 与 bridge basePath 分层，不重复拼前缀）
  const routerBase = options.basename && options.basename !== '/' ? options.basename.replace(/\/$/, '') : ''
  const toLogic = (): BridgeLocation => {
    const l = router.state.location
    const pathname = routerBase && l.pathname.startsWith(routerBase) ? l.pathname.slice(routerBase.length) || '/' : l.pathname
    return { pathname, search: l.search, hash: l.hash }
  }
  return {
    getLocation: toLogic,
    subscribe(listener) {
      return router.subscribe(() => listener(toLogic()))
    },
    async navigate(target, action) {
      if (options.canNavigate && !options.canNavigate(target)) {
        // 真实取消：与 useBlocker 同策略预判，URL/历史零副作用（不制造 blocker 异步态）
        return { status: 'cancelled', location: toLogic() }
      }
      await router.navigate((routerBase && routerBase !== '/' ? routerBase : '') + target.pathname + target.search + target.hash, { replace: action === 'replace' })
      return { status: 'committed', location: toLogic() }
    },
    go(delta: number) {
      void router.navigate(delta)
    },
  }
}

export interface ReactBridgeRouterConnection {
  /** RouterProvider 元素：子应用在自己的 root 内渲染 */
  element: ReactElement
  /** 清理本接线（通道订阅与本地监听；通道本身由宿主生命周期销毁） */
  dispose(): void
}

/**
 * 子应用侧：把子应用自己的 routes 接到通道，返回 RouterProvider 元素。
 *
 * ```tsx
 * export default defineBridgeApp((props, ctx) => {
 *   const conn = createReactBridgeRouter(ctx.routing, routes)
 *   const root = createRoot(el)
 *   root.render(conn.element)
 *   return { mount: () => {}, unmount: () => { conn.dispose(); root.unmount() } }
 * }, { routing: true })
 * ```
 */
export function createReactBridgeRouter(routing: BridgeChildRoute, routes: RouteObject[]): ReactBridgeRouterConnection {
  const init = routing.getLocation()
  const router = createMemoryRouter(routes, {
    initialEntries: [init.pathname + init.search + init.hash],
  })
  let syncing = false
  let disposed = false

  // 通道 → router（宿主权威位置应用；取消/外部变化 replace 到确认位置）
  const unsub = routing.subscribe((loc) => {
    if (disposed) return
    const next = loc.pathname + loc.search + loc.hash
    const cur = router.state.location
    if (next !== cur.pathname + cur.search + cur.hash) void router.navigate(next, { replace: true })
  })

  // router → 通道（Link/useNavigate 真实入口先改本地 router，这里转正式请求；取消回滚）
  const unwatch = router.subscribe(() => {
    if (disposed || syncing) return
    const cur = router.state.location
    const chan = routing.getLocation()
    if (cur.pathname + cur.search + cur.hash === chan.pathname + chan.search + chan.hash) return
    syncing = true
    void routing
      .navigate({ pathname: cur.pathname, search: cur.search, hash: cur.hash }, 'push')
      .then((result) => {
        syncing = false
        if (result.status === 'cancelled' && !disposed) {
          const c = result.location
          const next = c.pathname + c.search + c.hash
          const cur2 = router.state.location
          if (next !== cur2.pathname + cur2.search + cur2.hash) void router.navigate(next, { replace: true })
        }
      })
  })

  return {
    element: createElement(RouterProvider, { router }),
    dispose() {
      if (disposed) return
      disposed = true
      unwatch()
      unsub()
    },
  }
}
