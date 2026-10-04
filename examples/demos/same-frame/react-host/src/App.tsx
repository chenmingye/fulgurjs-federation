import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import IdentityBadges from './components/IdentityBadges'
import ComponentLevelPage from './pages/ComponentLevelPage'
import AppBridgePage from './pages/AppBridgePage'
import ComparePage from './pages/ComparePage'

/**
 * 宿主布局：标题 + 身份徽标（宿主/远程/runtime version）+ 左侧菜单 + 内容区。
 * 子应用身份徽标由子应用自身渲染（被桥接挂载时显示在内容区容器内）。
 */
export default function App() {
  return (
    <div className="sfh-layout">
      <header className="sfh-header">
        <h1>same-frame react-host · 同框架完整子应用桥接（React 宿主）</h1>
        <IdentityBadges hostName="sf-react-host" framework="React" />
      </header>
      <div className="sfh-body">
        <aside className="sfh-menu">
          <NavLink to="/component-level">页面1 · 组件级联邦</NavLink>
          <NavLink to="/app-bridge">页面2 · 应用级桥接</NavLink>
          <NavLink to="/compare">页面3 · 对比说明</NavLink>
        </aside>
        <main className="sfh-main">
          <Routes>
            <Route path="/" element={<Navigate to="/component-level" replace />} />
            <Route path="/component-level" element={<ComponentLevelPage />} />
            <Route path="/app-bridge" element={<AppBridgePage />} />
            <Route path="/compare" element={<ComparePage />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}
