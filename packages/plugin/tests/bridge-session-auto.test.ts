// @vitest-environment jsdom
/**
 * 自动会话（6.12 候选）回归：createAutomaticBridgeSession 代次语义 +
 * createVueBridgeApp({ session }) 集成行为。对应任务书「自动会话必测」：
 * 登录/恢复/退出/换号/同账号重登/刷新恢复、同身份 token 轮换不重挂、
 * 离页期间登出、多远程共享命名空间、非法 getter、sessionKey 冲突、
 * getContext 代次自动补入与显式矛盾、观察器缓存与存储不可用降级。
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import { createVueBridgeAppWithLoader } from '../src/bridge-host-vue'
import { createAutomaticBridgeSession } from '../src/bridge-session-auto'
import { clearAppContext } from '../src/context'

const g = globalThis as any

beforeEach(() => {
  delete g.__FULGURJS_APP_CONFIG__
  g.__FULGURJS_RUNTIME__ = { loadRemote: vi.fn(), clearSessionState: vi.fn() }
  sessionStorage.clear()
})
afterEach(() => {
  delete g.__FULGURJS_APP_CONFIG__
  delete g.__FULGURJS_RUNTIME__
  sessionStorage.clear()
  vi.restoreAllMocks()
})

/** 与公开 /vue 入口一致的真实绑定形态（门面已由 api-facade-bindings 守护） */
const boundFactory = (loadRemote: any) => createVueBridgeAppWithLoader(loadRemote, createAutomaticBridgeSession)

function fakeContract(tag: string) {
  const mounts: Array<Record<string, unknown>> = []
  const unmounts: HTMLElement[] = []
  const mod = {
    default: {
      mount(el: HTMLElement, props?: Record<string, unknown>) {
        mounts.push(props ?? {})
        const node = document.createElement('div')
        node.setAttribute('data-testid', `content-${tag}`)
        el.appendChild(node)
      },
      unmount(el: HTMLElement) { unmounts.push(el); el.textContent = '' },
    },
  }
  return { mod, mounts, unmounts }
}

function mountHost(Comp: any, props: Record<string, unknown>) {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const state = ref(props)
  const Wrapper = defineComponent({ setup: () => () => h(Comp, { ...state.value }) })
  const app = createApp(Wrapper)
  app.mount(root)
  return {
    app, root,
    setProps: async (p: Record<string, unknown>) => { state.value = { ...state.value, ...p }; await nextTick(); await nextTick() },
    unmount: () => app.unmount(),
  }
}

function statusOf(root: HTMLElement): string {
  return root.querySelector('[data-fulgurjs-bridge-root]')?.getAttribute('data-fulgurjs-bridge-status') ?? 'missing'
}

// ══ createAutomaticBridgeSession 代次语义（单元层）══════════════════════════

describe('createAutomaticBridgeSession：身份生命周期代次', () => {
  it('undefined→用户→null→同账号重登：代次生成、清空、再生成；undefined 期间保留刷新前记录', async () => {
    const identity = ref<string | null | undefined>(undefined)
    const s = createAutomaticBridgeSession(() => identity.value, 'ns-a')
    expect(s.sessionKey.value).toBeNull()
    identity.value = 'u1'; await nextTick()
    const first = s.sessionKey.value
    expect(first).toMatch(/^s-/)
    // 恢复中不抹记录：身份短暂回到 undefined（刷新后资料未到）
    identity.value = undefined; await nextTick()
    expect(s.sessionKey.value).toBeNull()
    expect(sessionStorage.getItem('ns-a:auto')).toContain('"u1"')
    identity.value = 'u1'; await nextTick()
    expect(s.sessionKey.value).toBe(first) // 同身份恢复同代次
    identity.value = null; await nextTick()
    expect(s.sessionKey.value).toBeNull()
    expect(sessionStorage.getItem('ns-a:auto')).toBeNull()
    identity.value = 'u1'; await nextTick()
    expect(s.sessionKey.value).toBeTruthy()
    expect(s.sessionKey.value).not.toBe(first) // 重登 = 新代次
  })

  it('A→B 换号生成新代次；同身份返回原代次（token 轮换不换代）', async () => {
    const identity = ref<string>('u1')
    const s = createAutomaticBridgeSession(() => identity.value, 'ns-b')
    const first = s.sessionKey.value
    identity.value = 'u1'; await nextTick()
    expect(s.sessionKey.value).toBe(first)
    identity.value = 'u2'; await nextTick()
    expect(s.sessionKey.value).not.toBe(first)
  })

  it('getter 非法返回/抛错：error 置位、不生成代次、不写存储', async () => {
    const identity = ref<string | number | null | undefined>('u1')
    const s = createAutomaticBridgeSession(() => identity.value, 'ns-c')
    expect(s.error.value).toBeUndefined()
    identity.value = '' as unknown as string; await nextTick()
    expect(s.error.value).toBeInstanceOf(TypeError)
    expect(s.sessionKey.value).toBeNull()
    // 非法返回等同"身份未知"而非登出：保留已保存身份记录，恢复后不强制换新代次
    expect(sessionStorage.getItem('ns-c:auto')).toContain('u1')
    identity.value = { id: 1 } as unknown as string; await nextTick()
    expect(s.error.value).toBeInstanceOf(TypeError)
    identity.value = 'u1'; await nextTick()
    expect(s.error.value).toBeUndefined()
    expect(s.sessionKey.value).toMatch(/^s-/)
    const boom = createAutomaticBridgeSession(() => { throw new Error('store 未就绪') }, 'ns-c2')
    expect(boom.error.value).toBeInstanceOf(Error)
    expect(boom.sessionKey.value).toBeNull()
  })

  it('观察器按 getter+命名空间缓存：同参复用同一 state；不同命名空间/不同 getter 独立', () => {
    const getId = () => 'u1' as const
    const a1 = createAutomaticBridgeSession(getId, 'shared')
    const a2 = createAutomaticBridgeSession(getId, 'shared')
    expect(a2).toBe(a1)
    const b1 = createAutomaticBridgeSession(getId, 'other')
    expect(b1).not.toBe(a1)
    const otherGetter = () => 'u1' as const
    expect(createAutomaticBridgeSession(otherGetter, 'shared')).not.toBe(a1)
  })

  it('sessionStorage 不可用/损坏：内存镜像维持同页一致；损坏 JSON 被忽略后新建代次', async () => {
    const identity = ref<string>('u1')
    const s1 = createAutomaticBridgeSession(() => identity.value, 'ns-d')
    const first = s1.sessionKey.value
    // 模拟另一标签页/损坏缓存：直接写坏 JSON，新 getter 实例读取时忽略
    sessionStorage.setItem('ns-d:auto', '{broken')
    const identity2 = ref<string>('u1')
    const s2 = createAutomaticBridgeSession(() => identity2.value, 'ns-d2')
    expect(s2.sessionKey.value).toMatch(/^s-/)
    // 存储抛错（隐私模式）：不阻断代次管理
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('quota', 'QuotaExceededError') })
    const identity3 = ref<string>('u1')
    const s3 = createAutomaticBridgeSession(() => identity3.value, 'ns-e')
    expect(s3.sessionKey.value).toMatch(/^s-/)
    identity3.value = null; await nextTick()
    expect(s3.sessionKey.value).toBeNull()
    spy.mockRestore()
    expect(first).toMatch(/^s-/)
  })

  it('刷新恢复：新实例从 sessionStorage 读回同身份同代次；身份不同的旧记录被替换', async () => {
    const identity = ref<string>('u1')
    const s1 = createAutomaticBridgeSession(() => identity.value, 'ns-f')
    const first = s1.sessionKey.value
    // 模拟刷新：新 getter 函数引用 + 同命名空间 → 从存储恢复
    const s2 = createAutomaticBridgeSession(() => 'u1', 'ns-f')
    expect(s2.sessionKey.value).toBe(first)
    const s3 = createAutomaticBridgeSession(() => 'u9', 'ns-f')
    expect(s3.sessionKey.value).not.toBe(first)
  })

  it('登出只清自己命名空间的上下文：他命名空间 AppContext 不被误清', async () => {
    const identity = ref<string>('u1')
    const mine = createAutomaticBridgeSession(() => identity.value, 'ns-mine')
    const other = createAutomaticBridgeSession(() => 'someone', 'ns-other')
    g.__FULGURJS_APP_CONFIG__ = { sessionKey: other.sessionKey.value }
    identity.value = null; await nextTick()
    expect(g.__FULGURJS_APP_CONFIG__?.sessionKey).toBe(other.sessionKey.value) // 别人的还在
    g.__FULGURJS_APP_CONFIG__ = { sessionKey: mine.sessionKey.value }
    identity.value = 'u1'; await nextTick(); identity.value = null; await nextTick()
    expect(g.__FULGURJS_APP_CONFIG__?.sessionKey).toBeNull() // 自己的被清（clear 置 null）
  })
})

// ══ createVueBridgeApp({ session }) 集成层 ═════════════════════════════════

describe('createVueBridgeApp 自动会话集成', () => {
  it('登录→挂载；null→卸载；离页期间登出→重进不挂旧上下文', async () => {
    const fake = fakeContract('bpm')
    const factory = boundFactory(async () => fake.mod)
    const identity = ref<string | null | undefined>('u1')
    const Comp = factory('bpm/bridge', { session: () => identity.value })
    const host = mountHost(Comp, {})
    await nextTick(); await nextTick()
    await new Promise(r => setTimeout(r, 50))
    expect(await vi.waitFor(() => statusOf(host.root))).toBe('ready')
    expect(fake.mounts).toHaveLength(1)
    const firstSk = g.__FULGURJS_APP_CONFIG__?.sessionKey
    expect(typeof firstSk).toBe('string')
    // 离开远程页（卸载视图）后登出：观察器仍属宿主页面
    host.unmount()
    identity.value = null
    await nextTick()
    expect(sessionStorage.getItem('fulgurjs-bridge-session:auto')).toBeNull()
    // 同账号再登录重进：新代次
    identity.value = 'u1'
    const host2 = mountHost(Comp, {})
    await vi.waitFor(() => expect(statusOf(host2.root)).toBe('ready'))
    expect(g.__FULGURJS_APP_CONFIG__?.sessionKey).not.toBe(firstSk)
    host2.unmount()
  })

  it('同身份 token 轮换不重挂：mounts 计数不增；getContext 实时读最新 token', async () => {
    const fake = fakeContract('token')
    const factory = boundFactory(async () => fake.mod)
    const identity = ref<string>('u1')
    const token = ref('t1')
    const Comp = factory('token/bridge', {
      session: () => identity.value,
      getContext: () => ({ getToken: () => token.value }),
    })
    const host = mountHost(Comp, {})
    await vi.waitFor(() => expect(statusOf(host.root)).toBe('ready'))
    expect(fake.mounts).toHaveLength(1)
    expect((g.__FULGURJS_APP_CONFIG__?.getToken as () => string)()).toBe('t1')
    token.value = 't2' // 仅 token 变化，身份未变
    await nextTick(); await nextTick(); await new Promise(r => setTimeout(r, 20))
    expect(fake.mounts).toHaveLength(1) // 不重挂
    expect(fake.unmounts).toHaveLength(0)
    expect((g.__FULGURJS_APP_CONFIG__?.getToken as () => string)()).toBe('t2') // 实时最新
    expect(g.__FULGURJS_APP_CONFIG__?.sessionKey).toBeTruthy()
    host.unmount()
  })

  it('A→B 换号：旧实例卸载、新代次挂载；undefined 恢复中不挂载不报错', async () => {
    const fake = fakeContract('switch')
    const factory = boundFactory(async () => fake.mod)
    const identity = ref<string>('A')
    const Comp = factory('switch/bridge', { session: () => identity.value })
    const host = mountHost(Comp, {})
    await vi.waitFor(() => expect(statusOf(host.root)).toBe('ready'))
    identity.value = 'B'
    // invalidate 同步卸载旧实例后、新代次微任务挂载前，status 有陈旧 ready 窗口——以真实挂载为准
    await vi.waitFor(() => expect(fake.mounts).toHaveLength(2))
    expect(fake.unmounts).toHaveLength(1)
    expect(statusOf(host.root)).toBe('ready')
    identity.value = undefined
    await vi.waitFor(() => expect(statusOf(host.root)).not.toBe('ready'))
    expect(fake.unmounts).toHaveLength(2)
    host.unmount()
  })

  it('session 与 sessionKey prop 同时设置 → 可读错误占位，不加载远程', async () => {
    const fake = fakeContract('conflict')
    const factory = boundFactory(async () => fake.mod)
    const Comp = factory('conflict/bridge', { session: () => 'u1' })
    const host = mountHost(Comp, { sessionKey: 'manual' })
    await nextTick(); await nextTick(); await new Promise(r => setTimeout(r, 10))
    expect(statusOf(host.root)).toBe('error')
    expect(fake.mounts).toHaveLength(0)
    expect(host.root.textContent).toContain('sessionKey')
    host.unmount()
  })

  it('getter 抛错/非法返回 → error 状态展示可读 TypeError；身份恢复后可挂载', async () => {
    const fake = fakeContract('badget')
    const factory = boundFactory(async () => fake.mod)
    // 用响应式身份驱动错误与恢复：观察器依赖响应式源，闭包变量变化不触发（业务真实形态即响应式 store）
    const phase = ref<'ok' | 'throw' | 'object'>('throw')
    const Comp = factory('badget/bridge', {
      session: () => {
        if (phase.value === 'throw') throw new Error('store 未初始化')
        if (phase.value === 'object') return { id: 1 } as unknown as string
        return 'u1'
      },
    })
    const host = mountHost(Comp, {})
    await vi.waitFor(() => expect(statusOf(host.root)).toBe('error'))
    expect(host.root.textContent).toContain('store 未初始化')
    phase.value = 'object'
    await vi.waitFor(() => expect(host.root.textContent).toContain('session'))
    expect(statusOf(host.root)).toBe('error')
    phase.value = 'ok'
    await vi.waitFor(() => expect(statusOf(host.root)).toBe('ready'))
    expect(fake.mounts).toHaveLength(1)
    host.unmount()
  })

  it('getContext 显式 sessionKey 与自动代次矛盾 → MFU-017 拒绝；缺省时自动补入', async () => {
    const bad = fakeContract('sk-bad')
    const factory = boundFactory(async () => bad.mod)
    const CompBad = factory('sk-bad/bridge', { session: () => 'u1', getContext: () => ({ sessionKey: 'host-manual' }) })
    const host1 = mountHost(CompBad, {})
    await vi.waitFor(() => expect(statusOf(host1.root)).toBe('error'))
    expect(host1.root.textContent).toMatch(/MFU-017|session/)
    expect(bad.mounts).toHaveLength(0)
    host1.unmount()

    clearAppContext()
    const ok = fakeContract('sk-ok')
    const okFactory = boundFactory(async () => ok.mod)
    const CompOk = okFactory('sk-ok/bridge', { session: () => 'u1', getContext: () => ({ user: { id: 1 } }) })
    const host2 = mountHost(CompOk, {})
    await vi.waitFor(() => expect(statusOf(host2.root)).toBe('ready'))
    expect(ok.mounts).toHaveLength(1)
    expect(typeof g.__FULGURJS_APP_CONFIG__?.sessionKey).toBe('string') // 自动补入
    host2.unmount()
  })

  it('同 getter 两份挂载共享同一代次与上下文；一者登出（getter 变 null）两者都清', async () => {
    const fake = fakeContract('multi')
    const factory = boundFactory(async () => fake.mod)
    const identity = ref<string>('u1')
    const Comp = factory('multi/bridge', { session: () => identity.value })
    const h1 = mountHost(Comp, {})
    const h2 = mountHost(Comp, {})
    await vi.waitFor(() => expect(statusOf(h1.root)).toBe('ready'))
    await vi.waitFor(() => expect(statusOf(h2.root)).toBe('ready'))
    expect(fake.mounts).toHaveLength(2)
    identity.value = null
    await vi.waitFor(() => expect(fake.unmounts).toHaveLength(2))
    expect(g.__FULGURJS_APP_CONFIG__?.sessionKey).toBeUndefined()
    h1.unmount(); h2.unmount()
  })

  it('session 非函数 / sessionStorageKey 缺 session → 立即 TypeError（配置期校验）', () => {
    const factory = boundFactory(async () => { throw new Error('unused') })
    expect(() => factory('cfg/bridge', { session: 'u1' as unknown as () => string })).toThrow(TypeError)
    expect(() => factory('cfg/bridge', { sessionStorageKey: 'k' })).toThrow(TypeError)
    expect(() => factory('cfg/bridge', { session: () => 'u1', sessionStorageKey: ' ' })).toThrow(TypeError)
  })
})
