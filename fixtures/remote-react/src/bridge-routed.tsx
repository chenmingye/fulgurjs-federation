/**
 * React 子应用路由同步桥接契约（fixtures/remote-react，URL 同步任务书 §3.2/§3.3）。
 * 宿主启用 routing 时经 loadRemote('remote-react/bridge-routed') 取本模块。
 * 受控路由 = createReactBridgeRouter（RR memory data router）；导航全部走
 * Link/useNavigate 真实入口；宿主取消时回滚最后确认位置。
 */
import { Link, useLocation, useParams } from 'react-router-dom'
import { defineBridgeApp } from '@fulgurjs/federation/react'
import { createReactBridgeRouter } from '@fulgurjs/federation/bridge/router/react'

function List(): React.ReactNode {
  return (
    <div data-bridge-routed="remote-react">
      <p data-testid="routed-react-page">react-routed:/list</p>
      <Link data-testid="routed-react-link-detail" to="/detail/456?src=link">打开详情 456</Link>
      <br />
      <Link data-testid="routed-react-link-secret" to="/secret">机密页</Link>
    </div>
  )
}

function Detail(): React.ReactNode {
  const { id } = useParams()
  const loc = useLocation()
  return (
    <div data-bridge-routed="remote-react">
      <p data-testid="routed-react-page">react-routed:/detail/{id}{loc.search}{loc.hash}</p>
      <Link data-testid="routed-react-link-home" to="/list">回列表</Link>
    </div>
  )
}

function Secret(): React.ReactNode {
  return (
    <div data-bridge-routed="remote-react">
      <p data-testid="routed-react-page">react-routed:/secret（不应出现）</p>
    </div>
  )
}

export default defineBridgeApp((_props, ctx) => {
  if (!ctx?.routing) {
    // 宿主未启用 URL 同步却挂了 routed 契约：测试面显式失败，不静默 memory
    throw new Error('bridge-routed 契约需要宿主 routing 通道（mount 第三参数）')
  }
  const conn = createReactBridgeRouter(ctx.routing, [
    { path: '/list', element: <List /> },
    { path: '/', element: <List /> },
    { path: '/detail/:id', element: <Detail /> },
    { path: '/secret', element: <Secret /> },
  ], { signal: ctx.signal })
  ;(globalThis as any).__ROUTED_REACT_ROUTER__ = (conn.element.props as any).router
  return conn.element
}, { routing: true })
