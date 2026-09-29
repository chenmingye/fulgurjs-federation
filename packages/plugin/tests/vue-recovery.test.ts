/**
 * D1/D2 回归：Vue 默认错误占位的恢复操作（remoteComponent 与 createHostPages 两条路径）。
 * 覆盖：失败占位含「重试加载」与「刷新页面重试」；同页重试真实重建加载并恢复；
 * 多次快速点击不产生重复并发加载（运行时单飞语义由 lifecycle.test.ts 守护，此处验证
 * 适配层每次点击恰一次 loadRemote 且恢复后组件唯一）；自定义 errorComponent 完全接管
 * （不注入按钮，契约不变）；刷新按钮点击只调 window.location.reload（不自动刷新）；
 * KeepAlive 名称约束不变（包装组件 name = cleanCompName(spec)，无外层包装）。
 */
// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest'
import { createApp, defineComponent, h, nextTick } from 'vue'
import { createRemoteComponent, createHostPages } from '../src/vue-adapter'

async function mount(Comp: any): Promise<HTMLElement> {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const app = createApp({ render: () => h(Comp) })
  app.config.warnHandler = () => {}
  app.mount(el)
  await new Promise((r) => setTimeout(r, 0))
  await nextTick()
  return el
}

const click = async (el: HTMLElement, selector: string): Promise<void> => {
  const btn = el.querySelector(selector) as HTMLButtonElement | null
  if (!btn) throw new Error(`button not found: ${selector}`)
  btn.click()
  await new Promise((r) => setTimeout(r, 0))
  await nextTick()
}

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('D1: remoteComponent 默认占位恢复', () => {
  it('加载失败占位含重试加载+刷新页面重试；点击重试加载真实重建加载并恢复', async () => {
    const err = Object.assign(new Error('boom: 连接被拒绝'), { code: 'MFU-001' })
    const load = vi.fn()
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce({ default: defineComponent({ render: () => h('p', 'recovered') }) })
    const RC = createRemoteComponent(load as never)('r/Flaky', { retries: 0 })
    const el = await mount(RC)
    expect(el.textContent).toContain('远程组件加载失败（错误码 MFU-001）')
    expect(el.querySelector('[data-fulgurjs-retry]')).toBeTruthy()
    expect(el.querySelector('[data-fulgurjs-reload]')).toBeTruthy()
    expect(load).toHaveBeenCalledTimes(1)
    await click(el, '[data-fulgurjs-retry]')
    expect(el.textContent).toContain('recovered')
    expect(load).toHaveBeenCalledTimes(2)
    expect(el.querySelector('[data-fulgurjs-error]')).toBeNull()
  })

  it('刷新页面重试点击调用 location.reload；不点击绝不自动刷新', async () => {
    const reload = vi.fn()
    const spy = vi.fn()
    vi.stubGlobal('location', { reload: spy })
    const load = vi.fn().mockRejectedValue(new Error('static dep failed'))
    const RC = createRemoteComponent(load as never)('r/StaticFail')
    const el = await mount(RC)
    expect(reload).not.toHaveBeenCalled()
    await click(el, '[data-fulgurjs-reload]')
    expect(spy).toHaveBeenCalledTimes(1)
    // 失败占位仍在（未做任何自动恢复）
    expect(el.querySelector('[data-fulgurjs-error]')).toBeTruthy()
  })

  it('多次快速点击重试不产生重复并发加载与双份组件', async () => {
    let resolveSecond: ((v: any) => void) | undefined
    const load = vi.fn()
      .mockRejectedValueOnce(new Error('fail-1'))
      .mockImplementation(() => new Promise<any>((r) => { resolveSecond = r }))
    const RC = createRemoteComponent(load as never)('r/SpamClick', { retries: 0 })
    const el = await mount(RC)
    expect(el.querySelector('[data-fulgurjs-error]')).toBeTruthy()
    await click(el, '[data-fulgurjs-retry]')
    await click(el, '[data-fulgurjs-retry]')
    await click(el, '[data-fulgurjs-retry]')
    // 三次点击 → loader 恰两次调用（首次失败 + 一次重试；retrying 在飞守卫吞掉后续点击）
    expect(load).toHaveBeenCalledTimes(2)
    resolveSecond?.({ default: defineComponent({ render: () => h('p', 'ok-spam') }) })
    await new Promise((r) => setTimeout(r, 0))
    await nextTick()
    expect(el.textContent).toContain('ok-spam')
    // 恢复后页面内只有一份业务组件
    expect(el.querySelectorAll('p').length).toBe(1)
  })

  it('自定义 errorComponent 完全接管：不注入默认按钮（既有使用者契约不变）', async () => {
    const Custom = defineComponent({
      props: { error: { type: Object, default: undefined } },
      setup: (props) => () => h('div', { class: 'custom-err' }, `custom:${String((props.error as Error)?.message)}`),
    })
    const load = vi.fn().mockRejectedValue(new Error('custom-fail'))
    const RC = createRemoteComponent(load as never)('r/Custom', { errorComponent: Custom })
    const el = await mount(RC)
    expect(el.querySelector('.custom-err')?.textContent).toContain('custom:custom-fail')
    expect(el.querySelector('[data-fulgurjs-retry]')).toBeNull()
    expect(el.querySelector('[data-fulgurjs-reload]')).toBeNull()
  })
})

describe('D1: createHostPages 路径恢复 + KeepAlive 约束', () => {
  it('页面组件失败占位可重试恢复；包装组件 name 保持（保活 include 匹配）且无外层包装', async () => {
    const err = Object.assign(new Error('entry unreachable'), { code: 'MFU-001' })
    let failFirst = true
    const load = vi.fn(async () => {
      if (failFirst) throw err
      return { default: defineComponent({ name: 'Inner', render: () => h('p', 'page-ok') }) }
    })
    const hp = createHostPages(
      {
        pages: [{ route: '/remote-a/home', name: 'Home', title: '首页', keepAlive: true }],
        remotePrefixes: { '/remote-a/': 'remote-a' },
      } as Parameters<typeof createHostPages>[0],
      load as never,
    )
    const Comp = hp.component('Home')
    expect((Comp as { name?: string }).name).not.toBe('Inner')
    const el = await mount(Comp)
    expect(el.querySelector('[data-fulgurjs-error]')).toBeTruthy()
    failFirst = false
    await click(el, '[data-fulgurjs-retry]')
    expect(el.textContent).toContain('page-ok')
    expect(hp.keepAliveNames.length).toBe(1)
    expect(hp.keepAliveNames[0]).toMatch(/^Fulgurjs_/)
  })

  it('hostPages 自定义 errorComponent 接管（无按钮注入）', async () => {
    const Custom = defineComponent({
      props: { error: { type: Object, default: undefined } },
      setup: () => () => h('div', { class: 'hp-custom' }, 'hp-takeover'),
    })
    const load = vi.fn(async () => { throw new Error('x') })
    const hp = createHostPages(
      {
        pages: [{ route: '/remote-a/home', name: 'Home', title: '首页' }],
        remotePrefixes: { '/remote-a/': 'remote-a' },
        errorComponent: Custom,
      } as unknown as Parameters<typeof createHostPages>[0],
      load as never,
    )
    const el = await mount(hp.component('Home'))
    expect(el.querySelector('.hp-custom')).toBeTruthy()
    expect(el.querySelector('[data-fulgurjs-retry]')).toBeNull()
  })
})
