/**
 * demo/bridge-router/react-remote/src/pages/OrderList.tsx — 工单列表页（筛选 + 分页）。
 * 筛选关键词与页码写入子应用路由 query（q=xxx&page=n，中文可输入），
 * 经桥接通道同步到宿主 URL；跳详情再返回时组件重建、状态从 query 还原。
 */
import { useMemo, useState } from 'react'
import type { ChangeEvent, ReactElement } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { reportNav } from '../child-bus'

interface OrderItem {
  id: number
  title: string
}

const ORDERS: OrderItem[] = [
  { id: 1, title: '登录异常排查' },
  { id: 2, title: '网络抖动投诉' },
  { id: 3, title: '权限配置变更' },
  { id: 4, title: '数据导出失败' },
  { id: 5, title: '消息推送延迟' },
  { id: 6, title: '账单核对差异' },
  { id: 7, title: '接口超时告警' },
  { id: 8, title: '存储扩容申请' },
]
const PAGE_SIZE = 3

export default function OrderList(): ReactElement {
  const location = useLocation()
  const navigate = useNavigate()
  const search = new URLSearchParams(location.search)
  const q = search.get('q') ?? ''
  const pageRaw = Number.parseInt(search.get('page') ?? '1', 10)
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1
  const [qInput, setQInput] = useState(q)

  const filtered = useMemo(
    () => (q === '' ? ORDERS : ORDERS.filter((item) => item.title.includes(q))),
    [q],
  )
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const buildTarget = (qValue: string, pageValue: number): string =>
    `/orders?page=${pageValue}${qValue === '' ? '' : `&q=${encodeURIComponent(qValue)}`}`

  const handleQInputChange = (event: ChangeEvent<HTMLInputElement>): void => {
    setQInput(event.target.value)
  }

  const handleSearch = (): void => {
    const target = buildTarget(qInput.trim(), 1)
    reportNav('子应用 push/replace', 'push', target)
    void navigate(target)
  }

  const handlePageStep = (delta: number): void => {
    const next = Math.min(totalPages, Math.max(1, page + delta))
    if (next === page) return
    const target = buildTarget(q, next)
    reportNav('子应用 push/replace', 'push', target)
    void navigate(target)
  }

  const handleOpenDetail = (item: OrderItem): void => {
    reportNav('子应用 Link', 'push', `/orders/${item.id}?src=row`)
    void navigate(`/orders/${item.id}?src=row`)
  }

  const handleGoSettings = (): void => {
    reportNav('子应用 Link', 'push', '/settings')
    void navigate('/settings')
  }

  const handleGoLocked = (): void => {
    reportNav('子应用 Link', 'push', '/locked')
    void navigate('/locked')
  }

  return (
    <section style={{ padding: '8px 0' }}>
      <h3 style={{ margin: '4px 0' }}>工单列表（子应用路由 /orders）</h3>
      <p style={{ color: '#666', fontSize: 13, margin: '4px 0' }}>
        当前筛选：q={q === '' ? '（空）' : q}，页码：{page}/{totalPages}（来自子应用路由 query）
      </p>
      <div style={{ display: 'flex', gap: 8, margin: '8px 0', flexWrap: 'wrap' }}>
        <input value={qInput} onChange={handleQInputChange} placeholder="输入筛选关键词（支持中文，如：网络）" aria-label="筛选关键词" />
        <button onClick={handleSearch}>筛选（push ?q=&amp;page=1）</button>
      </div>
      <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0' }}>
        {pageItems.map((item) => (
          <li key={item.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '4px 0' }}>
            <span>#{item.id} {item.title}</span>
            <button onClick={() => handleOpenDetail(item)}>查看详情</button>
          </li>
        ))}
        {pageItems.length === 0 && <li style={{ color: '#666' }}>无匹配工单</li>}
      </ul>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '8px 0' }}>
        <button disabled={page <= 1} onClick={() => handlePageStep(-1)}>上一页</button>
        <span>第 {page} / {totalPages} 页</span>
        <button disabled={page >= totalPages} onClick={() => handlePageStep(1)}>下一页</button>
      </div>
      <div style={{ display: 'flex', gap: 8, margin: '8px 0', flexWrap: 'wrap' }}>
        <button onClick={handleGoSettings}>前往设置页</button>
        <button onClick={handleGoLocked}>锁定页（触发宿主守卫）</button>
      </div>
    </section>
  )
}
