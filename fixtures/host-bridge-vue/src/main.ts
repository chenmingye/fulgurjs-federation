/**
 * host-bridge-vue 入口：vue-router 4（history 模式）承载两层——
 * '/' 为既有桥接交互页（既有 e2e 口径不变）；'/approval/*' 为 URL 同步路由页。
 * Vite base（import.meta.env.BASE_URL）与 bridge basePath 分层：前者进 Router base，
 * 后者由 routing prop 声明，不重复拼前缀（任务书 §2.3）。
 */
import { createApp, defineComponent, h } from 'vue'
import { createRouter, createWebHistory, RouterView, type RouteRecordRaw } from 'vue-router'
import App from './App.vue'
import RoutedApproval from './RoutedApproval.vue'

/** 根布局：只承载 RouterView（'/' 原页面 / '/approval/*' 路由页） */
const Layout = defineComponent({ setup: () => () => h(RouterView) })

/** 全局注册表（RoutedApproval 取端口用；main 是唯一组装点） */
const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', component: App },
    { path: '/approval/:pathMatch(.*)*', component: RoutedApproval },
    // fixture 宿主 404 策略：未知路径回宿主首页（U17b 断言宿主页可见）
    { path: '/:pathMatch(.*)*', component: App },
  ] as RouteRecordRaw[],
})

// 真实权限守卫：/approval/secret 一律拒绝（导航落定 NavigationFailure → cancelled）
router.beforeEach((to) => {
  ;(globalThis as any).__ROUTED_GUARD_CALLS__ = [...((globalThis as any).__ROUTED_GUARD_CALLS__ ?? []), to.fullPath]
  if (to.path.startsWith('/approval/secret')) return false
})
;(globalThis as any).__HOST_ROUTER__ = router

createApp(Layout).use(router).mount('#app')
