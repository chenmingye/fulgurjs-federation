import { createApp, h } from 'vue'
import { createRouter, createWebHistory, useRoute } from 'vue-router'
import { createHostPages } from '@fulgurjs/federation/runtime'
import App from './App.vue'
import HomePage from './pages/HomePage.vue'
import UtilsDemo from './pages/UtilsDemo.vue'
import { pages, remotePrefixes } from '../fulgurjs.config.ts'

// 页面适配器：URL 解析、最长前缀远程归属、异步组件缓存、
// 加载/错误占位（含「重试加载 / 刷新页面重试」）全部由插件完成。
const hostPages = createHostPages({
  pages,
  remotePrefixes,
})

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: HomePage },
    { path: '/utils-demo', component: UtilsDemo },
    {
      // 远程页面：spec 经 hostPages.component(spec) 取异步组件（spec = 远程名 + exposes 键）；
      // route.params + route.query 作为 props 透传给远程页面组件
      path: '/remote/home',
      component: { render: () => h(hostPages.component('vue-remote/pages/HomePage')) },
    },
    {
      path: '/remote/detail/:id',
      // params + query 全量透传给远程页面组件（响应式：路由变化即重渲染）
      component: {
        setup() {
          const route = useRoute()
          return () =>
            h(hostPages.component('vue-remote/pages/DetailPage'), {
              id: route.params.id as string,
              tab: (route.query.tab as string | undefined) ?? undefined,
            })
        },
      },
    },
  ],
})

createApp(App).use(router).mount('#app')
