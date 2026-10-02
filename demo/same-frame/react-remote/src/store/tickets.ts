/**
 * 工单本地内存数据：子应用自包含状态（不依赖宿主 store）。
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
  { id: 201, title: '审批流节点跳转丢失上下文', status: 'open', assignee: '陈晨', updatedAt: '2026-09-28 09:30' },
  { id: 202, title: '消息中心未读数不归零', status: 'processing', assignee: '周洁', updatedAt: '2026-09-29 11:15' },
  { id: 203, title: '组织架构树搜索无防抖', status: 'processing', assignee: '吴磊', updatedAt: '2026-09-29 16:48' },
  { id: 204, title: '打印模板边距溢出', status: 'open', assignee: '陈晨', updatedAt: '2026-09-30 10:02' },
  { id: 205, title: '数据大屏轮播卡顿', status: 'done', assignee: '周洁', updatedAt: '2026-09-26 17:20' },
  { id: 206, title: '导入模板缺少示例行', status: 'open', assignee: '吴磊', updatedAt: '2026-09-30 13:36' },
  { id: 207, title: '定时任务重复触发', status: 'done', assignee: '陈晨', updatedAt: '2026-09-25 15:10' },
  { id: 208, title: '附件上传进度条不动', status: 'processing', assignee: '周洁', updatedAt: '2026-09-30 17:44' },
  { id: 209, title: '仪表盘指标口径不一致', status: 'open', assignee: '吴磊', updatedAt: '2026-10-01 09:05' },
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
