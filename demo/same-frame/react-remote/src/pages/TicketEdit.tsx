import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { STATUS_LABELS, getTicket, updateTicket, type TicketStatus } from '../store/tickets'

/**
 * 编辑表单：可编辑、取消/保存；保存更新本地内存数据后回详情（列表随之更新）。
 */
export default function TicketEdit() {
  const { id } = useParams()
  const navigate = useNavigate()
  const source = getTicket(Number(id))

  const [title, setTitle] = useState(source?.title ?? '')
  const [status, setStatus] = useState<string>(source?.status ?? 'open')
  const [assignee, setAssignee] = useState(source?.assignee ?? '')

  const handleCancel = (): void => {
    navigate(`/tickets/${id}`)
  }

  const handleSave = (): void => {
    updateTicket(Number(id), {
      title,
      status: status as TicketStatus,
      assignee,
    })
    navigate(`/tickets/${id}`)
  }

  if (!source) {
    return (
      <div className="sfc-page">
        <h3>工单不存在</h3>
        <p>无法编辑不存在的工单（id={id}）。</p>
      </div>
    )
  }

  return (
    <div className="sfc-page">
      <h3>编辑工单 #{source.id}</h3>
      <label className="sfc-field">标题 <input value={title} onChange={(e) => setTitle(e.target.value)} /></label>
      <label className="sfc-field">状态
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          {Object.entries(STATUS_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </label>
      <label className="sfc-field">负责人 <input value={assignee} onChange={(e) => setAssignee(e.target.value)} /></label>
      <p>
        <button className="sfc-btn-primary" onClick={handleSave}>保存</button>
        <button onClick={handleCancel}>取消</button>
      </p>
    </div>
  )
}
