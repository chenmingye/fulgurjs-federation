/**
 * Vue 子应用桥接契约（fixtures/remote-a）。
 * 宿主经 loadRemote('remote-a/bridge') 取本模块默认导出，整站挂载/卸载。
 * memory 路由两条页面，验证 BR03（React 宿主嵌 Vue 子应用、子应用内部路由切换生效）。
 */
import { createApp, defineComponent, h, onMounted } from 'vue'
import { createMemoryHistory, createRouter, RouterView, useRoute, useRouter } from 'vue-router'
import { defineBridgeApp } from '@fulgurjs/federation/vue'

/** props 回显 + memory 路由导航的桥接根组件 */
const BridgeRoot = defineComponent({
  name: 'RemoteABridgeRoot',
  props: { label: { type: String, default: '' }, nested: { type: Object, default: null }, onReady: { type: Function, default: undefined } },
  setup(props) {
    const route = useRoute()
    const router = useRouter()
    // 挂载即回调 onReady（BR05：函数引用跨 root 传递验证）
    onMounted(() => { props.onReady?.() })
    return () =>
      h('div', { 'data-bridge-root': 'remote-a' }, [
        h('p', { 'data-testid': 'bridge-vue-props' }, `vue-bridge-props:${JSON.stringify({ label: (props as any).label ?? '', nested: (props as any).nested ?? null })}`),
        h('p', { 'data-testid': 'bridge-vue-route' }, `route:${String(route.path)}`),
        h('nav', [
          h('button', { 'data-testid': 'bridge-vue-go-about', onClick: () => router.push('/about') }, '到 about 页'),
          h('button', { 'data-testid': 'bridge-vue-go-home', onClick: () => router.push('/') }, '到 home 页'),
        ]),
        h(RouterView),
      ])
  },
})

const Home = defineComponent({ setup: () => () => h('p', { 'data-testid': 'bridge-vue-page' }, 'page:home') })
const About = defineComponent({ setup: () => () => h('p', { 'data-testid': 'bridge-vue-page' }, 'page:about') })

export default defineBridgeApp((props) => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: Home },
      { path: '/about', component: About },
    ],
  })
  const app = createApp(BridgeRoot, props)
  app.use(router)
  return app
})
