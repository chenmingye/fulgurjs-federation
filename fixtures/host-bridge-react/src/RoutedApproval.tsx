/**
 * RoutedApproval：URL 同步路由页（React 宿主 × Vue 子应用，?routed=1 驱动）。
 * - 端口 = createReactBridgeNavigation(router, { canNavigate })；canNavigate 与树内
 *   useBlocker 共用同一谓词（单一事实源：子应用请求端口预判取消，菜单/POP 走树内真实拦截）；
 * - basePath=/approval；?routed-delay=1 → 400ms pending（U12）；?spec=bridge → MFU-031（U17）。
 */
import { useEffect, useRef, useState, type ReactElement } from 'react'
import { Link, Outlet, useBlocker, useLocation } from 'react-router-dom'
import { clearAppContext } from '@fulgurjs/federation/react'
import { createReactBridgeApp } from '@fulgurjs/federation/bridge/react'
import { createReactBridgeNavigation, type BridgeHostRouting } from '@fulgurjs/federation/bridge/router/react'
import { getLatestHostContext, switchSession } from './host-context'


const params = new URLSearchParams(window.location.search)
const routedOn = params.get('routed') === '1'
const specName = params.get('spec') === 'bridge' ? 'bridge' : 'bridge-routed'

/** 取消策略（与 useBlocker 共用）：/approval/secret 一律拒绝 */
const isBlocked = (pathname: string): boolean => pathname.startsWith('/approval/secret')

/** data router 最小结构面（避免耦合 RR 内部类型路径） */
interface DataRouterLike {
  state: { location: { pathname: string; search: string; hash: string } }
  subscribe(cb: () => void): () => void
  navigate(to: string | number, opts?: { replace?: boolean }): void | Promise<void>
}

/** 端口在 main.tsx 组装 router 后注册（模块级单例）；basename 与 createBrowserRouter 同源（§2.3 分层） */
export function registerRouting(router: DataRouterLike, basename?: string): void {
  const navigation = createReactBridgeNavigation(router, {
    basename,
    canNavigate: (n) => !isBlocked(n.pathname),
  })
  ;(globalThis as any).__ROUTED_ROUTING__ = { basePath: '/approval', navigation } satisfies BridgeHostRouting
}

function SecretBlocker(): ReactElement {
  const blocker = useBlocker(({ nextLocation }) => isBlocked(nextLocation.pathname))
  useEffect(() => {
    if (blocker.state === 'blocked') {
      ;(globalThis as any).__ROUTED_BLOCKER_EVENTS__ = [
        ...((globalThis as any).__ROUTED_BLOCKER_EVENTS__ ?? []),
        blocker.location?.pathname,
      ]
      blocker.reset?.()
    }
  }, [blocker.state])
  return <Outlet />
}

const RemoteVueRouted = createReactBridgeApp(`remote-a/${specName}`, {
  retries: 0,
  getContext: () => getLatestHostContext(),
})

export function RoutedApproval(): ReactElement {
  const location = useLocation()
  const [sessionKey, setSessionKey] = useState<string | null>('sess-A')
  const [pending, setPending] = useState(params.get('routed-delay') === '1')
  const unmountedAt = useRef<number | undefined>(undefined)
  useEffect(() => {
    if (params.get('routed-delay') === '1') {
      const t = setTimeout(() => setPending(false), 400)
      return () => clearTimeout(t)
    }
  }, [])
  useEffect(() => () => {
    unmountedAt.current = Date.now()
    ;(globalThis as any).__ROUTED_UNMOUNTED_AT__ = unmountedAt.current
  }, [])

  const switchToB = (): void => {
    setSessionKey(null)
    setTimeout(() => {
      clearAppContext()
      switchSession('sess-B', { id: 2, name: 'bob' })
      setSessionKey('sess-B')
    }, 60)
  }

  const routing = (globalThis as any).__ROUTED_ROUTING__ as BridgeHostRouting | undefined

  return (
    <div style={{ fontFamily: 'sans-serif', padding: 12 }} data-testid="routed-react-host">
      <SecretBlocker />
      <nav style={{ padding: 8, background: '#eee', marginBottom: 8 }}>
        <Link data-testid="routed-menu-home" to="/" style={{ marginRight: 12 }}>宿主首页</Link>
        <Link data-testid="routed-menu-list" to="/approval/list" style={{ marginRight: 12 }}>审批列表</Link>
        <Link data-testid="routed-menu-detail" to="/approval/detail/789?tab=main" style={{ marginRight: 12 }}>审批详情789</Link>
        <Link data-testid="routed-menu-secret" to="/approval/secret" style={{ marginRight: 12 }}>机密页(会被blocker拦截)</Link>
        <button data-testid="routed-act-switch-b" onClick={switchToB}>换账号 B</button>
        <span data-testid="routed-session">{`session:${sessionKey ?? 'null'}`}</span>
      </nav>
      <p data-testid="routed-host-url">{location.pathname + location.search}</p>
      <div style={{ border: '1px solid #61dafb', padding: 8 }} data-testid="routed-bridge-area">
        {routedOn ? (
          pending ? (
            <p data-testid="routed-pending">pending…</p>
          ) : routing ? (
            <RemoteVueRouted sessionKey={sessionKey} routing={routing} appProps={{ origin: 'routed' }} />
          ) : null
        ) : (
          <p data-testid="routed-off">routed 未启用（?routed=1）——memory 模式</p>
        )}
      </div>
    </div>
  )
}
