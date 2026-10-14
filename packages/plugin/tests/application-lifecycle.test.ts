// @vitest-environment jsdom
/**
 * defineApplication（/vue 统一装配）生命周期单测。
 * 覆盖：同步/异步工厂、独立 start 与宿主桥接共用装配、容器占用拒绝、多容器隔离、
 * 跨应用定义卸载保护、旧 handle 不能停新代次、pending 取消（AbortError/迟到结果不落挂/
 * 迟到失败无未处理拒绝）、router.isReady 等待中取消释放 history、卸载失败封锁容器、
 * signal 归属与 hasBridgeMount、本地 memory router 自动安装、声明 routing 缺通道明确失败。
 */
import { describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick } from 'vue'
import { createRouter, createMemoryHistory, createWebHistory, RouterView } from 'vue-router'
import { defineApplication } from '../src/bridge-app-vue'
import { hasBridgeMount } from '../src/bridge-core'

function newEl(text?: string): HTMLElement {
  const el = document.createElement('div')
  if (text) el.dataset.label = text
  document.body.appendChild(el)
  return el
}

const Home = defineComponent({ render: () => h('p', '独立首页') })

function syncFactory(log: string[] = []) {
  return (props: Record<string, unknown>, ctx: { mode: string; signal: AbortSignal }) => {
    log.push(`factory:${ctx.mode}`)
    const app = createApp({ render: () => h('p', `${String(props.label ?? 'x')}-${ctx.mode}`) })
    return { app, router: createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: Home }] }) }
  }
}

describe('defineApplication：装配与启动', () => {
  it('B1/B3 同步工厂：独立 start 与宿主桥接使用同一份装配（mode 区分）', async () => {
    const log: string[] = []
    const application = defineApplication(syncFactory(log))
    const el = newEl()
    const handle = await application.start(el, { label: 'L' })
    expect(el.textContent).toContain('L-standalone')
    handle.unmount()
    expect(el.textContent).toBe('')
    // 桥接形态：同一契约对象直接 mount（宿主适配器的调用方式）
    await application.mount(el, { label: 'B' })
    expect(el.textContent).toContain('B-bridge')
    expect(log).toEqual(['factory:standalone', 'factory:bridge'])
    application.unmount(el)
  })

  it('B1 异步工厂：await 后完成装配；start 的 Promise 等待挂载完成', async () => {
    const application = defineApplication(async () => {
      await Promise.resolve()
      const app = createApp({ render: () => h('p', 'async-ok') })
      return { app, router: createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: Home }] }) }
    })
    const el = newEl()
    await application.start(el)
    expect(el.textContent).toContain('async-ok')
  })

  it('B4 同容器重复 start / start 后 mount / mount 后 start 都拒绝', async () => {
    const application = defineApplication(syncFactory())
    const el = newEl()
    const handle = await application.start(el)
    await expect(application.start(el), '同容器重复 start').rejects.toThrowError(/不能重复 start/)
    expect(() => application.mount(el), 'start 后 mount 冲突').toThrowError(/已有独立应用/)
    handle.unmount()
    application.mount(el)
    await expect(application.start(el), 'mount 后 start 冲突').rejects.toThrowError(/不能重复 start|已有独立应用|容器已被占用/)
    application.unmount(el)
  })

  it('B5 多容器各自创建 app 与业务状态（计数互不影响）', async () => {
    let created = 0
    const application = defineApplication(() => {
      created += 1
      const count = { value: created }
      const app = createApp({ render: () => h('p', `app${count.value}`) })
      return { app, router: createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: Home }] }) }
    })
    const elA = newEl('a'), elB = newEl('b')
    const h1 = await application.start(elA)
    const h2 = await application.start(elB)
    expect(elA.textContent).toContain('app1')
    expect(elB.textContent).toContain('app2')
    h1.unmount()
    expect(elA.textContent).toBe('')
    expect(elB.textContent, 'A 卸载不影响 B').toContain('app2')
    h2.unmount()
  })

  it('B6 应用定义 A 不能卸载应用定义 B 占用的容器', async () => {
    const appA = defineApplication(syncFactory())
    const appB = defineApplication(syncFactory())
    const el = newEl()
    await appB.start(el)
    expect(() => appA.unmount(el), 'A 的 unmount 对 B 的实例是 no-op').not.toThrow()
    expect(el.textContent, 'B 实例仍在').toContain('standalone')
  })

  it('B7 旧 handle 只停原代次；不能卸载同容器的新实例', async () => {
    const application = defineApplication(syncFactory())
    const el = newEl()
    const old = await application.start(el)
    old.unmount()
    await application.start(el, { label: 'NEW' })
    expect(el.textContent).toContain('NEW-standalone')
    old.unmount(), expect(el.textContent, '旧 handle 不停新代次').toContain('NEW')
  })
})

describe('defineApplication：取消与迟到结果', () => {
  it('B8 pending start 时 unmount：AbortError 及时拒绝，迟到成功不重新挂载', async () => {
    let releaseFactory!: () => void
    const application = defineApplication(() => new Promise(resolve => { releaseFactory = () => resolve(syncFactory()({}, { mode: 'standalone', signal: new AbortController().signal })) }))
    const el = newEl()
    const pending = application.start(el)
    await nextTick()
    application.unmount(el)
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    releaseFactory()
    await new Promise(r => setTimeout(r, 10))
    expect(el.textContent, '迟到工厂结果不落挂').toBe('')
    const second = application.start(el)
    await nextTick()
    releaseFactory()
    await expect(second, '容器已释放可重新 start').resolves.toBeTruthy()
  })

  it('B8 迟到失败不产生未处理拒绝（start 已以 AbortError 结束）', async () => {
    const unhandled: unknown[] = []
    const onUnhandled = (e: PromiseRejectionEvent) => unhandled.push(e.reason)
    process.on('unhandledRejection', onUnhandled as never)
    try {
      let rejectFactory!: (e: Error) => void
      const application = defineApplication(() => new Promise((_res, rej) => { rejectFactory = rej }))
      const el = newEl()
      const pending = application.start(el)
      await nextTick()
      application.unmount(el)
      await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
      rejectFactory(new Error('迟到失败'))
      await new Promise(r => setTimeout(r, 20))
      expect(unhandled).toEqual([])
    } finally {
      process.off('unhandledRejection', onUnhandled as never)
    }
  })

  it('B10 Vue router.isReady 等待期间取消：AbortError 且 memory history 被释放', async () => {
    let releaseReady!: () => void
    let historyDestroyed = false
    const application = defineApplication(() => {
      const history = createMemoryHistory()
      const originalDestroy = history.destroy.bind(history)
      history.destroy = () => { historyDestroyed = true; originalDestroy() }
      const router = createRouter({ history, routes: [{ path: '/', component: Home }] })
      const originalIsReady = router.isReady.bind(router)
      router.isReady = () => new Promise<void>(resolve => { releaseReady = resolve })
      const app = createApp({ render: () => h('p', 'r') })
      return { app, router }
    })
    const el = newEl()
    const pending = application.start(el)
    await nextTick()
    application.unmount(el)
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(historyDestroyed, '等待 isReady 时取消 → 释放 history').toBe(true)
    releaseReady()
    await new Promise(r => setTimeout(r, 10))
    expect(el.textContent).toBe('')
  })
})

describe('defineApplication：卸载失败与封锁', () => {
  it('B12 app.unmount 抛错真实传播；容器封锁后不能换 props 重新 start', async () => {
    let failUnmount = false
    const application = defineApplication(() => {
      const app = createApp({ render: () => h('p', 'x') })
      const originalUnmount = app.unmount.bind(app)
      app.unmount = () => { if (failUnmount) throw new Error('unmount exploded'); originalUnmount() }
      return { app, router: createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: Home }] }) }
    })
    const el = newEl()
    const handle = await application.start(el)
    failUnmount = true
    expect(() => handle.unmount(), '卸载失败真实传播').toThrowError('unmount exploded')
    failUnmount = false
    await expect(application.start(el), '封锁后重新 start 被拒').rejects.toThrowError(/卸载失败/)
    await expect(application.start(el, { label: 'other' }), '换 props 不能绕过封锁').rejects.toThrowError(/卸载失败/)
  })

  it('B13 signal 属于本次实例；独立模式 hasBridgeMount=false', async () => {
    const signals: AbortSignal[] = []
    const marks: boolean[] = []
    const application = defineApplication((_props, ctx) => {
      signals.push(ctx.signal)
      marks.push(hasBridgeMount(ctx))
      const app = createApp({ render: () => h('p', 'm') })
      return { app, router: createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: Home }] }) }
    })
    const el1 = newEl(), el2 = newEl()
    const handle = await application.start(el1)
    application.mount(el2, {})
    expect(marks, '独立 false / 桥接 true').toEqual([false, true])
    expect(signals[0]).not.toBe(signals[1], '每次实例独立 signal')
    handle.unmount()
    application.unmount(el2)
  })
})

describe('defineApplication：路由装配', () => {
  it('B16 未声明 routing：本地 memory router 自动安装并等待（无需手动 app.use）', async () => {
    const installSpy = vi.fn()
    const application = defineApplication(() => {
      const router = createRouter({
        history: createMemoryHistory(),
        routes: [
          { path: '/', component: Home },
          { path: '/about', component: defineComponent({ render: () => h('p', '关于页') }) },
        ],
      })
      const originalInstall = router.install.bind(router)
      router.install = (app: unknown) => { installSpy(); originalInstall(app as never) }
      const app = createApp({ render: () => h(RouterView) })
      return { app, router }
    })
    const el = newEl()
    await application.start(el)
    expect(installSpy, '插件代为 app.use(router)').toHaveBeenCalledTimes(1)
    expect(el.textContent).toContain('独立首页')
  })

  it('B17 声明 routing:true 但桥接无通道：明确失败，不静默退回首页', async () => {
    const application = defineApplication(syncFactory(), { routing: true })
    const el = newEl()
    await expect(application.mount(el, {}), '缺宿主通道 → MFU-034 明确失败').rejects.toThrowError(/MFU-034/)
    expect(el.textContent, '失败后不留半挂状态').toBe('')
  })

  it('B16 桥接模式未声明 routing：memory router 同样自动安装等待', async () => {
    const installSpy = vi.fn()
    const application = defineApplication(() => {
      const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: Home }] })
      const originalInstall = router.install.bind(router)
      router.install = (app: unknown) => { installSpy(); originalInstall(app as never) }
      const app = createApp({ render: () => h('p', 'b') })
      return { app, router }
    })
    const el = newEl()
    application.mount(el, {})
    await nextTick()
    expect(installSpy).toHaveBeenCalledTimes(1)
    application.unmount(el)
  })

  it('B15 routing:true + 宿主通道：初始深链由通道同步到子路由', async () => {
    const BASE = '/approval'
    const initial = { pathname: BASE + '/deep/page', search: '?x=1', hash: '' }
    const listeners = new Set<(l: { pathname: string; search: string; hash: string }) => void>()
    const host = {
      getLocation: () => ({ ...initial }),
      subscribe(l: never) { listeners.add(l); return () => listeners.delete(l) },
      async navigate() { return { status: 'committed' as const, location: { ...initial } } },
      go() {},
    }
    const { RoutingChannel } = await import('../src/bridge-router-core')
    const { createVueBridgeNavigation } = await import('../src/bridge-router-vue')
    const hostRouter = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:pathMatch(.*)*', component: Home }] })
    await hostRouter.push(initial.pathname + initial.search)
    await hostRouter.isReady()
    const channel = new RoutingChannel('t-app', BASE, createVueBridgeNavigation(hostRouter), 'app/bridge')
    const seen: string[] = []
    const application = defineApplication(() => {
      const router = createRouter({
        history: createMemoryHistory(),
        routes: [
          { path: '/', component: Home },
          { path: '/deep/page', component: defineComponent({ render: () => h('p', '深链页') }) },
        ],
      })
      router.afterEach(to => seen.push(String((to as { fullPath: string }).fullPath)))
      const app = createApp({ render: () => h('p', 'b') })
      return { app, router }
    }, { routing: true })
    const el = newEl()
    application.mount(el, {}, { routing: channel })
    await new Promise(r => setTimeout(r, 30))
    expect(seen.at(-1), '初始位置来自宿主通道同步').toBe('/deep/page?x=1')
    application.unmount(el)
    channel.dispose()
  })

  it('B/B18 独立模式等待 web router isReady（初始导航完成后才挂载）', async () => {
    const readyOrder: string[] = []
    const application = defineApplication(() => {
      const router = createRouter({
        history: createWebHistory(),
        routes: [{ path: '/', component: defineComponent({ mounted: () => readyOrder.push('mounted') }) }],
      })
      const originalIsReady = router.isReady.bind(router)
      router.isReady = async () => { await originalIsReady(); readyOrder.push('isReady') }
      const app = createApp({ render: () => h(RouterView) })
      return { app, router }
    })
    const el = newEl()
    await application.start(el)
    expect(readyOrder).toEqual(['isReady', 'mounted'])
  })
})
