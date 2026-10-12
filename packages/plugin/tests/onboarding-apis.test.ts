/**
 * 接入成本收敛 API 单测（6.6.0）：
 * - setup pageProviders：runtime 交付契约（每次 loadRemote 交付 / 无 consumerApp 跳过 /
 *   非数组 MFU-011 / 无声明零行为）+ 解析层（零参 loader / 项校验 / 缓存）
 * - Vue remoteComponent 祖先 Provider 包裹（外→内、attrs/slots 透传、无声明零包裹）
 * - installVueBridgeRouter：MFU-034 / connect→ready→install 顺序 / ready 拒绝传播且不 install
 * - hasBridgeMount：按应用/工厂上下文隔离，失败不影响独立应用
 * - createBridgeSession：renew/clear、持久化恢复、storageKey、存储不可用退化
 * - createReactBridgeRouter：routing 缺失统一 MFU-034
 */
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick } from 'vue'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'

type Runtime = typeof import('../src/runtime/index')
type RoutingChannel = import('../src/bridge-router-core').RoutingChannel
type BridgeHostNavigation = import('../src/bridge-router-core').BridgeHostNavigation
type BridgeLocation = import('../src/bridge-router-core').BridgeLocation

const SETUP_KEY = './__fulgurjs_setup__'
const BRIDGE_MOUNT_KEY = '__FULGURJS_BRIDGE_MOUNTED__'

function makeContainer(name: string, setupMod: Record<string, unknown>) {
  const container: any = { name }
  container.init = async () => {}
  container.get = async (m: string) => (m === SETUP_KEY ? setupMod : { default: { __page: `${name}:${m}` } })
  container.__fulgurjsSetup = SETUP_KEY
  return container
}

async function freshRuntime(): Promise<Runtime> {
  vi.resetModules()
  ;(globalThis as any).__FULGURJS_RUNTIME__ = undefined
  delete (globalThis as any).__FULGURJS_APP_CONFIG__
  delete (globalThis as any)[BRIDGE_MOUNT_KEY]
  return import('../src/runtime/index')
}

async function registerFake(rt: Runtime, name: string, container: any): Promise<void> {
  rt.registerRemote({ name, entry: '', promise: async () => container })
}

const loc = (pathname: string, search = '', hash = ''): BridgeLocation => ({ pathname, search, hash })

function fakeHost(initial: BridgeLocation = loc('/approval/list')): { host: BridgeHostNavigation; requests: { target: BridgeLocation; action: string }[] } {
  let current = { ...initial }
  const listeners = new Set<(l: BridgeLocation) => void>()
  const requests: { target: BridgeLocation; action: string }[] = []
  const host: BridgeHostNavigation = {
    getLocation: () => ({ ...current }),
    subscribe(l) {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    async navigate(target, action) {
      requests.push({ target: { ...target }, action })
      current = { ...target }
      for (const l of [...listeners]) l({ ...current })
      return { status: 'committed', location: { ...current } }
    },
    go() {},
  }
  return { host, requests }
}

beforeEach(() => {
  sessionStorage.clear()
})

describe('setup pageProviders（runtime 交付契约）', () => {
  let rt: Runtime
  beforeEach(async () => {
    rt = await freshRuntime()
  })

  it('声明 pageProviders + loadRemote 带 consumerApp：每次加载都交付声明数组（桥接重进同样拿到）', async () => {
    const providers = [{ name: 'AppProvider' }]
    await registerFake(rt, 'form-r', makeContainer('form-r', { default: () => {}, pageProviders: providers }))
    const delivered: unknown[][] = []
    const sink = { pageProviders: (list: unknown[]) => delivered.push(list) }
    await rt.loadRemote('form-r/page', { consumerApp: sink })
    await rt.loadRemote('form-r/other', { consumerApp: sink })
    expect(delivered).toEqual([providers, providers])
  })

  it('consumerApp 无 pageProviders 方法 / 不传 consumerApp：静默跳过，模块正常返回', async () => {
    await registerFake(rt, 'form-r2', makeContainer('form-r2', { default: () => {}, pageProviders: [{}] }))
    const mod = await rt.loadRemote('form-r2/page', { consumerApp: { component: () => {} } })
    expect((mod as any).default.__page).toContain('form-r2')
    const mod2 = await rt.loadRemote('form-r2/page')
    expect((mod2 as any).default.__page).toContain('form-r2')
  })

  it('pageProviders 导出非数组：MFU-011 三段式报错', async () => {
    await registerFake(rt, 'bad-r', makeContainer('bad-r', { default: () => {}, pageProviders: { AppProvider: {} } }))
    await expect(rt.loadRemote('bad-r/page', { consumerApp: { pageProviders: () => {} } })).rejects.toThrow(/MFU-011[\s\S]*pageProviders/)
  })

  it('setup 未声明 pageProviders：行为与既有版本一致（零交付零副作用）', async () => {
    await registerFake(rt, 'plain-r', makeContainer('plain-r', { default: () => {}, globalComponents: { A: {} } }))
    const sink = { pageProviders: vi.fn() }
    await rt.loadRemote('plain-r/page', { consumerApp: sink as never })
    expect(sink.pageProviders).not.toHaveBeenCalled()
  })
})

describe('resolvePageProviderEntries（解析层：loader / 项校验 / 缓存）', () => {
  it('零参 loader 解析 default ?? 模块本体；静态组件与函数式组件原样通过', async () => {
    const { resolvePageProviderEntries } = await import('../src/page-providers')
    const Comp = { name: 'AppProvider' }
    const FnComp = (props: unknown) => null
    const ZeroArgComp = Object.assign(() => null, { displayName: 'StaticProvider' })
    const list = [
      () => Promise.resolve({ default: Comp }),
      () => Promise.resolve(Comp),
      Comp,
      FnComp,
      ZeroArgComp,
    ]
    const resolved = await resolvePageProviderEntries(list as unknown[])
    expect(resolved).toEqual([Comp, Comp, Comp, FnComp, ZeroArgComp])
  })

  it('loader 返回非组件 / 数组含 null：按项报错并指明位置', async () => {
    const { resolvePageProviderEntries } = await import('../src/page-providers')
    await expect(resolvePageProviderEntries([() => Promise.resolve('nope')])).rejects.toThrow(/第 1 项.*loader/)
    await expect(resolvePageProviderEntries([null] as unknown[])).rejects.toThrow(/第 1 项类型为 null/)
    await expect(resolvePageProviderEntries([42] as unknown[])).rejects.toThrow(/第 1 项类型为 number/)
  })

  it('同一声明数组二次解析命中缓存：loader 不重复执行', async () => {
    const { resolvePageProviderEntries } = await import('../src/page-providers')
    const loader = vi.fn(() => Promise.resolve({ name: 'P' }))
    const list = [loader]
    await resolvePageProviderEntries(list)
    await resolvePageProviderEntries(list)
    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('并发消费共享加载；loader 拒绝后同一声明能真正重试', async () => {
    const { resolvePageProviderEntries } = await import('../src/page-providers')
    const failure = new Error('provider temporarily unavailable')
    const Provider = { name: 'RecoveredProvider' }
    const loader = vi.fn().mockRejectedValueOnce(failure).mockResolvedValueOnce(Provider)
    const list = [loader]
    const first = resolvePageProviderEntries(list)
    const second = resolvePageProviderEntries(list)
    expect(first).toBe(second)
    await expect(first).rejects.toBe(failure)
    await expect(second).rejects.toBe(failure)
    await expect(resolvePageProviderEntries(list)).resolves.toEqual([Provider])
    expect(loader).toHaveBeenCalledTimes(2)
  })

  it('空数组 / undefined：返回 undefined（渲染零包裹）', async () => {
    const { resolvePageProviderEntries } = await import('../src/page-providers')
    expect(await resolvePageProviderEntries([])).toBeUndefined()
    expect(await resolvePageProviderEntries(undefined)).toBeUndefined()
  })
})

describe('Vue remoteComponent 祖先 Provider 包裹', () => {
  async function mountWithLoad(loadRemote: (spec: string, opts?: { consumerApp?: unknown }) => Promise<unknown>, providers?: unknown[]): Promise<HTMLElement> {
    const { createRemoteComponent } = await import('../src/vue-adapter')
    const rc = createRemoteComponent(loadRemote as never)
    const Comp = rc('vue-r/page')
    const el = document.createElement('div')
    document.body.appendChild(el)
    const app = createApp({ render: () => h(Comp, { msg: 'hi' }) })
    app.config.warnHandler = () => {}
    app.mount(el)
    for (let i = 0; i < 6 && !el.textContent?.includes('inner-msg'); i++) {
      await new Promise((r) => setTimeout(r, 5))
      await nextTick()
    }
    void providers
    return el
  }

  /** 模拟 runtime 交付：load 期间调用 consumerApp.pageProviders(list) */
  function fakeLoad(module: unknown, providers?: unknown[]) {
    return async (_spec: string, opts?: { consumerApp?: { pageProviders?: (l: unknown[]) => void } }) => {
      if (providers && opts?.consumerApp?.pageProviders) opts.consumerApp.pageProviders(providers)
      return module
    }
  }

  it('声明两个 Provider：按 外→内 包裹业务组件（DOM 层级验证），attrs 透传到最内层', async () => {
    const Outer = defineComponent({ name: 'POuter', setup: () => () => h('div', { class: 'p-outer' }, [h('div', { class: 'p-outer-mark' }, 'outer'), (null as never)]) })
    const Inner = defineComponent({ name: 'PInner', setup: () => () => h('div', { class: 'p-inner' }, [h('div', { class: 'p-inner-mark' }, 'inner')]) })
    const Page = defineComponent({
      props: { msg: { type: String, required: true } },
      setup: (props) => () => h('div', { class: 'page', 'data-msg': props.msg }, 'inner-msg'),
    })
    // Provider 用默认插槽渲染子级（真实 Provider 形态）
    const slotOuter = defineComponent({ name: 'SlotOuter', setup: (_, { slots }) => () => h('div', { class: 'p-outer' }, [slots.default!()]) })
    const slotInner = defineComponent({ name: 'SlotInner', setup: (_, { slots }) => () => h('div', { class: 'p-inner' }, [slots.default!()]) })
    void Outer; void Inner
    const el = await mountWithLoad(fakeLoad({ default: Page }, [slotOuter, slotInner]), [slotOuter, slotInner])
    expect(el.querySelector('.p-outer .p-inner .page')?.textContent).toBe('inner-msg')
    expect(el.querySelector('.page')?.getAttribute('data-msg')).toBe('hi')
  })

  it('无 pageProviders 声明：零包装层，DOM 与既有行为一致', async () => {
    const Page = defineComponent({ props: { msg: { type: String } }, setup: (props) => () => h('div', { class: 'page' }, props.msg) })
    const el = await mountWithLoad(fakeLoad({ default: Page }))
    expect(el.querySelector('.page')?.textContent).toBe('hi')
    expect(el.querySelector('.p-outer')).toBeNull()
  })

  it('loader 形态 Provider（零参 loader）正常解析渲染', async () => {
    const Prov = defineComponent({ name: 'LazyProv', setup: (_, { slots }) => () => h('div', { class: 'lazy-prov' }, [slots.default!()]) })
    const Page = defineComponent({ setup: () => () => h('span', { class: 'page' }, 'ok') })
    const list = [() => Promise.resolve(Prov)]
    const el = await mountWithLoad(fakeLoad({ default: Page }, list), list)
    expect(el.querySelector('.lazy-prov .page')?.textContent).toBe('ok')
  })

  it('loader 返回非组件：渲染进入错误态（适配层错误占位），不静默丢 Provider', async () => {
    const Page = defineComponent({ setup: () => () => h('span', 'ok') })
    const list = [() => Promise.resolve('broken')]
    const el = await mountWithLoad(fakeLoad({ default: Page }, list), list)
    await new Promise((r) => setTimeout(r, 20))
    await nextTick()
    expect(el.textContent).toMatch(/pageProviders/)
  })
})

describe('installVueBridgeRouter（一次完成 校验→接线→ready→install）', () => {
  let RoutingChannelCtor: new (id: string, base: string, host: BridgeHostNavigation, spec: string) => RoutingChannel
  let installVueBridgeRouter: typeof import('../src/bridge-router-vue').installVueBridgeRouter
  const liveChannels: RoutingChannel[] = []
  const track = <T extends RoutingChannel>(ch: T): T => { liveChannels.push(ch); return ch }

  beforeEach(async () => {
    ;({ RoutingChannel: RoutingChannelCtor } = await import('../src/bridge-router-core'))
    ;({ installVueBridgeRouter } = await import('../src/bridge-router-vue'))
  })
  afterEach(() => {
    for (const ch of liveChannels.splice(0)) ch.dispose()
  })

  function makeChildApp() {
    const app = createApp({ render: () => h('div', 'app') })
    app.config.warnHandler = () => {}
    return { app, useSpy: vi.spyOn(app, 'use') }
  }

  function makeRouter(): Router {
    return createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: { render: () => h('div', 'home') } }, { path: '/list', component: { render: () => h('div', 'list') } }],
    })
  }

  it('ctx.routing 缺失（undefined / ctx 为空 / routing 为空）→ MFU-034，不触碰 app', async () => {
    const { app, useSpy } = makeChildApp()
    const router = makeRouter()
    await expect(installVueBridgeRouter(app, router, undefined)).rejects.toThrow(/MFU-034/)
    await expect(installVueBridgeRouter(app, router, { signal: undefined, routing: undefined })).rejects.toThrow(/MFU-034/)
    expect(useSpy).not.toHaveBeenCalled()
  })

  it('成功路径：ready 落定后才 app.use(router)（顺序合同由插件承担），返回连接', async () => {
    const { host } = fakeHost(loc('/approval/list'))
    const ch = track(new RoutingChannelCtor('c-install', '/approval', host, 'vue-r/bridge'))
    const { app, useSpy } = makeChildApp()
    const router = makeRouter()
    await installVueBridgeRouter(app, router, { routing: ch })
    expect(useSpy).toHaveBeenCalledTimes(1)
    expect(useSpy.mock.calls[0][0]).toBe(router)
    expect(router.currentRoute.value.fullPath).toBe('/list')
  })

  it('ready 拒绝（初始路由失败）→ install 不执行，错误原样传播', async () => {
    const { host } = fakeHost(loc('/approval/list'))
    const ch = track(new RoutingChannelCtor('c-fail', '/approval', host, 'vue-r/bridge'))
    ch.dispose() // 通道销毁后 getLocation 仍可用但通道失效：初始导航拒绝
    const { app, useSpy } = makeChildApp()
    const router = makeRouter()
    // dispose 后的通道：connect 阶段即拒绝（MFU-031 通道失效族）
    await expect(installVueBridgeRouter(app, router, { routing: ch })).rejects.toThrow()
    expect(useSpy).not.toHaveBeenCalled()
  })
})

describe('hasBridgeMount（应用隔离）', () => {
  it('两个 Vue 应用、失败工厂与独立 app 不共享形态', async () => {
    const { hasBridgeMount } = await import('../src/bridge-core')
    const { defineBridgeApp } = await import('../src/bridge-app-vue')
    const standalone = createApp({ render: () => h('div') })
    const apps: ReturnType<typeof createApp>[] = []
    const contexts: object[] = []
    const contract = defineBridgeApp((_, ctx) => {
      expect(hasBridgeMount(ctx)).toBe(true)
      contexts.push(ctx!)
      const app = createApp({ render: () => h('div', 'bridge') })
      apps.push(app)
      return app
    })
    const els = [document.createElement('div'), document.createElement('div')]
    for (const el of els) contract.mount(el)
    expect(contexts[0]).not.toBe(contexts[1])
    expect(apps.map(hasBridgeMount)).toEqual([true, true])
    expect(hasBridgeMount(standalone)).toBe(false)
    expect(hasBridgeMount({})).toBe(false)
    for (const el of els) contract.unmount(el)
    expect(hasBridgeMount(standalone)).toBe(false)
    const failed = defineBridgeApp((_, ctx) => {
      expect(hasBridgeMount(ctx)).toBe(true)
      throw new Error('factory failed')
    })
    expect(() => failed.mount(document.createElement('div'))).toThrow('factory failed')
    expect(hasBridgeMount(standalone)).toBe(false)
  })

  it('React 工厂失败仅标记自己的上下文', async () => {
    const { hasBridgeMount } = await import('../src/bridge-core')
    const { defineBridgeApp } = await import('../src/bridge-app-react')
    const unrelated = {}
    const contract = defineBridgeApp((_, ctx) => {
      expect(hasBridgeMount(ctx)).toBe(true)
      expect(hasBridgeMount(unrelated)).toBe(false)
      throw new Error('react factory failed')
    })
    expect(() => contract.mount(document.createElement('div'))).toThrow('react factory failed')
    expect(hasBridgeMount(unrelated)).toBe(false)
  })

  it('不同运行时副本读取同一 app 标记，且不写 globalThis', async () => {
    const first = await import('../src/bridge-core')
    const context = {}
    first.markBridgeMount(context)
    vi.resetModules()
    const second = await import('../src/bridge-core')
    expect(second.hasBridgeMount(context)).toBe(true)
    expect(second.hasBridgeMount({})).toBe(false)
    expect((globalThis as Record<string, unknown>).__FULGURJS_BRIDGE_MOUNTED__).toBeUndefined()
  })
})

describe('createBridgeSession（宿主 sessionKey 生命周期）', () => {
  it('renew 生成非空代次并持久化；clear 置 null 并清存储', async () => {
    const { createBridgeSession } = await import('../src/bridge-session')
    const s = createBridgeSession()
    expect(s.sessionKey.value).toBeNull()
    const id = s.renew()
    expect(id).toBeTruthy()
    expect(s.sessionKey.value).toBe(id)
    expect(sessionStorage.getItem('fulgurjs-bridge-session')).toBe(id)
    s.clear()
    expect(s.sessionKey.value).toBeNull()
    expect(sessionStorage.getItem('fulgurjs-bridge-session')).toBeNull()
  })

  it('同会话刷新恢复：新实例从 sessionStorage 读回同一代次', async () => {
    const { createBridgeSession } = await import('../src/bridge-session')
    const a = createBridgeSession()
    const id = a.renew()
    const b = createBridgeSession()
    expect(b.sessionKey.value).toBe(id)
  })

  it('storageKey 自定义：嵌套宿主互不串号', async () => {
    const { createBridgeSession } = await import('../src/bridge-session')
    const hostA = createBridgeSession({ storageKey: 'host-a' })
    const hostB = createBridgeSession({ storageKey: 'host-b' })
    hostA.renew()
    const idB = hostB.renew()
    expect(hostA.sessionKey.value).not.toBe(idB)
    expect(createBridgeSession({ storageKey: 'host-a' }).sessionKey.value).toBe(hostA.sessionKey.value)
  })

  it('存储不可用（隐私模式）：退化为纯内存，renew/clear 正常', async () => {
    const { createBridgeSession } = await import('../src/bridge-session')
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })
    const s = createBridgeSession()
    expect(s.renew()).toBeTruthy()
    expect(s.sessionKey.value).not.toBeNull()
    s.clear()
    expect(s.sessionKey.value).toBeNull()
    spy.mockRestore()
  })
})

describe('createReactBridgeRouter：routing 缺失统一 MFU-034', () => {
  it('第一参数为 undefined：抛 MFU-034（替代项目手写守卫）', async () => {
    const { createReactBridgeRouter } = await import('../src/bridge-router-react')
    expect(() => createReactBridgeRouter(undefined as never, [{ path: '/', element: null }])).toThrow(/MFU-034/)
  })
})


describe('React Provider 真实渲染和恢复', () => {
  it('Provider 挂起也受加载 timeout 约束，卸载不产生迟到更新', async () => {
    const React = await import('react')
    const { render, waitFor } = await import('@testing-library/react')
    const { createRemoteComponent } = await import('../src/react-adapter')
    const providers = [() => new Promise(() => {})]
    const load = async (_spec: string, opts?: { consumerApp?: { pageProviders?: (list: unknown[]) => void } }) => {
      opts?.consumerApp?.pageProviders?.(providers)
      return { default: () => React.createElement('span', null, 'must not render') }
    }
    const Remote = createRemoteComponent(load as never)('react-r/hanging', { timeout: 20 })
    const view = render(React.createElement(Remote))
    await waitFor(() => expect(view.container.textContent).toContain('超过 20 毫秒'))
    expect(view.container.textContent).not.toContain('must not render')
    view.unmount()
  })

  it('并发两个 consumer、祖先 context、props、卸载重挂与 loader 失败重试', async () => {
    const React = await import('react')
    const { render, waitFor, fireEvent } = await import('@testing-library/react')
    const { createRemoteComponent } = await import('../src/react-adapter')
    const Context = React.createContext('missing')
    const Provider = (props: { children?: import('react').ReactNode }) =>
      React.createElement(Context.Provider, { value: 'provided' }, props.children)
    const Page = (props: { label: string }) =>
      React.createElement('span', null, `${React.useContext(Context)}:${props.label}`)
    const loader = vi.fn().mockRejectedValueOnce(new Error('provider offline')).mockResolvedValue(Provider)
    const providers = [loader]
    const load = async (_spec: string, opts?: { consumerApp?: { pageProviders?: (list: unknown[]) => void } }) => {
      opts?.consumerApp?.pageProviders?.(providers)
      return { default: Page }
    }
    const Remote = createRemoteComponent(load as never)('react-r/page')
    const left = render(React.createElement(Remote, { label: 'left' }))
    await waitFor(() => expect(left.container.textContent).toContain('provider offline'))
    fireEvent.click(left.container.querySelector('[data-fulgurjs-retry]')!)
    await waitFor(() => expect(left.container.textContent).toBe('provided:left'))
    const right = render(React.createElement(Remote, { label: 'right' }))
    await waitFor(() => expect(right.container.textContent).toBe('provided:right'))
    left.unmount()
    right.unmount()
    const again = render(React.createElement(Remote, { label: 'again' }))
    await waitFor(() => expect(again.container.textContent).toBe('provided:again'))
    expect(loader).toHaveBeenCalledTimes(2)
    again.unmount()
  })
})
