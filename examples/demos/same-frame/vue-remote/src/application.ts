// 同一份装配：独立 web 路由 / 桥接本地 memory 路由，不启用宿主 URL 同步。
import { createApp } from 'vue'
import { createMemoryHistory, createWebHistory, createRouter } from 'vue-router'
import { defineApplication } from '@fulgurjs/federation/vue'
import App from './App.vue'
import { childRoutes } from './routes'
import './demo.css'

/** appProps：宿主传入的业务 props（label + 稳定回调 onReady/onGone，供宿主诊断计数）；
 * 普通 interface 无需额外索引签名。 */
export interface BridgeChildProps {
  label?: string
  onReady?: () => void
  onGone?: () => void
}

export default defineApplication<BridgeChildProps>((props, { mode }) => {
  const router = createRouter({
    // 子应用自持 memory 路由：不与宿主 URL 同步（README §8.2 默认形态；URL 同步见 §8.3）
    history: mode === 'bridge' ? createMemoryHistory() : createWebHistory(import.meta.env.BASE_URL),
    routes: childRoutes,
  })
  const app = createApp(App, { ...props })
  return { app, router }
})
