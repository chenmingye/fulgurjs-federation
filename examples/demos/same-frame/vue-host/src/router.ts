import { createRouter, createWebHistory } from 'vue-router'
import ComponentLevelPage from './pages/ComponentLevelPage.vue'
import AppBridgePage from './pages/AppBridgePage.vue'
import ComparePage from './pages/ComparePage.vue'

/** 宿主自己的 vue-router（history 模式）：宿主 URL 是浏览器历史唯一写入方 */
export const createHostRouter = () => createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', redirect: '/component-level' },
    { path: '/component-level', name: 'component-level', component: ComponentLevelPage },
    { path: '/app-bridge', name: 'app-bridge', component: AppBridgePage },
    { path: '/compare', name: 'compare', component: ComparePage },
  ],
})
