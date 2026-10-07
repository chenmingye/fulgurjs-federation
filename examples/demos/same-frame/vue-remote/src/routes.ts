/**
 * 子应用内部路由表（memory history 由各工厂调用创建，路由表共用）。
 * 独立抽出的原因：main.ts（独立运行壳）与 bridge.ts（桥接契约）都要用这份表；
 * 若从 bridge.ts 导入，prod 构建会把 expose 实现并进独立壳的 entry chunk，
 * 宿主加载桥接时连带执行 main.ts 的顶层副作用（createWebHistory + mount）。
 */
import type { RouteRecordRaw } from 'vue-router'
import TicketList from './pages/TicketList.vue'
import RemoteForm from './pages/RemoteForm.vue'
import TicketDetail from './pages/TicketDetail.vue'
import TicketEdit from './pages/TicketEdit.vue'

/** 子应用内部路由（memory history 由各工厂调用创建，路由表共用） */
export const childRoutes: RouteRecordRaw[] = [
  { path: '/', redirect: '/tickets' },
  { path: '/tickets', component: TicketList },
  { path: '/tickets/:id', component: TicketDetail, props: true },
  { path: '/tickets/:id/edit', component: TicketEdit, props: true },
  { path: '/remote-form', component: RemoteForm },
  { path: '/remote-form/:id', component: RemoteForm, props: false },
  { path: '/:pathMatch(.*)*', redirect: '/tickets' },
]
