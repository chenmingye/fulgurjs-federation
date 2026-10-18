/** 应用装配入口：main 只调用 start；独立与嵌入复用本工厂，每次挂载的实例和清理由插件管理。 */
// 独立与桥接装配唯一入口；返回未安装的 app/router，交给插件等待与挂载。
import { createApp } from 'vue'
import { createMemoryHistory, createWebHistory, createRouter, type RouteRecordRaw } from 'vue-router'
import { defineApplication } from '@fulgurjs/federation/vue'
import ChildLayout from '../../ChildLayout.vue'
import OrderList from '../../pages/OrderList.vue'
import OrderDetail from '../../pages/OrderDetail.vue'
import Settings from '../../pages/Settings.vue'
import Locked from '../../pages/Locked.vue'
import { createChildReporter, childReporterKey, type ChildProps } from '../../child-bus'

const routes: RouteRecordRaw[] = [
  // 根路径以 replace 规范化到 /orders（不产生额外历史条目）
  { path: '/', redirect: '/orders' },
  { path: '/orders', component: OrderList },
  { path: '/orders/:id', component: OrderDetail },
  { path: '/settings', component: Settings },
  { path: '/locked', component: Locked },
]

export default defineApplication<ChildProps>((props, ctx) => {
  const reporter = createChildReporter(props, ctx.signal)
  // 初始位置先读快照（规范化 replace 后对比上报）
  const init = ctx?.routing?.getLocation()
  const initPath = init ? init.pathname + init.search + init.hash : ''
  const router = createRouter({ history: ctx.mode === 'bridge' ? createMemoryHistory() : createWebHistory(import.meta.env.BASE_URL), routes })
  const app = createApp(ChildLayout)
  app.provide(childReporterKey, reporter)
  // afterEach 记录初始导航结果；路由安装与连接清理由插件负责。
  let reported = false
  router.afterEach((to, _from, failure) => {
    if (reported || failure) return
    reported = true
    reporter.reportNav(
      '子应用初始化',
      'init',
      to.fullPath !== initPath
        ? `根路径规范化 replace → ${to.fullPath}（无新增历史条目）`
        : `初始位置 → ${to.fullPath}（与宿主深链一致）`,
    )
  })
  return { app, router }
}, { routing: true })
