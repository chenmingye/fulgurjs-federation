/** 宿主装配入口：main 只调用 start；在这里连接本工程的路由与远程挂载，原业务页面仍在 pages/。 */
import { createApp } from 'vue'
import { defineApplication } from '@fulgurjs/federation/vue'
import App from '../../App.vue'
import { createHostRouter } from '../../router'
import { installFulgurjsErrorListener } from '../../diagnostics'
import '../../demo.css'

// 真实错误事件日志来源：runtime 发出的 window 'fulgurjs:error' 事件（诊断面板消费）
installFulgurjsErrorListener()

export default defineApplication(() => ({ app: createApp(App), router: createHostRouter() }))
