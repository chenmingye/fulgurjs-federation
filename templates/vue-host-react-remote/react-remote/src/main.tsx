import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './bridge'

// 独立运行入口：单独开发/调试子应用自身时使用。
// 被桥接宿主消费时走 fulgurjs-remoteEntry.js 容器入口与 ./bridge 契约，与本文件无关。
createRoot(document.getElementById('root')!).render(createElement(App))
