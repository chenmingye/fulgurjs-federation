/**
 * React 子应用桥接契约（./bridge expose 的默认导出，任务书 §3.3）。
 *
 * defineBridgeApp 工厂接收 props 快照、返回 ReactElement；
 * createRoot/首次提交探测/unmount 由契约实现负责（react-dom/client 在实际 mount 时按需加载）。
 */
import { useEffect, useState } from 'react'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { defineBridgeApp } from '@fulgurjs/federation/react'

/** 挂载即回调（宿主验证函数引用跨 root 传递） */
function OnReady({ onReady }: { onReady?: () => void }) {
  useEffect(() => {
    onReady?.()
    // 挂载回调只触发一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}

function Counter() {
  const [n, setN] = useState(0)
  return (
    <button data-testid="demo-react-counter" onClick={() => setN(n + 1)}>
      本地状态：{n}
    </button>
  )
}

function Shell(props: Record<string, unknown>) {
  const location = useLocation()
  const navigate = useNavigate()
  return (
    <div style={{ border: '1px solid #61dafb', borderRadius: 8, padding: 12, fontFamily: 'sans-serif' }}>
      <p style={{ margin: '0 0 6px', fontWeight: 600, color: '#0b7285' }}>React 子应用</p>
      <p data-testid="demo-react-props" style={{ margin: '0 0 6px' }}>
        {`appProps.label = ${(props as any).label || '（未传）'}`}
      </p>
      <p data-testid="demo-react-route" style={{ margin: '0 0 8px' }}>{`memory 路由：${location.pathname}`}</p>
      <nav style={{ marginBottom: 8 }}>
        <button style={{ marginRight: 8 }} onClick={() => navigate('/')}>首页</button>
        <button onClick={() => navigate('/about')}>关于</button>
      </nav>
      <Counter />
      <Routes>
        <Route path="/" element={<p data-testid="demo-react-page">页面：首页</p>} />
        <Route path="/about" element={<p data-testid="demo-react-page">页面：关于</p>} />
      </Routes>
    </div>
  )
}

export function App() {
  return (
    <MemoryRouter>
      <Shell />
    </MemoryRouter>
  )
}

export default defineBridgeApp((props) => (
  <MemoryRouter>
    <OnReady onReady={(props as any).onReady} />
    <Shell {...props} />
  </MemoryRouter>
))
