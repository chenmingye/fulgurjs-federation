/**
 * Shell：React-C 根框架（身份徽标 + 导航），props 经 Context 注入（桥接 appProps 或独立预览默认值）。
 */
import { createContext, useContext } from 'react'
import { NavLink } from 'react-router-dom'
import type { ShellProps } from './pages'

export const ShellPropsContext = createContext<ShellProps>({})

export function Shell({ children }: { children: React.ReactNode }) {
  const props = useContext(ShellPropsContext)
  return (
    <div style={{ border: '2px solid #fa8c16', borderRadius: 10, padding: 12, fontFamily: 'sans-serif', background: '#fffbe6' }}>
      <p style={{ margin: '0 0 6px', fontWeight: 700, color: '#d46b08' }} data-testid="rc-identity">
        React-C（联邦子应用）· 宿主：{props.host ?? '独立预览'} · 用户：{props.user ?? '—'} · depth：{props.depth ?? 0}
      </p>
      <nav style={{ marginBottom: 10 }}>
        <NavLink to="/orders" style={{ marginRight: 10 }}>工单列表</NavLink>
        <NavLink to="/dashboard" style={{ marginRight: 10 }}>仪表盘</NavLink>
        <NavLink to="/settings">设置</NavLink>
      </nav>
      {children}
    </div>
  )
}
