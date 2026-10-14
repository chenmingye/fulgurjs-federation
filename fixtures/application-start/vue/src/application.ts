import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createMemoryHistory, createWebHistory } from 'vue-router'
import { defineApplication, bindStoreToApp } from '@fulgurjs/federation/vue'
import App from './App.vue'
import Home from './Home.vue'
import Host from './Host.vue'
import About from './About.vue'
import { counterKey, counterDefinition } from './counter'

interface Props { label?: string }

// 每次启动/挂载都创建新 app、router、Pinia；业务装配只写在这一处。
export default defineApplication<Props>((props, { mode }) => {
  const router = createRouter({
    history: mode === 'bridge' ? createMemoryHistory() : createWebHistory(import.meta.env.BASE_URL),
    routes: [
      { path: '/', component: Home },
      { path: '/about', component: About },
      // 内层应用不再开放 /child，避免演示递归嵌套。
      ...(mode === 'standalone' ? [{ path: '/child/:pathMatch(.*)*', component: Host }] : []),
    ],
  })
  const app = createApp(App, { label: props.label ?? mode, mode })
  const pinia = createPinia()
  app.use(pinia)
  app.provide(counterKey, bindStoreToApp(counterDefinition, pinia))
  // 不提前 app.use(router)。独立模式等待 web 路由；桥接模式自动接线 memory 路由。
  return { app, router }
}, { routing: true })
