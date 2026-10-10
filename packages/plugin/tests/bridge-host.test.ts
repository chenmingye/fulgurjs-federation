// @vitest-environment jsdom
/**
 * 桥接宿主工厂单测（任务书 §3.4/§4.3/§4.5、BN02/BN06/BN08/BN10、BR05/BR09 语义层）。
 * 用假 loadRemote 驱动真实 Vue/React 宿主组件，验证：会话代次、appProps 快照、
 * 错误占位与恢复、多实例单会话、StrictMode 安全、容器 DOM 稳定性。
 *
 * 受控 sessionKey 语义（§4.3）：无 getter 时要求页面 AppContext 已有同值 sessionKey，
 * 否则 MFU-017——各用例按此先 provideSession() 或提供 getContext。
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { createApp, h, defineComponent, nextTick, ref } from 'vue'
import { createElement, Fragment, StrictMode } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createVueBridgeAppWithLoader } from '../src/bridge-host-vue'
import { createReactBridgeAppWithLoader } from '../src/bridge-host-react'
import { clearAppContext, provideAppContext } from '../src/context'

const g = globalThis as any

/** 预置页面会话（受控 sessionKey 无 getter 时的合法前置） */
function provideSession(sk: string, extra: Record<string, unknown> = {}): void {
  g.__FULGURJS_APP_CONFIG__ = { sessionKey: sk, ...extra }
}

beforeEach(() => {
  delete g.__FULGURJS_APP_CONFIG__
  g.__FULGURJS_RUNTIME__ = { loadRemote: vi.fn(), clearSessionState: vi.fn() }
})
afterEach(() => {
  cleanup()
  delete g.__FULGURJS_APP_CONFIG__
  delete g.__FULGURJS_RUNTIME__
  vi.restoreAllMocks()
})

/** 构造假桥接契约模块：记录 mount/unmount 调用与收到的 props */
function fakeContractModule(opts: {
  tag: string
  onMount?: (el: HTMLElement, props: Record<string, unknown>) => void
  onUnmount?: (el: HTMLElement) => void
}) {
  const mounts: Array<{ el: HTMLElement; props: Record<string, unknown> }> = []
  const unmounts: HTMLElement[] = []
  const contract = {
    mount(el: HTMLElement, props?: Record<string, unknown>): void {
      const p = props ?? {}
      mounts.push({ el, props: p })
      opts.onMount?.(el, p)
      const node = document.createElement('div')
      node.setAttribute('data-testid', `content-${opts.tag}`)
      node.textContent = `${opts.tag}:${String((p as any).label ?? '')}`
      el.appendChild(node)
    },
    unmount(el: HTMLElement): void {
      unmounts.push(el)
      opts.onUnmount?.(el)
      el.textContent = ''
    },
  }
  return { mod: { default: contract }, mounts, unmounts, contract }
}

function statusOf(root: HTMLElement): string {
  return root.querySelector('[data-fulgurjs-bridge-root]')?.getAttribute('data-fulgurjs-bridge-status') ?? 'missing'
}

// ══ Vue 宿主（createVueBridgeApp）══════════════════════════════════════════

describe('Vue 宿主 createVueBridgeApp', () => {
  function mountHost(Comp: any, props: Record<string, unknown>): { app: ReturnType<typeof createApp>; root: HTMLElement; setProps: (p: Record<string, unknown>) => Promise<void> } {
    const root = document.createElement('div')
    document.body.appendChild(root)
    const state = ref(props)
    const Wrapper = defineComponent({
      setup() {
        return () => h(Comp, { key: 0, ...state.value })
      },
    })
    const app = createApp(Wrapper)
    app.mount(root)
    return {
      app,
      root,
      setProps: async (p: Record<string, unknown>) => {
        state.value = { ...state.value, ...p }
        await nextTick()
        await nextTick()
      },
    }
  }

  it('挂载成功：契约收到容器与 appProps 浅拷贝快照；sessionKey 不混入业务 props（BR02/BR05）', async () => {
    const fake = fakeContractModule({ tag: 'react-app' })
    const loadRemote = vi.fn(async () => fake.mod)
    const Comp = createVueBridgeAppWithLoader(loadRemote)('remote-react/bridge', { getContext: () => ({ sessionKey: 'A', user: { id: 1 } }) })
    const onReady = () => {}
    const nested = { deep: 'obj' }
    const host = mountHost(Comp, { sessionKey: 'A', appProps: { label: 'L1', onReady, nested } })
    await waitFor(() => expect(statusOf(host.root)).toBe('ready'))
    expect(fake.mounts).toHaveLength(1)
    const { el, props } = fake.mounts[0]!
    // 容器是 data-fulgurjs-bridge-root 元素本体
    expect(el.getAttribute('data-fulgurjs-bridge-root')).toBe('remote-react/bridge')
    // 回归：容器默认占满宿主挂载区——无尺寸裸容器会让子应用 height:100% 布局链塌陷为 0
    expect(el.style.width).toBe('100%')
    expect(el.style.height).toBe('100%')
    // 浅拷贝快照：嵌套对象与函数保留原引用
    expect(props.label).toBe('L1')
    expect(props.onReady).toBe(onReady)
    expect(props.nested).toBe(nested)
    // sessionKey 控制参数不进入业务 props
    expect(props.sessionKey).toBeUndefined()
    // getContext 快照已由桥接层写入全局
    expect(g.__FULGURJS_APP_CONFIG__.sessionKey).toBe('A')
    expect(loadRemote).toHaveBeenCalledWith('remote-react/bridge', { retries: undefined })
    host.app.unmount()
  })

  it('同会话重渲染/只换 appProps 引用：不重挂、不重复 loadRemote（BR05/BR09）', async () => {
    provideSession('A')
    const fake = fakeContractModule({ tag: 'r' })
    const loadRemote = vi.fn(async () => fake.mod)
    const Comp = createVueBridgeAppWithLoader(loadRemote)('r/bridge', {})
    const host = mountHost(Comp, { sessionKey: 'A', appProps: { label: 'one' } })
    await waitFor(() => expect(statusOf(host.root)).toBe('ready'))
    expect(fake.mounts).toHaveLength(1)
    await host.setProps({ appProps: { label: 'two' } })
    await new Promise((r) => setTimeout(r, 20))
    expect(fake.mounts).toHaveLength(1)
    expect(loadRemote).toHaveBeenCalledTimes(1)
    // 顶层业务数据仍是上次挂载快照
    expect(fake.mounts[0]!.props.label).toBe('one')
    host.app.unmount()
  })

  it('登出（sessionKey → null）：立即卸载、不再请求；重登挂新代次（BR06）', async () => {
    provideSession('A')
    const fake = fakeContractModule({ tag: 'r' })
    const loadRemote = vi.fn(async () => fake.mod)
    const Comp = createVueBridgeAppWithLoader(loadRemote)('r/bridge', {})
    const host = mountHost(Comp, { sessionKey: 'A', appProps: { label: 'x' } })
    await waitFor(() => expect(statusOf(host.root)).toBe('ready'))
    expect(fake.unmounts).toHaveLength(0)
    clearAppContext()
    await host.setProps({ sessionKey: null })
    expect(fake.unmounts).toHaveLength(1)
    expect(statusOf(host.root)).toBe('idle')
    const calls = loadRemote.mock.calls.length
    await new Promise((r) => setTimeout(r, 20))
    expect(loadRemote.mock.calls.length).toBe(calls)
    // 重登：非空代次重新挂载（无 getter，校验现有 context）
    provideSession('B')
    await host.setProps({ sessionKey: 'B' })
    await waitFor(() => expect(statusOf(host.root)).toBe('ready'))
    expect(fake.mounts).toHaveLength(2)
    host.app.unmount()
  })

  it('A→B 直换：先卸载 A 再挂 B，B 快照写入且 A 独有字段消失（BR06）', async () => {
    let desired = 'A'
    const fakeA = fakeContractModule({ tag: 'a' })
    const fakeB = fakeContractModule({ tag: 'b' })
    const mods: Record<string, unknown> = { A: fakeA.mod, B: fakeB.mod }
    const loadRemote = vi.fn(async () => mods[desired])
    const Comp = createVueBridgeAppWithLoader(loadRemote)('r/bridge', {
      getContext: () => (desired === 'B'
        ? { sessionKey: 'B', user: { id: 2 }, bOnly: 'B-field' }
        : { sessionKey: 'A', user: { id: 1 }, aOnly: 'A-field' }),
    })
    const host = mountHost(Comp, { sessionKey: 'A', appProps: {} })
    await waitFor(() => expect(statusOf(host.root)).toBe('ready'))
    expect(fakeA.mounts).toHaveLength(1)
    expect(g.__FULGURJS_APP_CONFIG__.aOnly).toBe('A-field')
    desired = 'B'
    await host.setProps({ sessionKey: 'B' })
    await waitFor(() => expect(fakeB.mounts).toHaveLength(1))
    // A 已卸载、B 已挂载；A 独有字段消失
    expect(fakeA.unmounts).toHaveLength(1)
    expect(g.__FULGURJS_APP_CONFIG__.sessionKey).toBe('B')
    expect(g.__FULGURJS_APP_CONFIG__.bOnly).toBe('B-field')
    expect(g.__FULGURJS_APP_CONFIG__.aOnly).toBeUndefined()
    host.app.unmount()
  })

  it('加载失败 → 默认占位（错误码 + 重试按钮）；恢复后「重试加载」同页成功（BR07/BN02）', async () => {
    let shouldFail = true
    const fake = fakeContractModule({ tag: 'r' })
    const loadRemote = vi.fn(async () => {
      if (shouldFail) throw Object.assign(new Error('remote unreachable'), { code: 'MFU-001' })
      return fake.mod
    })
    const Comp = createVueBridgeAppWithLoader(loadRemote)('r/bridge', {})
    const host = mountHost(Comp, { sessionKey: undefined, appProps: { label: 'x' } })
    await waitFor(() => expect(statusOf(host.root)).toBe('error'))
    const errNode = host.root.querySelector('[data-fulgurjs-error]')
    expect(errNode?.getAttribute('data-fulgurjs-error')).toBe('MFU-001')
    expect(errNode?.textContent).toContain('重试加载')
    expect(errNode?.textContent).toContain('刷新页面重试')
    shouldFail = false
    fireEvent((errNode!.querySelector('[data-fulgurjs-retry]') as HTMLElement), new Event('click'))
    await waitFor(() => expect(statusOf(host.root)).toBe('ready'))
    expect(fake.mounts).toHaveLength(1)
    host.app.unmount()
  })

  it('契约非法 → MFU-015 占位（BN01）', async () => {
    const loadRemote = vi.fn(async () => ({ default: { mount: 1 } }))
    const Comp = createVueBridgeAppWithLoader(loadRemote)('r/bridge', {})
    const host = mountHost(Comp, { sessionKey: undefined, appProps: {} })
    await waitFor(() => expect(statusOf(host.root)).toBe('error'))
    const errNode = host.root.querySelector('[data-fulgurjs-error]')
    expect(errNode?.getAttribute('data-fulgurjs-error')).toBe('MFU-015')
    host.app.unmount()
  })

  it('受控 sessionKey 为空字符串 → MFU-017 拒绝且不加载；无 getter 且页面无会话 → MFU-017（BN10/BN08）', async () => {
    const loadRemote = vi.fn(async () => fakeContractModule({ tag: 'r' }).mod)
    const Comp = createVueBridgeAppWithLoader(loadRemote)('r/bridge', {})
    const host = mountHost(Comp, { sessionKey: '', appProps: {} })
    await waitFor(() => expect(statusOf(host.root)).toBe('error'))
    expect(host.root.querySelector('[data-fulgurjs-error]')?.getAttribute('data-fulgurjs-error')).toBe('MFU-017')
    expect(loadRemote).not.toHaveBeenCalled()
    // 数字同样拒绝
    await host.setProps({ sessionKey: 123 as unknown as string })
    await nextTick()
    expect(host.root.querySelector('[data-fulgurjs-error]')?.getAttribute('data-fulgurjs-error')).toBe('MFU-017')
    // 无 getter + 页面无 AppContext 的受控代次 → MFU-017 且不写全局
    await host.setProps({ sessionKey: 'A' })
    await waitFor(() => expect(host.root.querySelector('[data-fulgurjs-error]')?.getAttribute('data-fulgurjs-error')).toBe('MFU-017'))
    expect(g.__FULGURJS_APP_CONFIG__).toBeUndefined()
    expect(loadRemote).not.toHaveBeenCalled()
    host.app.unmount()
  })

  it('同页两个实例：同会话并存互不干扰；不同会话后挂者 MFU-017（BR09/BN10）', async () => {
    provideSession('A')
    const fake = fakeContractModule({ tag: 'r' })
    const loadRemote = vi.fn(async () => fake.mod)
    const Comp = createVueBridgeAppWithLoader(loadRemote)('r/bridge', {})
    const host1 = mountHost(Comp, { sessionKey: 'A', appProps: { label: 'i1' } })
    await waitFor(() => expect(statusOf(host1.root)).toBe('ready'))
    const host2 = mountHost(Comp, { sessionKey: 'A', appProps: { label: 'i2' } })
    await waitFor(() => expect(statusOf(host2.root)).toBe('ready'))
    expect(fake.mounts).toHaveLength(2)
    // 第三个实例传不同代次 → MFU-017（页面级单会话）
    const host3 = mountHost(Comp, { sessionKey: 'B', appProps: {} })
    await waitFor(() => expect(statusOf(host3.root)).toBe('error'))
    expect(host3.root.querySelector('[data-fulgurjs-error]')?.getAttribute('data-fulgurjs-error')).toBe('MFU-017')
    host1.app.unmount()
    host2.app.unmount()
    host3.app.unmount()
  })

  it('宿主组件卸载：契约 unmount 被同步调用且容器清空（BR04 语义层）', async () => {
    provideSession('A')
    const fake = fakeContractModule({ tag: 'r' })
    const loadRemote = vi.fn(async () => fake.mod)
    const Comp = createVueBridgeAppWithLoader(loadRemote)('r/bridge', {})
    const host = mountHost(Comp, { sessionKey: 'A', appProps: {} })
    await waitFor(() => expect(statusOf(host.root)).toBe('ready'))
    host.app.unmount()
    expect(fake.unmounts).toHaveLength(1)
  })

  it('子应用 unmount 抛错：MFU-016 持久封锁容器——重试与换会话都不再挂载（BN09）', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    provideSession('A')
    const fake = fakeContractModule({
      tag: 'r',
      onUnmount: () => { throw new Error('sub unmount boom') },
    })
    const loadRemote = vi.fn(async () => fake.mod)
    const Comp = createVueBridgeAppWithLoader(loadRemote)('r/bridge', {})
    const host = mountHost(Comp, { sessionKey: 'A', appProps: {} })
    await waitFor(() => expect(statusOf(host.root)).toBe('ready'))
    expect(fake.mounts).toHaveLength(1)
    // A→B：契约 unmount 抛错 → 宿主报告 MFU-016（phase: unmount，含原始原因）且不启动新实例
    provideSession('B')
    await host.setProps({ sessionKey: 'B' })
    await waitFor(() => expect(statusOf(host.root)).toBe('error'))
    const errEl = host.root.querySelector('[data-fulgurjs-error]')
    expect(errEl?.getAttribute('data-fulgurjs-error')).toBe('MFU-016')
    expect(errEl?.textContent).toContain('unmount 阶段失败')
    expect(errEl?.textContent).toContain('sub unmount boom')
    expect(fake.mounts).toHaveLength(1)
    // 封锁后：默认占位不提供「重试加载」（重挂不安全），只保留整页刷新恢复
    expect(host.root.querySelector('[data-fulgurjs-retry]')).toBeNull()
    expect(host.root.querySelector('[data-fulgurjs-reload]')).not.toBeNull()
    // 换会话（B→null→B）不得绕过封锁：不重挂、不覆盖错误态
    await host.setProps({ sessionKey: null })
    await host.setProps({ sessionKey: 'B' })
    await new Promise((r) => setTimeout(r, 20))
    expect(statusOf(host.root)).toBe('error')
    expect(fake.mounts).toHaveLength(1)
    expect(fake.unmounts).toHaveLength(1)
    // 卸载失败恰好报告一次；封锁后组件卸载不再重复报错
    expect(consoleError).toHaveBeenCalledTimes(1)
    host.app.unmount()
    expect(consoleError).toHaveBeenCalledTimes(1)
    consoleError.mockRestore()
  })

  it('正常卸载后换会话重挂仍可用（BN09 回归对照：封锁只针对 unmount 失败的容器）', async () => {
    provideSession('A')
    const fake = fakeContractModule({ tag: 'ok' })
    const loadRemote = vi.fn(async () => fake.mod)
    const Comp = createVueBridgeAppWithLoader(loadRemote)('r/bridge', {})
    const host = mountHost(Comp, { sessionKey: 'A', appProps: {} })
    await waitFor(() => expect(statusOf(host.root)).toBe('ready'))
    provideSession('B')
    await host.setProps({ sessionKey: 'B' })
    await waitFor(() => expect(statusOf(host.root)).toBe('ready'))
    expect(fake.mounts).toHaveLength(2)
    expect(fake.unmounts).toHaveLength(1)
    host.app.unmount()
    expect(fake.unmounts).toHaveLength(2)
  })

  it('pending 时换会话：迟到的旧模块不调用 mount、不覆盖新代次（BN06/BN07）', async () => {
    let desired = 'A'
    provideSession('A')
    let releaseA: ((v: unknown) => void) | undefined
    const fake = fakeContractModule({ tag: 'r' })
    const loadRemote = vi.fn(() => {
      if (desired === 'A') {
        return new Promise((resolve) => { releaseA = resolve })
      }
      return Promise.resolve(fake.mod)
    })
    const Comp = createVueBridgeAppWithLoader(loadRemote)('r/bridge', {})
    const host = mountHost(Comp, { sessionKey: 'A', appProps: {} })
    await new Promise((r) => setTimeout(r, 10))
    expect(statusOf(host.root)).toBe('pending')
    // A 还停在 loadRemote：直接换代到 B
    provideSession('B')
    desired = 'B'
    await host.setProps({ sessionKey: 'B' })
    await waitFor(() => expect(statusOf(host.root)).toBe('ready'))
    expect(fake.mounts).toHaveLength(1)
    // A 迟到 resolve：不得调用 mount
    releaseA?.(fake.mod)
    await new Promise((r) => setTimeout(r, 20))
    expect(fake.mounts).toHaveLength(1)
    host.app.unmount()
  })
})

// ══ React 宿主（createReactBridgeApp）══════════════════════════════════════

describe('React 宿主 createReactBridgeApp', () => {
  it('挂载成功：契约收到容器与快照；StrictMode 双 effect 无双实例（BR03/BR05）', async () => {
    const fake = fakeContractModule({ tag: 'vue-app' })
    const loadRemote = vi.fn(async () => fake.mod)
    const Comp = createReactBridgeAppWithLoader(loadRemote)('remote-vue/bridge', { getContext: () => ({ sessionKey: 'A', user: { id: 1 } }) })
    const onReady = () => {}
    const nested = { deep: 1 }
    render(
      createElement(StrictMode, null,
        createElement(Comp, { sessionKey: 'A', appProps: { label: 'L1', onReady, nested } })),
    )
    await screen.findByTestId('content-vue-app')
    expect(fake.mounts).toHaveLength(1)
    const { el, props } = fake.mounts[0]!
    expect(el.getAttribute('data-fulgurjs-bridge-root')).toBe('remote-vue/bridge')
    expect(props.label).toBe('L1')
    expect(props.onReady).toBe(onReady)
    expect(props.nested).toBe(nested)
    expect(props.sessionKey).toBeUndefined()
    expect(g.__FULGURJS_APP_CONFIG__.sessionKey).toBe('A')
    expect(document.querySelectorAll('[data-testid="content-vue-app"]')).toHaveLength(1)
  })

  it('登出（sessionKey → null）：立即卸载并保持空容器；重登新代次（BR06）', async () => {
    provideSession('A')
    const fake = fakeContractModule({ tag: 'v' })
    const loadRemote = vi.fn(async () => fake.mod)
    const Comp = createReactBridgeAppWithLoader(loadRemote)('r/bridge', {})
    const { rerender } = render(createElement(Comp, { sessionKey: 'A', appProps: {} }))
    await screen.findByTestId('content-v')
    clearAppContext()
    rerender(createElement(Comp, { sessionKey: null, appProps: {} }))
    await waitFor(() => expect(fake.unmounts).toHaveLength(1))
    expect(document.querySelector('[data-fulgurjs-bridge-root]')?.getAttribute('data-fulgurjs-bridge-status')).toBe('idle')
    const calls = loadRemote.mock.calls.length
    provideSession('B')
    rerender(createElement(Comp, { sessionKey: 'B', appProps: {} }))
    await screen.findByTestId('content-v')
    expect(fake.mounts).toHaveLength(2)
    expect(loadRemote.mock.calls.length).toBeGreaterThan(calls)
  })

  it('同会话重渲染不重挂；appProps 只换引用拿不到新值（BR05）', async () => {
    provideSession('A')
    const fake = fakeContractModule({ tag: 'v' })
    const loadRemote = vi.fn(async () => fake.mod)
    const Comp = createReactBridgeAppWithLoader(loadRemote)('r/bridge', {})
    const { rerender } = render(createElement(Comp, { sessionKey: 'A', appProps: { label: 'one' } }))
    await screen.findByTestId('content-v')
    expect(fake.mounts[0]!.props.label).toBe('one')
    rerender(createElement(Comp, { sessionKey: 'A', appProps: { label: 'two' } }))
    await act(async () => { await new Promise((r) => setTimeout(r, 20)) })
    expect(fake.mounts).toHaveLength(1)
    expect(fake.mounts[0]!.props.label).toBe('one')
    expect(loadRemote).toHaveBeenCalledTimes(1)
  })

  it('A→B 直换：旧代次作废并卸载，新代次挂载（BR06/BN07）', async () => {
    let desired = 'A'
    const fakeA = fakeContractModule({ tag: 'a' })
    const fakeB = fakeContractModule({ tag: 'b' })
    const loadRemote = vi.fn(async () => (desired === 'B' ? fakeB.mod : fakeA.mod))
    const Comp = createReactBridgeAppWithLoader(loadRemote)('r/bridge', {
      getContext: () => (desired === 'B'
        ? { sessionKey: 'B', user: { id: 2 }, bOnly: true }
        : { sessionKey: 'A', user: { id: 1 }, aOnly: true }),
    })
    const { rerender } = render(createElement(Comp, { sessionKey: 'A', appProps: {} }))
    await screen.findByTestId('content-a')
    desired = 'B'
    rerender(createElement(Comp, { sessionKey: 'B', appProps: {} }))
    await screen.findByTestId('content-b')
    expect(fakeA.unmounts).toHaveLength(1)
    expect(g.__FULGURJS_APP_CONFIG__.sessionKey).toBe('B')
    expect(g.__FULGURJS_APP_CONFIG__.aOnly).toBeUndefined()
    expect(g.__FULGURJS_APP_CONFIG__.bOnly).toBe(true)
  })

  it('加载失败 → 默认占位（错误码+两操作）；恢复后重试成功（BR07）', async () => {
    let shouldFail = true
    const fake = fakeContractModule({ tag: 'v' })
    const loadRemote = vi.fn(async () => {
      if (shouldFail) throw Object.assign(new Error('unreachable'), { code: 'MFU-001' })
      return fake.mod
    })
    const Comp = createReactBridgeAppWithLoader(loadRemote)('r/bridge', {})
    render(createElement(Comp, { sessionKey: undefined, appProps: {} }))
    const errBox = await screen.findByText(/桥接应用加载失败/).then((n) => n.closest('[data-fulgurjs-error]') as HTMLElement)
    expect(errBox.getAttribute('data-fulgurjs-error')).toBe('MFU-001')
    shouldFail = false
    fireEvent.click(errBox.querySelector('[data-fulgurjs-retry]') as HTMLElement)
    await screen.findByTestId('content-v')
    expect(fake.mounts).toHaveLength(1)
  })

  it('契约非法 → MFU-015 占位（BN01）', async () => {
    const loadRemote = vi.fn(async () => ({ default: {} }))
    const Comp = createReactBridgeAppWithLoader(loadRemote)('r/bridge', {})
    render(createElement(Comp, { sessionKey: undefined, appProps: {} }))
    await waitFor(() => {
      expect(document.querySelector('[data-fulgurjs-error="MFU-015"]')).not.toBeNull()
    })
  })

  it('mount pending 时换会话：迟到结果不调用 mount（BN06/BN07）', async () => {
    let desired = 'A'
    let releaseA: ((v: unknown) => void) | undefined
    const fake = fakeContractModule({ tag: 'v' })
    const loadRemote = vi.fn(() => {
      if (desired === 'A') {
        return new Promise((resolve) => { releaseA = resolve })
      }
      return Promise.resolve(fake.mod)
    })
    const Comp = createReactBridgeAppWithLoader(loadRemote)('r/bridge', {
      getContext: () => ({ sessionKey: desired }),
    })
    const { rerender } = render(createElement(Comp, { sessionKey: undefined, appProps: {} }))
    await act(async () => { await new Promise((r) => setTimeout(r, 10)) })
    expect(document.querySelector('[data-fulgurjs-bridge-root]')?.getAttribute('data-fulgurjs-bridge-status')).toBe('pending')
    desired = 'B'
    rerender(createElement(Comp, { sessionKey: 'B', appProps: {} }))
    await screen.findByTestId('content-v')
    releaseA?.(fake.mod)
    await act(async () => { await new Promise((r) => setTimeout(r, 20)) })
    expect(fake.mounts).toHaveLength(1)
  })

  it('子应用 unmount 抛错：MFU-016 持久封锁容器——重试与换会话都不再挂载（BN09）', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    provideSession('A')
    const fake = fakeContractModule({ tag: 'v', onUnmount: () => { throw new Error('sub unmount boom') } })
    const loadRemote = vi.fn(async () => fake.mod)
    const Comp = createReactBridgeAppWithLoader(loadRemote)('r/bridge', {})
    const { rerender, unmount } = render(createElement(Comp, { sessionKey: 'A', appProps: {} }))
    await screen.findByTestId('content-v')
    expect(fake.mounts).toHaveLength(1)
    // A→B：契约 unmount 抛错 → MFU-016（phase: unmount，含原始原因）且不启动新实例
    provideSession('B')
    await act(async () => { rerender(createElement(Comp, { sessionKey: 'B', appProps: {} })) })
    await waitFor(() => {
      expect(document.querySelector('[data-fulgurjs-error="MFU-016"]')).not.toBeNull()
    })
    const errEl = document.querySelector('[data-fulgurjs-error="MFU-016"]')
    expect(errEl?.textContent).toContain('unmount 阶段失败')
    expect(errEl?.textContent).toContain('sub unmount boom')
    expect(fake.mounts).toHaveLength(1)
    // 封锁后：默认占位不提供「重试加载」，只保留整页刷新恢复
    expect(document.querySelector('[data-fulgurjs-retry]')).toBeNull()
    expect(document.querySelector('[data-fulgurjs-reload]')).not.toBeNull()
    // 换会话（B→null→B）不得绕过封锁：不重挂、不覆盖错误态
    await act(async () => { rerender(createElement(Comp, { sessionKey: null, appProps: {} })) })
    await act(async () => { rerender(createElement(Comp, { sessionKey: 'B', appProps: {} })) })
    await act(async () => { await new Promise((r) => setTimeout(r, 20)) })
    expect(document.querySelector('[data-fulgurjs-bridge-root]')?.getAttribute('data-fulgurjs-bridge-status')).toBe('error')
    expect(fake.mounts).toHaveLength(1)
    expect(fake.unmounts).toHaveLength(1)
    // 卸载失败恰好报告一次
    expect(consoleError).toHaveBeenCalledTimes(1)
    unmount()
    expect(consoleError).toHaveBeenCalledTimes(1)
    consoleError.mockRestore()
  })

  it('自定义 fallback 与 error 渲染函数生效（§3.4 选项）', async () => {
    const loadRemote = vi.fn(async () => { throw Object.assign(new Error('x'), { code: 'MFU-001' }) })
    const Comp = createReactBridgeAppWithLoader(loadRemote)('r/bridge', {
      fallback: createElement('p', { 'data-testid': 'my-fallback' }, 'loading…'),
      error: (e: unknown) => createElement('p', { 'data-testid': 'my-error' }, `custom:${(e as { code?: string }).code}`),
    })
    render(createElement(Comp, { sessionKey: undefined, appProps: {} }))
    await screen.findByTestId('my-error')
    expect(screen.getByTestId('my-error').textContent).toBe('custom:MFU-001')
  })

  it('非法选项（负数 retries / NaN timeout）同步报错（§3.4）', () => {
    const factory = createReactBridgeAppWithLoader(vi.fn())
    expect(() => factory('r/bridge', { retries: -1 })).toThrowError(/retries/)
    expect(() => factory('r/bridge', { timeout: Number.NaN })).toThrowError(/timeout/)
    const vueFactory = createVueBridgeAppWithLoader(vi.fn())
    expect(() => vueFactory('r/bridge', { retries: 11 })).toThrowError(/retries/)
  })
})
