/**
 * host-bridge-react：React 宿主嵌入 Vue 桥接子应用（remote-a/bridge）。
 * 交互面覆盖：props 快照与函数引用、受控会话（A→登出→B）、多实例、
 * 宿主重渲染风暴、StrictMode、故障注入 spec 选择（BN01/BN02）、卸载循环（BR04）。
 */
import { createElement, useCallback, useEffect, useRef, useState, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { clearAppContext } from '@fulgurjs/federation/react'
import { createReactBridgeApp } from '@fulgurjs/federation/bridge/react'
import { getLatestHostContext, switchSession, logoutSession } from './host-context'

const params = new URLSearchParams(window.location.search)
const specParam = params.get('spec') ?? 'bridge'
const multi = params.get('multi') === '1'

// BN07：注入 onSession 真实延迟（远程 setup 读同一页面全局）
if (params.get('onsession-delay') === '1') {
  ;(globalThis as any).__FG_ONSESSION_DELAY_MS__ = 400
}

// spec 允许切换正常/故障注入 expose（e2e 经 URL 驱动）
const exposeName = specParam === 'broken' ? 'bridge-broken' : specParam === 'mount-fail' ? 'bridge-mount-fail' : 'bridge'
const RemoteVueApp = createReactBridgeApp(`remote-a/${exposeName}`, {
  retries: 0,
  getContext: () => getLatestHostContext(),
})

function Host(): React.ReactElement {
  const [sessionKey, setSessionKey] = useState<string | null>('sess-A')
  const [userName, setUserName] = useState('alice')
  const [label, setLabel] = useState('from-host-v1')
  const [renderTick, setRenderTick] = useState(0)
  const [bridgeKey, setBridgeKey] = useState(0)
  const [eventLog, setEventLog] = useState<string[]>([])
  const [readyCount, setReadyCount] = useState(0)
  const readyRef = useRef(0)

  const log = useCallback((msg: string) => {
    setEventLog((prev) => [...prev, msg].slice(-20))
  }, [])

  const handleReady = useCallback(() => {
    readyRef.current++
    setReadyCount(readyRef.current)
    log(`onReady#${readyRef.current}`)
  }, [log])

  useEffect(() => {
    log('page-loaded')
  }, [log])

  const nextFrame = async (): Promise<void> => {
    await new Promise((r) => requestAnimationFrame(() => r(null)))
    await new Promise((r) => setTimeout(r, 50))
  }

  const switchToB = async (): Promise<void> => {
    setSessionKey(null)
    await nextFrame()
    clearAppContext()
    switchSession('sess-B', { id: 2, name: 'bob' })
    setUserName('bob')
    setSessionKey('sess-B')
  }

  const logout = async (): Promise<void> => {
    setSessionKey(null)
    await nextFrame()
    clearAppContext()
    logoutSession()
    setUserName('')
  }

  const reloginA = async (): Promise<void> => {
    setSessionKey(null)
    await nextFrame()
    clearAppContext()
    switchSession('sess-A', { id: 1, name: 'alice' })
    setUserName('alice')
    setSessionKey('sess-A')
  }

  const appProps = { label, onReady: handleReady, nested: { origin: 'host-bridge-react' } }

  return (
    <div style={{ fontFamily: 'sans-serif', padding: 12 }}>
      <h1 data-testid="host-title">host-bridge-react（React 宿主 × Vue 子应用）</h1>
      <p data-testid="host-session">{`session:${sessionKey ?? 'null'} user:${userName || 'none'} tick:${renderTick}`}</p>
      <p data-testid="host-event-log">{eventLog.join('|')}</p>
      <p data-testid="host-ready-count">{`ready-count:${readyCount}`}</p>

      <div style={{ margin: '8px 0' }}>
        <button data-testid="act-switch-b" onClick={() => void switchToB()}>换账号 B</button>
        <button data-testid="act-logout" onClick={() => void logout()}>登出</button>
        <button data-testid="act-relogin-a" onClick={() => void reloginA()}>重登 A</button>
        <button data-testid="act-storm" onClick={() => { for (let i = 0; i < 20; i++) setRenderTick((t) => t + 1) }}>重渲染风暴</button>
        <button data-testid="act-remount" onClick={() => setBridgeKey((k) => k + 1)}>key 重挂</button>
        <button data-testid="act-toggle-label" onClick={() => setLabel((l) => (l === 'from-host-v1' ? 'from-host-v2' : 'from-host-v1'))}>换 props 引用</button>
      </div>

      <div style={{ border: '1px solid #ccc', padding: 8 }} data-testid="bridge-area">
        {multi ? (
          <>
            <RemoteVueApp sessionKey={sessionKey} appProps={{ label: 'inst-1', onReady: handleReady }} />
            <hr />
            <RemoteVueApp sessionKey={sessionKey} appProps={{ label: 'inst-2', onReady: handleReady }} />
          </>
        ) : (
          <RemoteVueApp key={bridgeKey} sessionKey={sessionKey} appProps={appProps} />
        )}
      </div>
    </div>
  )
}

// URL 同步（/approval/*）：data router 承载路由；'/' 原页面不变（既有 e2e 口径不变）。
// basename = Vite base（子目录部署不与 bridge basePath 重复拼前缀，任务书 §2.3）。
const basename = import.meta.env.BASE_URL === '/' ? undefined : import.meta.env.BASE_URL
void basename

async function bootstrap(): Promise<void> {
  const { createBrowserRouter, RouterProvider } = await import('react-router-dom')
  const { RoutedApproval, registerRouting } = await import('./RoutedApproval')
  const router = createBrowserRouter(
    [
      { path: '/', element: createElement(Host) },
      { path: '/approval/*', element: createElement(RoutedApproval) },
      // fixture 宿主 404 策略：未知路径回宿主首页
      { path: '*', element: createElement(Host) },
    ],
    basename ? { basename } : undefined,
  )
  registerRouting(router, basename)
  createRoot(document.getElementById('root')!).render(
    createElement(StrictMode, null, createElement(RouterProvider, { router })),
  )
}
void bootstrap()
