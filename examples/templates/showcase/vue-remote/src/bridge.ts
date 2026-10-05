/**
 * examples/templates/showcase/vue-remote/src/bridge.ts — Vue 子应用桥接契约（exposes './bridge'）。
 * defineBridgeApp(factory, { routing: true }) 声明路由协议（缺失时宿主启用同步即 MFU-031 占位）。
 * 受控路由 = createMemoryHistory + connectVueBridgeRouter；工厂为异步形态——
 * 必须 await conn.ready 后再 app.use(router)（初始 push 落定后再 install）。
 */
import { createApp } from 'vue'
import { createMemoryHistory, createRouter, type RouteRecordRaw } from 'vue-router'
import { defineBridgeApp } from '@fulgurjs/federation/vue'
import { connectVueBridgeRouter } from '@fulgurjs/federation/vue'
import ChildLayout from './ChildLayout.vue'
import OrderList from './pages/OrderList.vue'
import OrderDetail from './pages/OrderDetail.vue'
import Settings from './pages/Settings.vue'
import Locked from './pages/Locked.vue'
import { bindReporter, reportNav } from './child-bus'

const routes: RouteRecordRaw[] = [
  // 根路径以 replace 规范化到 /orders（不产生额外历史条目）
  { path: '/', redirect: '/orders' },
  { path: '/orders', component: OrderList },
  { path: '/orders/:id', component: OrderDetail },
  { path: '/settings', component: Settings },
  { path: '/locked', component: Locked },
]

export default defineBridgeApp(async (props, ctx) => {
  if (!ctx?.routing) {
    throw new Error('本契约需要宿主启用 URL 同步（mount 第三参数 routing）')
  }
  bindReporter(props)
  const init = ctx.routing.getLocation()
  const initPath = init.pathname + init.search + init.hash
  const router = createRouter({ history: createMemoryHistory(), routes })
  const conn = connectVueBridgeRouter(ctx.routing, router, { signal: ctx.signal })
  await conn.ready
  const currentPath = router.currentRoute.value.fullPath
  reportNav(
    '子应用初始化',
    'init',
    currentPath !== initPath
      ? `根路径规范化 replace → ${currentPath}（无新增历史条目）`
      : `初始位置 → ${currentPath}（与宿主深链一致）`,
  )
  const app = createApp(ChildLayout, props)
  app.use(router)
  return app
}, { routing: true })
