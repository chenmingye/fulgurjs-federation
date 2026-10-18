/** 应用装配入口：main 只调用 start；独立与嵌入复用本工厂，每次挂载的实例和清理由插件管理。 */
import { StrictMode } from 'react'
import { defineApplication } from '@fulgurjs/federation/react'
import App from '../../App'

// 独立运行入口：单独开发/调试远程自身时使用。
// 被宿主消费时走的是 fulgurjs-remoteEntry.js 容器入口，与本文件无关。
export default defineApplication(() => (
  <StrictMode>
    <App />
  </StrictMode>
))
