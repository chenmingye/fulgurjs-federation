import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'
import PanelsPage from './pages/PanelsPage.vue'
import { hostPages } from './fulgurjs/host/pages'
import { provideDemoContext } from './fulgurjs/host/bridge'
import { pushTrace, registerTraceBridge } from './fulgurjs/host/trace'

registerTraceBridge()
// 登录代次：真实工程由登录流程生成；演示在启动时提供初值，让远程 setup/onSession 与
// requireAppContext 有完整 context 可读（时序契约 bridge → setup/onSession → 页面模块）。
provideDemoContext('s-demo-001')

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'Panels', component: PanelsPage },
    // 远程页面路由：同一份 hostPages 页面表注册（README 路径②）；
    // params + query 作为 props 全量透传给远程页面组件
    ...hostPages.pages.map((p) => ({
      path: p.route,
      name: String(p.name ?? p.route),
      props: (route: { params: Record<string, string>; query: Record<string, string> }) => ({
        ...route.params,
        ...route.query,
      }),
      component: hostPages.component(hostPages.resolve(p.route)!.spec),
    })),
  ],
})

router.beforeEach((to) => {
  const resolved = hostPages.resolve(to.path)
  pushTrace({
    source: 'host',
    label: resolved
      ? `路由进入 ${to.path} → ${resolved.spec}（最长前缀归属 ${resolved.remote}）`
      : `路由进入 ${to.path}（本地页面）`,
  })
})

createApp(App).use(router).mount('#app')
