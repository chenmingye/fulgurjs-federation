/**
 * 共享版本选择与 CJS 垫片语义回归（20261001 补修轮独立验收）。
 * 覆盖 getLoadedShare/loadShare 共用版本选择后的同步查询语义、resolveShare 快照
 * 隔离、CJS 垫片 strictVersion 透传与本地 fallback 不掩盖版本冲突的约束。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizeOptions } from '../src/options'
import { transformModule } from '../src/transform'
import { genCjsNsFacade } from '../src/virtual'

type Runtime = typeof import('../src/runtime/index')

async function fresh(): Promise<Runtime> {
  vi.resetModules()
  ;(globalThis as any).__FULGURJS_RUNTIME__ = undefined
  return import('../src/runtime/index')
}

describe('runtime: 同步共享查询（getLoadedShare 补修回归）', () => {
  let rt: Runtime
  beforeEach(async () => {
    rt = await fresh()
  })

  it('非单例 1.x/2.x 均就绪：要求 ^1 返回 1.x，要求 ^2 返回 2.x（按范围筛选就绪实例）', async () => {
    rt.initSharing('default')
    const v1 = { v: '1.5.0' }
    const v2 = { v: '2.1.0' }
    rt.registerShare('default', 'lib', '1.5.0', async () => v1, { from: 'a' })
    rt.registerShare('default', 'lib', '2.1.0', async () => v2, { from: 'b' })
    // 两个版本都通过异步协商加载（value 就绪）
    expect(await rt.loadShare('lib', { shareKey: 'lib', requiredVersion: '^1.0.0' })).toBe(v1)
    expect(await rt.loadShare('lib', { shareKey: 'lib', requiredVersion: '^2.0.0' })).toBe(v2)
    // 同步查询按各自范围返回对应实例，而不是统一取最高
    expect(rt.getLoadedShare('lib', { shareKey: 'lib', requiredVersion: '^1.0.0' })).toBe(v1)
    expect(rt.getLoadedShare('lib', { shareKey: 'lib', requiredVersion: '^2.0.0' })).toBe(v2)
  })

  it('无匹配就绪实例返回 undefined，且绝不触发任何 get()（不发起加载）', async () => {
    rt.initSharing('default')
    let getCalls = 0
    rt.registerShare('default', 'lib', '2.0.0', async () => {
      getCalls++
      return { v: 2 }
    }, { from: 'a' })
    // 未加载过：同步查询 undefined，get 不被调用
    expect(rt.getLoadedShare('lib', { shareKey: 'lib', requiredVersion: '^1.0.0' })).toBeUndefined()
    expect(rt.getLoadedShare('lib', { shareKey: 'lib', requiredVersion: '^2.0.0' })).toBeUndefined()
    expect(getCalls).toBe(0)
    // 加载 2.0.0 后：范围 ^1 仍无匹配就绪实例 → undefined；^2 命中
    expect(await rt.loadShare('lib', { shareKey: 'lib', requiredVersion: '^2.0.0' })).toEqual({ v: 2 })
    expect(rt.getLoadedShare('lib', { shareKey: 'lib', requiredVersion: '^1.0.0' })).toBeUndefined()
    expect(rt.getLoadedShare('lib', { shareKey: 'lib', requiredVersion: '^2.0.0' })).toEqual({ v: 2 })
    expect(getCalls).toBe(1)
  })

  it('singleton：已加载优先、宽松冲突仅告警、strictVersion 同步拒绝', async () => {
    rt.initSharing('default')
    const only = { v: '18.3.1' }
    rt.registerShare('default', 'react', '18.3.1', async () => only, { from: 'host' })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // 宽松：同步查询在不满足 ^19 时仍返回该单例并告警（不换实例、不走 fallback）
    expect(await rt.loadShare('react', { shareKey: 'react', requiredVersion: '^19.0.0', singleton: true })).toBe(only)
    expect(rt.getLoadedShare('react', { shareKey: 'react', requiredVersion: '^19.0.0', singleton: true })).toBe(only)
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy.mock.calls[0][0]).toContain('MFU-010')
    // strictVersion：同步路径与异步路径同样拒绝
    await expect(
      rt.loadShare('react', { shareKey: 'react', requiredVersion: '^19.0.0', singleton: true, strictVersion: true }),
    ).rejects.toThrow('MFU-003')
    expect(() =>
      rt.getLoadedShare('react', { shareKey: 'react', requiredVersion: '^19.0.0', singleton: true, strictVersion: true }),
    ).toThrow('MFU-003')
    warnSpy.mockRestore()
  })

  it('singleton 选中实例尚未就绪（value 未定）时同步返回 undefined，不擅自换另一份已就绪实例', async () => {
    rt.initSharing('default')
    let releaseHi: (v: unknown) => void = () => {}
    const gate = new Promise((r) => {
      releaseHi = r
    })
    const ready18 = { v: '18.3.1' }
    const pending19 = { v: '19.3.0' }
    rt.registerShare('default', 'react', '18.3.1', async () => ready18, { from: 'a' })
    rt.registerShare('default', 'react', '19.3.0', async () => {
      await gate
      return pending19
    }, { from: 'b' })
    const hi = rt.loadShare('react', { shareKey: 'react', requiredVersion: '^19.0.0', singleton: true })
    await Promise.resolve() // 让 loadShare 标记 19.3.0 loaded 并进入 get()
    // 单例已选中 19.3.0（未就绪）：不得退回已就绪的 18.3.1，也不得发起额外加载
    expect(rt.getLoadedShare('react', { shareKey: 'react', requiredVersion: '^19.0.0', singleton: true })).toBeUndefined()
    releaseHi(null)
    expect(await hi).toBe(pending19)
    // 就绪后同一查询命中同一实例
    expect(rt.getLoadedShare('react', { shareKey: 'react', requiredVersion: '^19.0.0', singleton: true })).toBe(pending19)
  })

  it('快照不跨 shareScope / shareKey / 版本范围串用（hook 场景）', async () => {
    rt.initSharing('default')
    rt.initSharing('tenant-x')
    let pick = 0
    rt.registerPlugins([
      {
        name: 'picker',
        init(hooks) {
          hooks.resolveShare = (info) => {
            const wanted = info.requiredVersion === '^2.0.0' ? '2.0.0' : '1.0.0'
            return info.available.find((e) => e.version === wanted) ?? info.picked
          }
        },
      },
    ])
    const dv1 = { scope: 'default', v: 1 }
    const dv2 = { scope: 'default', v: 2 }
    const tv1 = { scope: 'tenant-x', v: 1 }
    rt.registerShare('default', 'lib', '1.0.0', async () => dv1, { from: 'a' })
    rt.registerShare('default', 'lib', '2.0.0', async () => dv2, { from: 'b' })
    rt.registerShare('tenant-x', 'lib', '1.0.0', async () => tv1, { from: 'a' })
    rt.registerShare('default', 'other', '1.0.0', async () => ({ key: 'other' }), { from: 'a' })
    expect(await rt.loadShare('lib', { shareKey: 'lib', shareScope: 'default' })).toBe(dv1)
    // 其他 scope：无快照可复用 → undefined（hook 不能被同步执行去猜 tenant-x 的结果）
    expect(rt.getLoadedShare('lib', { shareKey: 'lib', shareScope: 'tenant-x' })).toBeUndefined()
    expect(await rt.loadShare('lib', { shareKey: 'lib', shareScope: 'tenant-x' })).toBe(tv1)
    // 其他 key：无串用
    expect(rt.getLoadedShare('other', { shareKey: 'other', shareScope: 'default' })).toBeUndefined()
    expect(await rt.loadShare('other', { shareKey: 'other', shareScope: 'default' })).toEqual({ key: 'other' })
    // 其他版本范围：^2 与全量是不同消费条件，未协商过 → undefined
    expect(rt.getLoadedShare('lib', { shareKey: 'lib', shareScope: 'default', requiredVersion: '^2.0.0' })).toBeUndefined()
    expect(await rt.loadShare('lib', { shareKey: 'lib', shareScope: 'default', requiredVersion: '^2.0.0' })).toBe(dv2)
    expect(rt.getLoadedShare('lib', { shareKey: 'lib', shareScope: 'default', requiredVersion: '^2.0.0' })).toBe(dv2)
  })

  it('resolveShare 选低版本 / 返回原表之外的条目 / 异步返回均生效', async () => {
    rt.initSharing('default')
    const hi = { v: '2.0.0' }
    const lo = { v: '1.0.0' }
    const external = { v: 'external' }
    rt.registerShare('default', 'lib', '2.0.0', async () => hi, { from: 'a' })
    rt.registerShare('default', 'lib', '1.0.0', async () => lo, { from: 'b' })
    let mode: 'low' | 'external' | 'async-external' = 'low'
    rt.registerPlugins([
      {
        name: 'chooser',
        init(hooks) {
          hooks.resolveShare = async (info) => {
            if (mode === 'low') return info.available.find((e) => e.version === '1.0.0')
            // 原表之外的条目：带 get/from 的完整 ShareEntry 形态
            return {
              version: '9.9.9', from: 'synthetic',
              get: async () => external,
            } as never
          }
        },
      },
    ])
    expect(await rt.loadShare('lib', { shareKey: 'lib', requiredVersion: '^1.0.0' })).toBe(lo)
    // 同消费条件（^1.0.0）可同步复用；不同条件不能
    expect(rt.getLoadedShare('lib', { shareKey: 'lib', requiredVersion: '^1.0.0' })).toBe(lo)
    expect(rt.getLoadedShare('lib', { shareKey: 'lib' })).toBeUndefined()
    mode = 'external'
    expect(await rt.loadShare('lib', { shareKey: 'lib', requiredVersion: '^2.0.0' })).toBe(external)
    expect(rt.getLoadedShare('lib', { shareKey: 'lib', requiredVersion: '^2.0.0' })).toBe(external)
    mode = 'async-external'
    // 异步 hook：loadShare 正常等待结果；同步查询只复用相同条件的既有成功快照
    expect(await rt.loadShare('lib', { shareKey: 'lib', requiredVersion: '~2.0' })).toBe(external)
    expect(rt.getLoadedShare('lib', { shareKey: 'lib', requiredVersion: '~2.0' })).toBe(external)
  })

  it('同步查询绝不执行 resolveShare hook；只复用相同消费条件的成功快照', async () => {
    rt.initSharing('default')
    const inst = { v: 1 }
    rt.registerShare('default', 'lib', '1.0.0', async () => inst, { from: 'a' })
    let hookCalls = 0
    rt.registerPlugins([
      {
        name: 'counter',
        init(hooks) {
          hooks.resolveShare = () => {
            hookCalls++
          }
        },
      },
    ])
    expect(rt.getLoadedShare('lib', { shareKey: 'lib', requiredVersion: '^1.0.0' })).toBeUndefined()
    expect(hookCalls).toBe(0)
    await rt.loadShare('lib', { shareKey: 'lib', requiredVersion: '^1.0.0' })
    expect(hookCalls).toBe(1)
    expect(rt.getLoadedShare('lib', { shareKey: 'lib', requiredVersion: '^1.0.0' })).toBe(inst)
    expect(hookCalls).toBe(1) // 命中快照不重跑 hook
  })

  it('注册新运行时插件后不复用旧裁决快照', async () => {
    rt.initSharing('default')
    const a = { v: 'a' }
    const b = { v: 'b' }
    rt.registerShare('default', 'lib', '1.0.0', async () => a, { from: 'a' })
    rt.registerShare('default', 'lib', '2.0.0', async () => b, { from: 'b' })
    rt.registerPlugins([
      {
        name: 'pick-hi',
        init(hooks) {
          hooks.resolveShare = (info) => info.available.find((e) => e.version === '2.0.0')
        },
      },
    ])
    expect(await rt.loadShare('lib', { shareKey: 'lib', requiredVersion: '^1.0.0' })).toBe(b)
    expect(rt.getLoadedShare('lib', { shareKey: 'lib', requiredVersion: '^1.0.0' })).toBe(b)
    // 新插件改判低版本：注册即清空快照，同步查询不得沿用 b
    rt.registerPlugins([
      {
        name: 'pick-lo',
        init(hooks) {
          hooks.resolveShare = (info) => info.available.find((e) => e.version === '1.0.0')
        },
      },
    ])
    expect(rt.getLoadedShare('lib', { shareKey: 'lib', requiredVersion: '^1.0.0' })).toBeUndefined()
    expect(await rt.loadShare('lib', { shareKey: 'lib', requiredVersion: '^1.0.0' })).toBe(a)
    expect(rt.getLoadedShare('lib', { shareKey: 'lib', requiredVersion: '^1.0.0' })).toBe(a)
  })



  it('fallback 实例回写共享作用域：空作用域新建 loaded 条目，后续协商/同步查询命中同一份', async () => {
    rt.initSharing('default')
    const localHost = { v: 'host-local-19' }
    // 生产宿主时序：门面 fallback 先于入口 init（作用域为空）
    const got = await rt.loadShare('react', { shareKey: 'react', requiredVersion: '19.3.0', singleton: true, fallback: async () => localHost, localVersion: '19.3.0' })
    expect(got).toBe(localHost)
    // 回写后：同步查询命中；init 的同版本注册被 first-wins 跳过，不产生第二实例
    expect(rt.getLoadedShare('react', { shareKey: 'react', requiredVersion: '19.3.0', singleton: true })).toBe(localHost)
    rt.registerShare('default', 'react', '19.3.0', async () => ({ v: 'OTHER' }), { from: 'host' })
    expect(await rt.loadShare('react', { shareKey: 'react', singleton: true })).toBe(localHost)
    expect(rt.getLoadedShare('react', { shareKey: 'react', singleton: true })).toBe(localHost)
  })

  it('已有可选中条目时不走 fallback（singleton 语义保持）；非匹配 fallback 不污染条目', async () => {
    rt.initSharing('default')
    rt.registerShare('default', 'react', '19.3.0', async () => ({ v: 'entry' }), { from: 'host' })
    const localCopy = { v: 'local-19' }
    // singleton：有注册条目即协商命中，fallback 不参与（本地副本不抢占已注册实例）
    expect(await rt.loadShare('react', { shareKey: 'react', requiredVersion: '19.3.0', singleton: true, fallback: async () => localCopy, localVersion: '19.3.0' })).toEqual({ v: 'entry' })
    // singleton 版本不匹配：仍用注册条目并告警（fallback 不参与、不回填——不掩盖冲突）
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    rt.registerShare('default', 'vue', '3.5.0', async () => ({ v: 'entry-3.5' }), { from: 'host' })
    const localVue40 = { v: 'local-4.0' }
    expect(await rt.loadShare('vue', { shareKey: 'vue', requiredVersion: '^4.0.0', singleton: true, fallback: async () => localVue40, localVersion: '4.0.0' })).toEqual({ v: 'entry-3.5' })
    expect(rt.getLoadedShare('vue', { shareKey: 'vue', singleton: true })).toEqual({ v: 'entry-3.5' })
    expect(warnSpy).toHaveBeenCalledTimes(1)
    warnSpy.mockRestore()
  })

  it('pinLoadedShare：垫片先于 TLA 门面求值时，本地副本被登记为将选中实例（无版本冲突时）', async () => {
    rt.initSharing('default')
    // 宿主已注册 19.3.0（未加载）——remote 的 jsx-runtime 链先把垫片求值的场景
    rt.registerShare('default', 'react', '19.3.0', async () => ({ v: 'HOST' }), { from: 'host' })
    const localRemoteCopy = { v: 'REMOTE-LOCAL' }
    // 垫片同步查询：未命中（无任何就绪实例/快照）
    expect(rt.getLoadedShare('react', { shareKey: 'react', requiredVersion: '19.3.0', singleton: true })).toBeUndefined()
    // 垫片登记本地副本（版本一致）
    rt.pinLoadedShare('react', { shareKey: 'react', requiredVersion: '19.3.0', singleton: true }, '19.3.0', localRemoteCopy)
    // 同步查询现在命中登记实例；后续门面协商（相同条件）也收敛到同一份（不重复 get）
    expect(rt.getLoadedShare('react', { shareKey: 'react', requiredVersion: '19.3.0', singleton: true })).toBe(localRemoteCopy)
    expect(await rt.loadShare('react', { shareKey: 'react', requiredVersion: '19.3.0', singleton: true })).toBe(localRemoteCopy)
    // 宿主条目的 get（HOST 副本）不再被加载——单实例收敛
    expect(rt.getLoadedShare('react', { shareKey: 'react', requiredVersion: '19.3.0', singleton: true })).toBe(localRemoteCopy)
  })

  it('pinLoadedShare：版本不一致不登记（不掩盖版本冲突）；实例已就绪不抢占', async () => {
    rt.initSharing('default')
    const hostInstance = { v: 'host-18' }
    rt.registerShare('default', 'react', '18.3.1', async () => hostInstance, { from: 'host' })
    const local19 = { v: 'remote-local-19' }
    // 远程本地副本是 19.3.0，条目是 18.3.1：不登记
    rt.pinLoadedShare('react', { shareKey: 'react', singleton: true }, '19.3.0', local19)
    expect(rt.getLoadedShare('react', { shareKey: 'react', singleton: true })).toBeUndefined()
    // 宿主实例加载后：不抢占已就绪实例
    expect(await rt.loadShare('react', { shareKey: 'react', singleton: true })).toBe(hostInstance)
    rt.pinLoadedShare('react', { shareKey: 'react', singleton: true }, '18.3.1', local19)
    expect(rt.getLoadedShare('react', { shareKey: 'react', singleton: true })).toBe(hostInstance)
    // strictVersion 拒绝场景：pin 静默放弃，不改变错误语义
    expect(() => rt.pinLoadedShare('react', { shareKey: 'react', requiredVersion: '^19.0.0', singleton: true, strictVersion: true }, '19.3.0', local19)).not.toThrow()
  })

  it('本地 fallback 不掩盖版本冲突：singleton 不满足时仍用单例（宽松）或拒绝（strict），不走 fallback', async () => {
    rt.initSharing('default')
    const singleton = { v: '18.3.1' }
    rt.registerShare('default', 'react', '18.3.1', async () => singleton, { from: 'host' })
    const fallbackInstance = { v: 'local-19' }
    const fallback = vi.fn(async () => fallbackInstance)
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // 宽松：命中单例 + 告警；fallback 不被调用（否则本地副本会掩盖不兼容并制造第二实例）
    expect(await rt.loadShare('react', { shareKey: 'react', requiredVersion: '^19.0.0', singleton: true, fallback })).toBe(singleton)
    expect(fallback).not.toHaveBeenCalled()
    // strict：直接拒绝；fallback 同样不参与
    await expect(
      rt.loadShare('react', { shareKey: 'react', requiredVersion: '^19.0.0', singleton: true, strictVersion: true, fallback }),
    ).rejects.toThrow('MFU-003')
    expect(fallback).not.toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('非单例无匹配版本时才走本地 fallback（import:false/本地副本兜底语义保留）', async () => {
    rt.initSharing('default')
    rt.registerShare('default', 'lib', '1.0.0', async () => ({ v: 1 }), { from: 'a' })
    const local = { v: 'local' }
    const fallback = vi.fn(async () => local)
    expect(await rt.loadShare('lib', { shareKey: 'lib', requiredVersion: '^2.0.0', fallback })).toBe(local)
    expect(fallback).toHaveBeenCalledTimes(1)
    // strictVersion + 无匹配：拒绝并保持 fallback 不参与
    await expect(
      rt.loadShare('lib', { shareKey: 'lib', requiredVersion: '^2.0.0', strictVersion: true, fallback }),
    ).rejects.toThrow('MFU-003')
    expect(fallback).toHaveBeenCalledTimes(1)
  })
})

describe('runtime: loadShare × pinLoadedShare 并发时序（实例所有权回归）', () => {
  let rt: Runtime
  beforeEach(async () => {
    rt = await fresh()
  })

  /** 可控 getter：返回「当前轮次」的受控 Promise，测试直接放行/拒绝该 Promise（与 pin 的本地实例互为不同对象） */
  function gatedShare(key: string, version: string, opts: { singleton?: boolean } = {}) {
    let res: (v: any) => void = () => {}
    let rej: (e: unknown) => void = () => {}
    let gate = new Promise<any>((_res, _rej) => {
      res = _res
      rej = _rej
    })
    const state = { instance: { v: `getter-${key}` } }
    const getter = vi.fn(() => gate)
    rt.registerShare('default', key, version, getter, { from: 'host', singleton: opts.singleton })
    return {
      getter,
      state,
      /** 放行当前在飞（或下一次）getter 调用，返回 state.instance */
      resolve: () => res(state.instance),
      reject: (e = new Error('getter boom')) => rej(e),
      /** 换新轮次：此后 getter 的下一次调用等待新的受控 Promise */
      nextRound: () => {
        gate = new Promise<any>((_res, _rej) => {
          res = _res
          rej = _rej
        })
      },
    }
  }

  it('loadShare 挂起期间 pin 本地实例：getter 完成后不得覆盖（同步与异步消费者同实例）', async () => {
    rt.initSharing('default')
    const s = gatedShare('react', '19.3.0', { singleton: true })
    const loadPromise = rt.loadShare('react', { shareKey: 'react', requiredVersion: '19.3.0', singleton: true })
    // getter 已调用且挂起；此刻 CJS 垫片 pin 本地副本
    expect(s.getter).toHaveBeenCalledTimes(1)
    const localCopy = { v: 'LOCAL' }
    rt.pinLoadedShare('react', { shareKey: 'react', requiredVersion: '19.3.0', singleton: true }, '19.3.0', localCopy)
    // getter 以另一份实例完成——协商结果必须让位于先写入的 pin
    s.resolve()
    await expect(loadPromise).resolves.toBe(localCopy)
    expect(rt.getLoadedShare('react', { shareKey: 'react', requiredVersion: '19.3.0', singleton: true })).toBe(localCopy)
  })

  it('非单例多版本范围：pin 只作用于选中条目，其他版本条目不受牵连', async () => {
    rt.initSharing('default')
    const v1 = { v: '1.5.0' }
    rt.registerShare('default', 'lib', '1.5.0', async () => v1, { from: 'a' })
    const s = gatedShare('lib', '2.1.0')
    const loadPromise = rt.loadShare('lib', { shareKey: 'lib', requiredVersion: '^2.0.0' })
    const local21 = { v: 'LOCAL-2.1' }
    rt.pinLoadedShare('lib', { shareKey: 'lib', requiredVersion: '^2.0.0' }, '2.1.0', local21)
    s.resolve()
    await expect(loadPromise).resolves.toBe(local21)
    // ^1 的消费者仍命中 1.x 实例（pin 未跨条目污染）
    expect(await rt.loadShare('lib', { shareKey: 'lib', requiredVersion: '^1.0.0' })).toBe(v1)
  })

  it('pin 先于 loadShare：快路径复用已登记实例，getter 不被调用', async () => {
    rt.initSharing('default')
    const s = gatedShare('react', '19.3.0', { singleton: true })
    const localCopy = { v: 'LOCAL' }
    rt.pinLoadedShare('react', { shareKey: 'react', requiredVersion: '19.3.0', singleton: true }, '19.3.0', localCopy)
    await expect(rt.loadShare('react', { shareKey: 'react', requiredVersion: '19.3.0', singleton: true })).resolves.toBe(localCopy)
    expect(s.getter).not.toHaveBeenCalled()
  })

  it('同一条目多个 loadShare 并发：getter 恰好一次，全体收敛同一实例', async () => {
    rt.initSharing('default')
    const s = gatedShare('lib', '2.0.0')
    const p1 = rt.loadShare('lib', { shareKey: 'lib', requiredVersion: '^2.0.0' })
    const p2 = rt.loadShare('lib', { shareKey: 'lib', requiredVersion: '^2.0.0' })
    await Promise.resolve() // 让两个调用都进入等待
    expect(s.getter).toHaveBeenCalledTimes(1)
    s.resolve()
    const [r1, r2] = await Promise.all([p1, p2])
    expect(r1).toBe(s.state.instance)
    expect(r2).toBe(s.state.instance)
  })

  it('getter 拒绝：无 pin 时回滚加载状态可重试；重试成功后实例可用', async () => {
    rt.initSharing('default')
    const s = gatedShare('lib', '2.0.0')
    const first = rt.loadShare('lib', { shareKey: 'lib', requiredVersion: '^2.0.0' })
    s.reject()
    await expect(first).rejects.toThrow('getter boom')
    // 状态恢复：失败条目不再被视为已加载（未就绪条目同步查询仍 undefined）
    expect(rt.getLoadedShare('lib', { shareKey: 'lib', requiredVersion: '^2.0.0' })).toBeUndefined()
    // 重试：新的 get() 发起并可成功（换新轮次并改写放行实例）
    s.nextRound()
    const ok = { v: 'retry-ok' }
    s.state.instance = ok
    const second = rt.loadShare('lib', { shareKey: 'lib', requiredVersion: '^2.0.0' })
    s.resolve()
    await expect(second).resolves.toBe(ok)
    expect(s.getter).toHaveBeenCalledTimes(2)
  })

  it('singleton getter 拒绝：失败条目回滚「已加载」标记，已就绪实例按已加载优先被选中', async () => {
    rt.initSharing('default')
    const s = gatedShare('react', '19.3.0', { singleton: true })
    rt.registerShare('default', 'react', '18.3.1', async () => ({ v: '18-ready' }), { from: 'b', singleton: true })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // 19 在飞（loaded=true）→ 单例已加载优先选中 19
    const first = rt.loadShare('react', { shareKey: 'react', requiredVersion: '^19.0.0', singleton: true })
    s.reject()
    await expect(first).rejects.toThrow('getter boom')
    // 18 就绪后：修复前 19 的 loaded 残留会永久抢占「已加载优先」，每次单例请求都重试死条目；
    // 修复后回滚生效，已就绪的 18 按已加载优先胜出
    await expect(rt.loadShare('react', { shareKey: 'react', requiredVersion: '^18.0.0' })).resolves.toEqual({ v: '18-ready' })
    await expect(rt.loadShare('react', { shareKey: 'react', singleton: true })).resolves.toEqual({ v: '18-ready' })
    warnSpy.mockRestore()
  })

  it('getter 拒绝但窗口内已 pin：收敛到 pin 实例而非把失败抛给异步消费者', async () => {
    rt.initSharing('default')
    const s = gatedShare('react', '19.3.0', { singleton: true })
    const loadPromise = rt.loadShare('react', { shareKey: 'react', requiredVersion: '19.3.0', singleton: true })
    const localCopy = { v: 'LOCAL' }
    rt.pinLoadedShare('react', { shareKey: 'react', requiredVersion: '19.3.0', singleton: true }, '19.3.0', localCopy)
    s.reject(new Error('negotiation failed'))
    await expect(loadPromise).resolves.toBe(localCopy)
    expect(rt.getLoadedShare('react', { shareKey: 'react', requiredVersion: '19.3.0', singleton: true })).toBe(localCopy)
  })

  it('自定义 resolveShare + pin：hook 语义保留，选中条目已有实例时不再重复 get', async () => {
    rt.initSharing('default')
    const getterInstance = { v: 'HOST' }
    const getter = vi.fn(async () => getterInstance)
    rt.registerShare('default', 'react', '19.3.0', getter, { from: 'host', singleton: true })
    const localCopy = { v: 'LOCAL' }
    rt.pinLoadedShare('react', { shareKey: 'react', requiredVersion: '19.3.0', singleton: true }, '19.3.0', localCopy)
    const hook = vi.fn((info: { picked: unknown }) => info.picked)
    rt.registerPlugins([{ name: 'pick-default', init: (h) => { h.resolveShare = hook as any } }])
    // hook 每次调用仍执行，但选中条目已持有 pin 实例——直接复用，不重复加载
    await expect(rt.loadShare('react', { shareKey: 'react', requiredVersion: '19.3.0', singleton: true })).resolves.toBe(localCopy)
    expect(hook).toHaveBeenCalledTimes(1)
    expect(getter).not.toHaveBeenCalled()
    // hook 存在时同步查询走成功快照：命中同一实例
    expect(rt.getLoadedShare('react', { shareKey: 'react', requiredVersion: '19.3.0', singleton: true })).toBe(localCopy)
  })
})

describe('CJS 垫片与改写路径（生成物与 transform 行为）', () => {
  const ROOT = process.cwd()

  it('genCjsNsFacade：strictVersion/singleton/requiredVersion 全量透传到 getLoadedShare 参数', () => {
    const n = normalizeOptions(
      {
        name: 'remote',
        exposes: { './x': './src/x.ts' },
        shared: { react: { singleton: true, strictVersion: true, requiredVersion: '^18.0.0' } },
      },
      ROOT,
      'build',
    )
    const item = n.shared.find((s) => s.shareKey === 'react')!
    const code = genCjsNsFacade(item, ['useState', 'createElement'])
    expect(code).toContain('strictVersion: true')
    expect(code).toContain('singleton: true')
    expect(code).toContain('requiredVersion: "^18.0.0"')
    expect(code).toContain('getLoadedShare')
    expect(code).toContain('__fulgurjs_gls("react", {')
    // webpack 默认值规则：singleton 时不默认 strictVersion，不虚传
    const n2 = normalizeOptions({ name: 'r', exposes: { './x': './src/x.ts' }, shared: { react: { singleton: true } } }, ROOT, 'build')
    const item2 = n2.shared.find((x) => x.shareKey === 'react')!
    expect(item2.strictVersion).toBe(false)
    const code2 = genCjsNsFacade(item2, ['useState'])
    expect(code2).not.toContain('strictVersion')
  })

  it('宿主 shared 提供闭包内的 CJS require 保持原生引用（不再改写到协商垫片）', async () => {
    const n = normalizeOptions(
      {
        name: 'host',
        remotes: { r: 'http://localhost:5101/@fulgurjs-entry.js' },
        devSharedSelf: true,
        shared: { 'react-dom': { singleton: true }, react: { singleton: true } },
      },
      ROOT,
      'build',
    )
    const closureRoots = [{ root: '/proj/node_modules/react-dom/', keys: new Set(['react-dom']) }]
    const cjs = `module.exports = function(e){return e(require("react"))}`
    // 闭包内：require 保持原生
    const inside = await transformModule(cjs, '/proj/node_modules/react-dom/index.js', {
      options: n, rewriteShared: true, allowNodeModules: true, cjsRequireRewrite: true,
      sharedClosureRoots: closureRoots,
    })
    // 闭包内唯一候选（require 重写）被跳过 → 无改动 → null（require 保持原生即原码）
    expect(inside).toBeNull()
    // 闭包外（纯远程身份）：require 走同步协商垫片
    const outside = await transformModule(cjs, '/proj/node_modules/other-pkg/index.js', {
      options: n, rewriteShared: true, allowNodeModules: true, cjsRequireRewrite: true,
      sharedClosureRoots: closureRoots,
    })
    expect(outside?.code).toContain('require("virtual:fulgurjs-cjs-ns:react")')
  })

  it('默认导入走绑定门面（协商路径），不误走本地 provider 门面', async () => {
    const n = normalizeOptions(
      { name: 'h', remotes: { r: 'http://localhost:5101/@fulgurjs-entry.js' }, shared: { vue: { singleton: true, requiredVersion: '^3.4.0' } } },
      ROOT,
      'build',
    )
    const r = await transformModule(`import Vue from 'vue'\nconsole.log(Vue)\n`, '/src/a.ts', {
      options: n, rewriteShared: true,
    })
    // 绑定门面带 ?f= 签名（TLA loadShare 协商 + fallback）；本地 provider 门面无 ?f=
    expect(r?.code).toMatch(/from 'virtual:fulgurjs-shared:vue\?f=[\w-]+'/)
    expect(r?.code).not.toMatch(/from 'virtual:fulgurjs-shared:vue'/)
    expect(r?.code).not.toContain(`from 'vue'`)
  })

  it('命名空间导入 / 动态导入 / 默认导出转发均进入 loadShare 协商路径', async () => {
    const n = normalizeOptions(
      { name: 'h', remotes: { r: 'http://localhost:5101/@fulgurjs-entry.js' }, shared: { vue: {} } },
      ROOT,
      'build',
    )
    const ns = await transformModule(`import * as VueNS from 'vue'\nconsole.log(VueNS)\n`, '/src/ns.ts', {
      options: n, rewriteShared: true,
    })
    expect(ns?.code).toContain('__fulgurjs_loadShare("vue"')
    const dyn = await transformModule(`const m = await import('vue')\n`, '/src/dyn.ts', {
      options: n, rewriteShared: true,
    })
    expect(dyn?.code).toContain('await __fulgurjs_loadShare("vue"')
    const reexport = await transformModule(`export { default as V } from 'vue'\n`, '/src/re.ts', {
      options: n, rewriteShared: true,
    })
    expect(reexport?.code).toMatch(/virtual:fulgurjs-shared:vue\?f=[\w-]+/)
    // 动态 import 的 loadShare 调用携带本地 fallback（协商失败回落本应用副本）
    expect(dyn?.code).toContain('fallback')
  })
})
