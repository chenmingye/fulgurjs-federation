import { createElement } from 'react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'

// StrictMode：dev 下双 effect/双渲染检验（R02/R09 断言不因 StrictMode 关闭而通过）
// basename 跟随 vite base（dev 为根；prod 部署在 /host-react/ 子路径，避免双 base）
const basename = import.meta.env.BASE_URL === '/' ? undefined : import.meta.env.BASE_URL
createRoot(document.getElementById('root')!).render(
  createElement(StrictMode, null, createElement(BrowserRouter, { basename }, createElement(App))),
)
