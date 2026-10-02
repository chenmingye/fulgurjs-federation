import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { STATUS_LABELS, listTickets, type TicketStatus } from '../store/tickets'

const STATUS_OPTIONS: Array<{ value: 'all' | TicketStatus; label: string }> = [
  { value: 'all', label: '全部状态' },
  { value: 'open', label: STATUS_LABELS.open },
  { value: 'processing', label: STATUS_LABELS.processing },
  { value: 'done', label: STATUS_LABELS.done },
]

const PAGE_SIZE = 4

/**
 * 工单列表：本地内存数据 + 状态筛选 + 关键字过滤 + 客户端分页。
 * 路由由子应用自持（createMemoryRouter，不落宿主 URL）；编辑保存后回到本页数据即更新。
 */
export default function TicketList() {
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState<'all' | TicketStatus>('all')
  const [page, setPage] = useState(1)

  const filtered = useMemo(() => {
    const kw = keyword.trim()
    return listTickets().filter((t) => {
      const hitStatus = status === 'all' || t.status === status
      const hitKeyword = kw === '' || t.title.includes(kw)
      return hitStatus && hitKeyword
    })
  }, [keyword, status])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const handleKeywordChange = (value: string): void => {
    setKeyword(value)
    setPage(1)
  }

  const handleStatusChange = (value: string): void => {
    setStatus(value as 'all' | TicketStatus)
    setPage(1)
  }

  return (
    <div className="sfc-page">
      <h3>工单列表</h3>
      <div className="sfc-toolbar">
        <input value={keyword} placeholder="按标题搜索" onChange={(e) => handleKeywordChange(e.target.value)} />
        <select value={status} onChange={(e) => handleStatusChange(e.target.value)}>
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <span>共 {filtered.length} 条</span>
      </div>
      <table className="sfc-table">
        <thead>
          <tr><th>ID</th><th>标题</th><th>状态</th><th>负责人</th><th>更新时间</th></tr>
        </thead>
        <tbody>
          {paged.map((t) => (
            <tr key={t.id}>
              <td>{t.id}</td>
              <td><Link to={`/tickets/${t.id}`}>{t.title}</Link></td>
              <td>{STATUS_LABELS[t.status]}</td>
              <td>{t.assignee}</td>
              <td>{t.updatedAt}</td>
            </tr>
          ))}
          {paged.length === 0 ? (
            <tr><td colSpan={5}>无匹配工单</td></tr>
          ) : null}
        </tbody>
      </table>
      <div className="sfc-pager">
        <button disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</button>
        <span>第 {page} / {totalPages} 页</span>
        <button disabled={page >= totalPages} onClick={() => setPage(page + 1)}>下一页</button>
      </div>
    </div>
  )
}
