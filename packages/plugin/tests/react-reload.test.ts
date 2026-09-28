// @vitest-environment jsdom
/** reload 回归：旧数据清理、卸载失效、乱序与 StrictMode 请求隔离。 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { createElement, StrictMode } from 'react'
import { createUseLoadRemote, type UseLoadRemoteResult } from '../src/react-adapter'

// React 会忽略卸载后的 setState；直接记录 setter 调用，避免把「没有重渲染」误判为已取消。
const writes = vi.hoisted(() => ({ afterUnmount: false, late: [] as unknown[] }))
vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react')
  return {
    ...actual,
    useState: (initial: unknown) => {
      const [value, setValue] = actual.useState(initial)
      return [value, (next: unknown) => {
        if (writes.afterUnmount) writes.late.push(next)
        setValue(next)
      }]
    },
  }
})

afterEach(() => {
  writes.afterUnmount = false
  writes.late = []
  cleanup()
})

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((ok, fail) => { resolve = ok; reject = fail })
  return { promise, resolve, reject }
}

type Data = { user: string }

function mount(load: (spec: string) => Promise<Data>, strict = false) {
  const useLoad = createUseLoadRemote(load)
  let current!: UseLoadRemoteResult<Data>
  function Probe() {
    current = useLoad<Data>('r/data')
    return createElement('p', null, current.data?.user ?? 'empty')
  }
  const view = render(strict
    ? createElement(StrictMode, null, createElement(Probe))
    : createElement(Probe))
  return { ...view, result: () => current }
}

describe('useLoadRemote reload', () => {
  it('清空成功的旧数据，失败后只有 error；reload 正常结束', async () => {
    const next = deferred<Data>()
    const load = vi.fn()
      .mockResolvedValueOnce({ user: 'A' })
      .mockReturnValueOnce(next.promise)
    const view = mount(load)
    await screen.findByText('A')
    let pending!: Promise<void>
    act(() => { pending = view.result().reload() })
    expect(view.result().data).toBeUndefined()
    expect(view.result().error).toBeUndefined()
    expect(view.result().loading).toBe(true)
    const failure = new Error('reload failed')
    await act(async () => { next.reject(failure); await pending })
    expect(view.result().data).toBeUndefined()
    expect(view.result().error).toBe(failure)
    expect(view.result().loading).toBe(false)
  })

  it.each(['resolve', 'reject'] as const)('卸载后的 reload %s 不再调用任何状态 setter', async (outcome) => {
    const next = deferred<Data>()
    const load = vi.fn()
      .mockResolvedValueOnce({ user: 'A' })
      .mockReturnValueOnce(next.promise)
    const view = mount(load)
    await screen.findByText('A')
    let pending!: Promise<void>
    act(() => { pending = view.result().reload() })
    view.unmount()
    writes.afterUnmount = true
    await act(async () => {
      if (outcome === 'resolve') next.resolve({ user: 'late' })
      else next.reject(new Error('late failure'))
      await pending
    })
    expect(writes.late).toEqual([])
    const calls = load.mock.calls.length
    await view.result().reload()
    expect(load.mock.calls).toHaveLength(calls)
    expect(writes.late).toEqual([])
  })

  it('连续 reload：后一次先完成，旧结果不能覆盖它', async () => {
    const first = deferred<Data>()
    const last = deferred<Data>()
    const load = vi.fn()
      .mockResolvedValueOnce({ user: 'initial' })
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(last.promise)
    const view = mount(load)
    await screen.findByText('initial')
    let p1!: Promise<void>
    let p2!: Promise<void>
    act(() => { p1 = view.result().reload(); p2 = view.result().reload() })
    await act(async () => { last.resolve({ user: 'latest' }); await p2 })
    await screen.findByText('latest')
    await act(async () => { first.resolve({ user: 'stale' }); await p1 })
    expect(view.result().data).toEqual({ user: 'latest' })
    expect(view.result().loading).toBe(false)
  })

  it('StrictMode cleanup 后的旧 effect 不覆盖新的 effect', async () => {
    const old = deferred<Data>()
    const next = deferred<Data>()
    const load = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise)
    const view = mount(load, true)
    expect(load).toHaveBeenCalledTimes(2)
    await act(async () => { next.resolve({ user: 'current' }) })
    await screen.findByText('current')
    await act(async () => { old.resolve({ user: 'expired' }) })
    expect(view.result().data).toEqual({ user: 'current' })
  })
})
