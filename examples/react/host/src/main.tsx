import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Link, Route, Routes, useParams, useSearchParams } from 'react-router-dom'
import App from './App'
import UtilsDemo from './pages/UtilsDemo'
import { RemoteHomePage, RemoteDetailPage } from './remotePages'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <nav style={{ display: 'flex', gap: 16, padding: 16, fontFamily: 'sans-serif' }}>
        <Link to="/">首页</Link>
        <Link to="/remote/home">远程首页</Link>
        <Link to="/remote/detail/7?tab=basic">远程详情（id=7）</Link>
        <Link to="/utils-demo">TS 模块调用</Link>
      </nav>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/utils-demo" element={<UtilsDemo />} />
        <Route path="/remote/home" element={<RemoteHomePage />} />
        {/* 远程参数页：params + query 全量透传给远程页面组件 */}
        <Route path="/remote/detail/:id" element={<RemoteDetailRoute />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)

/** 从 react-router 取 params/query 再交给页面适配器组件（适配器与路由库解耦） */
function RemoteDetailRoute() {
  const { id } = useParams()
  const [search] = useSearchParams()
  return <RemoteDetailPage id={id} tab={search.get('tab') ?? undefined} />
}
