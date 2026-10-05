import { label } from 'rv-policy'
import React, { createContext, useContext, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { loadShare, unwrapDefault, version } from '@fulgurjs/federation/react'
import { createReactBridgeApp } from '@fulgurjs/federation/react'

const context = createContext('宿主 Context')
const options = { retries: 0, getContext: () => ({ sessionKey: 'version-demo', user: { name: '演示用户' } }) }
const Isolated = createReactBridgeApp('rv-remote18/bridge', options)
const Incompatible = createReactBridgeApp('rv-remote18-strict/bridge', options)
const Corrected = createReactBridgeApp('rv-remote19/bridge', options)
const state: Record<string, any> = { hostReact: React, pluginVersion: version }
;(window as any).__RV = state
const isolatedReady = (info: Record<string, unknown>) => { state.isolated = info }
const correctedReady = (info: Record<string, unknown>) => { state.corrected = info }

function App() {
  const text = useContext(context)
  const [count, setCount] = useState(0)
  const [mode, setMode] = useState<'idle' | 'bad' | 'fixed'>('idle')
  return <main style={{ fontFamily: 'sans-serif', maxWidth: 900, margin: 'auto' }}>
    <h1>React 18 / 19 版本隔离与故障恢复</h1>
    <p data-testid="async-choice">{label}</p>
    <p data-testid="host-version">宿主 React {React.version} · {text}</p>
    <button data-testid="host-counter" onClick={() => setCount(count + 1)}>宿主计数：{count}</button>
    <h2>独立作用域：React 19 宿主嵌 React 18 子应用</h2>
    <div data-testid="isolated"><Isolated sessionKey="version-demo" appProps={{ onReady: isolatedReady }} /></div>
    <h2>默认作用域：严格拒绝与对齐版本后的重新加载</h2>
    <p>错误配方使用 React 18；修正配方切换到实际安装 React 19 的远程。宿主与浏览器页面保持运行。</p>
    <button data-testid="reject" onClick={() => setMode('bad')}>加载不兼容的 React 18</button>
    <button data-testid="recover" onClick={() => setMode('fixed')}>加载版本已对齐的 React 19</button>
    <div data-testid="recovery">{mode === 'bad' ? <Incompatible sessionKey="version-demo" /> : mode === 'fixed' ?
      <Corrected sessionKey="version-demo" appProps={{ onReady: correctedReady }} /> : <p>请选择配方</p>}</div>
  </main>
}
loadShare('react', { singleton: true, strictVersion: true, requiredVersion: '^19.0.0' }).then((value) => {
  state.hostDynamicSame = unwrapDefault(value) === React
}).catch(console.error)
createRoot(document.getElementById('root')!).render(<context.Provider value="宿主 Context"><App /></context.Provider>)
