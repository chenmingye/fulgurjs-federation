/**
 * React-C 页面集：工单列表（筛选+分页，状态写入 URL query）、详情、设置表单、仪表盘。
 * 路由跳转全部使用 Link/useNavigate 真实入口（受控 memory data router）。
 */
import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'

export interface ShellProps {
  host?: string
  user?: string
  depth?: number
}

const ORDERS = Array.from({ length: 23 }, (_, i) => ({
  id: String(1001 + i),
  title: `工单 ${1001 + i}（${i % 3 === 0 ? '上海' : i % 3 === 1 ? '北京' : '广州'}）`,
  status: i % 3 === 0 ? '待处理' : i % 3 === 1 ? '进行中' : '已完成',
}))

function useTick() {
  const [t] = useState(() => new Date().toLocaleTimeString())
  return t
}

export function Dashboard(): React.ReactNode {
  const tick = useTick()
  return (
    <div data-testid="rc-page-dashboard">
      <h3>仪表盘（挂载于 {tick}）</h3>
      <p>卡片数据为演示内存数据；切走再切回（路由变化不重挂时）时间不变。</p>
      <ul>
        <li>今日工单：23</li>
        <li>待处理：8</li>
        <li>跨框架链路：宿主 → 本应用（depth 见宿主面板）</li>
      </ul>
      <Link to="/orders">前往工单列表 →</Link>
    </div>
  )
}

export function Orders(): React.ReactNode {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const page = Number(params.get('page') ?? '1')
  const size = 5
  const filtered = ORDERS.filter((o) => !q || o.title.includes(q))
  const maxPage = Math.max(1, Math.ceil(filtered.length / size))
  const cur = Math.min(Math.max(1, page), maxPage)
  const rows = filtered.slice((cur - 1) * size, cur * size)
  return (
    <div data-testid="rc-page-orders">
      <h3>工单列表</h3>
      <p>
        筛选（写入 ?q=，支持中文）：
        <input
          data-testid="rc-orders-q"
          value={q}
          onChange={(e) => setParams({ q: e.target.value, page: '1' })}
          placeholder="如：上海"
        />
      </p>
      <table border={1} cellPadding={6} style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr><th>编号</th><th>标题</th><th>状态</th><th></th></tr>
        </thead>
        <tbody>
          {rows.map((o) => (
            <tr key={o.id} data-testid="rc-order-row">
              <td>{o.id}</td>
              <td>{o.title}</td>
              <td>{o.status}</td>
              <td><Link to={`/orders/${o.id}`}>详情</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        <button data-testid="rc-orders-prev" disabled={cur <= 1} onClick={() => setParams({ q, page: String(cur - 1) })}>上一页</button>
        <span> 第 {cur} / {maxPage} 页 </span>
        <button data-testid="rc-orders-next" disabled={cur >= maxPage} onClick={() => setParams({ q, page: String(cur + 1) })}>下一页</button>
      </p>
      <p><Link to="/settings">前往设置表单 →</Link></p>
    </div>
  )
}

export function OrderDetail(): React.ReactNode {
  const { id } = useParams()
  const loc = useLocation()
  const order = ORDERS.find((o) => o.id === id)
  return (
    <div data-testid="rc-page-order-detail">
      <h3>工单详情 {id}{loc.search}{loc.hash}</h3>
      <p>{order ? `${order.title} · ${order.status}` : '未找到该工单（演示数据 1001-1023）'}</p>
      <p><Link to="/orders">← 返回列表（筛选与页码应保留）</Link></p>
    </div>
  )
}

export function Settings(): React.ReactNode {
  const [name, setName] = useState('默认策略')
  const [saved, setSaved] = useState('')
  return (
    <div data-testid="rc-page-settings">
      <h3>设置表单（本地状态跨路由保留验证点）</h3>
      <p>
        策略名：<input data-testid="rc-settings-name" value={name} onChange={(e) => setName(e.target.value)} />
        <button data-testid="rc-settings-save" onClick={() => setSaved(`已保存：${name} @ ${new Date().toLocaleTimeString()}`)}>保存</button>
        <button data-testid="rc-settings-cancel" onClick={() => setName('默认策略')}>取消</button>
      </p>
      <p data-testid="rc-settings-saved">{saved || '（未保存）'}</p>
      <p><Link to="/orders">← 返回列表再回来，输入应保留</Link></p>
    </div>
  )
}

export function NotFound(): React.ReactNode {
  const navigate = useNavigate()
  return (
    <div data-testid="rc-page-404">
      <p>页面不存在（子应用 404）</p>
      <button onClick={() => navigate('/orders')}>回工单列表</button>
    </div>
  )
}
