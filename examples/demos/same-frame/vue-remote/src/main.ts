import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'
import { childRoutes } from './routes'
import './demo.css'

// 独立运行入口：单独开发/调试子应用自身（web history 便于直接浏览）。
// 被桥接宿主消费时走 ./bridge 契约（memory 路由），与本文件无关。
const router = createRouter({ history: createWebHistory(), routes: childRoutes })
createApp(App, { label: '独立运行态' }).use(router).mount('#app')
