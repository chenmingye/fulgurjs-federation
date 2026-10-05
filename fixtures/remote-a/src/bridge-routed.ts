/**
 * Vue 子应用路由同步桥接契约（fixtures/remote-a，URL 同步任务书 §3.2/§3.3）。
 * 受控路由 = createRouter(memory) + connectVueBridgeRouter；导航走 router.push
 * （RouterLink 等价真实入口）；工厂为异步形态——初始 push 落定后再 app.use(router)
 * （install 初始导航竞态防护，任务书 §1 原型结论 1）。
 */
import { createApp, defineComponent, h } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { defineBridgeApp } from '@fulgurjs/federation/vue'
import { connectVueBridgeRouter } from '@fulgurjs/federation/vue'

const List = defineComponent({
  setup() {
    // useRouter 必须在 setup 内捕获（组件上下文）；点击闭包引用捕获值
    const router = useRouter()
    return () =>
      h('div', { 'data-bridge-routed': 'remote-a' }, [
        h('p', { 'data-testid': 'routed-vue-page' }, 'vue-routed:/list'),
        h('button', { 'data-testid': 'routed-vue-link-detail', onClick: () => void router.push('/detail/456?src=link') }, '打开详情 456'),
        h('button', { 'data-testid': 'routed-vue-link-secret', onClick: () => void router.push('/secret') }, '机密页'),
      ])
  },
})

const Detail = defineComponent({
  setup() {
    const router = useRouter()
    const route = useRoute()
    return () =>
      h('div', { 'data-bridge-routed': 'remote-a' }, [
        h('p', { 'data-testid': 'routed-vue-page' }, `vue-routed:${route.fullPath}`),
        h('button', { 'data-testid': 'routed-vue-link-home', onClick: () => void router.push('/list') }, '回列表'),
      ])
  },
})

const Secret = defineComponent({
  setup() {
    return () => h('p', { 'data-testid': 'routed-vue-page' }, 'vue-routed:/secret（不应出现）')
  },
})

import { useRoute, useRouter } from 'vue-router'

export default defineBridgeApp(async (props, ctx) => {
  if (!ctx?.routing) {
    throw new Error('bridge-routed 契约需要宿主 routing 通道（mount 第三参数）')
  }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/list', component: List },
      { path: '/', component: List },
      { path: '/detail/:id', component: Detail },
      { path: '/secret', component: Secret },
    ],
  })
  const conn = connectVueBridgeRouter(ctx.routing, router, { signal: ctx.signal })
  await conn.ready
  const app = createApp({ setup: () => () => h(RouterView) }, props as Record<string, unknown>)
  app.use(router)
  ;(globalThis as any).__ROUTED_VUE_ROUTER__ = router
  ;(globalThis as any).__ROUTED_VUE_MOUNT_ERR__ = undefined
  app.config.errorHandler = (err) => {
    ;(globalThis as any).__ROUTED_VUE_MOUNT_ERR__ = String(err)
  }
  return app
}, { routing: true })
