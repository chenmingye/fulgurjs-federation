/**
 * examples/templates/showcase/vue-host/src/main.ts — 宿主入口。
 * 宿主 Router 是浏览器历史唯一写入方；catch-all 路由（/br-react/* 单条记录渲染同一组件）
 * 保证子应用内部导航不重挂宿主组件。守卫与 POP 日志在此一次性安装。
 */
import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'
import HomePage from './pages/HomePage.vue'
import AboutPage from './pages/AboutPage.vue'
import BridgeReactPage from './pages/BridgeReactPage.vue'
import { initBridgeRouting } from './routing'
import { installGuard } from './guard'
import { installPopStateLogger } from './demo-log'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: HomePage },
    { path: '/about', component: AboutPage },
    // catch-all：子应用挂载在 /br-react 前缀下，内部导航全部命中同一条路由记录
    { path: '/br-react/:pathMatch(.*)*', component: BridgeReactPage },
  ],
})

initBridgeRouting(router)
installGuard(router)
installPopStateLogger()

createApp(App).use(router).mount('#app')
