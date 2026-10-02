/** React Router data router 的宿主端口与子应用 memory router 接线（按需入口）。 */
import type { ReactElement } from 'react'
import { createElement } from 'react'
import { RouterProvider, createMemoryRouter, type RouteObject } from 'react-router-dom'
import { sameLocation, type BridgeChildRoute, type BridgeHostNavigation, type BridgeLocation, type BridgeHostRouting } from './bridge-router-core'
import { connectChildNavigation } from './bridge-router-sync'

/** 宿主桥接组件 routing prop 的类型（宿主启用 URL 同步时传入；README §8.3） */
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
}

/** 返回 RouterProvider 元素，直接作为 defineBridgeApp 工厂的 ReactElement 返回值。 */
export function createReactBridgeRouter(routing: BridgeChildRoute, routes: RouteObject[], options: { signal?: AbortSignal } = {}): ReactBridgeRouterConnection {
  const init = routing.getLocation()
  const router = createMemoryRouter(routes, { initialEntries: [init.pathname + init.search + init.hash] })
  const navigate = router.navigate.bind(router)
  let disposed = false
  const sync = connectChildNavigation(routing, async (loc) => {
    const cur = router.state.location
    if (!sameLocation(cur, loc)) await navigate(loc.pathname + loc.search + loc.hash, { replace: true })
  }, (error) => console.error('[fulgurjs] 子应用 React 路由同步失败：', error))
  router.navigate = ((to: Parameters<typeof router.navigate>[0], options?: Parameters<typeof router.navigate>[1]) => {
    if (typeof to === 'number') { if (!disposed) routing.go(to); return Promise.resolve() }
    const task = sync.enqueue(async () => {
      await navigate(to, options)
      const l = router.state.location
      return { pathname: l.pathname, search: l.search, hash: l.hash }
    }, options?.replace ? 'replace' : 'push').then(() => {})
    void task.catch((error) => console.error('[fulgurjs] 子应用 React 路由同步失败：', error))
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
  const connection: ReactBridgeRouterConnection = {
    element: createElement(RouterProvider, { router }),
    dispose() {
      if (disposed) return
      options.signal?.removeEventListener('abort', connection.dispose)
      disposed = true; unwatch(); sync.dispose(); router.dispose()
    },
  }
  options.signal?.addEventListener('abort', connection.dispose, { once: true })
  if (options.signal?.aborted) connection.dispose()
  return connection
}
