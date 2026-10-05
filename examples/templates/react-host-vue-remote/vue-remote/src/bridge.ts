/**
 * Vue 子应用桥接契约（./bridge expose 的默认导出，任务书 §3.3）。
 *
 * defineBridgeApp 工厂接收 props 快照，返回装配完整的 VueApp——
 * 路由、状态库等插件在这里自行装配；挂载/卸载与按容器跟踪由契约负责。
 */
import { createApp, defineComponent, h, ref } from 'vue'
import { createMemoryHistory, createRouter, RouterView, useRoute, useRouter } from 'vue-router'
import { defineBridgeApp } from '@fulgurjs/federation/vue'

/** props 类型：appProps 由宿主传入（label + 稳定回调 onReady） */
export interface BridgeVueProps {
  label?: string
  onReady?: () => void
}

const Root = defineComponent({
  name: 'BridgeVueRoot',
  props: {
    label: { type: String, default: '' },
    onReady: { type: Function, default: undefined },
  },
  setup(props) {
    const route = useRoute()
    const router = useRouter()
    const mountTime = ref(new Date().toLocaleTimeString())
    props.onReady?.()
    return () =>
      h('div', { style: 'border:1px solid #42b883;border-radius:8px;padding:12px;font-family:sans-serif' }, [
        h('p', { style: 'margin:0 0 6px;font-weight:600;color:#42b883' }, `Vue 子应用（挂载于 ${mountTime.value}）`),
        h('p', { 'data-testid': 'demo-vue-props', style: 'margin:0 0 6px' }, `appProps.label = ${props.label || '（未传）'}`),
        h('p', { 'data-testid': 'demo-vue-route', style: 'margin:0 0 8px' }, `memory 路由：${String(route.path)}`),
        h('nav', { style: 'margin-bottom:8px' }, [
          h('button', { onClick: () => router.push('/'), style: 'margin-right:8px' }, '首页'),
          h('button', { onClick: () => router.push('/about') }, '关于'),
        ]),
        h(RouterView),
      ])
  },
})

const HomePage = defineComponent({ setup: () => () => h('p', { 'data-testid': 'demo-vue-page' }, '页面：首页') })
const AboutPage = defineComponent({ setup: () => () => h('p', { 'data-testid': 'demo-vue-page' }, '页面：关于') })

export default defineBridgeApp((props) => {
  const router = createRouter({
    // 子应用内部用 memory 路由（v1 不与宿主 URL 同步，见 README §12）
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: HomePage },
      { path: '/about', component: AboutPage },
    ],
  })
  const app = createApp(Root, props)
  app.use(router)
  return app
})
