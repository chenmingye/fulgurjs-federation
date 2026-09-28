// @vitest-environment jsdom
/**
 * D01 回归：同实例会话切换（任务书 §3 复现用例）。
 * 修复前这些用例失败（calls 停在 ["A"]，渲染保持 A 的数据）；
 * 修复后：context.sessionKey 变化 + 宿主 rerender ⇒ 已挂载实例重新走加载生命周期。
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, fireEvent, cleanup } from '@testing-library/react'
import { createElement, useEffect, useState, type ReactNode } from 'react'
import {
  createRemoteComponent,
  createUseLoadRemote,
  createReactHostPages,
} from '../src/react-adapter'

const g = globalThis as any

function setSession(sk: string | undefined): void {
  if (sk === undefined) delete g.__FULGURJS_APP_CONFIG__
  else g.__FULGURJS_APP_CONFIG__ = { ...(g.__FULGURJS_APP_CONFIG__ ?? {}), sessionKey: sk }
}

beforeEach(() => {
  delete g.__FULGURJS_APP_CONFIG__
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  delete g.__FULGURJS_APP_CONFIG__
})

/** 提供新 context 并触发 rerender 的宿主 harness（模拟宿主「provide 后 setState」契约） */
function makeRerenderableHost(childOf: (sessionKey: string | undefined) => ReactNode) {
  let rerender: ((sk: string | undefined) => void) | null = null
  function Host(): ReactNode {
    const [sk, setSk] = useState<string | undefined>(undefined)
    useEffect(() => {
      rerender = setSk
    }, [])
    return childOf(sk)
  }
  render(createElement(Host))
  return (sk: string | undefined) => {
    if (sk === undefined) delete g.__FULGURJS_APP_CONFIG__
    else g.__FULGURJS_APP_CONFIG__ = { ...(g.__FULGURJS_APP_CONFIG__ ?? {}), sessionKey: sk }
    act(() => { rerender?.(sk) })
  }
}

describe('D01: useLoadRemote 同实例 A→B', () => {
  it('sessionKey 变化 + rerender ⇒ 重新加载并渲染 B 的数据', async () => {
    const load = vi.fn((spec: string) => {
      const sk = g.__FULGURJS_APP_CONFIG__?.sessionKey
      return Promise.resolve({ value: `${spec}@${sk ?? 'none'}` })
    })
    const useLoad = createUseLoadRemote(load)
    const switchTo = makeRerenderableHost(() => {
      const r = useLoad('r/data')
      return createElement('p', { 'data-testid': 'probe' }, `${r.loading ? 'loading' : 'ok'}:${r.data?.value ?? ''}:${r.error ? 'ERR' : 'OK'}`)
    })

    await screen.findByText('ok:r/data@none:OK')
    expect(load).toHaveBeenCalledTimes(1)

    // A → B：同实例 rerender，必须重新走 loadRemote（新代次）
    switchTo('A')
    await screen.findByText('ok:r/data@A:OK')
    expect(load).toHaveBeenCalledTimes(2)

    switchTo('B')
    await screen.findByText('ok:r/data@B:OK')
    expect(load).toHaveBeenCalledTimes(3)
  })

  it('undefined→A 与 A→clear(退出)→B 分开成立；无 session 普通组件不受影响', async () => {
    const load = vi.fn((spec: string) =>
      Promise.resolve({ value: `${spec}@${g.__FULGURJS_APP_CONFIG__?.sessionKey ?? 'anon'}` }))
    const useLoad = createUseLoadRemote(load)
    const switchTo = makeRerenderableHost(() => {
      const r = useLoad('r/pub')
      return createElement('p', null, `${r.data?.value ?? '…'}`)
    })

    await screen.findByText('r/pub@anon') // 无 session 正常加载（公开组件场景）
    switchTo('A')
    await screen.findByText('r/pub@A')
    // 登出：clearAppContext 后 rerender——context 无 sessionKey，hook 回到公开态（清旧会话数据）
    switchTo(undefined)
    await screen.findByText('r/pub@anon')
    expect(load).toHaveBeenCalledTimes(3)
  })

  it('慢 A 晚于 B 返回：B 保持不变（乱序不覆盖）', async () => {
    let releaseA: (v: any) => void = () => {}
    const load = vi.fn((spec: string) => {
      const sk = g.__FULGURJS_APP_CONFIG__?.sessionKey
      if (sk === 'A') return new Promise((resolve) => { releaseA = resolve })
      return Promise.resolve({ value: `${spec}@${sk}` })
    })
    const useLoad = createUseLoadRemote(load)
    const switchTo = makeRerenderableHost(() => {
      const r = useLoad('r/race')
      return createElement('p', null, `${r.data?.value ?? '…'}`)
    })

    switchTo('A')
    await screen.findByText('…') // A pending
    switchTo('B')
    await screen.findByText('r/race@B')
    // A 的慢请求晚到：不得覆盖 B
    await act(async () => { releaseA({ value: 'r/race@A-late' }) })
    await new Promise((r) => setTimeout(r, 20))
    expect(screen.getByText('r/race@B')).toBeTruthy()
    expect(screen.queryByText('r/race@A-late')).toBeNull()
  })

  it('同会话普通 rerender 不重复加载（去重）', async () => {
    const load = vi.fn(() => Promise.resolve({ v: 1 }))
    const useLoad = createUseLoadRemote(load)
    let bump: (() => void) | null = null
    function Host(): ReactNode {
      const [, setN] = useState(0)
      useEffect(() => { bump = () => setN((x) => x + 1) }, [])
      const r = useLoad('r/same')
      return createElement('p', null, `${r.data?.v ?? '…'}`)
    }
    render(createElement(Host))
    await screen.findByText('1')
    const calls = load.mock.calls.length
    act(() => { bump?.() })
    act(() => { bump?.() })
    await new Promise((r) => setTimeout(r, 30))
    expect(load.mock.calls.length).toBe(calls) // 同代次 rerender 不重载
  })
})

describe('D01: remoteComponent 同实例 A→B', () => {
  it('已挂载的远程组件随 sessionKey 重载新会话数据', async () => {
    const load = vi.fn((spec: string) =>
      Promise.resolve({ default: function C() { return createElement('p', null, `loaded-for:${g.__FULGURJS_APP_CONFIG__?.sessionKey ?? 'anon'}`) } }))
    const RC = createRemoteComponent(load)('r/rc')
    const switchTo = makeRerenderableHost(() => createElement(RC))

    await screen.findByText('loaded-for:anon')
    switchTo('A')
    await screen.findByText('loaded-for:A')
    expect(load).toHaveBeenCalledTimes(2)
    switchTo('B')
    await screen.findByText('loaded-for:B')
    expect(load).toHaveBeenCalledTimes(3)
  })
})

describe('D01: hostPages.component(spec) 模块级缓存 A→B', () => {
  it('模块级缓存组件在会话切换后重载（不依赖重新调用 component()）', async () => {
    const load = vi.fn((spec: string) =>
      Promise.resolve({ default: function Page() { return createElement('p', null, `page-user:${g.__FULGURJS_APP_CONFIG__?.sessionKey ?? 'anon'}`) } }))
    const hp = createReactHostPages(
      { pages: [{ route: '/x/home', spec: 'pages/home' }], remotePrefixes: { '/x': 'rx' } },
      load as never,
    )
    const Cached = hp.component('rx/pages/home') // 模块级缓存一次
    const switchTo = makeRerenderableHost(() => createElement(Cached))

    await screen.findByText('page-user:anon')
    switchTo('A')
    await screen.findByText('page-user:A')
    switchTo('B')
    await screen.findByText('page-user:B')
    expect(load.mock.calls.length).toBeGreaterThanOrEqual(3)
  })
})

describe('D01: reload 卸载/会话切换失效（§3.4 状态契约）', () => {
  it('reload 期间卸载：过期结果不写状态；契约统一 data=undefined/error=undefined/loading=true', async () => {
    let resolveReload: (v: any) => void = () => {}
    const load = vi.fn((spec: string) => new Promise((resolve) => { resolveReload = resolve }))
    const useLoad = createUseLoadRemote(load)
    let out: any
    function Comp(): ReactNode {
      out = useLoad('r/x')
      return createElement('p', null, `${out.loading ? 'L' : 'D'}:${out.data ? 'has' : 'no'}`)
    }
    const { unmount } = render(createElement(Comp))
    await screen.findByText('L:no') // 首次加载 pending（resolve 握手在 reload 覆盖后完成）
    // 卸载前发起 reload；卸载后 resolve——状态不得更新（也无未处理拒绝）
    void out.reload()
    unmount()
    await act(async () => { resolveReload({ late: true }) })
    expect(out.data).toBeUndefined()
  })

  it('reload 失败呈现于 error（Promise<void> 不抛）', async () => {
    let fail = false
    const load = vi.fn((spec: string) => fail ? Promise.reject(new Error('reload-fail')) : Promise.resolve({ v: 1 }))
    const useLoad = createUseLoadRemote(load)
    let out: any
    function Comp(): ReactNode {
      out = useLoad('r/f')
      return createElement('button', { onClick: () => void out.reload() }, out.error ? String((out.error as Error).message) : 'ok')
    }
    render(createElement(Comp))
    await screen.findByText('ok')
    fail = true
    await act(async () => { fireEvent.click(screen.getByText('ok')) })
    await screen.findByText('reload-fail')
    expect(out.loading).toBe(false)
  })
})
