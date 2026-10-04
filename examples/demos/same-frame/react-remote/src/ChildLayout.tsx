import { useEffect } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { getAppContext } from '@fulgurjs/federation/react'
import type { AppContext } from '@fulgurjs/federation/react'
import { useBridgeProps } from './bridge'

/**
 * 读取宿主会话信息（AppContext 快照；仅在被宿主桥接挂载时存在）。
 * 独立直开子应用页面时无宿主运行时——预期降级，不产生控制台错误。
 */
function readSessionInfo(): string {
  try {
    const ctx = getAppContext() as Partial<AppContext>
    const user = ctx.user as { name?: string } | undefined
    if (ctx.sessionKey) return `宿主会话 ${ctx.sessionKey} · 用户 ${user?.name ?? '—'}`
  } catch {
    /* 独立运行：无宿主运行时，属预期降级 */
  }
  return '独立运行（无 AppContext）'
}

/**
 * 子应用布局：身份栏（容器名 + 框架 + 当前内部路由 + 宿主会话）+ 内部导航 + Outlet。
 * onReady/onGone 在本组件挂载/卸载生命周期边界触发一次，宿主据此推进真实计数。
 */
export default function ChildLayout() {
  const props = useBridgeProps()
  const location = useLocation()

  useEffect(() => {
    props.onReady?.()
    return () => {
      props.onGone?.()
    }
    // 挂载/卸载回调只在每次桥接挂载的生命周期边界触发一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="sfc-child-app">
      <div className="sfc-bar">
        <span className="sfc-badge sfc-badge-child">子应用 sf-react-remote</span>
        <span className="sfc-badge">框架 React</span>
        <span className="sfc-badge">内部路由 {location.pathname}</span>
        <span className="sfc-badge sfc-badge-session" data-testid="child-session">{readSessionInfo()}</span>
      </div>
      {props.label ? <p className="sfc-child-label">{props.label}</p> : null}
      <nav className="sfc-nav">
        <Link to="/tickets">工单列表</Link>
      </nav>
      <Outlet />
    </div>
  )
}
