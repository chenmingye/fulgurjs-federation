/**
 * examples/templates/showcase/react-host/src/Layout.tsx — 宿主根布局：顶部导航 + 守卫横幅 + Outlet。
 * 「工单列表 / 设置」是直接跳子应用深链的菜单项：宿主 navigate 到 basePath 下的路径。
 */
import { Outlet, useNavigate } from 'react-router-dom'
import type { ReactElement } from 'react'
import GuardBanner from './GuardBanner'
import { logNav } from './demo-log'

interface MenuItem {
  label: string
  path: string
}

const MENUS: MenuItem[] = [
  { label: '首页', path: '/' },
  { label: '关于', path: '/about' },
  { label: '桥接演示页', path: '/br-vue' },
  { label: '工单列表', path: '/br-vue/orders' },
  { label: '设置', path: '/br-vue/settings' },
]

export default function Layout(): ReactElement {
  const navigate = useNavigate()

  const handleMenu = (item: MenuItem): void => {
    logNav('宿主菜单', `push ${item.path}`)
    void navigate(item.path)
  }

  return (
    <div style={{ padding: 12, maxWidth: 960, margin: '0 auto', fontFamily: "'PingFang SC', 'Microsoft YaHei', sans-serif" }}>
      <GuardBanner />
      <nav aria-label="宿主导航" style={{ display: 'flex', gap: 8, padding: '8px 0', borderBottom: '1px solid #ddd', marginBottom: 12, flexWrap: 'wrap' }}>
        {MENUS.map((item) => (
          <button key={item.path} onClick={() => handleMenu(item)}>{item.label}</button>
        ))}
      </nav>
      <Outlet />
    </div>
  )
}
