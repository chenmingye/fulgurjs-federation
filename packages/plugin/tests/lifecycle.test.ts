/**
 * setup/onSession 生命周期单测（§3.3.1 固定公开契约）。
 *
 * 每个 case 通过 vi.resetModules + 动态 import 获得全新 runtime 实例；
 * 远程以 promise-based remote 形式注入假容器（协议 { name, init, get, __fulgurjsSetup? }）。
 * 覆盖：首次加载时序（T3）/ 并发去重 / 同代次去重 / 换代重跑+信号失效 / 失败重试 /
 * 缺 sessionKey（MFU-013）/ 非法导出（MFU-011）/ 自递归（MFU-014）/ 预载与 getContainer
 * 无副作用（T7）/ 无 setup 远程行为不变（T1）/ clearSessionState 语义。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Runtime = typeof import('../src/runtime/index')

const SETUP_KEY = './__fulgurjs_setup__'

interface FakeOptions {
  setupMod?: Record<string, unknown> | ((calls: string[]) => Record<string, unknown>)
  pageMod?: unknown
}

function makeContainer(name: string, opts: FakeOptions = {}) {
  const calls: string[] = []
  const container: any = { name, calls }
  container.init = async () => {
    calls.push('init')
  }
  container.get = async (m: string) => {
    calls.push(`get:${m}`)
    if (m === SETUP_KEY) {
      const mod = typeof opts.setupMod === 'function' ? opts.setupMod(calls) : opts.setupMod
      return mod ?? { default: () => {} }
    }
    return opts.pageMod ?? { default: { __page: name } }
  }
  if (opts.setupMod !== undefined || typeof opts.setupMod === 'function') {
    container.__fulgurjsSetup = SETUP_KEY
  }
  return container
}

async function fresh(): Promise<Runtime> {
  vi.resetModules()
  ;(globalThis as any).__FULGURJS_RUNTIME__ = undefined
  delete (globalThis as any).__FULGURJS_APP_CONFIG__
  return import('../src/runtime/index')
}

async function registerFake(rt: Runtime, name: string, container: any): Promise<void> {
  rt.registerRemote({ name, entry: '', promise: async () => container })
}

describe('setup/onSession：无 setup 的远程行为不变（T1/T2）', () => {
  let rt: Runtime
  beforeEach(async () => {
    rt = await fresh()
  })

  it('无 setup 元数据：loadRemote 直接返回模块，不触碰 AppContext/sessionKey', async () => {
    const c = makeContainer('r1')
    await registerFake(rt, 'r1', c)
    const mod = await rt.loadRemote('r1/Page')
    expect((mod as any).default.__page).toBe('r1')
    expect(c.calls).toEqual(['init', 'get:./Page'])
  })

  it('普通 TS expose 语义：加载返回命名空间，导出函数不被自动调用（T2）', async () => {
    let invoked = false
    const c = makeContainer('r2', { pageMod: { doWork: () => { invoked = true } } })
    await registerFake(rt, 'r2', c)
    const mod = (await rt.loadRemote('r2/math')) as any
    expect(invoked).toBe(false)
    mod.doWork()
    expect(invoked).toBe(true)
  })

  it("loadRemote('remote') 只取容器，不执行 setup", async () => {
    let ran = false
    const c = makeContainer('r3', { setupMod: { default: () => { ran = true } } })
    await registerFake(rt, 'r3', c)
    const container = await rt.loadRemote('r3')
    expect(container.name).toBe('r3')
    expect(ran).toBe(false)
  })

  it('getContainer 不执行 setup（T7 预载无副作用）', async () => {
    let ran = false
    const c = makeContainer('r4', { setupMod: { default: () => { ran = true } } })
    await registerFake(rt, 'r4', c)
    await rt.getContainer('r4')
    expect(ran).toBe(false)
  })
})

describe('setup/onSession：时序与去重（T3）', () => {
  let rt: Runtime
  beforeEach(async () => {
    rt = await fresh()
  })

  it('首次加载时序：init → 取 setup 模块 → 执行 setup → 取页面模块', async () => {
    const c = makeContainer('r5', { setupMod: { default: () => {} } })
    await registerFake(rt, 'r5', c)
    await rt.loadRemote('r5/Page')
    expect(c.calls).toEqual(['init', `get:${SETUP_KEY}`, 'get:./Page'])
  })

  it('setup 在 init 之后执行（共享协商已完成）', async () => {
    let initDone = false
    const c = makeContainer('r6')
    c.init = async () => { initDone = true }
    c.get = async (m: string) => {
      if (m === SETUP_KEY) {
        return { default: () => { expect(initDone).toBe(true) } }
      }
      return { default: {} }
    }
    c.__fulgurjsSetup = SETUP_KEY
    await registerFake(rt, 'r6', c)
    await rt.loadRemote('r6/Page')
  })

  it('并发加载两个页面：应用级 setup 只执行一次（T3）', async () => {
    let setupCount = 0
    const c = makeContainer('r7', { setupMod: { default: () => { setupCount++ } } })
    await registerFake(rt, 'r7', c)
    await Promise.all([rt.loadRemote('r7/A'), rt.loadRemote('r7/B')])
    expect(setupCount).toBe(1)
  })

  it('成功后再次加载不重复执行 setup', async () => {
    let setupCount = 0
    const c = makeContainer('r8', { setupMod: { default: () => { setupCount++ } } })
    await registerFake(rt, 'r8', c)
    await rt.loadRemote('r8/A')
    await rt.loadRemote('r8/B')
    expect(setupCount).toBe(1)
  })

  it('onSession 同一代次只执行一次；模块缓存命中仍会触发会话检查', async () => {
    let sessionCount = 0
    const c = makeContainer('r9', {
      setupMod: { default: () => {}, onSession: () => { sessionCount++ } },
    })
    await registerFake(rt, 'r9', c)
    ;(globalThis as any).__FULGURJS_APP_CONFIG__ = { sessionKey: 's-1' }
    await rt.loadRemote('r9/A')
    await rt.loadRemote('r9/A') // 模块已缓存，仍走会话检查
    await rt.loadRemote('r9/B')
    expect(sessionCount).toBe(1)
  })

  it('换登录代次：onSession 重新执行，且旧代次 signal 失效、新旧串行', async () => {
    const seen: string[] = []
    let releaseOld: (() => void) | undefined
    const oldDone = new Promise<void>((r) => { releaseOld = r })
    const c = makeContainer('r10', {
      setupMod: {
        default: () => {},
        onSession: async (ctx: any) => {
          seen.push(ctx.sessionKey)
          if (ctx.sessionKey === 's-old') await oldDone // 旧调用挂起
        },
      },
    })
    await registerFake(rt, 'r10', c)
    ;(globalThis as any).__FULGURJS_APP_CONFIG__ = { sessionKey: 's-old' }
    const p1 = rt.loadRemote('r10/A')
    await vi.waitFor(() => expect(seen).toEqual(['s-old']))
    // 旧调用未结束时换代
    ;(globalThis as any).__FULGURJS_APP_CONFIG__ = { sessionKey: 's-new' }
    const p2 = rt.loadRemote('r10/A')
    // 新 onSession 必须等旧调用落定后才执行（串行）
    await Promise.resolve()
    expect(seen).toEqual(['s-old'])
    releaseOld!()
    await Promise.all([p1, p2])
    expect(seen).toEqual(['s-old', 's-new'])
  })

  it('onSession 收到 signal；换代时旧 signal 被 abort', async () => {
    let oldSignal: AbortSignal | undefined
    let release: (() => void) | undefined
    const gate = new Promise<void>((r) => { release = r })
    const c = makeContainer('r11', {
      setupMod: {
        default: () => {},
        onSession: async (ctx: any) => {
          if (ctx.sessionKey === 's-1') {
            oldSignal = ctx.signal
            await gate
          }
        },
      },
    })
    await registerFake(rt, 'r11', c)
    ;(globalThis as any).__FULGURJS_APP_CONFIG__ = { sessionKey: 's-1' }
    const p1 = rt.loadRemote('r11/A')
    await vi.waitFor(() => expect(oldSignal).toBeDefined())
    ;(globalThis as any).__FULGURJS_APP_CONFIG__ = { sessionKey: 's-2' }
    const p2 = rt.loadRemote('r11/A')
    // abort 发生在新代次的会话检查内（经 await 边界），轮询等待
    await vi.waitFor(() => expect(oldSignal!.aborted).toBe(true))
    release!()
    await Promise.all([p1, p2])
  })

  it('clearSessionState：退出清理后同代次 onSession 必须重跑', async () => {
    let count = 0
    const c = makeContainer('r12', {
      setupMod: { default: () => {}, onSession: () => { count++ } },
    })
    await registerFake(rt, 'r12', c)
    ;(globalThis as any).__FULGURJS_APP_CONFIG__ = { sessionKey: 's-x' }
    await rt.loadRemote('r12/A')
    expect(count).toBe(1)
    rt.clearSessionState()
    await rt.loadRemote('r12/A')
    expect(count).toBe(2)
  })
})

describe('setup/onSession：失败路径与错误码（T4/T6）', () => {
  let rt: Runtime
  beforeEach(async () => {
    rt = await fresh()
  })

  it('setup 抛错 → MFU-012，该次 loadRemote 拒绝；修复后可直接重试且不重复已成功阶段', async () => {
    let attempts = 0
    const c = makeContainer('r13', {
      setupMod: () => {
        attempts++
        if (attempts === 1) return { default: () => { throw new Error('boom') } }
        return { default: () => {} }
      },
    })
    await registerFake(rt, 'r13', c)
    await expect(rt.loadRemote('r13/Page')).rejects.toThrow('MFU-012')
    expect(attempts).toBe(1)
    const mod = await rt.loadRemote('r13/Page')
    expect((mod as any).default.__page).toBe('r13')
    expect(attempts).toBe(2)
  })

  it('onSession 抛错 → MFU-012；重试只重跑会话段（setup 不重复）', async () => {
    let setupCount = 0
    let sessionAttempts = 0
    const c = makeContainer('r14', {
      setupMod: () => {
        return {
          default: () => { setupCount++ },
          onSession: () => {
            sessionAttempts++
            if (sessionAttempts === 1) throw new Error('dict failed')
          },
        }
      },
    })
    await registerFake(rt, 'r14', c)
    ;(globalThis as any).__FULGURJS_APP_CONFIG__ = { sessionKey: 's-1' }
    await expect(rt.loadRemote('r14/Page')).rejects.toThrow('MFU-012')
    expect(setupCount).toBe(1)
    await rt.loadRemote('r14/Page')
    expect(setupCount).toBe(1)
    expect(sessionAttempts).toBe(2)
  })

  it('onSession 存在但缺 sessionKey → MFU-013；宿主补齐后同一加载成功', async () => {
    let ran = false
    const c = makeContainer('r15', {
      setupMod: { default: () => {}, onSession: () => { ran = true } },
    })
    await registerFake(rt, 'r15', c)
    await expect(rt.loadRemote('r15/Page')).rejects.toThrow('MFU-013')
    expect(ran).toBe(false)
    ;(globalThis as any).__FULGURJS_APP_CONFIG__ = { sessionKey: 's-late' }
    await rt.loadRemote('r15/Page')
    expect(ran).toBe(true)
  })

  it('sessionKey 为空串/非字符串同样 MFU-013', async () => {
    const c = makeContainer('r16', {
      setupMod: { default: () => {}, onSession: () => {} },
    })
    await registerFake(rt, 'r16', c)
    ;(globalThis as any).__FULGURJS_APP_CONFIG__ = { sessionKey: '' }
    await expect(rt.loadRemote('r16/Page')).rejects.toThrow('MFU-013')
    ;(globalThis as any).__FULGURJS_APP_CONFIG__ = { sessionKey: 42 as unknown as string }
    await expect(rt.loadRemote('r16/Page')).rejects.toThrow('MFU-013')
  })

  it('默认导出不是函数 → MFU-011（带实际类型与预期签名）', async () => {
    const c = makeContainer('r17', { setupMod: { default: 'not-a-fn' } })
    await registerFake(rt, 'r17', c)
    await expect(rt.loadRemote('r17/Page')).rejects.toThrow(/MFU-011[\s\S]*string[\s\S]*export default async function setup/)
  })

  it('具名导出 onSession 不是函数 → MFU-011', async () => {
    const c = makeContainer('r18', { setupMod: { default: () => {}, onSession: 42 } })
    await registerFake(rt, 'r18', c)
    await expect(rt.loadRemote('r18/Page')).rejects.toThrow(/MFU-011[\s\S]*onSession/)
  })

  it('setup 内同步递归 loadRemote 同一远程 → MFU-014（不死锁；外层可见性由业务决定）', async () => {
    const errors: any[] = []
    const c = makeContainer('r19', {
      setupMod: {
        default: () => {
          // 递归调用被守卫当场拒绝（带 MFU-014 的 rejected promise 交回调用方）
          void rt.loadRemote('r19/Other').catch((e) => errors.push(e))
        },
      },
    })
    await registerFake(rt, 'r19', c)
    // setup 未吞掉控制流：页面加载正常完成，死锁被守卫阻断
    const mod = await rt.loadRemote('r19/Page')
    expect((mod as any).default.__page).toBe('r19')
    expect(errors).toHaveLength(1)
    expect(errors[0].code).toBe('MFU-014')
    expect(errors[0].message).toContain('r19/Other')
  })

  it('setup 执行窗口内的并发页面加载不误报 MFU-014（T3 并发）', async () => {
    const c = makeContainer('r20', {
      setupMod: { default: () => new Promise((r) => setTimeout(r, 10)) },
    })
    await registerFake(rt, 'r20', c)
    const [a, b] = await Promise.all([rt.loadRemote('r20/A'), rt.loadRemote('r20/B')])
    expect((a as any).default.__page).toBe('r20')
    expect((b as any).default.__page).toBe('r20')
  })

  it('fallbackModule 不掩盖 setup 失败（初始化错误原样抛出）', async () => {
    const c = makeContainer('r21', {
      setupMod: { default: () => { throw new Error('setup boom') } },
    })
    await registerFake(rt, 'r21', c)
    await expect(
      rt.loadRemote('r21/Page', { fallbackModule: () => ({ default: { fallback: true } }) }),
    ).rejects.toThrow('MFU-012')
  })
})

describe('setup/onSession：契约固化', () => {
  it('容器元数据键与 node 侧 SETUP_CONTAINER_KEY 同值（跨 bundle 契约）', async () => {
    const { SETUP_CONTAINER_KEY } = await import('../src/options')
    expect(SETUP_CONTAINER_KEY).toBe('__fulgurjsSetup')
  })

  it('RemoteSetupContext 的 appContext 为调用时快照（换代后重新读取，非旧引用）', async () => {
    const rt = await fresh()
    const seen: any[] = []
    const c = makeContainer('r23', {
      setupMod: {
        default: () => {},
        onSession: (ctx: any) => { seen.push(ctx.appContext.user) },
      },
    })
    await registerFake(rt, 'r23', c)
    ;(globalThis as any).__FULGURJS_APP_CONFIG__ = { sessionKey: 's-1', user: { id: 'A' } }
    await rt.loadRemote('r23/A')
    ;(globalThis as any).__FULGURJS_APP_CONFIG__ = { sessionKey: 's-2', user: { id: 'B' } }
    await rt.loadRemote('r23/A')
    expect(seen).toEqual([{ id: 'A' }, { id: 'B' }])
  })
})
