import { useEffect, useState } from 'react'
import { Link, Route, Routes, useParams, useSearchParams, useLocation } from 'react-router-dom'
import {
  createReactHostPages,
  provideAppContext,
  clearAppContext,
  remoteComponent,
  remoteSchema,
  useLoadRemote,
} from '@fulgurjs/federation/react'
import { pages, remotePrefixes } from './federation/pages.data'

// ── 联邦页面表（纯数据 + dev schema；组件工厂与页面表声明均零加载副作用）──
const hp = createReactHostPages({
  pages,
  remotePrefixes,
  schema: remoteSchema,
  // beforeLoad：每次实际加载前把最新登录态合并进 context（token 即时值的拉取式契约）
  beforeLoad: () => {
    const name = accountRef.current
    if (name) provideAppContext({ user: { name }, getToken: () => `token-${name}` })
  },
})

// ── 普通远程组件（模块顶层创建，不能在 render 内重新调用工厂）──
const RemoteButton = remoteComponent<{ label: string; onClick?: () => void }>('remote-react/Button', {
  fallback: <p data-testid="button-fallback">正在加载远程按钮…</p>,
})
const FaultMissing = remoteComponent('remote-react/does-not-exist')
const FaultTimeout = remoteComponent('remote-react/slow-payload', { timeout: 150, fallback: <p>等待中…</p> })
const FaultRender = remoteComponent('remote-react/broken-render')
const RemoteHooksProbeA = remoteComponent<{ tag: string; instance: number }>('remote-react/HooksProbe')
const RemoteHooksProbeB = remoteComponent<{ tag: string; instance: number }>('remote-react/HooksProbe')

// 页面表组件：与 Vue 相同动词 component(spec)，路由层渲染
const RemoteHome = hp.component('remote-react/pages/home')
const RemoteDetail = hp.component<{ id: string; tab?: string }>('remote-react/pages/detail')

// 登录态镜像（beforeLoad/Provider 读取最新值，避免闭包过期）
const accountRef = { current: null as string | null }

/** 共享 Context 对象：经远程 expose 拿同一实例（R08） */
function RemoteThemeProvider({ account, children }: { account: string | null; children: React.ReactNode }) {
  const { data, error, loading } = useLoadRemote<{ default: React.Context<{ theme: 'light' | 'dark'; account: string }> }>('remote-react/theme-context')
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  // 远程 Context 模块不可用时降级直渲染 children（不阻断页面；远程组件读到默认值，
  // 加载类错误由各远程组件自身的错误占位呈现——N01 断言路径）
  if (error || loading || !data) return <>{children}</>
  const Ctx = data.default
  return (
    <Ctx.Provider value={{ theme, account: account ?? 'anonymous' }}>
      <label>
        <input type="checkbox" data-testid="theme-toggle" checked={theme === 'dark'} onChange={(e) => setTheme(e.target.checked ? 'dark' : 'light')} />
        切换主题（{theme}）
      </label>
      {children}
    </Ctx.Provider>
  )
}

function UtilsPanel() {
  type Utils = { formatMoney(v: number, currency?: string): string; formatDate(iso: string): string }
  const { data, error, loading, reload } = useLoadRemote<Utils>('remote-react/utils')
  if (loading) return <p data-testid="utils-loading">utils 加载中…</p>
  if (error) return <button onClick={() => void reload()}>utils 加载失败，重试</button>
  return (
    <div data-testid="utils-panel">
      <p data-testid="utils-money">{data?.formatMoney(12.5)}</p>
      <p data-testid="utils-date">{data?.formatDate('2026-09-28T01:02:03Z')}</p>
      <button data-testid="utils-reload" onClick={() => void reload()}>reload</button>
    </div>
  )
}

/** 会话面板：读远程 setup/onSession 计数（挂 window），验证 R06/R07 */
function SessionPanel() {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 200)
    return () => clearInterval(t)
  }, [])
  const g = window as unknown as {
    __REMOTE_REACT_SETUP__?: number
    __REMOTE_REACT_ON_SESSION__?: number
    __REMOTE_REACT_LAST_SESSION__?: string
  }
  void tick
  return (
    <div data-testid="session-panel">
      <p data-testid="setup-count">setup:{g.__REMOTE_REACT_SETUP__ ?? 0}</p>
      <p data-testid="onsession-count">onSession:{g.__REMOTE_REACT_ON_SESSION__ ?? 0}</p>
      <p data-testid="last-session">lastSession:{g.__REMOTE_REACT_LAST_SESSION__ ?? '(none)'}</p>
    </div>
  )
}

function DetailRoute() {
  const { id } = useParams()
  const [sp] = useSearchParams()
  return <RemoteDetail id={id ?? ''} tab={sp.get('tab') ?? undefined} />
}

/** D01 浏览器探针：同实例会话切换。挂在 App 顶层（不随 account 卸载）——
 *  登录 A→B 仅触发宿主 rerender；hook 必须随新 sessionKey 重新加载并展示 B 的真实数据。
 *  加载次数挂 window 供 e2e 断言（同会话 rerender 不重载）。 */
const g = window as unknown as { __SESSION_LIVE_LOADS__?: number }
function SessionLive(): React.ReactNode {
  const { data, loading } = useLoadRemote<{ formatMoney(v: number, c?: string): string }>('remote-react/utils')
  const [renders, setRenders] = useState(0)
  const location = useLocation()
  useEffect(() => { setRenders((x) => x + 1) }, [])
  const key = (window).__FULGURJS_APP_CONFIG__?.sessionKey as string | undefined
  if (loading) g.__SESSION_LIVE_LOADS__ = (g.__SESSION_LIVE_LOADS__ ?? 0) + 1
  const money = data ? `session-live:${key?.split('-')[1] ?? 'anon'}:${data.formatMoney(1)}` : ''
  return (
    <div data-testid="session-live" style={{ display: location.pathname === '/session-live' ? 'block' : 'none' }}>
      <p data-testid="session-live-money">{loading ? 'loading…' : money}</p>
      <p data-testid="session-live-loads">loads:{g.__SESSION_LIVE_LOADS__}</p>
      <p data-testid="session-live-renders">renders:{renders}</p>
    </div>
  )
}

export default function App() {
  const [account, setAccount] = useState<string | null>(null)
  const [buttonClicks, setButtonClicks] = useState(0)

  const login = (name: string) => {
    const sessionKey = `session-${name}-${Date.now()}`
    provideAppContext({
      user: { name },
      getToken: () => `token-${name}`,
      sessionKey,
    })
    accountRef.current = name
    setAccount(name)
  }
  const logout = () => {
    clearAppContext()
    accountRef.current = null
    setAccount(null)
  }

  return (
    <div style={{ fontFamily: 'sans-serif', padding: 16 }}>
      <SessionLive />
      <h1>host-react（fulgurjs federation）</h1>
      <nav>
        <Link to="/">首页</Link> · <Link to="/remote-react/home">远程首页</Link> · <Link to="/remote-react/detail/42?tab=basic">远程参数页</Link> · <Link to="/utils">远程 utils</Link> · <Link to="/hooks">Hooks 探针</Link> · <Link to="/session">会话</Link> · <Link to="/fault">故障注入</Link>
      </nav>
      <p data-testid="account-state">account:{account ?? '(未登录)'}</p>
      <div>
        <button data-testid="login-alice" onClick={() => login('alice')}>登录 alice</button>
        <button data-testid="login-bob" onClick={() => login('bob')}>登录 bob</button>
        <button data-testid="logout" onClick={logout}>退出</button>
      </div>

      {account ? (
        <RemoteThemeProvider account={account}>
          <Routes>
            <Route path="/" element={<main>
              <p>宿主首页（无远程模块加载——R01 冷缓存断言点）</p>
              <RemoteButton label="远程按钮" onClick={() => setButtonClicks((c) => c + 1)} />
              <p data-testid="button-clicks">clicks:{buttonClicks}</p>
            </main>} />
            <Route path="/remote-react/home" element={<RemoteHome />} />
            <Route path="/remote-react/detail/:id" element={<DetailRoute />} />
            <Route path="/utils" element={<UtilsPanel />} />
            <Route path="/hooks" element={<>
              <RemoteHooksProbeA tag="A" instance={1} />
              <RemoteHooksProbeB tag="B" instance={2} />
            </>} />
            <Route path="/session" element={<SessionPanel />} />
            <Route path="/fault" element={<>
              <section><h3>N03 缺失 expose</h3><FaultMissing /></section>
              <section><h3>N04 超时</h3><FaultTimeout /></section>
              <section><h3>N05 渲染抛错</h3><FaultRender /></section>
            </>} />
          </Routes>
        </RemoteThemeProvider>
      ) : (
        <p data-testid="logged-out">已退出（联邦内容已卸载）</p>
      )}
    </div>
  )
}
