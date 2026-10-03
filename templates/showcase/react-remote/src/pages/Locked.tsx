/**
 * demo/bridge-router/react-remote/src/pages/Locked.tsx — 锁定页（守卫放行后才可见）。
 * 前往本页的导航会被宿主守卫（Vue：异步 beforeEach；React：useBlocker）拦截，等待「继续/取消」。
 */
import type { ReactElement } from 'react'
import { Link } from 'react-router-dom'
import { reportNav } from '../child-bus'

export default function Locked(): ReactElement {
  const handleBack = (): void => {
    reportNav('子应用 Link', 'push', '/orders')
  }

  return (
    <section style={{ padding: '8px 0' }}>
      <h3 style={{ margin: '4px 0' }}>锁定页（子应用路由 /locked）</h3>
      <p style={{ margin: '4px 0' }}>你能看到本页，说明宿主守卫选择了「继续」。</p>
      <p style={{ margin: '4px 0' }}>
        <Link to="/orders" onClick={handleBack}>回工单列表</Link>
      </p>
    </section>
  )
}
