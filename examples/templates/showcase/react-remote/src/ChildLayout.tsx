/**
 * examples/templates/showcase/react-remote/src/ChildLayout.tsx — 子应用根布局：导航演示按钮 + Outlet。
 * push/replace 走被 createReactBridgeRouter 接管的 router.navigate（经通道同步宿主 URL）；
 * 数字 navigate 委托宿主浏览器历史（go），不创建第二条独立历史。
 */
import { Outlet, useNavigate } from 'react-router-dom'
import type { ReactElement } from 'react'
import { getMountCount, reportNav } from './child-bus'

export default function ChildLayout(): ReactElement {
  const navigate = useNavigate()

  const handlePushDemo = (): void => {
    const target = `/orders?page=2&q=${encodeURIComponent('演示')}`
    reportNav('子应用 push/replace', 'push', target)
    void navigate(target)
  }

  const handleReplaceDemo = (): void => {
    reportNav('子应用 push/replace', 'replace', '/settings')
    void navigate('/settings', { replace: true })
  }

  const handleGoBack = (): void => {
    reportNav('子应用 go', 'go', '-1')
    navigate(-1)
  }

  const handleGoForward = (): void => {
    reportNav('子应用 go', 'go', '1')
    navigate(1)
  }

  return (
    <div style={{ borderTop: '1px dashed #ccc', marginTop: 8, paddingTop: 8 }}>
      <p style={{ margin: '4px 0' }}>
        <strong>React 子应用</strong>（受控 memory 路由）· 本会话挂载次数：{getMountCount()}
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '8px 0' }}>
        <button onClick={handlePushDemo}>子应用 push /orders?q=演示&amp;page=2</button>
        <button onClick={handleReplaceDemo}>子应用 replace /settings</button>
        <button onClick={handleGoBack}>子应用 go(-1)</button>
        <button onClick={handleGoForward}>子应用 go(1)</button>
      </div>
      <Outlet />
    </div>
  )
}
