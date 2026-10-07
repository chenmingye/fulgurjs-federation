// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, KeepAlive, nextTick, ref, resolveComponent, type App } from 'vue'
import { createHostPages, createRemoteComponent } from '../src/vue-adapter'
const apps: App[] = []
const session = (key: string) => { (globalThis as any).__FULGURJS_APP_CONFIG__ = { sessionKey: key } }
async function flush() { await new Promise(r => setTimeout(r, 0)); await nextTick() }
async function mount(comp: any) {
  const el = document.createElement('div'); document.body.append(el)
  const app = createApp({ render: () => h(comp, { value: 'props-ok' }, { default: () => 'slots-ok' }) })
  app.config.warnHandler = () => {}; app.mount(el); apps.push(app); await flush()
  return { app, el }
}
afterEach(() => { apps.splice(0).forEach(a => a.unmount()); document.body.innerHTML = ''; delete (globalThis as any).__FULGURJS_APP_CONFIG__ })
for (const kind of ['component', 'page'] as const) {
  const make = (load: any) => kind === 'component'
    ? createRemoteComponent(load)('r/page')
    : createHostPages({ pages: [{ route: '/r/page' }], remotePrefixes: { '/r/': 'r' } }, load).component('r/page')
  it(kind + ': 已解析组件挂入两个 app 均注册依赖并透传 props/slots', async () => {
    const section = defineComponent({ setup: (_, { slots }) => () => h('section', slots.default?.()) })
    const inner = defineComponent({ props: ['value'], setup: (props, { slots }) => () => h(resolveComponent('remote-section'), {}, { default: () => [props.value, slots.default?.()] }) })
    const load = vi.fn(async (_spec, opts) => { opts.consumerApp.component('remote-section', section); return { default: inner } })
    const comp = make(load)
    const first = await mount(comp), second = await mount(comp)
    for (const { el } of [first, second]) { expect(el.querySelector('section')).toBeTruthy(); expect(el.textContent).toBe('props-okslots-ok') }
    expect(load).toHaveBeenCalledTimes(2)
  })
  it(kind + ': 无需再次 component()，静态路由换会话重挂刷新初始化', async () => {
    session('a')
    const load = vi.fn(async () => {
      const key = (globalThis as any).__FULGURJS_APP_CONFIG__.sessionKey
      return { default: { render: () => h('p', key) } }
    })
    const comp = make(load); const first = await mount(comp); expect(first.el.textContent).toBe('a')
    first.app.unmount(); apps.splice(apps.indexOf(first.app), 1); session('b')
    const second = await mount(comp); expect(second.el.textContent).toBe('b'); expect(load).toHaveBeenCalledTimes(2)
  })
  it(kind + ': 卸载后迟到的加载不能写入', async () => {
    let finish!: (x: unknown) => void
    const load = vi.fn().mockResolvedValueOnce({ default: { render: () => h('p', 'old') } })
      .mockImplementationOnce(() => new Promise(r => { finish = r }))
    const comp = make(load); await mount(comp)
    const second = await mount(comp); second.app.unmount(); apps.splice(apps.indexOf(second.app), 1)
    finish({ default: { render: () => h('p', 'late') } }); await flush(); expect(second.el.textContent).toBe('')
  })
  it(kind + ': 零参 loader 拒绝传播给消费方 errorHandler', async () => {
    const rejected = new Error('global component import rejected')
    const load = vi.fn(async (_spec, opts) => {
      opts.consumerApp.component('remote-section', () => Promise.reject(rejected))
      return { default: { render: () => h(resolveComponent('remote-section')) } }
    })
    const comp = make(load); const el = document.createElement('div'); document.body.append(el)
    const app = createApp({ render: () => h(comp) }); apps.push(app)
    const errors = vi.fn(); app.config.errorHandler = errors; app.mount(el); await flush()
    expect(errors).toHaveBeenCalledWith(rejected, expect.anything(), expect.any(String))
  })
}
it('保活同会话保持计数、换会话重建，切出无 deactivate 异常', async () => {
  session('a'); const show = ref(true); const errors = vi.fn()
  const load = vi.fn(async () => ({ default: defineComponent({ setup() {
    const key = (globalThis as any).__FULGURJS_APP_CONFIG__.sessionKey
    const count = ref(0); return () => h('button', { onClick: () => count.value++ }, `${key}:${count.value}`)
  } }) }))
  const pages = createHostPages({ pages: [{ route: '/r/page', keepAlive: true }], remotePrefixes: { '/r/': 'r' } }, load)
  const comp = pages.component('r/page')
  const { app, el } = await mount(defineComponent({ render: () => h(KeepAlive, { include: pages.keepAliveNames }, { default: () => show.value ? h(comp) : h('p', 'outside') }) }))
  app.config.errorHandler = errors
  el.querySelector('button')!.click(); await flush(); expect(el.textContent).toBe('a:1')
  show.value = false; await flush(); show.value = true; await flush(); expect(el.textContent).toBe('a:1'); expect(load).toHaveBeenCalledTimes(1)
  show.value = false; await flush(); session('b'); show.value = true; await flush()
  expect(el.textContent).toBe('b:0'); expect(load).toHaveBeenCalledTimes(2); expect(errors).not.toHaveBeenCalled()
})
