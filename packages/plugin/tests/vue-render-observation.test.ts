/**
 * P01 回归（2026-10-22 DEMES5.5 从零迁移轮）：远程组件子树内部错误的观测与接线。
 *
 * 修复前事实：模块加载成功、业务组件 setup 抛错被 app.config.errorHandler 接管时，
 * DOM 空白、无插件错误占位、无 fulgurjs:error —— 内部错误完全不可观测。
 *
 * 修复后契约：
 * - 默认（零行为变化）：errorCaptured 边界观测上报 MFU-020（details.remote/module/
 *   phase='render'/renderInfo，cause=原始异常对象），错误继续传播（业务 errorHandler
 *   照旧收到），不注入占位、不吞错；
 * - 可选接线：传 renderErrorComponent 后本边界消费错误（传播停止、errorHandler 不再
 *   收到该错误），渲染消费方占位（error/retry props），retry 重新挂载远程组件可恢复。
 * 分别覆盖同步 setup 抛错、render 抛错、嵌套异步组件 loader 拒绝三类。
 */
// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest'
import { createApp, defineAsyncComponent, defineComponent, h, nextTick, ref, resolveComponent } from 'vue'
import { createRemoteComponent } from '../src/vue-adapter'

async function mountWithHandler(Comp: any, errorHandler?: (err: unknown) => void): Promise<{ el: HTMLElement; handler: ReturnType<typeof vi.fn> }> {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const app = createApp({ render: () => h(Comp) })
  app.config.warnHandler = () => {}
  const handler = vi.fn(errorHandler ?? (() => {}))
  app.config.errorHandler = (err) => { handler(err) }
  app.mount(el)
  await new Promise((r) => setTimeout(r, 0))
  await nextTick()
  return { el, handler }
}

interface CapturedEvent { remote: string; error: any }

function listenErrors(): { events: CapturedEvent[]; off: () => void } {
  const events: CapturedEvent[] = []
  const onEvent = (e: Event): void => { events.push((e as CustomEvent).detail) }
  window.addEventListener('fulgurjs:error', onEvent)
  return { events, off: () => window.removeEventListener('fulgurjs:error', onEvent) }
}

afterEach(() => {
  document.body.innerHTML = ''
  ;(globalThis as any).__FULGURJS_RUNTIME__ = undefined
  ;(globalThis as any).__FULGURJS_REPORTED_ERRORS__ = undefined
  vi.restoreAllMocks()
})

describe('P01：默认观测（不吞错、不注入占位）', () => {
  it('同步 setup 抛错被业务 errorHandler 接管：区域空白但 fulgurjs:error 上报 MFU-020，cause===原始异常，错误仍到达业务 handler', async () => {
    const { events, off } = listenErrors()
    const original = new Error('业务表单初始化崩溃')
    const BadForm = defineComponent({ setup: () => { throw original } })
    const RC = createRemoteComponent(async () => ({ default: BadForm }) as never)('r-bad/Form', { retries: 0 })
    const { el, handler } = await mountWithHandler(RC)
    // 业务 handler 照旧收到原始错误（传播语义未被插件改变）
    expect(handler).toHaveBeenCalledWith(original)
    const seen = events.filter((e) => e.remote === 'r-bad')
    expect(seen).toHaveLength(1)
    expect(seen[0].error.code).toBe('MFU-020')
    expect(seen[0].error.cause).toBe(original)
    expect(seen[0].error.details).toMatchObject({ remote: 'r-bad', module: 'Form', phase: 'render' })
    // 默认不注入占位：区域保持空白（插件不吞错、不强判空 DOM）
    expect(el.querySelector('[data-fulgurjs-error]')).toBeNull()
    off()
  })

  it('render 函数抛错：同样观测上报（renderInfo 含渲染阶段）', async () => {
    const { events, off } = listenErrors()
    const original = new Error('render 阶段崩溃')
    const BadRender = defineComponent({ render: () => { throw original } })
    const RC = createRemoteComponent(async () => ({ default: BadRender }) as never)('r-render/Panel', { retries: 0 })
    await mountWithHandler(RC)
    const seen = events.filter((e) => e.remote === 'r-render')
    expect(seen).toHaveLength(1)
    expect(seen[0].error.code).toBe('MFU-020')
    expect(seen[0].error.cause).toBe(original)
    expect(String(seen[0].error.details.renderInfo)).toBeTruthy()
    off()
  })

  it('嵌套异步组件 loader 拒绝：观测上报，renderInfo 为 async component loader', async () => {
    const { events, off } = listenErrors()
    const Nested = defineComponent({
      components: {
        LateChild: defineAsyncComponent(() => Promise.reject(new Error('嵌套异步模块拒绝'))),
      },
      render: () => h('div', [h('span', 'shell'), h(resolveComponent('LateChild'))]),
    })
    const RC = createRemoteComponent(async () => ({ default: Nested }) as never)('r-nest/Page', { retries: 0 })
    const { handler } = await mountWithHandler(RC)
    expect(handler).toHaveBeenCalled()
    const seen = events.filter((e) => e.remote === 'r-nest')
    expect(seen).toHaveLength(1)
    expect(seen[0].error.code).toBe('MFU-020')
    expect(seen[0].error.details).toMatchObject({ phase: 'render' })
    expect(String(seen[0].error.details.renderInfo)).toContain('async component loader')
    off()
  })

  it('同一错误对象只报告一次（观测与 UI 呈现不重复）；合法渲染保持安静（无事件）', async () => {
    const { events, off } = listenErrors()
    const Good = defineComponent({ render: () => h('p', 'fine') })
    const RC = createRemoteComponent(async () => ({ default: Good }) as never)('r-ok/Fine', { retries: 0 })
    await mountWithHandler(RC)
    expect(events.filter((e) => e.remote === 'r-ok')).toHaveLength(0)
    off()
  })
})

describe('P01：renderErrorComponent 接线（接管展示与恢复）', () => {
  it('边界消费错误：业务 errorHandler 不再收到，占位收到 error/retry；retry 后重挂远程组件恢复', async () => {
    const shouldFail = ref(true)
    const original = new Error('表单内部崩溃（可恢复）')
    let setupRuns = 0
    const Flaky = defineComponent({
      setup() {
        setupRuns += 1
        if (shouldFail.value) throw original
        return () => h('p', 'form recovered')
      },
    })
    const RenderErrorView = defineComponent({
      props: { error: { type: Object, default: undefined }, retry: { type: Function, default: undefined } },
      render() {
        return h('div', { 'data-boundary-error': '' }, [
          h('p', `业务表单渲染失败：${(this.error as Error)?.message}`),
          h('button', { type: 'button', onClick: () => (this.retry as () => void)?.() }, '恢复表单'),
        ])
      },
    })
    const RC = createRemoteComponent(async () => ({ default: Flaky }) as never)('r-flaky/Form', {
      retries: 0, renderErrorComponent: RenderErrorView,
    })
    const { el, handler } = await mountWithHandler(RC)
    // 边界已消费：业务 errorHandler 不收到该错误
    expect(handler).not.toHaveBeenCalled()
    expect(el.querySelector('[data-boundary-error]')).toBeTruthy()
    expect(el.textContent).toContain('表单内部崩溃（可恢复）')
    // 恢复：修复业务条件后 retry 重新挂载（重跑 setup），真实内容回来
    shouldFail.value = false
    const btn = el.querySelector('[data-boundary-error] button') as HTMLButtonElement
    btn.click()
    await new Promise((r) => setTimeout(r, 0))
    await nextTick()
    expect(setupRuns).toBe(2)
    expect(el.textContent).toContain('form recovered')
    expect(el.querySelector('[data-boundary-error]')).toBeNull()
  })
})
