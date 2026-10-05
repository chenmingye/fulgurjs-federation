/** React Router data router 的宿主导航端口与子应用 memory router 接线（统一入口 /react 提供）。 */
// react-router-dom 是 /react 的**可选**依赖边界：纯 React 组件工程（未安装 react-router-dom）
// 导入 /react 时不得被强制解析它。因此本文件对 react-router-dom 只保留 type 导入
// （RouteObject），运行期取值一律走下方模块级按需预热 + 就绪判定：
// - dev：Vite 将依赖内缺失的动态导入改写为 optional-peer-dep 错误模块（200 + 描述性 throw），
//   预热的拒绝被捕获，零噪声；装了 react-router-dom 的工程照常解析。
// - prod：缺依赖时 rollup 产出空 chunk（import 成功但形状为空）——按形状校验兜底。
// 就绪前调用 createReactBridgeRouter 走惰性宿主（首次渲染等待预热落定）；就绪后与
// 历史行为完全一致：同步创建 memory router，element.props.router 可被宿主内省。
import { createElement, useEffect, useState, type ReactElement } from 'react'
import type { RouterProvider, createMemoryRouter, RouteObject } from 'react-router-dom'
import { sameLocation, type BridgeChildRoute, type BridgeHostNavigation, type BridgeLocation, type BridgeHostRouting } from './bridge-router-core'
import { collapseConsecutiveReports, connectChildNavigation } from './bridge-router-sync'

/** 宿主桥接组件 routing prop 的类型（宿主启用 URL 同步时传入；见 API 手册 url-sync） */
export type { BridgeHostRouting }

export type ReactBridgeCancelPolicy = (next: BridgeLocation) => boolean
export interface ReactDataRouterLike {
  state: {
    location: { pathname: string; search: string; hash: string; key?: string }
    navigation?: { state: string; location?: BridgeLocation }
    blockers?: ReadonlyMap<string, { state: string; reset?: () => void }>
  }
  subscribe(cb: () => void): () => void
  navigate(to: string | number, opts?: { replace?: boolean }): void | Promise<void>
}

// ---- react-router-dom 模块级按需预热（可选依赖边界，见文件头） ----
type ReactRouterModule = { createMemoryRouter: typeof createMemoryRouter; RouterProvider: typeof RouterProvider }
let routerDomModule: ReactRouterModule | null = null
let routerDomFailure: unknown = null
const routerDomReady: Promise<void> = import('react-router-dom').then(
  (m) => {
    // prod 缺依赖：rollup 产出空 chunk——import 成功但缺成员，按形状判定为不可用
    const candidate = m as Partial<ReactRouterModule> | null
    if (candidate && typeof candidate.createMemoryRouter === 'function' && typeof candidate.RouterProvider === 'function') {
      routerDomModule = candidate as ReactRouterModule
    } else {
      routerDomFailure = new Error(
        '[fulgurjs] react-router-dom 未安装或不可用（createMemoryRouter/RouterProvider 缺失）。' +
          'createReactBridgeRouter（URL 同步受控路由）需要 react-router-dom ≥6.11；' +
          '不使用路由同步的纯 React 组件工程无需安装。',
      )
    }
  },
  (e) => {
    routerDomFailure = e
  },
)
/** 内部时序缝隙：等待模块级预热落定（仅测试使用；生产代码不需要等待——未就绪时走惰性宿主） */
export const __reactRouterDomReady = routerDomReady

/** canNavigate 是可选预判；最终结果同时核对真实 blocker 与已提交位置。 */
export function createReactBridgeNavigation(
  router: ReactDataRouterLike,
  options: { canNavigate?: ReactBridgeCancelPolicy; basename?: string } = {},
): BridgeHostNavigation {
  const base = options.basename && options.basename !== '/' ? options.basename.replace(/\/$/, '') : ''
  const toLogic = (): BridgeLocation => {
    const l = router.state.location
    const pathname = base && (l.pathname === base || l.pathname.startsWith(base + '/')) ? l.pathname.slice(base.length) || '/' : l.pathname
    return { pathname, search: l.search, hash: l.hash }
  }
  return {
    getLocation: toLogic,
    subscribe(listener) {
      let previous = toLogic()
      return router.subscribe(() => {
        const next = toLogic()
        if (!sameLocation(previous, next)) { previous = next; listener(next) }
      })
    },
    async navigate(target, action, context) {
      if (context?.signal?.aborted || (options.canNavigate && !options.canNavigate(target))) return { status: 'cancelled', location: toLogic() }
      const initial = router.state.location
      return new Promise((resolve, reject) => {
        let finished = false
        let returned = false
        let blocked = false
        let unwatch: () => void = () => {}
        const finish = (status: 'committed' | 'cancelled') => {
          if (finished) return
          finished = true; unwatch(); context?.signal?.removeEventListener('abort', abort)
          resolve({ status, location: toLogic() })
        }
        const abort = () => {
          finish('cancelled')
          for (const blocker of router.state.blockers?.values() ?? []) if (blocker.state === 'blocked') blocker.reset?.()
          const loading = router.state.navigation
          if (loading && loading.state !== 'idle' && loading.location?.pathname === base + target.pathname) {
            // data router 无逐请求 abort API：以确认位置的 replace 取消仍属于本请求的 loader。
            // 外部新导航目标不同则不触碰；不增加浏览器历史条目。
            const current = toLogic()
            void Promise.resolve().then(() => {
              const latest = router.state.navigation
              if (!latest || latest.state === 'idle' || latest.location?.pathname !== base + target.pathname) return
              return router.navigate(current.pathname + current.search + current.hash, { replace: true })
            })
              .catch((error) => console.error('[fulgurjs] 取消宿主待提交导航失败：', error))
          }
        }
        const check = () => {
          if (finished) return
          if (context?.signal?.aborted) { abort(); return }
          const blockers = [...(router.state.blockers?.values() ?? [])]
          if (blockers.some((b) => b.state === 'blocked' || b.state === 'proceeding')) { blocked = true; return }
          if (router.state.navigation && router.state.navigation.state !== 'idle') return
          const actual = router.state.location
          const committed = actual.key !== initial.key || !sameLocation(actual, initial)
          if (committed) finish('committed')
          else if (returned || blocked) finish('cancelled')
        }
        unwatch = router.subscribe(check)
        context?.signal?.addEventListener('abort', abort, { once: true })
        Promise.resolve().then(() => {
          if (finished || context?.signal?.aborted) return
          return router.navigate(target.pathname + target.search + target.hash, { replace: action === 'replace' })
        }).then(() => {
          returned = true; check()
        }, (error) => {
          if (finished) return
          finished = true; unwatch(); context?.signal?.removeEventListener('abort', abort); reject(error)
        })
      })
    },
    go(delta) { void Promise.resolve().then(() => router.navigate(delta)).catch((error) => console.error('[fulgurjs] 宿主历史导航失败：', error)) },
  }
}

export interface ReactBridgeRouterConnection {
  element: ReactElement
  dispose(): void
  /**
   * 已接线 memory router 的就绪合同（可加性导出）：
   * fast 路径（预热已就绪）= 同步已 resolve 的 Promise（element.props.router 等价）；
   * slow 路径（预热未落定/缺依赖）= 惰性宿主接线完成时 resolve（缺依赖时 reject 清晰错误）。
   * 宿主内省请优先用它，不要假设 element.props.router 同步存在。
   */
  routerReady: Promise<WiredRouter['router']>
}

/** 已接线的 memory router（fast 路径同步产出；slow 路径由惰性宿主补挂） */
interface WiredRouter {
  router: ReturnType<ReactRouterModule['createMemoryRouter']>
  RouterProvider: ReactRouterModule['RouterProvider']
  dispose(): void
}

/**
 * 用真实 react-router-dom 模块创建 memory data router 并接线路由同步
 * （fast/slow 两条路径共用；与历史同步行为逐行等价）。
 */
function wireReactBridgeRouter(
  m: ReactRouterModule,
  routing: BridgeChildRoute,
  routes: RouteObject[],
  options: { signal?: AbortSignal },
): WiredRouter {
  const init = routing.getLocation()
  const router = m.createMemoryRouter(routes, { initialEntries: [init.pathname + init.search + init.hash] })
  const navigate = router.navigate.bind(router)
  let disposed = false
  const report = collapseConsecutiveReports((error) => console.error('[fulgurjs] 子应用 React 路由同步失败：', error))
  const sync = connectChildNavigation(routing, async (loc) => {
    const cur = router.state.location
    if (!sameLocation(cur, loc)) await navigate(loc.pathname + loc.search + loc.hash, { replace: true })
  }, report)
  router.navigate = ((to: Parameters<typeof router.navigate>[0], options?: Parameters<typeof router.navigate>[1]) => {
    if (typeof to === 'number') { if (!disposed) routing.go(to); return Promise.resolve() }
    const task = sync.enqueue(async () => {
      await navigate(to, options)
      const l = router.state.location
      return { pathname: l.pathname, search: l.search, hash: l.hash }
    }, options?.replace ? 'replace' : 'push').then(() => {})
    void task.catch(report)
    return task
  }) as typeof router.navigate
  // 初始 loader 重定向使用 replace 同步；普通 Router 状态更新不再误报为 push。
  let unwatch: () => void = () => {}
  if (!router.state.initialized) unwatch = router.subscribe(() => {
    if (!router.state.initialized) return
    unwatch()
    const actual = router.state.location
    if (!sameLocation(actual, init)) void sync.enqueue(async () => actual, 'replace').catch((error) => console.error('[fulgurjs] 初始 React 路由同步失败：', error))
  })
  const wired: WiredRouter = {
    router,
    RouterProvider: m.RouterProvider,
    dispose() {
      if (disposed) return
      disposed = true
      options.signal?.removeEventListener('abort', disposeWired)
      unwatch(); sync.dispose(); router.dispose()
    },
  }
  const disposeWired = () => wired.dispose()
  options.signal?.addEventListener('abort', disposeWired, { once: true })
  if (options.signal?.aborted) wired.dispose()
  return wired
}

/** 惰性宿主：模块级预热未就绪时（罕见竞态），首次渲染等待落定后补挂 RouterProvider */
function LazyRouterProviderHost(props: {
  routing: BridgeChildRoute
  routes: RouteObject[]
  signal?: AbortSignal
  isDisposed: () => boolean
  onWired: (w: WiredRouter) => void
}): ReactElement | null {
  const [wired, setWired] = useState<WiredRouter | null>(null)
  const [failure, setFailure] = useState<unknown>(routerDomFailure)
  useEffect(() => {
    if (wired || failure !== null) return
    let alive = true
    void routerDomReady.then(
      () => {
        if (!alive) return
        if (routerDomFailure) { setFailure(routerDomFailure); return }
        if (!routerDomModule || props.isDisposed()) return
        const w = wireReactBridgeRouter(routerDomModule, props.routing, props.routes, { signal: props.signal })
        props.onWired(w)
        setWired(w)
      },
      (e) => { if (alive) setFailure(e) },
    )
    return () => { alive = false }
  }, [wired, failure, props])
  if (failure !== null) {
    throw failure instanceof Error ? failure : new Error(String(failure))
  }
  return wired ? createElement(wired.RouterProvider, { router: wired.router }) : null
}

/** 返回 RouterProvider 元素，直接作为 defineBridgeApp 工厂的 ReactElement 返回值。 */
export function createReactBridgeRouter(routing: BridgeChildRoute, routes: RouteObject[], options: { signal?: AbortSignal } = {}): ReactBridgeRouterConnection {
  let disposed = false
  let wired: WiredRouter | null = null
  const dispose = () => {
    if (disposed) return
    disposed = true
    wired?.dispose()
  }
  if (routerDomModule) {
    // fast 路径：与历史行为一致——同步创建 router，element.props.router 可被内省
    wired = wireReactBridgeRouter(routerDomModule, routing, routes, options)
    const fastRouter = wired.router
    const connection: ReactBridgeRouterConnection = {
      element: createElement(wired.RouterProvider, { router: wired.router }),
      dispose,
      routerReady: Promise.resolve(fastRouter),
    }
    options.signal?.addEventListener('abort', connection.dispose, { once: true })
    if (options.signal?.aborted) connection.dispose()
    return connection
  }
  // slow 路径：预热未落定（罕见竞态）或缺依赖（缺依赖错误在首次渲染时以合同内异常暴露）
  let wireResolve: (r: WiredRouter['router']) => void = () => {}
  const routerReady = new Promise<WiredRouter['router']>((resolve, reject) => {
    wireResolve = resolve
    void routerDomReady.then(() => {
      if (routerDomFailure && !routerDomModule) reject(routerDomFailure)
    }, (e) => reject(e))
  })
  const connection: ReactBridgeRouterConnection = {
    element: createElement(LazyRouterProviderHost, {
      routing,
      routes,
      signal: options.signal,
      isDisposed: () => disposed,
      onWired: (w) => { wired = w; wireResolve(w.router) },
    }),
    dispose,
    routerReady,
  }
  options.signal?.addEventListener('abort', connection.dispose, { once: true })
  if (options.signal?.aborted) connection.dispose()
  return connection
}
