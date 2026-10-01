/**
 * React 子应用的组件文件（BR10 Fast Refresh 载体）。
 * 只导出组件——本文件的兼容修改可 Fast Refresh 到宿主页面并保留子应用本地状态；
 * 契约模块（bridge.tsx，默认导出非组件）的修改按 plugin-react 规则自动整页刷新。
 */
import { useEffect, useState } from 'react'
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom'

/** 挂载即回调（BR05：函数引用跨 root 传递验证） */
export function OnReady({ onReady }: { onReady?: () => void }) {
  useEffect(() => {
    onReady?.()
    // 挂载回调只触发一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}

export function Counter() {
  const [n, setN] = useState(0)
  return (
    <button data-testid="bridge-react-counter" onClick={() => setN(n + 1)}>count:{n}</button>
  )
}

export function BridgeRoot(props: Record<string, unknown>) {
  const location = useLocation()
  const navigate = useNavigate()
  return (
    <div data-bridge-root="remote-react">
      <p data-testid="bridge-react-props">{`react-bridge-props:${JSON.stringify({ label: (props as any).label ?? '', nested: (props as any).nested ?? null })}`}</p>
      <p data-testid="bridge-react-route">{`route:${location.pathname}`}</p>
      <nav>
        <button data-testid="bridge-react-go-about" onClick={() => navigate('/about')}>到 about 页</button>
        <button data-testid="bridge-react-go-home" onClick={() => navigate('/')}>到 home 页</button>
      </nav>
      <Routes>
        <Route path="/" element={<p data-testid="bridge-react-page">page:home</p>} />
        <Route path="/about" element={<p data-testid="bridge-react-page">page:about</p>} />
      </Routes>
    </div>
  )
}
