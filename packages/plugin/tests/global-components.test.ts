/**
 * setup globalComponents 契约单测（6.1.0：组件联邦的全局注册组件安装）。
 *
 * 场景来源：远程组件模板内的字符串标签（如 <a-divider>）按消费方 app 全局注册表解析，
 * 桥接子应用每次挂载新建 app 实例——注册必须随每次 loadRemote 对当次 consumerApp 幂等执行，
 * 不能只随 setup 跑一次。覆盖：注册进消费方 app / 换消费方 app 重注册 / 无 consumerApp 跳过 /
 * 非法导出类型（MFU-011）/ 失败清缓存 / setup 无声明零行为。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Runtime = typeof import('../src/runtime/index')

const SETUP_KEY = './__fulgurjs_setup__'

function makeContainer(name: string, setupMod: Record<string, unknown> | (() => Record<string, unknown>)) {
  const container: any = { name }
  container.init = async () => {}
  container.get = async (m: string) => {
    const mod = typeof setupMod === 'function' ? setupMod() : setupMod
    return m === SETUP_KEY ? mod : { default: { __page: name } }
  }
  container.__fulgurjsSetup = SETUP_KEY
  return container
}

function makeFakeApp() {
  const registered = new Map<string, unknown>()
  return {
    registered,
    app: { component: (n: string, c: unknown) => registered.set(n, c) },
  }
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

describe('setup globalComponents（组件联邦全局注册安装）', () => {
  let rt: Runtime
  beforeEach(async () => {
    rt = await fresh()
  })

  it('声明 globalComponents + loadRemote 带 consumerApp：注册到消费方 app 且模块正常返回', async () => {
    const Divider = { name: 'ADivider', __comp: true }
    const c = makeContainer('form-r', { default: () => {}, globalComponents: { ADivider: Divider } })
    await registerFake(rt, 'form-r', c)
    const { app, registered } = makeFakeApp()
    const mod = await rt.loadRemote('form-r/flowable/form', { consumerApp: app })
    expect((mod as any).default.__page).toBe('form-r')
    expect(registered.get('ADivider')).toBe(Divider)
  })

  it('每次 loadRemote 都注册：第二个消费方 app（桥接重进新建实例）同样拿到注册', async () => {
    const Divider = { name: 'ADivider' }
    const c = makeContainer('form-r2', { default: () => {}, globalComponents: { ADivider: Divider } })
    await registerFake(rt, 'form-r2', c)
    const a = makeFakeApp()
    await rt.loadRemote('form-r2/form', { consumerApp: a.app })
    const b = makeFakeApp()
    await rt.loadRemote('form-r2/form', { consumerApp: b.app })
    expect(a.registered.get('ADivider')).toBe(Divider)
    expect(b.registered.get('ADivider')).toBe(Divider)
  })

  it('两个消费方并发加载：setup 单飞但注册各自完成', async () => {
    const Divider = { name: 'ADivider' }
    const setup = vi.fn(async () => { await new Promise(resolve => setTimeout(resolve, 5)) })
    await registerFake(rt, 'concurrent-form', makeContainer('concurrent-form', {
      default: setup, globalComponents: { ADivider: Divider },
    }))
    const a = makeFakeApp(), b = makeFakeApp()
    await Promise.all([
      rt.loadRemote('concurrent-form/form', { consumerApp: a.app }),
      rt.loadRemote('concurrent-form/form', { consumerApp: b.app }),
    ])
    expect(setup).toHaveBeenCalledTimes(1)
    expect(a.registered.get('ADivider')).toBe(Divider)
    expect(b.registered.get('ADivider')).toBe(Divider)
  })

  it('同一 app 重复加载幂等：同名覆盖不抛错', async () => {
    const c = makeContainer('form-r3', { default: () => {}, globalComponents: { ASelect: { name: 'ASelect' } } })
    await registerFake(rt, 'form-r3', c)
    const { app, registered } = makeFakeApp()
    await rt.loadRemote('form-r3/form', { consumerApp: app })
    await expect(rt.loadRemote('form-r3/form', { consumerApp: app })).resolves.toBeTruthy()
    expect(registered.size).toBe(1)
  })

  it('无 consumerApp（手动加载/无组件上下文）：跳过注册，不报错', async () => {
    const c = makeContainer('form-r4', { default: () => {}, globalComponents: { ADivider: {} } })
    await registerFake(rt, 'form-r4', c)
    await expect(rt.loadRemote('form-r4/form')).resolves.toBeTruthy()
  })

  it('consumerApp 无 component 方法：静默跳过', async () => {
    const c = makeContainer('form-r5', { default: () => {}, globalComponents: { ADivider: {} } })
    await registerFake(rt, 'form-r5', c)
    await expect(rt.loadRemote('form-r5/form', { consumerApp: {} })).resolves.toBeTruthy()
  })

  it('globalComponents 导出为数组：MFU-011 三段式报错，可重试', async () => {
    let attempts = 0
    const c = makeContainer('form-r6', () => {
      attempts++
      return attempts === 1
        ? { default: () => {}, globalComponents: [1, 2] }
        : { default: () => {}, globalComponents: { ADivider: {} } }
    })
    await registerFake(rt, 'form-r6', c)
    const { app } = makeFakeApp()
    await expect(rt.loadRemote('form-r6/form', { consumerApp: app })).rejects.toMatchObject({ code: 'MFU-011' })
    const { app: app2, registered } = makeFakeApp()
    await expect(rt.loadRemote('form-r6/form', { consumerApp: app2 })).resolves.toBeTruthy()
    expect(registered.has('ADivider')).toBe(true)
  })

  it('setup 未声明 globalComponents：行为与 6.0.0 完全一致，consumerApp 传了也无副作用', async () => {
    const c = makeContainer('form-r7', { default: () => {} })
    await registerFake(rt, 'form-r7', c)
    const { app, registered } = makeFakeApp()
    await expect(rt.loadRemote('form-r7/form', { consumerApp: app })).resolves.toBeTruthy()
    expect(registered.size).toBe(0)
  })
})
