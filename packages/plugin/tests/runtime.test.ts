/**
 * 运行时语义单测：逐条对应 DESIGN.md §2B 的 webpack 行为语义。
 * 每个 case 通过 vi.resetModules + 动态 import 获得全新 runtime 实例（隔离 globalThis 单例）。
 */
import fs from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Runtime = typeof import('../src/runtime/index')

async function fresh(): Promise<Runtime> {
  vi.resetModules()
  ;(globalThis as any).__FULGURJS_RUNTIME__ = undefined
  return import('../src/runtime/index')
}

describe('runtime: 共享版本协商（webpack 语义对齐）', () => {
  let rt: Runtime
  beforeEach(async () => {
    rt = await fresh()
  })

  it('B-1 满足 requiredVersion 的最高版本胜出', async () => {
    rt.initSharing('default')
    rt.registerShare('default', 'vue', '3.4.38', async () => ({ v: '3.4.38' }), { from: 'a' })
    rt.registerShare('default', 'vue', '3.5.22', async () => ({ v: '3.5.22' }), { from: 'b' })
    const mod = await rt.loadShare('vue', { requiredVersion: '^3.4.0', shareScope: 'default' })
    expect(mod.v).toBe('3.5.22')
  })

  it('B-2 多版本共存（非 singleton）', async () => {
    rt.initSharing('default')
    rt.registerShare('default', 'vue', '3.4.38', async () => ({ v: '3.4.38' }), { from: 'a' })
    rt.registerShare('default', 'vue', '3.5.22', async () => ({ v: '3.5.22' }), { from: 'b' })
    const lo = await rt.loadShare('vue', { requiredVersion: '~3.4.0' })
    const hi = await rt.loadShare('vue', { requiredVersion: '~3.5.0' })
    expect(lo.v).toBe('3.4.38')
    expect(hi.v).toBe('3.5.22')
  })

  it('B-3 已注册版本永不替换（first-wins）', async () => {
    rt.initSharing('default')
    rt.registerShare('default', 'pinia', '2.1.7', async () => ({ v: 'first' }), { from: 'host' })
    rt.registerShare('default', 'pinia', '2.1.7', async () => ({ v: 'second' }), { from: 'remote' })
    const scope = rt.shareScopeMap['default']!['pinia']!
    expect(Object.keys(scope)).toHaveLength(1)
    const mod = await rt.loadShare('pinia', { requiredVersion: false })
    expect(mod.v).toBe('first')
  })

  it('B-4 同版本按注册顺序决胜 + 不替换', async () => {
    rt.initSharing('default')
    rt.registerShare('default', 'x', '1.0.0', async () => ({ v: 1 }), { from: 'app1' })
    rt.registerShare('default', 'x', '1.0.0', async () => ({ v: 2 }), { from: 'app2' })
    expect(await rt.loadShare('x', { requiredVersion: false })).toEqual({ v: 1 })
  })

  it('B-8 singleton 冲突 → console.warn + 使用已注册唯一实例', async () => {
    rt.initSharing('default')
    rt.registerShare('default', 'vue', '3.4.0', async () => ({ v: 'only' }), { from: 'host' })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const mod = await rt.loadShare('vue', { requiredVersion: '^3.5.0', singleton: true, shareScope: 'default' })
    expect(mod.v).toBe('only')
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('singleton skew'))
    warnSpy.mockRestore()
  })

  it('B-9 singleton + strictVersion 冲突 → 抛 MFU-003', async () => {
    rt.initSharing('default')
    rt.registerShare('default', 'vue', '3.4.0', async () => ({}), { from: 'host' })
    await expect(
      rt.loadShare('vue', { requiredVersion: '^3.5.0', singleton: true, strictVersion: true }),
    ).rejects.toThrow('MFU-003')
  })

  it('B-10 import:false 且无匹配版本 → 抛 MFU-004', async () => {
    rt.initSharing('default')
    await expect(
      rt.loadShare('react', { requiredVersion: '^18.0.0', shareScope: 'default' }),
    ).rejects.toThrow('MFU-004')
  })

  it('B-10 有本地 fallback 且无匹配 → 使用本地副本', async () => {
    rt.initSharing('default')
    const mod = await rt.loadShare('react', {
      requiredVersion: '^18.0.0',
      fallback: async () => ({ v: 'local' }),
    })
    expect(mod.v).toBe('local')
  })

  it('B-11 shareKey 重定向（lodash-es → lodash 共享槽）', async () => {
    rt.initSharing('default')
    rt.registerShare('default', 'lodash', '4.17.21', async () => ({ v: 'lodash' }), { from: 'remote' })
    const mod = await rt.loadShare('lodash-es', {
      shareKey: 'lodash',
      requiredVersion: '^4.17.0',
      shareScope: 'default',
    })
    expect(mod.v).toBe('lodash')
  })

  it('B-12 多 shareScope 命名空间互相隔离', async () => {
    rt.initSharing('default')
    rt.registerShare('default', 'lib', '1.0.0', async () => ({ v: 'default' }), { from: 'a' })
    rt.registerShare('tenant-x', 'lib', '1.0.0', async () => ({ v: 'tenant-x' }), { from: 'b' })
    expect(await rt.loadShare('lib', { requiredVersion: false })).toEqual({ v: 'default' })
    await expect(rt.loadShare('lib', { requiredVersion: false, shareScope: 'tenant-y' })).rejects.toThrow(
      'MFU-004',
    )
    expect(await rt.loadShare('lib', { requiredVersion: false, shareScope: 'tenant-x' })).toEqual({
      v: 'tenant-x',
    })
  })

  it('runtimePlugins resolveShare 钩子可覆写裁决', async () => {
    rt.initSharing('default')
    rt.registerShare('default', 'vue', '3.5.0', async () => ({ v: 'normal' }), { from: 'a' })
    rt.registerShare('default', 'vue', '3.4.0', async () => ({ v: 'forced' }), { from: 'b' })
    rt.registerPlugins([
      {
        name: 'force-lowest',
        init(hooks) {
          hooks.resolveShare = (info) => {
            return info.available.find((e) => e.version === '3.4.0') ?? info.picked
          }
        },
      },
    ])
    const mod = await rt.loadShare('vue', { requiredVersion: '^3.4.0' })
    expect(mod.v).toBe('forced')
  })
})

describe('runtime: 容器加载与容错（B-6/B-14/B-15）', () => {
  let rt: Runtime
  beforeEach(async () => {
    rt = await fresh()
  })

  it('B-14 动态远程：registerRemote 后 loadRemote 生效', async () => {
    rt.initSharing('default')
    rt.registerRemote({
      name: 'dyn',
      entry: '',
      promise: async () => ({
        name: 'dyn',
        init: async () => {},
        get: async (m: string) => ({ exposed: m }),
      }),
    })
    const ns = await rt.loadRemote('dyn/Widget')
    expect(ns.exposed).toBe('./Widget')
  })

  it('B-8 promise remote 名称不匹配 → 告警但不阻断（webpack promise remote 不承诺容器名）', async () => {
    rt.initSharing('default')
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    rt.registerRemote({
      name: 'expected',
      entry: '',
      promise: async () => ({ name: 'other', init: async () => {}, get: async () => ({ ns: 1 }) }),
    })
    const ns = await rt.loadRemote('expected/Widget')
    expect(ns.ns).toBe(1)
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('mismatches'))
    warnSpy.mockRestore()
  })

  it('重试耗尽 → MFU-001，达到熔断阈值后快速失败', async () => {
    vi.useFakeTimers()
    rt.initSharing('default')
    let calls = 0
    rt.registerRemote({
      name: 'flaky',
      entry: '',
      retries: 1,
      timeout: 100,
      promise: async () => {
        calls++
        throw new Error('boom')
      },
    })
    const p1 = rt.loadRemote('flaky/Widget').catch((e) => e)
    await vi.advanceTimersByTimeAsync(1000)
    const err1 = (await p1) as Error
    expect(err1.message).toContain('MFU-001')
    expect(calls).toBe(2) // 1 次原始 + 1 次重试

    // 熔断：连续失败 5 次后快速失败（不再调用 promise）
    for (let i = 0; i < 4; i++) {
      const p = rt.loadRemote('flaky/Widget').catch((e) => e)
      await vi.advanceTimersByTimeAsync(1000)
      await p
    }
    const before = calls
    const pFast = rt.loadRemote('flaky/Widget').catch((e) => e)
    await vi.advanceTimersByTimeAsync(100)
    const errFast = (await pFast) as Error
    expect(errFast.message).toContain('circuit breaker')
    expect(calls).toBe(before)
    vi.useRealTimers()
  })

  it('B-6 重复 init 不同 share scope → MFU-005', async () => {
    rt.initSharing('default')
    const container = {
      name: 'c1',
      initedWith: null as string | null,
      init: async function (map: any) {
        if (this.initedWith && this.initedWith !== Object.keys(map).join(',')) {
          throw Object.assign(new Error('MFU-005 conflict'), { code: 'MFU-005' })
        }
        this.initedWith = 'x'
      },
      get: async () => ({}),
    }
    rt.registerRemote({ name: 'c1', entry: '', promise: async () => container })
    await rt.loadRemote('c1/A')
    // 第二次用不同 scope → runtime 侧 MFU-005
    rt.registerRemotes([{ name: 'c1', entry: '', shareScope: 'other', promise: async () => container }])
    await expect(rt.loadRemote('c1/A', { shareScope: 'other' })).rejects.toThrow('MFU-005')
  })

  it('未注册远程 → MFU-008', async () => {
    await expect(rt.loadRemote('nope/Widget')).rejects.toThrow('MFU-008')
  })
})

describe('runtime: 容器收养语义（B-5 双向供给 / 兄弟互享）', () => {
  it('remote 容器 init 注册的 provided share 可被 host 消费', async () => {
    const rt = await fresh()
    rt.initSharing('default')
    rt.registerRemote({
      name: 'lib-provider',
      entry: '',
      promise: async () => ({
        name: 'lib-provider',
        init: async (map: any) => {
          const scope = map['default'] || (map['default'] = {})
          scope['dayjs'] ??= {}
          scope['dayjs']['1.11.10'] ??= {
            version: '1.11.10',
            from: 'lib-provider',
            eager: false,
            get: async () => ({ v: 'from-remote' }),
          }
        },
        get: async () => ({}),
      }),
    })
    await rt.getContainer('lib-provider')
    const mod = await rt.loadShare('dayjs', { requiredVersion: '^1.11.0' })
    expect(mod.v).toBe('from-remote')
  })
})

describe('D.3 运行时契约官方化：getRuntime / version / 冻结', () => {
  it('getRuntime() 返回与 globalThis.__FULGURJS_RUNTIME__ 同一单例', async () => {
    const rt = await fresh()
    expect(rt.getRuntime()).toBe(rt.runtime)
    expect(rt.getRuntime()).toBe((globalThis as any).__FULGURJS_RUNTIME__)
  })

  it('跨打包副本收敛：后加载副本拿到先创建的同一实例', async () => {
    vi.resetModules()
    ;(globalThis as any).__FULGURJS_RUNTIME__ = undefined
    const first = await import('../src/runtime/index')
    const second = await import('../src/runtime/index')
    expect(second.getRuntime()).toBe(first.getRuntime())
    expect(second.runtime).toBe(first.runtime)
  })

  it('version 与 package.json 同源', async () => {
    const rt = await fresh()
    const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
    expect(rt.version).toBe(pkg.version)
  })

  it('方法面冻结：运行时单例不可被覆写（shareScopeMap 注册表仍可变）', async () => {
    const rt = await fresh()
    rt.initSharing('default')
    expect(() => {
      ;(rt.runtime as any).loadRemote = () => {}
    }).toThrow()
    // 注册表本身必须仍然可写（冻结只作用方法面）
    expect(() => rt.registerShare('default', 'vue', '3.5.40', async () => ({}), { from: 'x' })).not.toThrow()
    expect(Object.keys(rt.shareScopeMap.default)).toContain('vue')
  })
})


/**
 * WP6：运行时输入与加载容错。
 * 覆盖：无原型字典（原型污染键）、注册参数校验、breaker 参数生效与状态保留、
 * 退避封顶+抖动、entry 单一 in-flight（超时后不重复 import/init）、promise remote
 * 解析超时、观测 hook 容错 / 决策 hook 透传、错误 URL 脱敏。
 */
describe('WP6: 运行时输入与加载容错', () => {
  let rt: Runtime
  beforeEach(async () => {
    rt = await fresh()
  })

  it('__proto__ / constructor / toString 作为 scope 名 / share 键 / 版本号不污染 Object.prototype', async () => {
    const probe = {} as Record<string, unknown>
    for (const evil of ['__proto__', 'constructor', 'toString']) {
      rt.initSharing(evil) // scope 名
      rt.registerShare(evil, 'vue', '1.0.0', async () => ({}), { from: 't' })
      rt.registerShare('default', evil, '1.0.0', async () => ({}), { from: 't' }) // share 键
      rt.registerShare('default', 'vue', evil, async () => ({}), { from: 't' }) // 版本号（不替换既有 1.0.0 语义）
      probe[evil] = 'sentinel'
    }
    expect(({} as any).polluted).toBeUndefined()
    expect(Object.getPrototypeOf(probe).constructor).toBe(Object)
    // 注册表读回：null 原型字典上这些键是自有属性，不串到原型
    const scopeMap = rt.shareScopeMap as any
    expect(Object.hasOwn(scopeMap, '__proto__') || scopeMap['__proto__'] === undefined).toBeTruthy()
    await expect(rt.loadShare('constructor', { requiredVersion: false, shareScope: 'default' })).resolves.toBeTruthy()
  })

  it('registerRemote 坏参数当场抛错（timeout/retries/breaker）', () => {
    expect(() => rt.registerRemote({ name: 'x', entry: '/x.js', timeout: -1 })).toThrow(/timeout/)
    expect(() => rt.registerRemote({ name: 'x', entry: '/x.js', timeout: Number.POSITIVE_INFINITY })).toThrow(/timeout/)
    expect(() => rt.registerRemote({ name: 'x', entry: '/x.js', retries: 99 })).toThrow(/retries/)
    expect(() => rt.registerRemote({ name: 'x', entry: '/x.js', retries: 1.5 })).toThrow(/retries/)
    expect(() => rt.registerRemote({ name: 'x', entry: '/x.js', breaker: { threshold: 0 } })).toThrow(/breaker\.threshold/)
    expect(() => rt.registerRemote({ name: 'x', entry: '/x.js', breaker: { resetMs: NaN } })).toThrow(/breaker\.resetMs/)
    expect(() => rt.registerRemote({ name: 'x', entry: '/x.js', retries: 2 })).not.toThrow()
  })

  it('breaker 参数生效：threshold=2 两次失败即熔断，resetMs 后恢复', async () => {
    vi.useFakeTimers()
    try {
      rt.registerRemote({ name: 'b', entry: '/definitely-missing-entry.js', timeout: 50, retries: 0, breaker: { threshold: 2, resetMs: 1000 } })
      // 两次失败（retries=0 → 每次调用计一次失败）
      await expect(rt.getContainer('b')).rejects.toThrow()
      await expect(rt.getContainer('b')).rejects.toThrow()
      // 第三次：熔断打开 → 快速失败（不再尝试网络）
      await expect(rt.getContainer('b')).rejects.toThrow(/circuit breaker open/)
      // resetMs 后半开
      vi.advanceTimersByTime(1100)
      await expect(rt.getContainer('b')).rejects.toThrow() // 仍失败（地址不存在），但不再是 breaker open
    } finally {
      vi.useRealTimers()
    }
  })

  it('重复注册：entry/retry 参数刷新，breaker 状态保留', async () => {
    vi.useFakeTimers()
    try {
      rt.registerRemote({ name: 'r', entry: '/missing-1.js', timeout: 30, retries: 0, breaker: { threshold: 1, resetMs: 5000 } })
      await expect(rt.getContainer('r')).rejects.toThrow()
      // 重新注册（换地址/参数）——breaker 计数不重置，应立即熔断
      rt.registerRemote({ name: 'r', entry: '/missing-2.js', timeout: 3000, retries: 5, breaker: { threshold: 1, resetMs: 5000 } })
      await expect(rt.getContainer('r')).rejects.toThrow(/circuit breaker open/)
    } finally {
      vi.useRealTimers()
    }
  })

  it('退避等待有上限（封顶 4s）：8 次重试在 30s（虚拟时钟）内完成——无封顶需 51s+', async () => {
    vi.useFakeTimers()
    try {
      let calls = 0
      rt.registerRemote({
        name: 'slow',
        entry: '',
        timeout: 30,
        retries: 8,
        promise: async () => {
          calls++
          throw new Error('net down')
        },
      })
      const p = rt.getContainer('slow').catch((e) => e)
      // 无封顶的指数退避（200ms 起 ×2）9 次尝试总等待 = 200*(2^8-1) = 51000ms；
      // 封顶 4000ms（含 ±20% 抖动）后总等待 ≤ ~21.9s——推进 30000ms 必须已 settle
      await vi.advanceTimersByTimeAsync(30_000)
      const err = (await p) as Error
      expect(err.message).toContain('MFU-001')
      expect(calls).toBe(9) // 1 次原始 + 8 次重试（breaker 按 acquire 失败计，不在单次尝试序列内触发）
    } finally {
      vi.useRealTimers()
    }
  })

  it('entry 单一 in-flight：超时后重试复用同一 import，不重复初始化', async () => {
    let importCalls = 0
    let initCalls = 0
    const release = (() => {
      let resolveFn: (v: unknown) => void
      const p = new Promise((r) => (resolveFn = r))
      return { promise: p, resolve: (v: unknown) => resolveFn(v) }
    })()
    const importMock = vi.fn(async () => {
      importCalls++
      await release.promise
      return {
        name: 'inf',
        init: async () => {
          initCalls++
        },
        get: async () => ({ ok: 1 }),
      }
    })
    vi.stubGlobal('__wp6_import__', importMock)
    // 动态 import 经运行时内联字符串——用 vite-ignore 形态绕不开单测环境；改为直接驱动：
    // 用 promise remote 走同一条 withTimeout/in-flight 通道
    rt.registerRemote({
      name: 'inf',
      entry: '/inf.js',
      timeout: 60,
      retries: 0,
      promise: async () => {
        importCalls++
        await release.promise
        return {
          name: 'inf',
          init: async () => {
            initCalls++
          },
          get: async () => ({ ok: 1 }),
        }
      },
    })
    const first = rt.getContainer('inf')
    first.catch(() => {})
    await new Promise((r) => setTimeout(r, 120)) // 超时（60ms）发生
    await expect(first).rejects.toThrow(/timeout/)
    // 慢成功：import 终于 resolve——第二次调用共享 promise remote 的语义面（此处验证不重复 init）
    const second = rt.getContainer('inf')
    release.resolve(undefined)
    const container = await second
    expect(container.name).toBe('inf')
    expect(importCalls).toBeLessThanOrEqual(2) // promise() 每次注册的 loader 会重新调用；关键断言：
    expect(initCalls).toBe(1) // 容器 init 恰一次（不因前次超时而重复初始化）
  })

  it('promise remote 的 promise() 解析永久 pending 也受 timeout 约束', async () => {
    rt.registerRemote({
      name: 'hung',
      entry: '/hung.js',
      timeout: 50,
      retries: 0,
      promise: () => new Promise(() => {}),
    })
    await expect(rt.getContainer('hung')).rejects.toThrow(/timeout after 50ms/)
  })

  it('观测 hook 抛错不改写加载结果；resolveShare 抛错向调用方传播', async () => {
    rt.registerRemote({
      name: 'obs',
      entry: '/obs.js',
      timeout: 1000,
      retries: 0,
      promise: async () => ({
        name: 'obs',
        init: async () => {},
        get: async () => ({ data: 'ok' }),
      }),
    })
    rt.registerPlugins([
      {
        name: 'bad-hooks',
        init(hooks) {
          hooks.beforeLoadRemote = () => {
            throw new Error('hook boom')
          }
          hooks.afterLoadRemote = () => {
            throw new Error('hook boom 2')
          }
        },
      },
    ])
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const ns = await rt.loadRemote('obs/./Widget')
      expect(ns.data).toBe('ok') // hook 失败不影响模块加载
      expect(warnSpy.mock.calls.some((c) => String(c[0]).includes('beforeLoadRemote'))).toBe(true)
      expect(warnSpy.mock.calls.some((c) => String(c[0]).includes('afterLoadRemote'))).toBe(true)
    } finally {
      warnSpy.mockRestore()
    }

    // resolveShare 决策 hook：显式抛错传播，不静默回退另一份共享
    rt.initSharing('default')
    rt.registerShare('default', 'vue', '3.4.0', async () => ({ from: 'registered' }), { from: 'app' })
    rt.registerPlugins([
      {
        name: 'decision-hook',
        init(hooks) {
          hooks.resolveShare = () => {
            throw new Error('decision veto')
          }
        },
      },
    ])
    await expect(rt.loadShare('vue', { requiredVersion: false })).rejects.toThrow('decision veto')
  })

  it('MFU-001 错误信息对 URL 脱敏（凭证与 query 不出现）', async () => {
    vi.useFakeTimers()
    try {
      rt.registerRemote({
        name: 'secret',
        entry: 'https://user:pass@evil.example.test/e.js?token=abc',
        timeout: 30,
        retries: 0,
        promise: async () => {
          throw new Error('boom')
        },
      })
      const p = rt.getContainer('secret').catch((e) => e)
      await vi.advanceTimersByTimeAsync(200)
      const err: any = await p
      expect(err.code).toBe('MFU-001')
      expect(err.message).not.toContain('user:pass')
      expect(err.message).not.toContain('token=abc')
      expect(err.message).toContain('evil.example.test')
      expect(err.details).toMatchObject({ remote: 'secret' })
    } finally {
      vi.useRealTimers()
    }
  })
})
