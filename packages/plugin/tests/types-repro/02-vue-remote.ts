/**
 * Vue 直渲染 + 虚拟运行时的典型消费形态（最新 TS 口径守卫）。
 */
import { remoteComponent, loadRemote, preloadRemote } from '@fulgurjs/federation/runtime'

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
