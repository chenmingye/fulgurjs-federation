/**
 * P02/P03 回归（2026-10-22 DEMES5.5 从零迁移轮）：
 * P02 重包装保留原始 cause——container 获取失败与 expose 求值拒绝的 MFU-001 包装必须
 *   `wrapped.cause === original`（非仅消息包含）；非 Error 拒绝值原样保留在 cause；
 *   带 code 的领域错误原样透传（身份不变）。
 * P03 错误通知通路完整——expose 拒绝（含 code 透传路径）也发 fulgurjs:error 与
 *   onRemoteError；同一失败对象跨边界只报告一次（并发共享同一拒绝）；新重试的新错误
 *   仍可见；hook 自身抛错不改变原失败语义；setup/onSession/MFU-013 失败同样可见。
 */
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Runtime = typeof import('../src/runtime/index')

interface CapturedEvent { remote: string; error: any }

async function fresh(): Promise<Runtime> {
  vi.resetModules()
  ;(globalThis as any).__FULGURJS_RUNTIME__ = undefined
  ;(globalThis as any).__FULGURJS_REPORTED_ERRORS__ = undefined
  delete (globalThis as any).__FULGURJS_APP_CONFIG__
  return import('../src/runtime/index')
}

function listenErrors(): { events: CapturedEvent[]; off: () => void } {
  const events: CapturedEvent[] = []
  const onEvent = (e: Event): void => { events.push((e as CustomEvent).detail) }
  window.addEventListener('fulgurjs:error', onEvent)
  return { events, off: () => window.removeEventListener('fulgurjs:error', onEvent) }
}

describe('P02：MFU-001 重包装保留原始 cause', () => {
  let rt: Runtime
  beforeEach(async () => { rt = await fresh() })

  it('container 获取失败：最终 MFU-001 的 cause === 底层拒绝值', async () => {
    const underlying = new Error('connect ECONNREFUSED 127.0.0.1:6199')
    rt.registerRemote({ name: 'p2-conn', promise: async () => { throw underlying }, retries: 0, timeout: 200 })
    const err = await rt.loadRemote('p2-conn/page' as never).catch((e: unknown) => e)
    expect((err as any).code).toBe('MFU-001')
    expect((err as any).cause).toBe(underlying)
  })

  it('expose 求值拒绝：包装错误的 cause === 原始 Error（对象身份）', async () => {
    const original = new Error('module evaluation boom')
    const container = {
      name: 'p2-exp', init: async () => {},
      get: async (m: string) => { if (m === './page') throw original; return {} },
    }
    rt.registerRemote({ name: 'p2-exp', entry: '', promise: async () => container, retries: 0 })
    const err = await rt.loadRemote('p2-exp/page' as never).catch((e: unknown) => e)
    expect((err as any).code).toBe('MFU-001')
    expect((err as any).details).toMatchObject({ remote: 'p2-exp', module: './page', stage: 'expose' })
    expect((err as any).cause).toBe(original)
  })

  it('非 Error 拒绝值：cause 原样保留真实值（字符串）', async () => {
    const container = {
      name: 'p2-str', init: async () => {},
      get: async () => { throw 'plain string rejection' },
    }
    rt.registerRemote({ name: 'p2-str', entry: '', promise: async () => container, retries: 0 })
    const err = await rt.loadRemote('p2-str/mod' as never).catch((e: unknown) => e)
    expect((err as any).cause).toBe('plain string rejection')
    expect((err as any).message).toContain('plain string rejection')
  })

  it('带 code 的领域错误原样透传：身份与 code 不变', async () => {
    const domain = Object.assign(new Error('expose 未声明'), { code: 'MFU-006', details: { remote: 'p2-dom' } })
    const container = {
      name: 'p2-dom', init: async () => {},
      get: async () => { throw domain },
    }
    rt.registerRemote({ name: 'p2-dom', entry: '', promise: async () => container, retries: 0 })
    const err = await rt.loadRemote('p2-dom/x' as never).catch((e: unknown) => e)
    expect(err).toBe(domain)
    expect((err as any).code).toBe('MFU-006')
  })
})

describe('P03：错误通知通路完整（expose/setup/会话）', () => {
  let rt: Runtime
  beforeEach(async () => { rt = await fresh() })

  it('expose 拒绝发 fulgurjs:error（stage=expose，cause 保留），并发共享同一拒绝只报一次', async () => {
    const { events, off } = listenErrors()
    const original = new Error('eval fail')
    let rejected: Promise<never> | undefined
    const container = {
      name: 'p3-exp', init: async () => {},
      get: async (m: string) => {
        if (m === './page') { rejected ??= Promise.reject(original); return rejected }
        return {}
      },
    }
    rt.registerRemote({ name: 'p3-exp', entry: '', promise: async () => container, retries: 0 })
    const [a, b] = await Promise.allSettled([rt.loadRemote('p3-exp/page' as never), rt.loadRemote('p3-exp/page' as never)])
    expect(a.status).toBe('rejected')
    expect(b.status).toBe('rejected')
    // 两次调用共享同一失败：事件只报一次（同一错误对象全页去重）
    const forRemote = events.filter((e) => e.remote === 'p3-exp')
    expect(forRemote).toHaveLength(1)
    expect(forRemote[0].error.code).toBe('MFU-001')
    expect(forRemote[0].error.details).toMatchObject({ stage: 'expose' })
    expect(forRemote[0].error.cause).toBe(original)
    off()
  })

  it('code 透传路径同样发事件；失败重试的新错误对象再次可见', async () => {
    const { events, off } = listenErrors()
    const first = Object.assign(new Error('first miss'), { code: 'MFU-006' })
    const second = Object.assign(new Error('second miss'), { code: 'MFU-006' })
    let attempt = 0
    const container = {
      name: 'p3-retry', init: async () => {},
      get: async () => { attempt += 1; throw attempt === 1 ? first : second },
    }
    rt.registerRemote({ name: 'p3-retry', entry: '', promise: async () => container, retries: 0 })
    await rt.loadRemote('p3-retry/mod' as never).catch(() => {})
    await rt.loadRemote('p3-retry/mod' as never).catch(() => {})
    const codes = events.filter((e) => e.remote === 'p3-retry').map((e) => e.error)
    // 两次尝试两个错误对象：各自可见（重试是新尝试）
    expect(codes).toHaveLength(2)
    expect(codes[0]).toBe(first)
    expect(codes[1]).toBe(second)
    off()
  })

  it('setup 执行失败（MFU-012）发事件且 cause 保留原始异常', async () => {
    const { events, off } = listenErrors()
    const boom = new Error('setup inner crash')
    const container = {
      name: 'p3-setup', __fulgurjsSetup: './__fulgurjs_setup__',
      init: async () => {},
      get: async (m: string) => {
        if (m === './__fulgurjs_setup__') return { default: () => { throw boom } }
        return {}
      },
    }
    rt.registerRemote({ name: 'p3-setup', entry: '', promise: async () => container, retries: 0 })
    const err = await rt.loadRemote('p3-setup/any' as never).catch((e: unknown) => e)
    expect((err as any).code).toBe('MFU-012')
    expect((err as any).cause).toBe(boom)
    const seen = events.filter((e) => e.remote === 'p3-setup')
    expect(seen).toHaveLength(1)
    expect(seen[0].error.code).toBe('MFU-012')
    off()
  })

  it('onSession 缺 sessionKey（MFU-013）发事件；onRemoteError hook 同时收到且 hook 抛错不吞原始失败', async () => {
    const { events, off } = listenErrors()
    const hookCalls: any[] = []
    rt.registerPlugins([{ name: 'obs', init: (hooks) => {
      hooks.onRemoteError = (info) => { hookCalls.push(info); if (info.error.code === 'MFU-013') throw new Error('hook boom') }
    } }])
    const container = {
      name: 'p3-sess', __fulgurjsSetup: './__fulgurjs_setup__',
      init: async () => {},
      get: async (m: string) => {
        if (m === './__fulgurjs_setup__') return { onSession: () => {} }
        return {}
      },
    }
    rt.registerRemote({ name: 'p3-sess', entry: '', promise: async () => container, retries: 0 })
    const err = await rt.loadRemote('p3-sess/any' as never).catch((e: unknown) => e)
    expect((err as any).code).toBe('MFU-013')
    expect(events.filter((e) => e.remote === 'p3-sess' && e.error.code === 'MFU-013')).toHaveLength(1)
    expect(hookCalls.filter((c) => c.error.code === 'MFU-013')).toHaveLength(1)
    off()
  })
})
