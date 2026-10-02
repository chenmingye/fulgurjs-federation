// @vitest-environment jsdom
/**
 * 桥接契约与子应用适配器单测（任务书 §3.2/§3.3、BN01/BN02/BN03/BN06/BN09）。
 * 用真实 Vue/React 在 jsdom 挂载，验证 mount/unmount 语义、按 el 分键、
 * 重复 mount 拒绝、pending 卸载作废、错误包装（MFU-015/016）。
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { createApp, h, defineComponent, type App as VueApp } from 'vue'
import { createElement, Component, type ReactNode } from 'react'
import { act } from '@testing-library/react'
import { defineBridgeApp as defineVueBridgeApp, type VueBridgeAppFactory } from '../src/bridge-app-vue'
import { defineBridgeApp as defineReactBridgeApp, type ReactBridgeAppFactory } from '../src/bridge-app-react'
import { assertBridgeContract, resolveBridgeContext } from '../src/bridge-core'
import { bridgeHostError } from '../src/bridge-errors'
import { provideAppContext, clearAppContext } from '../src/context'

const g = globalThis as any

beforeEach(() => {
  delete g.__FULGURJS_APP_CONFIG__
  g.__FULGURJS_RUNTIME__ = { loadRemote: vi.fn(), clearSessionState: vi.fn() }
})
afterEach(() => {
  delete g.__FULGURJS_APP_CONFIG__
  delete g.__FULGURJS_RUNTIME__
})

function codeOf(e: unknown): string {
  return (e as { code?: string }).code ?? ''
}

function newEl(): HTMLElement {
  const el = document.createElement('div')
  document.body.appendChild(el)
  return el
}

// ── 契约校验（MFU-015，BN01）────────────────────────────────────────────────

describe('assertBridgeContract（MFU-015）', () => {
  it('默认导出形态与裸契约形态都放行', () => {
    const contract = { mount: () => {}, unmount: () => {} }
    expect(assertBridgeContract('r/bridge', { default: contract })).toBe(contract)
    expect(assertBridgeContract('r/bridge', contract)).toBe(contract)
  })

  it('缺 mount/unmount 或非对象 → MFU-015', () => {
    expect(() => assertBridgeContract('r/bridge', {})).toThrowError(/MFU-015/)
    expect(() => assertBridgeContract('r/bridge', { default: { mount: 1, unmount: () => {} } })).toThrowError(/MFU-015/)
    expect(() => assertBridgeContract('r/bridge', null)).toThrowError(/MFU-015/)
    expect(() => assertBridgeContract('r/bridge', 'str')).toThrowError(/MFU-015/)
    try {
      assertBridgeContract('r/bridge', { default: { mount: () => {} } })
      expect.unreachable()
    } catch (e) {
      expect(codeOf(e)).toBe('MFU-015')
      expect((e as Error).message).toContain('unmount')
    }
  })
})

// ── Vue 子应用契约（defineBridgeApp /runtime 形态）──────────────────────────

function makeVueContract(tracker: { mounted: string[]; unmounted: string[] }, failUnmount = false) {
  const factory: VueBridgeAppFactory = (props) => {
    return createApp(
      defineComponent({
        setup: () => () =>
          h('div', { 'data-testid': 'vue-bridge-content' }, `vue:${String(props.label ?? 'none')}`),
      }),
    )
  }
  const contract = defineVueBridgeApp(factory)
  const origMount = contract.mount.bind(contract)
  const origUnmount = contract.unmount.bind(contract)
  return {
    contract: {
      mount(el: HTMLElement, props?: Record<string, unknown>): void {
        tracker.mounted.push(el.getAttribute('data-el') ?? '?')
        origMount(el, props)
      },
      unmount(el: HTMLElement): void {
        tracker.unmounted.push(el.getAttribute('data-el') ?? '?')
        if (failUnmount) throw new Error('unmount boom')
        origUnmount(el)
      },
    },
    raw: contract,
  }
}

describe('defineBridgeApp（Vue /runtime 形态）', () => {
  let el: HTMLElement
  beforeEach(() => {
    el = newEl()
  })
  afterEach(() => {
    el.remove()
  })

  it('mount 同步完成首次渲染并渲染 props；unmount 清空容器', () => {
    const { contract } = makeVueContract({ mounted: [], unmounted: [] })
    contract.mount(el, { label: 'A' })
    expect(el.querySelector('[data-testid="vue-bridge-content"]')?.textContent).toContain('vue:A')
    contract.unmount(el)
    expect(el.querySelector('[data-testid="vue-bridge-content"]')).toBeNull()
  })

  it('同一容器重复 mount 拒绝（原始错误原样抛出，宿主侧 bridgeHostError 转 MFU-016）且不覆盖原实例（BN03）', () => {
    const { raw } = makeVueContract({ mounted: [], unmounted: [] })
    raw.mount(el, { label: 'A' })
    expect(() => raw.mount(el, { label: 'B' })).toThrowError(/容器已被占用/)
    try {
      raw.mount(el, { label: 'B' })
      expect.unreachable()
    } catch (e) {
      // 5.5.0 起子应用适配器原样抛出；宿主在 mount 边界统一包装为 MFU-016（真实 spec）
      const wrapped = bridgeHostError('mount', 'remote-demo/bridge', e)
      expect(codeOf(wrapped)).toBe('MFU-016')
      expect((wrapped as any).details.spec).toBe('remote-demo/bridge')
      expect(String(wrapped.message)).toContain('remote-demo/bridge')
    }
    // 原实例未被覆盖
    expect(el.querySelector('[data-testid="vue-bridge-content"]')?.textContent).toContain('vue:A')
    raw.unmount(el)
  })

  it('不同容器互不干扰（按 el 分键）', () => {
    const el2 = newEl()
    const { raw } = makeVueContract({ mounted: [], unmounted: [] })
    raw.mount(el, { label: 'A' })
    raw.mount(el2, { label: 'B' })
    expect(el.querySelector('[data-testid="vue-bridge-content"]')?.textContent).toContain('vue:A')
    expect(el2.querySelector('[data-testid="vue-bridge-content"]')?.textContent).toContain('vue:B')
    raw.unmount(el)
    expect(el2.querySelector('[data-testid="vue-bridge-content"]')).not.toBeNull()
    raw.unmount(el2)
    el2.remove()
  })

  it('工厂抛错 → 原始错误原样抛出，宿主侧包装为 MFU-016（phase: mount，真实 spec）；无半挂残留', () => {
    const contract = defineVueBridgeApp(() => {
      throw new Error('factory boom')
    })
    expect(() => contract.mount(el)).toThrowError('factory boom')
    try {
      contract.mount(el)
      expect.unreachable()
    } catch (e) {
      expect(codeOf(e)).toBe('')
      const wrapped = bridgeHostError('mount', 'remote-demo/bridge', e)
      expect(codeOf(wrapped)).toBe('MFU-016')
      expect((wrapped as any).details.phase).toBe('mount')
      expect((wrapped as any).details.spec).toBe('remote-demo/bridge')
      expect((wrapped as Error).message).toContain('factory boom')
    }
    // 失败后容器未被占用：可重新 mount
    const ok = defineVueBridgeApp((props) => createApp(defineComponent({ setup: () => () => h('i', String(props.n ?? 0)) })))
    ok.mount(el, { n: 1 })
    expect(el.textContent).toContain('1')
    ok.unmount(el)
  })

  it('未知容器 unmount 为 no-op；unmount 抛错原样抛出，宿主侧包装为 MFU-016（phase: unmount，BN09）', () => {
    const { raw } = makeVueContract({ mounted: [], unmounted: [] })
    expect(() => raw.unmount(document.createElement('div'))).not.toThrow()
    raw.mount(el)
    raw.unmount(el)
    // app.unmount 抛错 → 原始错误原样抛出；宿主侧单点包装为 MFU-016（真实 spec + cause）
    const throwing = defineVueBridgeApp(() => ({
      mount: (target: HTMLElement) => { target.appendChild(document.createElement('i')) },
      unmount: () => { throw new Error('unmount boom') },
    }) as unknown as VueApp)
    throwing.mount(el)
    try {
      throwing.unmount(el)
      expect.unreachable()
    } catch (e) {
      expect(codeOf(e)).toBe('')
      expect((e as Error).message).toContain('unmount boom')
      const wrapped = bridgeHostError('unmount', 'remote-demo/bridge', e)
      expect(codeOf(wrapped)).toBe('MFU-016')
      expect((wrapped as any).details.phase).toBe('unmount')
      expect((wrapped as any).details.spec).toBe('remote-demo/bridge')
      expect(String((wrapped as any).details.cause)).toContain('unmount boom')
      // 单点包装：已是插件诊断的错误原样保留（cause 不再被二次包装）
      expect(bridgeHostError('unmount', 'remote-demo/bridge', wrapped)).toBe(wrapped)
    }
  })
})

// ── React 子应用契约（defineBridgeApp /react 形态）──────────────────────────

function makeReactElement(props: Record<string, unknown>, label: string): ReturnType<typeof createElement> {
  return createElement('div', { 'data-testid': 'react-bridge-content' }, `react:${String((props as any).label ?? label)}`)
}

async function flushReact(): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0))
  })
}

describe('defineBridgeApp（React /react 形态）', () => {
  let el: HTMLElement
  beforeEach(() => {
    el = newEl()
  })
  afterEach(() => {
    el.remove()
  })

  it('mount 的 Promise 在首次根提交后完成；DOM 真实渲染（不得把 root.render() 返回当成功）', async () => {
    const contract = defineReactBridgeApp((props) => makeReactElement(props, 'A'))
    let committed = false
    const p = contract.mount(el, { label: 'A' }).then(() => {
      // resolve 时 DOM 必须已经存在（首次提交语义）
      committed = el.querySelector('[data-testid="react-bridge-content"]') !== null
    })
    await p
    expect(committed).toBe(true)
    expect(el.querySelector('[data-testid="react-bridge-content"]')?.textContent).toContain('react:A')
    contract.unmount(el)
    expect(el.querySelector('[data-testid="react-bridge-content"]')).toBeNull()
  })

  it('工厂同步抛错 → mount 同步抛原始错误（宿主侧包装为 MFU-016），无半挂残留，重试可用（BN02 之一）', async () => {
    let shouldFail = true
    const contract = defineReactBridgeApp(() => {
      if (shouldFail) throw new Error('first render boom')
      return makeReactElement({}, 'ok')
    })
    // 工厂在 mount 调用内同步求值 → 同步抛出（宿主在 mount 边界转占位诊断）
    expect(() => contract.mount(el)).toThrowError('first render boom')
    expect(el.querySelector('[data-testid="react-bridge-content"]')).toBeNull()
    // 失败后容器未被占用：可重新 mount
    shouldFail = false
    await contract.mount(el)
    expect(el.querySelector('[data-testid="react-bridge-content"]')?.textContent).toContain('react:ok')
    contract.unmount(el)
  })

  it('首次渲染失败的组件树（渲染期抛错）→ mount 拒绝并清理', async () => {
    class Boom extends Component {
      override render(): ReactNode {
        throw new Error('render-time boom')
      }
    }
    const contract = defineReactBridgeApp(() => createElement(Boom))
    await expect(contract.mount(el)).rejects.toThrowError('render-time boom')
    expect(el.querySelector('[data-testid="react-bridge-content"]')).toBeNull()
    // 清理后可重试
    const ok = defineReactBridgeApp(() => makeReactElement({}, 'ok'))
    await ok.mount(el)
    expect(el.querySelector('[data-testid="react-bridge-content"]')?.textContent).toContain('react:ok')
    ok.unmount(el)
  })

  it('同一容器重复 mount 同步拒绝（原始错误，宿主侧转 MFU-016），原实例不受影响（BN03）', async () => {
    const contract = defineReactBridgeApp((props) => makeReactElement(props, 'x'))
    const p = contract.mount(el, { label: 'A' })
    expect(() => contract.mount(el)).toThrowError(/容器已被占用/)
    await p
    expect(el.querySelector('[data-testid="react-bridge-content"]')?.textContent).toContain('react:A')
    contract.unmount(el)
  })

  it('pending 时卸载立即作废代次：迟到结果不复活 DOM、无未处理拒绝（BN06）', async () => {
    const contract = defineReactBridgeApp(() => makeReactElement({}, 'late'))
    const p = contract.mount(el)
    // 在 react-dom/client 动态取得前同步卸载（作废）
    contract.unmount(el)
    await expect(p).resolves.toBeUndefined()
    // 迟到的挂载不产生 DOM
    await flushReact()
    expect(el.querySelector('[data-testid="react-bridge-content"]')).toBeNull()
  })

  it('未知容器 unmount 为 no-op', async () => {
    const contract = defineReactBridgeApp(() => makeReactElement({}, 'x'))
    expect(() => contract.unmount(document.createElement('div'))).not.toThrow()
  })
})

// ── 会话与上下文代次校验（§4.3，BN08/BR06）──────────────────────────────────

describe('resolveBridgeContext（会话代次校验）', () => {
  it('getter 快照校验通过后由调用方写全局；快照错误形态不写全局（BN08）', () => {
    const getContext = () => ({ sessionKey: 'A', user: { id: 1 } })
    const r = resolveBridgeContext('r/bridge', 'A', getContext)
    expect(r.provide?.sessionKey).toBe('A')
    provideAppContext(r.provide!)
    expect(g.__FULGURJS_APP_CONFIG__.sessionKey).toBe('A')

    // getter 抛错 → MFU-016 phase getContext
    try {
      resolveBridgeContext('r/bridge', 'A', () => { throw new Error('ctx boom') })
      expect.unreachable()
    } catch (e) {
      expect(codeOf(e)).toBe('MFU-016')
      expect((e as any).details.phase).toBe('getContext')
    }
    // thenable → MFU-016；非对象 → MFU-016
    expect(() => resolveBridgeContext('r/bridge', 'A', (() => Promise.resolve({})) as never)).toThrowError(/MFU-016/)
    expect(() => resolveBridgeContext('r/bridge', 'A', (() => 42) as never)).toThrowError(/MFU-016/)
    // 快照 sessionKey 不匹配 → MFU-017，且不写 A 快照
    const before = JSON.stringify(g.__FULGURJS_APP_CONFIG__)
    try {
      resolveBridgeContext('r/bridge', 'B', () => ({ sessionKey: 'A' }))
      expect.unreachable()
    } catch (e) {
      expect(codeOf(e)).toBe('MFU-017')
    }
    expect(JSON.stringify(g.__FULGURJS_APP_CONFIG__)).toBe(before)
  })

  it('getContext 返回 null/undefined/原始值：MFU-016 phase getContext 且诊断含实际返回值，不抛 TypeError（BN08）', () => {
    // 回归：null/undefined 曾在错误消息构造分支再次访问 .then 抛出普通 TypeError（错误码丢失）
    for (const [returned, descFragment] of [
      [null, 'null'],
      [undefined, 'undefined'],
      ['oops', '非对象值（string："oops"）'],
      [true, '非对象值（boolean："true"）'],
    ] as const) {
      try {
        resolveBridgeContext('r/bridge', 'A', (() => returned) as never)
        expect.unreachable()
      } catch (e) {
        expect((e as TypeError).constructor.name, `返回 ${String(returned)} 不应抛 TypeError`).not.toBe('TypeError')
        expect(codeOf(e), `返回 ${String(returned)} 应保持 MFU-016`).toBe('MFU-016')
        expect((e as any).details.phase).toBe('getContext')
        expect((e as Error).message).toContain(descFragment)
        expect((e as Error).message).toContain('纯 getter')
      }
    }
    // Promise/thenable：诊断明确指向同步 getter 要求
    try {
      resolveBridgeContext('r/bridge', 'A', (() => Promise.resolve({ sessionKey: 'A' })) as never)
      expect.unreachable()
    } catch (e) {
      expect(codeOf(e)).toBe('MFU-016')
      expect((e as any).details.phase).toBe('getContext')
      expect((e as Error).message).toContain('Promise/thenable')
    }
  })

  it('无 getter 时校验现有 AppContext；不一致 → MFU-017', () => {
    expect(() => resolveBridgeContext('r/bridge', 'A', undefined)).toThrowError(/MFU-017/)
    provideAppContext({ sessionKey: 'A' })
    expect(resolveBridgeContext('r/bridge', 'A', undefined)).toEqual({})
    expect(() => resolveBridgeContext('r/bridge', 'B', undefined)).toThrowError(/MFU-017/)
  })

  it('换代清旧账号独有字段：A 的 foo 在 B 快照写入后消失（BR06 零残留）', () => {
    provideAppContext({ sessionKey: 'A', foo: 'A-private', user: { id: 1 } })
    const r = resolveBridgeContext('r/bridge', 'B', () => ({ sessionKey: 'B', user: { id: 2 } }))
    provideAppContext(r.provide!)
    const ctx = g.__FULGURJS_APP_CONFIG__
    expect(ctx.sessionKey).toBe('B')
    expect(ctx.user).toEqual({ id: 2 })
    expect(ctx.foo).toBeUndefined()
  })

  it('同会话快照重复 provide 幂等 merge（不清除其他字段）', () => {
    provideAppContext({ sessionKey: 'A', foo: 'kept', user: { id: 1 } })
    const r = resolveBridgeContext('r/bridge', 'A', () => ({ sessionKey: 'A', bar: 'added' }))
    provideAppContext(r.provide!)
    const ctx = g.__FULGURJS_APP_CONFIG__
    expect(ctx.foo).toBe('kept')
    expect(ctx.bar).toBe('added')
  })

  it('uncontrolled（sessionKey undefined）不校验 sessionKey，仍可提供快照', () => {
    const r = resolveBridgeContext('r/bridge', undefined, () => ({ user: { id: 9 } }))
    expect(r.provide).toEqual({ user: { id: 9 } })
    expect(resolveBridgeContext('r/bridge', undefined, undefined)).toEqual({})
  })
})
