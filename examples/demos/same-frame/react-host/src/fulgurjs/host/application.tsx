/** 宿主装配入口：main 只调用 start；在这里连接本工程的路由与远程挂载，原业务页面仍在 pages/。 */
import { defineApplication } from '@fulgurjs/federation/react'
import { BrowserRouter } from 'react-router-dom'
import App from '../../App'
import { installFulgurjsErrorListener } from '../../diagnostics'
import '../../demo.css'

// 真实错误事件日志来源：runtime 发出的 window 'fulgurjs:error' 事件（诊断面板消费）
installFulgurjsErrorListener()

// 不启用 StrictMode：让桥接 mount/unmount 计数与 Vue 宿主一一对应
// （StrictMode 双 effect 下计数按其语义各多一次；桥接契约对两种模式都安全）。
// BrowserRouter：宿主自己的路由（浏览器历史唯一写入方），子应用用 memory 路由互不干扰。
export default defineApplication(() => (
  <BrowserRouter basename={import.meta.env.BASE_URL}>
    <App />
  </BrowserRouter>
))
