import { Link, useNavigate, useParams } from 'react-router-dom'
import { STATUS_LABELS, getTicket } from '../store/tickets'

/**
 * 工单详情：路由参数 :id 来自子应用 memory 路由（不落宿主 URL）。
 */
export default function TicketDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const ticket = getTicket(Number(id))

  if (!ticket) {
    return (
      <div className="sfc-page">
        <h3>工单不存在</h3>
        <p>路由参数 id={id} 没有对应的本地工单数据。</p>
        <Link className="sfc-link" to="/tickets">返回列表</Link>
      </div>
    )
  }

  return (
    <div className="sfc-page">
      <h3>工单详情 #{ticket.id}</h3>
      <p><b>标题：</b>{ticket.title}</p>
      <p><b>状态：</b>{STATUS_LABELS[ticket.status]}</p>
      <p><b>负责人：</b>{ticket.assignee}</p>
      <p><b>更新时间：</b>{ticket.updatedAt}</p>
      <p>
        <button onClick={() => navigate(`/tickets/${ticket.id}/edit`)}>编辑</button>
        <Link className="sfc-link" to="/tickets">返回列表</Link>
      </p>
    </div>
  )
}
