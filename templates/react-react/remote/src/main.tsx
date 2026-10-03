import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

// 独立运行入口：单独开发/调试远程自身时使用。
// 被宿主消费时走的是 fulgurjs-remoteEntry.js 容器入口，与本文件无关。
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
