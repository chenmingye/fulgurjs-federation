/**
 * demo/bridge-router/react-remote/src/pages/OrderDetail.tsx — 工单详情页（路径参数 /orders/:id）。
 * 「返回列表」走 go(-1)（委托宿主浏览器历史）；「回列表」走 push（经通道写宿主 URL）。
 */
import type { ReactElement } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { reportNav } from '../child-bus'

export default function OrderDetail(): ReactElement {
  const params = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const id = params.id ?? ''
  const queryEcho = location.search === '' ? '（无）' : location.search

  const handleBack = (): void => {
    reportNav('子应用 go', 'go', '-1')
    navigate(-1)
  }

  const handleLinkBack = (): void => {
    reportNav('子应用 Link', 'push', '/orders')
    void navigate('/orders')
  }

  return (
    <section style={{ padding: '8px 0' }}>
      <h3 style={{ margin: '4px 0' }}>工单详情（子应用路由 /orders/:id）</h3>
      <p style={{ margin: '4px 0' }}>工单 ID：<code>{id}</code>；query 回显：<code>{queryEcho}</code></p>
      <div style={{ display: 'flex', gap: 8, margin: '8px 0', flexWrap: 'wrap' }}>
        <button onClick={handleBack}>返回列表（go(-1)）</button>
        <button onClick={handleLinkBack}>回列表（push /orders）</button>
      </div>
    </section>
  )
}
