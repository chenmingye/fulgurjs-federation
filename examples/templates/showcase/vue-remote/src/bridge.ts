/**
 * examples/templates/showcase/vue-remote/src/bridge.ts — Vue 子应用桥接契约（exposes './bridge'）。
 * defineBridgeApp(factory, { routing: true }) 声明路由协议（缺失时宿主启用同步即 MFU-031 占位）。
 * 返回 { app, router }，插件等待初始位置、安装路由、挂载并在卸载时释放连接。
 */
import { createApp } from 'vue'
import { createMemoryHistory, createRouter, type RouteRecordRaw } from 'vue-router'
import { defineBridgeApp } from '@fulgurjs/federation/vue'
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

export default defineBridgeApp((props, ctx) => {
  bindReporter(props)
  // 初始位置先读快照（规范化 replace 后对比上报）
  const init = ctx?.routing?.getLocation()
  const initPath = init ? init.pathname + init.search + init.hash : ''
  const router = createRouter({ history: createMemoryHistory(), routes })
  const app = createApp(ChildLayout, props)
  // afterEach 记录初始导航结果；路由安装与连接清理由插件负责。
  let reported = false
  router.afterEach((to, _from, failure) => {
    if (reported || failure) return
    reported = true
    reportNav(
      '子应用初始化',
      'init',
      to.fullPath !== initPath
        ? `根路径规范化 replace → ${to.fullPath}（无新增历史条目）`
        : `初始位置 → ${to.fullPath}（与宿主深链一致）`,
    )
  })
  return { app, router }
}, { routing: true })
