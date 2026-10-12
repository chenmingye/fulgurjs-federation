/**
 * Vue 直渲染 + 虚拟运行时的典型消费形态（最新 TS 口径守卫）。
 */
import { remoteComponent, loadRemote, preloadRemote } from '@fulgurjs/federation/vue'
import { defineBridgeApp, type VueBridgeAppSetup } from '@fulgurjs/federation/vue'
import { createApp } from 'vue'
import { createRouter, createMemoryHistory } from 'vue-router'

defineBridgeApp<{ label: string }>((props) => {
  const result: VueBridgeAppSetup = {
    app: createApp({ template: '<p />' }, props),
    router: createRouter({ history: createMemoryHistory(), routes: [] }),
  }
  return result
}, { routing: true })
// @ts-expect-error router 必须是可接线的路由实例，不能是路由配置数组。
defineBridgeApp(() => ({ app: createApp({}), router: [] }), { routing: true })

const FederatedForm = remoteComponent('demo-host/FormRouterPage')
const FederatedAmis = remoteComponent('demo-host/AmisFormRouterPage', {
  loadingComponent: { template: '<div />' } as any,
  retries: 2,
  delay: 200,
})

async function consume() {
  const mod = await loadRemote<{ getDictItems: (code: string) => Promise<unknown> }>('demo-host/api')
  await mod.getDictItems('sex')
  await preloadRemote('mes-bpm', { mode: 'prefetch' })
}
void FederatedForm
void FederatedAmis
void consume
