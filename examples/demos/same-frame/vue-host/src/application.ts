import { createApp } from 'vue'
import { defineApplication } from '@fulgurjs/federation/vue'
import App from './App.vue'
import { createHostRouter } from './router'
import { installFulgurjsErrorListener } from './diagnostics'
import './demo.css'

// 真实错误事件日志来源：runtime 发出的 window 'fulgurjs:error' 事件（诊断面板消费）
installFulgurjsErrorListener()

export default defineApplication(() => ({ app: createApp(App), router: createHostRouter() }))
