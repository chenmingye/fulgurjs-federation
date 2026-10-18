/** 宿主装配入口：main 只调用 start；在这里连接本工程的路由与远程挂载，原业务页面仍在 pages/。 */
import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import { defineApplication } from '@fulgurjs/federation/vue'
import App from '../../App.vue'
import HomePage from '../../pages/HomePage.vue'
import AboutPage from '../../pages/AboutPage.vue'
import BridgeReactPage from './BridgeReactPage.vue'
import { initBridgeRouting } from './routing'
import { installGuard } from './guard'
import { installPopStateLogger } from './demo-log'

export default defineApplication((_props, { signal }) => {
  const router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes: [
      { path: '/', component: HomePage },
      { path: '/about', component: AboutPage },
      // catch-all：子应用挂载在 /br-react 前缀下，内部导航全部命中同一条路由记录
      { path: '/br-react/:pathMatch(.*)*', component: BridgeReactPage },
    ],
  })

  initBridgeRouting(router)
  installGuard(router)
  installPopStateLogger(signal)

  return { app: createApp(App), router }
})
