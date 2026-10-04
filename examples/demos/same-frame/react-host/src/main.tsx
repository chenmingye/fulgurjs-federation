import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { installFulgurjsErrorListener } from './diagnostics'
import './demo.css'

// 真实错误事件日志来源：runtime 发出的 window 'fulgurjs:error' 事件（诊断面板消费）
installFulgurjsErrorListener()

// 不启用 StrictMode：让桥接 mount/unmount 计数与 Vue 宿主一一对应
// （StrictMode 双 effect 下计数按其语义各多一次；桥接契约对两种模式都安全）。
// BrowserRouter：宿主自己的路由（浏览器历史唯一写入方），子应用用 memory 路由互不干扰。
createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>,
)
