/**
 * 诊断补强回归（D03/D07/D09/D13）：
 * - MFU-018：远程模块导出形态不是可渲染组件时，在 remoteComponent/hostPages 组件消费
 *   边界报错（错误码可见、不渲染空白成功页）；合法选项组件不误报。
 * - MFU-019：Vue 直渲染的渲染器与共享作用域收敛实例身份不一致时在适配器边界报错，
 *   附双方版本；收敛一致与「作用域无实例（不可比）」都放行（D13：无元数据远程不误拒）。
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

describe('MFU-019 Vue 运行时身份（组件直渲染边界）', () => {
  const stubSharedVue = (ns: unknown) =>
    vi.stubGlobal('__FULGURJS_RUNTIME__', { getLoadedShare: (name: string) => (name === 'vue' ? ns : undefined) })

  it('作用域收敛实例与渲染链 ref 不一致 → 报 MFU-019 并附双方版本', async () => {
    stubSharedVue({ ref: () => {}, version: '9.9.9' })
    const load = vi.fn().mockResolvedValue({ default: okComp() })
    const RC = createRemoteComponent(load as never)('r/Split')
    const el = await mount(RC)
    expect(el.textContent).toContain('MFU-019')
    expect(el.textContent).toContain('9.9.9')
    expect(el.textContent).toContain(vueVersion)
    expect(el.textContent).not.toContain('remote-ok')
  })

  it('收敛实例与渲染链一致（同一 ref 引用）→ 正常渲染，不误报', async () => {
    stubSharedVue({ ref: vueRef, version: vueVersion })
    const load = vi.fn().mockResolvedValue({ default: okComp() })
    const RC = createRemoteComponent(load as never)('r/Shared')
    const el = await mount(RC)
    expect(el.textContent).toContain('remote-ok')
  })

  it('作用域无 vue 实例（双方未声明 shared / 旧远程无元数据）→ 不可比不判，正常渲染', async () => {
    stubSharedVue(undefined)
    const load = vi.fn().mockResolvedValue({ default: okComp() })
    const RC = createRemoteComponent(load as never)('r/Legacy')
    const el = await mount(RC)
    expect(el.textContent).toContain('remote-ok')
  })

  it('hostPages 路径同样执行身份检查', async () => {
    stubSharedVue({ ref: () => {}, version: '8.8.8' })
    const load = vi.fn().mockResolvedValue({ default: okComp() })
    const pages = createHostPages({ pages: [{ route: '/x', spec: 'Split' }], remotePrefixes: { '/x': 'r' } }, load as never)
    const el = await mount(pages.component('r/Split'))
    expect(el.textContent).toContain('MFU-019')
  })

  it('作用域条目缺 ref/version（不可信信号）→ 跳过比较不误报', async () => {
    stubSharedVue({ somethingElse: true })
    const load = vi.fn().mockResolvedValue({ default: okComp() })
    const RC = createRemoteComponent(load as never)('r/Odd')
    const el = await mount(RC)
    expect(el.textContent).toContain('remote-ok')
  })
})
