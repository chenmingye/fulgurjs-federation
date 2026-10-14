import { createApp } from 'vue'
import { createMemoryHistory, createWebHistory, createRouter } from 'vue-router'
import { defineApplication } from '@fulgurjs/federation/vue'
import App from './App.vue'
import HomePage from './HomePage.vue'
import AboutPage from './AboutPage.vue'

export interface BridgeVueProps { label?: string; onReady?: () => void }

// 同一工厂服务独立调试和宿主桥接。这个基础模板没有启用宿主 URL 同步。
export default defineApplication<BridgeVueProps>((props, { mode }) => {
  const router = createRouter({
    history: mode === 'bridge' ? createMemoryHistory() : createWebHistory(import.meta.env.BASE_URL),
    routes: [{ path: '/', component: HomePage }, { path: '/about', component: AboutPage }],
  })
  const app = createApp(App, { ...props })
  // 不提前安装 router：独立 web 与本地 memory 都由统一入口安装/等待。
  return { app, router }
})
