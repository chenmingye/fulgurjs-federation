import { StrictMode, useCallback, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { clearAppContext } from '@fulgurjs/federation/react'
import { createReactBridgeApp } from '@fulgurjs/federation/react'
import { getLatestHostContext, login, logout } from './host-session'

// 工厂选项：fallback（pending 占位）、error（节点或 (error, retry) => ReactNode）、
// retries、timeout、getContext 与 Vue 宿主同语义
const RemoteVueApp = createReactBridgeApp('bridge-vue-remote/bridge', {
  retries: 1,
  getContext: () => getLatestHostContext(),
})

function Host() {
  const [sessionKey, setSessionKey] = useState<string | null>('login-1-alice')
  const [userName, setUserName] = useState('Alice')
  const [label, setLabel] = useState('来自 React 宿主')
  const [readyCount, setReadyCount] = useState(0)

  const handleReady = useCallback(() => setReadyCount((c) => c + 1), [])

  const nextFrame = async (): Promise<void> => {
    await new Promise((r) => requestAnimationFrame(() => r(null)))
  }

  const switchUser = async (): Promise<void> => {
    setSessionKey(null)
    await nextFrame()
    clearAppContext()
    login('login-2-bob', { id: 2, name: 'Bob' })
    setUserName('Bob')
    setSessionKey('login-2-bob')
  }

  const doLogout = async (): Promise<void> => {
    setSessionKey(null)
    await nextFrame()
    clearAppContext()
    logout()
    setUserName('')
  }

  return (
    <div style={{ fontFamily: 'sans-serif', padding: 16, maxWidth: 720 }}>
      <h1>React 宿主 × Vue 子应用（@fulgurjs/federation/react）</h1>
      <p data-testid="demo-session">{`会话：${sessionKey ?? '未登录'}（${userName || '—'}）· onReady 次数：${readyCount}`}</p>
      <p>
        <button data-testid="demo-switch" onClick={() => void switchUser()}>切换到 Bob（clearAppContext → 重挂）</button>
        <button data-testid="demo-logout" onClick={() => void doLogout()}>登出（sessionKey → null）</button>
      </p>
      <section style={{ marginTop: 12 }}>
        <RemoteVueApp sessionKey={sessionKey} appProps={{ label, onReady: handleReady }} />
      </section>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Host />
  </StrictMode>,
)
