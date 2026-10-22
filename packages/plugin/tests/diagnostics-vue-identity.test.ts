/**
 * 诊断补强回归（D03/D07/D09/D13）：
 * - MFU-018：远程模块导出形态不是可渲染组件时，在 remoteComponent/hostPages 组件消费
 *   边界报错（错误码可见、不渲染空白成功页）；合法选项组件不误报。
 * - MFU-019：当前组件编译证据与渲染器不同才拒绝；无元数据不从默认共享表猜测。
 * 身份证据 = 实际导出引用比较（ref 函数），不是版本字符串。
 */
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref as vueRef, version as vueVersion } from 'vue'
import { createRemoteComponent, createHostPages } from '../src/vue-adapter'

async function mount(Comp: any): Promise<HTMLElement> {
  const { createApp, nextTick } = await import('vue')
  const el = document.createElement('div')
  document.body.appendChild(el)
  const app = createApp({ render: () => h(Comp) })
  app.config.warnHandler = () => {}
  app.mount(el)
  await new Promise((r) => setTimeout(r, 0))
  await nextTick()
  return el
}

afterEach(() => {
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const okComp = () => defineComponent({ render: () => h('p', 'remote-ok') })

describe('MFU-018 组件导出形态', () => {
  it('导出 number/无 render 的普通对象 → 报 MFU-018，不渲染空白成功页', async () => {
    for (const bad of [42, { plain: true }]) {
      const load = vi.fn().mockResolvedValue({ default: bad })
      const RC = createRemoteComponent(load as never)('r/Bad')
      const el = await mount(RC)
      expect(el.textContent).toContain('MFU-018')
      expect(el.textContent).toContain('不是可渲染组件')
      expect(el.textContent).not.toContain('remote-ok')
    }
  })

  it('合法选项组件（render 函数）不因形态检查误报', async () => {
    const load = vi.fn().mockResolvedValue({ default: { name: 'Opt', render: () => h('b', 'opt-ok') } })
    const RC = createRemoteComponent(load as never)('r/Opt')
    const el = await mount(RC)
    expect(el.textContent).toContain('opt-ok')
  })

  it('hostPages 路径同样报 MFU-018', async () => {
    const load = vi.fn().mockResolvedValue({ default: 'plain-string' })
    const pages = createHostPages({ pages: [{ route: '/x', spec: 'Bad' }], remotePrefixes: { '/x': 'r' } }, load as never)
    const el = await mount(pages.component('r/Bad'))
    expect(el.textContent).toContain('MFU-018')
  })
})

describe('MFU-019 当前组件的运行时证据', () => {
  const withEvidence = (value: unknown) => Object.defineProperty(okComp(), Symbol.for('fulgurjs.vue-runtime'), {
    value: { key: 'ref', value },
  })

  it('当前 SFC 实际引用不同，在 remoteComponent 边界拒绝并给出证据', async () => {
    const load = vi.fn().mockResolvedValue({ default: withEvidence(() => {}) })
    const el = await mount(createRemoteComponent(load as never)('r/Split'))
    expect(el.textContent).toContain('MFU-019')
    expect(el.textContent).toContain('当前 SFC')
    expect(el.textContent).toContain(vueVersion)
  })

  it('当前组件引用相同，无关默认共享实例不造成误拦', async () => {
    vi.stubGlobal('__FULGURJS_RUNTIME__', { getLoadedShare: () => ({ ref: () => {}, version: vueVersion }) })
    const load = vi.fn().mockResolvedValue({ default: withEvidence(vueRef) })
    const el = await mount(createRemoteComponent(load as never)('r/Shared'))
    expect(el.textContent).toContain('remote-ok')
    expect(el.textContent).not.toContain('MFU-019')
  })

  it('没有当前组件证据，不从无关共享表推断冲突', async () => {
    vi.stubGlobal('__FULGURJS_RUNTIME__', { getLoadedShare: () => ({ ref: () => {}, version: vueVersion }) })
    const load = vi.fn().mockResolvedValue({ default: okComp() })
    const el = await mount(createRemoteComponent(load as never)('r/Legacy'))
    expect(el.textContent).toContain('remote-ok')
  })

  it('hostPages 使用相同的当前组件证据', async () => {
    const load = vi.fn().mockResolvedValue({ default: withEvidence(() => {}) })
    const pages = createHostPages({ pages: [{ route: '/x', spec: 'Split' }], remotePrefixes: { '/x': 'r' } }, load as never)
    const el = await mount(pages.component('r/Split'))
    expect(el.textContent).toContain('MFU-019')
  })
})
