/**
 * 运行时语义单测：逐条对应 DESIGN.md §2B 的 webpack 行为语义。
 * 每个 case 通过 vi.resetModules + 动态 import 获得全新 runtime 实例（隔离 globalThis 单例）。
 */
import fs from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Runtime = typeof import('../src/runtime/index')

async function fresh(): Promise<Runtime> {
  vi.resetModules()
  ;(globalThis as any).__FULGUR_RUNTIME__ = undefined
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
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('singleton conflict'))
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
  it('getRuntime() 返回与 globalThis.__FULGUR_RUNTIME__ 同一单例', async () => {
    const rt = await fresh()
    expect(rt.getRuntime()).toBe(rt.runtime)
    expect(rt.getRuntime()).toBe((globalThis as any).__FULGUR_RUNTIME__)
  })

  it('跨打包副本收敛：后加载副本拿到先创建的同一实例', async () => {
    vi.resetModules()
    ;(globalThis as any).__FULGUR_RUNTIME__ = undefined
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
