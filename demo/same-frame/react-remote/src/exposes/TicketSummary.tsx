import { useState } from 'react'
import { listTickets } from '../store/tickets'
import '../demo.css'

/**
 * 组件级暴露（对比项）：宿主用 remoteComponent 直渲染的单个远程组件。
 * 刻意不带路由/会话语义——统计只反映本模块自身的数据，无 AppContext 协议，
 * 与「应用级桥接」（完整子应用 + 受控会话）形成对照。
 */
export default function TicketSummary({ title }: { title?: string }) {
  const [clicks, setClicks] = useState(0)
  const all = listTickets()
  const stats = {
    total: all.length,
    open: all.filter((t) => t.status === 'open').length,
    processing: all.filter((t) => t.status === 'processing').length,
    done: all.filter((t) => t.status === 'done').length,
  }

  return (
    <div className="sfc-summary">
      <p className="sfc-summary-title">{title || '工单概览（远程组件直渲染）'}</p>
      <p className="sfc-summary-line">
        {`总数 ${stats.total} · 待处理 ${stats.open} · 进行中 ${stats.processing} · 已完成 ${stats.done}`}
      </p>
      <p>
        <button onClick={() => setClicks((c) => c + 1)}>远程组件内交互：{clicks}</button>
        <span className="sfc-summary-note">来源：sf-react-remote/components/TicketSummary（无路由、无 AppContext）</span>
      </p>
    </div>
  )
}
