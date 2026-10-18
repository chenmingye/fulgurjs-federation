/** 宿主装配入口：main 只调用 start；在这里连接本工程的路由与远程挂载，原业务页面仍在 pages/。 */
import { createApp, h } from 'vue'
import { createRouter, createWebHistory, useRoute } from 'vue-router'
import { defineApplication, createHostPages } from '@fulgurjs/federation/vue'
import App from '../../App.vue'
import HomePage from '../../pages/HomePage.vue'
import UtilsDemo from '../../pages/UtilsDemo.vue'
import { pages, remotePrefixes } from '../../../fulgurjs.config.ts'

// 页面适配器：URL 解析、最长前缀远程归属、异步组件缓存、
// 加载/错误占位（含「重试加载 / 刷新页面重试」）全部由插件完成。
const hostPages = createHostPages({
  pages,
  remotePrefixes,
})

// 远程页面 Router 记录从页面表派生（route + spec 唯一来源 = fulgurjs.config.ts 的 pages；
// 业务自有路由仍归本 Router 管理——业务 Router 与联邦页面映射是两类事实）。
// 远程名按最长前缀从 remotePrefixes 解析（与运行时归属一致）；params + query 全量透传给
// 远程页面组件（响应式：路由变化即重渲染）。
const remoteNameOf = (route: string): string => {
  const prefix = Object.keys(remotePrefixes)
    .filter((p) => route === p || route.startsWith(p + '/') || route.startsWith(p))
    .sort((a, b) => b.length - a.length)[0]
  const name = prefix ? remotePrefixes[prefix] : undefined
  if (!name) throw new Error(`页面 ${route} 不匹配任何 remotePrefixes 前缀——请核对 fulgurjs.config.ts`)
  return name
}
const remoteRoutes = pages.map((page) => ({
  path: page.route,
  component: {
    setup() {
      const route = useRoute()
      return () =>
        h(hostPages.component(`${remoteNameOf(page.route)}/${page.spec}`), {
          ...route.params,
          ...route.query,
        })
    },
  },
}))

// 应用装配只写一次；每次 start 创建自己的 router。
export default defineApplication(() => {
  const router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes: [
      { path: '/', component: HomePage },
      { path: '/utils-demo', component: UtilsDemo },
      ...remoteRoutes,
    ],
  })

  return { app: createApp(App), router }
})
