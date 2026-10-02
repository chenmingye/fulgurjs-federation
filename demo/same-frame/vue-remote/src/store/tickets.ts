/**
 * 工单本地内存数据：子应用自包含状态（不依赖宿主 store/pinia）。
 * 模块级单例——桥接「卸载再挂载」后数据仍在（同一模块实例持续存活），
 * 用于演示应用级桥接下子应用状态的生命周期边界。真实数据，保存即更新。
 */
export type TicketStatus = 'open' | 'processing' | 'done'

export interface Ticket {
  id: number
  title: string
  status: TicketStatus
  assignee: string
  updatedAt: string
}

export const STATUS_LABELS: Record<TicketStatus, string> = {
  open: '待处理',
  processing: '进行中',
  done: '已完成',
}

const tickets: Ticket[] = [
  { id: 101, title: '登录页验证码不显示', status: 'open', assignee: '张伟', updatedAt: '2026-09-28 10:20' },
  { id: 102, title: '订单导出缺少物流单号列', status: 'processing', assignee: '李娜', updatedAt: '2026-09-29 14:05' },
  { id: 103, title: '报表中心夜间任务超时', status: 'processing', assignee: '王强', updatedAt: '2026-09-29 18:40' },
  { id: 104, title: '移动端白屏（iOS 16）', status: 'open', assignee: '赵敏', updatedAt: '2026-09-30 09:12' },
  { id: 105, title: '权限树勾选状态不回显', status: 'done', assignee: '张伟', updatedAt: '2026-09-26 16:30' },
  { id: 106, title: '批量删除后分页未刷新', status: 'open', assignee: '李娜', updatedAt: '2026-09-30 11:47' },
  { id: 107, title: '接口 502：字典服务抖动', status: 'done', assignee: '王强', updatedAt: '2026-09-25 13:00' },
  { id: 108, title: '文件预览不支持 OFD 格式', status: 'processing', assignee: '赵敏', updatedAt: '2026-09-30 15:22' },
  { id: 109, title: '首页性能劣化（LCP > 4s）', status: 'open', assignee: '张伟', updatedAt: '2026-10-01 08:55' },
]

function nowLabel(): string {
  const d = new Date()
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export function listTickets(): Ticket[] {
  return tickets
}

export function getTicket(id: number): Ticket | undefined {
  return tickets.find((t) => t.id === id)
}

export function updateTicket(id: number, patch: Partial<Omit<Ticket, 'id'>>): Ticket | undefined {
  const target = tickets.find((t) => t.id === id)
  if (!target) return undefined
  Object.assign(target, patch, { updatedAt: nowLabel() })
  return target
}
