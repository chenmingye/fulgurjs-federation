/**
 * 同框架 Vue 子应用桥接契约（expose './bridge' 的默认导出，README §8.2）。
 *
 * defineBridgeApp 工厂接收 appProps 快照，创建 app + 自包含 memory 路由，
 * app.use(router) 后返回装配完整的 VueApp——挂载/卸载与按容器 el 跟踪由契约负责。
 * 每次挂载都新建 app 与 router 实例：不注册任何全局组件/插件到共享实例，
 * 子应用一切注册都发生在这个新 app 上（控制台纪律：无重复注册警告）。
 */
import { createApp } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { defineBridgeApp } from '@fulgurjs/federation/vue'
import App from './App.vue'
import { childRoutes } from './routes'
import './demo.css'

/** appProps：宿主传入的业务 props（label + 稳定回调 onReady/onGone，供宿主诊断计数）；
 * 索引签名用于满足 createApp 根 props 的 Data 形状 */
export interface BridgeChildProps {
  label?: string
  onReady?: () => void
  onGone?: () => void
  [key: string]: unknown
}

export default defineBridgeApp((props) => {
  const childProps = props as BridgeChildProps
  const router = createRouter({
    // 子应用自持 memory 路由：不与宿主 URL 同步（README §8.2 默认形态；URL 同步见 §8.3）
    history: createMemoryHistory(),
    routes: childRoutes,
  })
  const app = createApp(App, childProps)
  app.use(router)
  return app
})
