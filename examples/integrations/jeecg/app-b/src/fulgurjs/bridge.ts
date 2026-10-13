/**
 * Jeecg-B 桥接契约（./bridge expose 的默认导出）。
 *
 * 复用 JeecgBoot 官方 bootstrap 的装配序列（src/main.ts），差异点：
 * - 路由用 createMemoryHistory（受控 memory 路由），经 installVueBridgeRouter 接入
 *   宿主导航端口（connect → ready → install 顺序由插件承担）。
 * - 独立 Pinia 实例（createAppStore）+ setActivePinia，保证与宿主实例状态隔离。
 * - token/用户由宿主 appProps 传入（props.ts 中转），权限守卫照常工作（mock 数据层）。
 * - 挂载由桥接契约负责（本工厂只装配返回 VueApp）；unmount 清理参照官方
 *   qiankunMicro 模式（destroyRouter/destroyStore/clearComponent 由契约统一调度）。
 */
import { createApp } from 'vue'
import { createMemoryHistory } from 'vue-router'
import { setActivePinia } from 'pinia'
import { defineBridgeApp } from '@fulgurjs/federation/vue'
import { installVueBridgeRouter } from '@fulgurjs/federation/vue'

import 'uno.css'
import '/@/design/index.less'
import 'ant-design-vue/dist/reset.css'
import 'virtual:svg-icons-register'

import App from '/@/App.vue'
import { createAppStore, setupStore } from '/@/store'
import { createRouter } from '/@/router'
import { setupRouterGuard } from '/@/router/guard'
import { useUserStoreWithOut } from '/@/store/modules/user'
import { useAppStoreWithOut } from '/@/store/modules/app'
import { initAppConfigStore } from '/@/logics/initAppConfig'
import { setupErrorHandle } from '/@/logics/error-handle'
import { setupGlobDirectives } from '/@/directives'
import { setupI18n } from '/@/locales/setupI18n'
import { registerGlobComp } from '/@/components/registerGlobComp'
import { registerThirdComp } from '/@/settings/registerThirdComp'
import { registerSuper } from '/@/views/super/registerSuper'
import { registerPackages } from '/@/utils/monorepo/registerPackages'
import { setBridgeProps, type JeecgBridgeProps } from './props'

export interface BridgeFactoryProps extends JeecgBridgeProps, Record<string, unknown> {
  /** 宿主 AppContext 快照（演示展示用） */
  appContext?: Record<string, unknown>
  /** Vue 根节点真实挂载后通知宿主 */
  onReady?: () => void
}

export default defineBridgeApp<BridgeFactoryProps>(async (props, { signal, routing } = {}) => {
  setBridgeProps(props)

  const store = createAppStore()
  setActivePinia(store)

  // 登录态注入：权限守卫要求 token 存在，mock 数据层接受演示 token
  const userStore = useUserStoreWithOut()
  userStore.setToken(String(props?.token ?? 'jeecg-bridge-demo-token'))

  // 受控 memory 路由（守卫在接线前注册，保证权限路由在初始导航中装配；
  // connect → ready → install 的顺序合同由 installVueBridgeRouter 承担）
  const router = createRouter({ history: createMemoryHistory('/') })
  setupRouterGuard(router)

  const app = createApp(App, { onVnodeMounted: props?.onReady })
  setupStore(app)

  await setupI18n(app)
  initAppConfigStore()
  // 桥接模式布局适配：vben 侧栏/头部默认 fixed 定位会逃逸挂载容器盖住宿主侧栏，
  // 实例作为子应用时改为文档流内布局（仅本实例的 store 配置，不影响独立启动）
  useAppStoreWithOut().setProjectConfig({
    menuSetting: { fixed: false },
    headerSetting: { fixed: false },
  })
  registerPackages(app)
  registerGlobComp(app)
  await registerSuper(app)

  await installVueBridgeRouter(app, router, { signal, routing })
  await router.isReady()

  setupGlobDirectives(app)
  setupErrorHandle(app)
  await registerThirdComp(app)

  // 布局参数：与官方 MainAppProps 对齐（演示保持完整布局：菜单/页签/头部可见）
  useAppStoreWithOut().setMainAppProps({ hideSider: false, hideHeader: false, hideMultiTabs: false })

  return app
}, { routing: true })
