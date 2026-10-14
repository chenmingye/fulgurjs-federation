/** 普通业务路由表；application 工厂按运行模式创建自己的 router。 */
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
