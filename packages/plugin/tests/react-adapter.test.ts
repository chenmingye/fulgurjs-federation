// @vitest-environment jsdom
/**
 * react-adapter 单测：remoteComponent 状态机（pending/ready/error/timeout/retry）、
 * 导出形态校验、渲染边界、useLoadRemote 竞态与 StrictMode、RemoteErrorBoundary、
 * createReactHostPages 会话代次缓存。真实浏览器链路（loadRemote→容器协商）由 e2e 覆盖。
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react'
import { Component, createElement, forwardRef, memo, useState, useEffect, type ReactNode } from 'react'
import {
  createRemoteComponent,
  createUseLoadRemote,
  createReactHostPages,
  RemoteErrorBoundary,
} from '../src/react-adapter'

beforeEach(() => {
  const g = globalThis as any
  delete g.__FULGURJS_APP_CONFIG__
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  const g = globalThis as any
  delete g.__FULGURJS_APP_CONFIG__
})

/** 同步解析的 loadRemote 桩（微任务后交付） */
const okLoader = (impl: (spec: string) => any) =>
  vi.fn((spec: string) => Promise.resolve(impl(spec)))

describe('remoteComponent 加载与渲染', () => {
  it('pending 显示 fallback，成功后渲染远程组件并透传 props/children/回调', async () => {
    const load = okLoader(() => ({ default: ({ label, onClick }: { label: string; onClick: () => void }) =>
      createElement('button', { onClick }, label) }))
    const RemoteButton = createRemoteComponent(load)('r/Button', { fallback: createElement('p', null, '加载中…') })
    const onClick = vi.fn()
    render(createElement(RemoteButton, { label: '远程按钮', onClick }))
    expect(screen.getByText('加载中…')).toBeTruthy()
    const btn = await screen.findByText('远程按钮')
    fireEvent.click(btn)
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(load).toHaveBeenCalledWith('r/Button', { retries: undefined })
  })

  it('工厂创建不触发加载；首次渲染才 loadRemote', () => {
    const load = vi.fn(() => Promise.resolve({ default: () => null }))
    createRemoteComponent(load)('r/never-rendered')
    expect(load).not.toHaveBeenCalled()
  })

  it('函数/memo/forwardRef 导出均正确渲染；ref 透传到 forwardRef 组件', async () => {
    const RefComp = forwardRef(function RefTarget({ v }: { v: number }, ref: any) {
      return createElement('p', { ref, 'data-v': v }, `ref-${v}`)
    })
    const load = okLoader(() => ({ default: RefComp }))
    const RemoteRef = createRemoteComponent(load)('r/Ref')
    let node: HTMLElement | null = null
    const setRef = (el: HTMLElement | null) => { node = el }
    render(createElement(RemoteRef, { v: 7, ref: setRef } as never))
    expect(await screen.findByText('ref-7')).toBeTruthy()
    await waitFor(() => expect(node).toBeInstanceOf(HTMLElement))
    const MemoComp = memo(function M() { return createElement('p', null, 'memo-ok') })
    const load2 = okLoader(() => ({ default: MemoComp }))
    const RemoteMemo = createRemoteComponent(load2)('r/Memo')
    render(createElement(RemoteMemo))
    expect(await screen.findByText('memo-ok')).toBeTruthy()
  })

  it('class 组件导出渲染', async () => {
    class Cls extends Component<{ v: string }> {
      override render(): ReactNode { return createElement('p', null, `class-${this.props.v}`) }
    }
    const load = okLoader(() => ({ default: Cls }))
    const RemoteCls = createRemoteComponent(load)('r/Cls')
    render(createElement(RemoteCls, { v: 'x' } as never))
    expect(await screen.findByText('class-x')).toBeTruthy()
  })

  it('非法导出（字符串/数字/空命名空间）显示错误，不渲染空白成功页', async () => {
    for (const bad of ['not-a-component', 42]) {
      const load = okLoader(() => ({ default: bad }))
      const RC = createRemoteComponent(load)('r/Bad')
      render(createElement(RC))
      expect(await screen.findByText(/没有导出可渲染组件/)).toBeTruthy()
      cleanup()
    }
  })

  it('options 非法值（负 timeout / 非整数 retries）工厂期抛错', () => {
    const factory = createRemoteComponent(vi.fn())
    expect(() => factory('r/x', { timeout: -1 as unknown as number })).toThrow(/timeout 配置无效/)
    expect(() => factory('r/x', { retries: 1.5 })).toThrow(/retries 配置无效/)
    expect(() => createReactHostPages({ pages: [], remotePrefixes: {} } as never, vi.fn() as never)).not.toThrow()
  })
})

describe('remoteComponent 失败、恢复与超时', () => {
  it('加载失败显示默认中文占位（错误码+根因+修法+重试）；点击重试建立新加载尝试并恢复', async () => {
    const err = Object.assign(new Error('boom: 连接被拒绝'), { code: 'MFU-001' })
    const load = vi.fn()
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce({ default: () => createElement('p', null, 'recovered') })
    const RC = createRemoteComponent(load)('r/Flaky', { retries: 0 })
    render(createElement(RC))
    expect(await screen.findByText(/远程组件加载失败（错误码 MFU-001）/)).toBeTruthy()
    expect(screen.getByText('重试加载')).toBeTruthy()
    expect(load).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByText('重试加载'))
    expect(await screen.findByText('recovered')).toBeTruthy()
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('自定义 error 渲染函数收到真实 error 与可用的 retry', async () => {
    const load = vi.fn()
      .mockRejectedValueOnce(new Error('first fail'))
      .mockResolvedValueOnce({ default: () => createElement('p', null, 'ok2') })
    const RC = createRemoteComponent(load)('r/Custom', {
      retries: 0,
      error: (error, retry) => createElement('button', { onClick: retry }, `custom:${(error as Error).message}`),
    })
    render(createElement(RC))
    expect(await screen.findByText('custom:first fail')).toBeTruthy()
    fireEvent.click(screen.getByText('custom:first fail'))
    expect(await screen.findByText('ok2')).toBeTruthy()
  })

  it('timeout 生效：pending→超时占位；迟到的成功不覆盖超时终态', async () => {
    let lateResolve: ((v: any) => void) | undefined
    const load = vi.fn(() => new Promise<any>((resolve) => { lateResolve = resolve }))
    const RC = createRemoteComponent(load)('r/Slow', { timeout: 40 })
    render(createElement(RC))
    expect(await screen.findByText(/加载等待超过 40 毫秒/)).toBeTruthy()
    // 迟到成功到达：不得覆盖已终态的超时错误
    await act(async () => { lateResolve?.({ default: () => createElement('p', null, 'late') }) })
    await new Promise((r) => setTimeout(r, 20))
    expect(screen.getByText(/加载等待超过 40 毫秒/)).toBeTruthy()
    expect(screen.queryByText('late')).toBeNull()
  })

  it('超时后迟到失败不产生未处理 rejection', async () => {
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
    try {
      const load = vi.fn(() => new Promise<any>((_, reject) => {
        setTimeout(() => reject(new Error('late failure')), 120)
      }))
      const RC = createRemoteComponent(load)('r/SlowFail', { timeout: 40 })
      render(createElement(RC))
      expect(await screen.findByText(/加载等待超过 40 毫秒/)).toBeTruthy()
      await new Promise((r) => setTimeout(r, 200))
      await new Promise((r) => setTimeout(r, 0))
      expect(unhandled).not.toHaveBeenCalled()
    } finally {
      process.off('unhandledRejection', unhandled)
    }
  })

  it('远程组件渲染抛错：内置边界捕获显示渲染错误占位；重试后重新渲染恢复', async () => {
    let shouldThrow = true
    const Flaky = () => {
      if (shouldThrow) throw new Error('render exploded')
      return createElement('p', null, 'render-ok')
    }
    const load = okLoader(() => ({ default: Flaky }))
    const RC = createRemoteComponent(load)('r/Thrower')
    render(createElement(RC))
    expect(await screen.findByText(/远程组件渲染出错/)).toBeTruthy()
    shouldThrow = false
    fireEvent.click(screen.getByText('重试加载'))
    expect(await screen.findByText('render-ok')).toBeTruthy()
  })
})

describe('useLoadRemote', () => {
  const Hook = createUseLoadRemote((spec: string) => new Promise((resolve) => {
    setTimeout(() => resolve({ spec, value: `${spec}-data` }), spec === 'r/slow' ? 80 : 5)
  }))

  function Probe({ spec, onResult }: { spec: string; onResult: (r: any) => void }) {
    const result = Hook(spec)
    useEffect(() => { onResult(result) })
    return createElement('p', { 'data-testid': 'probe' }, `${result.loading ? 'loading' : 'done'}:${result.data?.value ?? String(result.error?.message ?? '')}`)
  }

  it('loading → data；error 无错误时恒为 undefined', async () => {
    const seen: any[] = []
    render(createElement(Probe, { spec: 'r/fast', onResult: (r) => seen.push({ ...r }) }))
    await waitFor(() => expect(seen[seen.length - 1].data).toEqual({ spec: 'r/fast', value: 'r/fast-data' }))
    expect(seen[seen.length - 1].error).toBeUndefined()
    expect(seen[seen.length - 1].loading).toBe(false)
  })

  it('失败写 error；reload 成功后清除（Promise<void> 不抛）', async () => {
    let fail = true
    const loader = vi.fn((spec: string) => fail
      ? Promise.reject(new Error('load failed'))
      : Promise.resolve({ value: 'after-reload' }))
    const H = createUseLoadRemote(loader)
    let out: any
    function Comp() {
      out = H('r/x')
      return createElement('button', { 'data-testid': 'reload', onClick: () => void out.reload() }, 'reload')
    }
    render(createElement(Comp))
    await waitFor(() => expect(out.error?.message).toBe('load failed'))
    fail = false
    await act(async () => { fireEvent.click(screen.getByTestId('reload')) })
    await waitFor(() => expect(out.data).toEqual({ value: 'after-reload' }))
    expect(out.error).toBeUndefined()
  })

  it('快速 A→B 切换：慢 A 晚返回不覆盖快 B 的结果', async () => {
    const seen: any[] = []
    const { rerender } = render(createElement(Probe, { spec: 'r/slow', onResult: (r) => seen.push(r) }))
    await new Promise((r) => setTimeout(r, 10))
    rerender(createElement(Probe, { spec: 'r/fast', onResult: (r) => seen.push(r) }))
    await waitFor(() => {
      const last = seen[seen.length - 1]
      expect(last.data?.value).toBe('r/fast-data')
    })
    // 等慢 A 也返回后，最终状态仍是 B
    await new Promise((r) => setTimeout(r, 120))
    expect(seen[seen.length - 1].data?.value).toBe('r/fast-data')
  })

  it('卸载后返回不写状态（无 act 警告/异常）', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { unmount } = render(createElement(Probe, { spec: 'r/slow', onResult: () => {} }))
    unmount()
    await new Promise((r) => setTimeout(r, 150))
    expect(consoleWarn).not.toHaveBeenCalledWith(expect.stringContaining('update on an unmounted component'))
  })

  it('调用方每次 render 新建 options 对象不无限重载（按字段比较）', async () => {
    const loader = vi.fn(() => new Promise<any>((resolve) => setTimeout(() => resolve({ v: 1 }), 10)))
    const H = createUseLoadRemote(loader)
    function Comp() {
      const { data } = H('r/opts', { retries: 2 }) // 每次新对象
      return createElement('p', null, data?.v ? 'ok' : '…')
    }
    render(createElement(Comp))
    await screen.findByText('ok')
    await new Promise((r) => setTimeout(r, 50))
    // StrictMode 之外单次挂载：effect 一次；options 字段不变不再重跑
    expect(loader).toHaveBeenCalledTimes(1)
  })
})

describe('StrictMode 双 effect 安全', () => {
  it('RemoteLoader 与 useLoadRemote 在 StrictMode 下最终收敛正确', async () => {
    const { StrictMode } = await import('react')
    const load = okLoader(() => ({ default: () => createElement('p', null, 'sm-ok') }))
    const RC = createRemoteComponent(load)('r/SM')
    render(createElement(StrictMode, null, createElement(RC)))
    expect(await screen.findByText('sm-ok')).toBeTruthy()
  })
})

describe('RemoteErrorBoundary（独立页面级兜底）', () => {
  it('捕获子树渲染错误；fallback 函数收到 error 与 reset', async () => {
    const Boom = () => { throw new Error('subtree boom') }
    render(createElement(RemoteErrorBoundary, {
      fallback: ({ error, reset }) => createElement('button', { onClick: reset }, `bound:${(error as Error).message}`),
    }, createElement(Boom)))
    expect(await screen.findByText('bound:subtree boom')).toBeTruthy()
  })

  it('resetKeys 变化重置边界（受控重试形态）', async () => {
    let boom = true
    const Boom = () => {
      if (boom) throw new Error('reset-me')
      return createElement('p', null, 'after-reset')
    }
    function Host() {
      const [k, setK] = useState(0)
      return createElement('div', null,
        createElement(RemoteErrorBoundary, { resetKeys: [k] }, createElement(Boom)),
        createElement('button', { 'data-testid': 'bump', onClick: () => { boom = false; setK((x) => x + 1) } }, 'bump'),
      )
    }
    render(createElement(Host))
    expect(await screen.findByText(/reset-me/)).toBeTruthy()
    fireEvent.click(screen.getByTestId('bump'))
    expect(await screen.findByText('after-reset')).toBeTruthy()
  })

  it('onError 收到 error 与 componentStack 信息', async () => {
    const onError = vi.fn()
    const Boom = () => { throw new Error('cb-err') }
    render(createElement(RemoteErrorBoundary, { onError }, createElement(Boom)))
    await waitFor(() => expect(onError).toHaveBeenCalled())
    expect((onError.mock.calls[0]![0] as Error).message).toBe('cb-err')
    expect(onError.mock.calls[0]![1]).toBeTruthy()
  })
})

describe('createReactHostPages', () => {
  const PAGES = [
    { route: '/remote-r/home', name: 'Home' },
    { route: '/remote-r/detail/:id', spec: 'detail-view' },
  ]
  const load = okLoader((spec) => ({ default: () => createElement('p', null, `page:${spec}`) }))

  it('resolve 与 component 基本合同；keepAliveNames 不存在（React 不承诺保活）', () => {
    const hp = createReactHostPages({ pages: PAGES, remotePrefixes: { '/remote-r': 'remote-r' } }, load as never)
    expect(hp.resolve('/remote-r/home')?.spec).toBe('remote-r/home')
    expect(hp.resolve('/remote-r/detail/42')?.params).toEqual({ id: '42' })
    expect(hp.resolve('/nope')).toBeNull()
    expect((hp as any).keepAliveNames).toBeUndefined()
  })

  it('component(spec) 同代次同引用复用；新非空 sessionKey 后重建（新引用，触发新加载链）', () => {
    const hp = createReactHostPages({ pages: PAGES, remotePrefixes: { '/remote-r': 'remote-r' } }, load as never)
    const c1 = hp.component('remote-r/home')
    const c2 = hp.component('remote-r/home')
    expect(c1).toBe(c2)
    ;(globalThis as any).__FULGURJS_APP_CONFIG__ = { sessionKey: 'user-B' }
    const c3 = hp.component('remote-r/home')
    expect(c3).not.toBe(c1)
    // 登出（undefined）不重建
    delete (globalThis as any).__FULGURJS_APP_CONFIG__
    expect(hp.component('remote-r/home')).toBe(c3)
  })

  it('页面组件经 beforeLoad 加载（每次实际尝试前执行，含 retry）', async () => {
    const beforeLoad = vi.fn(async () => {})
    const hp = createReactHostPages(
      { pages: PAGES, remotePrefixes: { '/remote-r': 'remote-r' }, beforeLoad },
      load as never,
    )
    const Page = hp.component<{ id?: string }>('remote-r/home')
    render(createElement(Page))
    expect(await screen.findByText('page:remote-r/home')).toBeTruthy()
    expect(beforeLoad).toHaveBeenCalledTimes(1)
  })

  it('页面表声明零加载副作用（不渲染不 loadRemote）', () => {
    const spy = vi.fn(load)
    createReactHostPages({ pages: PAGES, remotePrefixes: { '/remote-r': 'remote-r' } }, spy as never)
    expect(spy).not.toHaveBeenCalled()
  })
})
