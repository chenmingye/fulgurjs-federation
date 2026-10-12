// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { createRouter, createMemoryHistory, RouterView } from 'vue-router'
import { defineBridgeApp } from '../src/bridge-app-vue'
import type { BridgeChildRoute, BridgeLocation } from '../src/bridge-router-core'

const contracts: Array<{ unmount(el: HTMLElement): void }> = []
const elements: HTMLElement[] = []
afterEach(() => {
  for (const contract of contracts.splice(0)) for (const el of elements) contract.unmount(el)
  for (const el of elements.splice(0)) el.remove()
})
function target() {
  const el = document.createElement('div')
  document.body.appendChild(el); elements.push(el)
  return el
}
function channel() {
  let location: BridgeLocation = { pathname: '/detail/42', search: '?q=中文', hash: '#section' }
  const listeners = new Set<(loc: BridgeLocation) => void>()
  const routing: BridgeChildRoute = {
    getLocation: () => location,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) },
    async navigate(to) { location = to; for (const fn of listeners) fn(to); return { status: 'committed', location } },
    go: vi.fn(),
  }
  return { routing, listeners }
}
function setup(label = 'ready') {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/:pathMatch(.*)*', component: { render: () => h('p', label) } },
  ] })
  const app = createApp({ render: () => h(RouterView) })
  return { app, router }
}
function track<T extends ReturnType<typeof defineBridgeApp>>(contract: T): T { contracts.push(contract); return contract }

describe('Vue bridge app/router 自动装配', () => {
  it('先经过业务守卫，再安装 router/提交根；中文 query/hash 与后续导航完整保留', async () => {
    const result = setup()
    const ch = channel()
    const events: string[] = []
    result.router.beforeEach(async () => { events.push('guard'); await Promise.resolve() })
    const use = vi.spyOn(result.app, 'use')
    const contract = track(defineBridgeApp(() => result, { routing: true }))
    const el = target()
    const mounting = contract.mount(el, {}, { routing: ch.routing })
    expect(use).not.toHaveBeenCalled()
    await mounting
    expect(events).toEqual(['guard'])
    expect(use).toHaveBeenCalledOnce()
    expect(el.textContent).toBe('ready')
    expect(result.router.currentRoute.value.query.q).toBe('中文')
    expect(result.router.currentRoute.value.hash).toBe('#section')
    await result.router.push('/next?q=二#last')
    await nextTick()
    expect(ch.routing.getLocation()).toEqual({ pathname: '/next', search: '?q=%E4%BA%8C', hash: '#last' })
  })

  it('未提供宿主通道明确报 MFU-034，失败后同容器可重试', async () => {
    const contract = track(defineBridgeApp(() => setup(), { routing: true }))
    const el = target()
    await expect(contract.mount(el)).rejects.toMatchObject({ code: 'MFU-034' })
    await contract.mount(el, {}, { routing: channel().routing })
    expect(el.textContent).toBe('ready')
  })

  it('漏声明 routing 不静默安装独立 router', async () => {
    const contract = track(defineBridgeApp(() => setup()))
    await expect(contract.mount(target())).rejects.toThrow(/routing: true/)
  })

  it('初始守卫失败释放订阅和恢复导航方法，真实错误原样传播', async () => {
    const result = setup()
    const originalPush = result.router.push
    const ch = channel()
    result.router.beforeEach(() => false)
    const use = vi.spyOn(result.app, 'use')
    const contract = track(defineBridgeApp(() => result, { routing: true }))
    await expect(contract.mount(target(), {}, { routing: ch.routing })).rejects.toThrow(/MFU-033/)
    expect(use).not.toHaveBeenCalled()
    expect(result.router.push).toBe(originalPush)
    expect(ch.listeners.size).toBe(0)
  })

  it('卸载自动释放路由；同一契约第二容器仍可导航', async () => {
    const created: ReturnType<typeof setup>[] = []
    const contract = track(defineBridgeApp(() => { const result = setup(); created.push(result); return result }, { routing: true }))
    const a = target(), b = target(), ca = channel(), cb = channel()
    await contract.mount(a, {}, { routing: ca.routing })
    await contract.mount(b, {}, { routing: cb.routing })
    contract.unmount(a)
    expect(ca.listeners.size).toBe(0)
    expect(cb.listeners.size).toBe(1)
    await created[1]!.router.push('/other')
    expect(cb.routing.getLocation().pathname).toBe('/other')
    expect(a.textContent).toBe('')
    expect(b.textContent).toBe('ready')
  })

  it('等待初始守卫时卸载，迟到完成不安装 router，不复活 DOM', async () => {
    let release!: () => void
    const result = setup(), ch = channel(), el = target()
    result.router.beforeEach(() => new Promise<void>(resolve => { release = resolve }))
    const use = vi.spyOn(result.app, 'use')
    const contract = track(defineBridgeApp(() => result, { routing: true }))
    const pending = contract.mount(el, {}, { routing: ch.routing })
    await vi.waitFor(() => expect(release).toBeTypeOf('function'))
    contract.unmount(el)
    expect(ch.listeners.size).toBe(0)
    release(); await pending
    expect(use).not.toHaveBeenCalled()
    expect(el.textContent).toBe('')
  })

  it('mount 抛错释放路由连接并清空占用，同页可正常重挂', async () => {
    const result = setup(), ch = channel(), el = target()
    const push = result.router.push
    const unmount = vi.spyOn(result.app, 'unmount').mockImplementation(() => {})
    vi.spyOn(result.app, 'mount').mockImplementation(() => { throw new Error('mount failed') })
    let first = true
    const contract = track(defineBridgeApp(() => {
      if (first) { first = false; return result }
      return setup('retry')
    }, { routing: true }))
    await expect(contract.mount(el, {}, { routing: ch.routing })).rejects.toThrow('mount failed')
    expect(unmount).toHaveBeenCalledOnce()
    expect(ch.listeners.size).toBe(0)
    expect(result.router.push).toBe(push)
    await contract.mount(el, {}, { routing: ch.routing })
    expect(el.textContent).toBe('retry')
  })

  it('旧异步工厂在同容器新代次挂起时完成，不覆盖新代次', async () => {
    const releases: Array<(app: ReturnType<typeof createApp>) => void> = []
    const contract = track(defineBridgeApp(() => new Promise(resolve => { releases.push(resolve) })))
    const el = target()
    const old = contract.mount(el)
    contract.unmount(el)
    const current = contract.mount(el)
    releases[0]!(createApp({ render: () => h('p', 'old') })); await old
    expect(el.textContent).toBe('')
    releases[1]!(createApp({ render: () => h('p', 'new') })); await current
    expect(el.textContent).toBe('new')
  })

  it('同步返回裸 app 仍同步挂载，非法返回值报告工厂合同', () => {
    const el = target()
    const contract = track(defineBridgeApp(() => createApp({ render: () => h('p', 'sync') })))
    expect(contract.mount(el)).toBeUndefined()
    expect(el.textContent).toBe('sync')
    for (const value of [null, 'invalid', 42]) {
      const invalid = defineBridgeApp(() => value as never)
      expect(() => invalid.mount(target())).toThrow(/工厂返回值不是 VueApp/)
    }
  })
})
