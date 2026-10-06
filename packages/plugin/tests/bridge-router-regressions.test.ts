// @vitest-environment node
/** URL 同步补修：真实 Router 的历史动作、取消、并发与错误语义。 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter, isNavigationFailure, NavigationFailureType } from 'vue-router'
import { createMemoryRouter, redirect } from 'react-router-dom'
import { RoutingChannel, normalizeBasePath, type BridgeLocation, type BridgeHostNavigation } from '../src/bridge-router-core'
import { createVueBridgeNavigation, connectVueBridgeRouter } from '../src/bridge-router-vue'
import { createReactBridgeNavigation, createReactBridgeRouter } from '../src/bridge-router-react'
const loc = (pathname: string): BridgeLocation => ({ pathname, search: '', hash: '' })
const cleanups: (() => void)[] = []
afterEach(() => { cleanups.splice(0).reverse().forEach((fn) => fn()) })
function host() {
  let current = loc('/approval/list')
  const listeners = new Set<(l: BridgeLocation) => void>()
  const requests: { pathname: string; action: string }[] = []
  const broadcast = (l: BridgeLocation) => { current = l; listeners.forEach((fn) => fn(l)) }
  const port: BridgeHostNavigation = {
    getLocation: () => current,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) },
    async navigate(target, action) { requests.push({ pathname: target.pathname, action }); broadcast(target); return { status: 'committed', location: current } },
    go: vi.fn(),
  }
  const channel = new RoutingChannel('test', '/approval', port, 'remote/bridge')
  cleanups.push(() => channel.dispose())
  return { port, channel, broadcast, requests }
}
const vue = () => createRouter({ history: createMemoryHistory(), routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }] })
function reactChild(channel: RoutingChannel) {
  const conn = createReactBridgeRouter(channel, [{ path: '*', element: null }])
  cleanups.push(conn.dispose)
  return (conn.element.props as { router: ReturnType<typeof createMemoryRouter> }).router
}

describe('URL 同步回归', () => {
  it.each(['vue', 'react'])('%s：push/replace 保留动作，go/back/forward 委托宿主', async (framework) => {
    const h = host()
    if (framework === 'vue') {
      const router = vue(); const conn = connectVueBridgeRouter(h.channel, router); cleanups.push(conn.dispose)
      await conn.ready
      await router.push('/one'); await router.push({ path: '/two', replace: true })
      router.back(); router.forward(); router.go(-2)
    } else {
      const router = reactChild(h.channel)
      await router.navigate('/one'); await router.navigate('/two', { replace: true })
      await router.navigate(-1); await router.navigate(1); await router.navigate(-2)
    }
    expect(h.requests).toEqual([{ pathname: '/approval/one', action: 'push' }, { pathname: '/approval/two', action: 'replace' }])
    expect(h.port.go).toHaveBeenNthCalledWith(1, -1)
    expect(h.port.go).toHaveBeenNthCalledWith(2, 1)
    expect(h.port.go).toHaveBeenNthCalledWith(3, -2)
  })

  it('U13：内核三次重叠请求全部串行落定，只有一个在飞请求', async () => {
    const h = host(); const native = h.port.navigate
    const gates: (() => void)[] = []
    let active = 0; let max = 0
    h.port.navigate = async (target, action) => {
      active++; max = Math.max(max, active)
      await new Promise<void>((r) => gates.push(r))
      const result = await native(target, action); active--; return result
    }
    const tasks = ['/one', '/two', '/three'].map((path) => h.channel.navigate(loc(path), 'push'))
    for (let i = 0; i < 3; i++) { await vi.waitFor(() => expect(gates).toHaveLength(i + 1)); gates[i]() }
    expect((await Promise.all(tasks)).map((r) => r.status)).toEqual(['committed', 'committed', 'committed'])
    expect(max).toBe(1); expect(h.channel.getLocation()).toEqual(loc('/three'))
  })

  it.each(['vue', 'react'])('U13 %s：快速连续本地导航没有丢失', async (framework) => {
    const h = host()
    let navigate: (path: string) => Promise<unknown>
    if (framework === 'vue') {
      const router = vue(); const conn = connectVueBridgeRouter(h.channel, router); cleanups.push(conn.dispose); await conn.ready
      navigate = (path) => router.push(path)
    } else { const router = reactChild(h.channel); navigate = (path) => router.navigate(path) }
    await Promise.all(['/one', '/two', '/three'].map(navigate))
    expect(h.requests.map((r) => r.pathname)).toEqual(['/approval/one', '/approval/two', '/approval/three'])
    expect(h.channel.getLocation()).toEqual(loc('/three'))
  })

  it('外部离页作废在飞及排队请求，旧通道不能把宿主拉回来', async () => {
    const h = host()
    let release!: () => void
    h.port.navigate = async (target, _action, context) => {
      await new Promise<void>((r) => { release = r })
      if (!context?.signal?.aborted) h.broadcast(target)
      return { status: 'committed', location: h.port.getLocation() }
    }
    const first = h.channel.navigate(loc('/one'), 'push')
    const next = h.channel.navigate(loc('/two'), 'push')
    await vi.waitFor(() => expect(release).toBeTypeOf('function'))
    h.broadcast(loc('/other')); release()
    expect((await first).status).toBe('cancelled'); expect((await next).status).toBe('cancelled')
    expect((await h.channel.navigate(loc('/three'), 'push')).status).toBe('cancelled')
    expect(h.port.getLocation()).toEqual(loc('/other'))
  })

  it('异常以 MFU-033 + cause 拒绝，后续队列仍能恢复', async () => {
    const h = host(); const native = h.port.navigate; const cause = new Error('loader failed')
    h.port.navigate = async () => { throw cause }
    await expect(h.channel.navigate(loc('/one'), 'push')).rejects.toMatchObject({ code: 'MFU-033', cause })
    h.port.navigate = native
    expect((await h.channel.navigate(loc('/two'), 'push')).status).toBe('committed')
  })

  it('Vue 初始守卫异常拒绝 ready；宿主守卫异常没有伪装取消', async () => {
    const h = host(); const router = vue(); const cause = new Error('guard failed')
    router.onError(() => {}); router.beforeEach(() => { throw cause })
    const conn = connectVueBridgeRouter(h.channel, router); cleanups.push(conn.dispose)
    await expect(conn.ready).rejects.toMatchObject({ code: 'MFU-033', cause })
    const hostRouter = vue(); hostRouter.onError(() => {}); hostRouter.beforeEach(() => { throw cause })
    await expect(createVueBridgeNavigation(hostRouter).navigate(loc('/two'), 'push')).rejects.toBe(cause)
  })

  it('Vue 取消返回真实 NavigationFailure，后续 replace 可恢复', async () => {
    const h = host(); const router = vue(); const conn = connectVueBridgeRouter(h.channel, router); cleanups.push(conn.dispose); await conn.ready
    const native = h.port.navigate
    h.port.navigate = async () => ({ status: 'cancelled', location: h.port.getLocation() })
    expect(isNavigationFailure(await router.push('/denied'))).toBe(true)
    expect(router.currentRoute.value.fullPath).toBe('/list')
    h.port.navigate = native; await router.replace('/allowed')
    expect(h.channel.getLocation()).toEqual(loc('/allowed'))
  })

  it('Vue history base 不会二次剥离逻辑 pathname', async () => {
    const router = createRouter({ history: createMemoryHistory('/app/'), routes: [{ path: '/:pathMatch(.*)*', component: {} }] })
    await router.push('/app/detail')
    expect(createVueBridgeNavigation(router, { routerBase: '/app' }).getLocation()).toEqual(loc('/app/detail'))
  })

  it.each(['reset', 'proceed'])('React 真实 blocker %s：等待真实裁决，无 canNavigate 预判', async (decision) => {
    const router = createMemoryRouter([{ path: '*', element: null }], { initialEntries: ['/approval/list'] }); cleanups.push(() => router.dispose())
    router.getBlocker('guard', () => true)
    let settled = false
    const task = createReactBridgeNavigation(router).navigate(loc('/approval/two'), 'push').then((r) => { settled = true; return r })
    await vi.waitFor(() => expect(router.state.blockers.get('guard')?.state).toBe('blocked'))
    expect(settled).toBe(false); expect(router.state.location.pathname).toBe('/approval/list')
    const blocker = router.state.blockers.get('guard')!
    if (blocker.state === 'blocked') { if (decision === 'reset') blocker.reset(); else blocker.proceed() }
    expect((await task).status).toBe(decision === 'reset' ? 'cancelled' : 'committed')
    expect(router.state.location.pathname).toBe(decision === 'reset' ? '/approval/list' : '/approval/two')
  })

  it('React blocker 中卸载会取消并清掉 blocker，无永久挂起', async () => {
    const router = createMemoryRouter([{ path: '*', element: null }], { initialEntries: ['/approval/list'] }); cleanups.push(() => router.dispose())
    router.getBlocker('guard', () => true)
    const abort = new AbortController()
    const task = createReactBridgeNavigation(router).navigate(loc('/approval/two'), 'push', { signal: abort.signal })
    await vi.waitFor(() => expect(router.state.blockers.get('guard')?.state).toBe('blocked'))
    abort.abort()
    expect((await task).status).toBe('cancelled'); expect(router.state.blockers.get('guard')?.state).toBe('unblocked')
  })

  it('React basename 按段剥离；原生 navigate 自动附加 base', async () => {
    const router = createMemoryRouter([{ path: '*', element: null }], { basename: '/app', initialEntries: ['/app/approval/list'] }); cleanups.push(() => router.dispose())
    const port = createReactBridgeNavigation(router, { basename: '/app' })
    expect(port.getLocation()).toEqual(loc('/approval/list'))
    await port.navigate(loc('/approval/two'), 'replace')
    expect(router.state.location.pathname).toBe('/app/approval/two')
  })

  it('React 初始 loader 重定向 replace 同步宿主', async () => {
    const h = host()
    const conn = createReactBridgeRouter(h.channel, [{ path: '/list', loader: () => redirect('/detail/1') }, { path: '*', element: null }]); cleanups.push(conn.dispose)
    await vi.waitFor(() => expect(h.requests).toEqual([{ pathname: '/approval/detail/1', action: 'replace' }]))
  })

  it('拒绝等价根前缀及编码逃逸目标，不破坏合法编码 query', async () => {
    for (const base of ['//', '/a//b', '/a/..', '/a/%2e%2e', '/a\\b']) expect(() => normalizeBasePath(base, 'remote')).toThrow(/MFU-030/)
    const h = host()
    for (const path of ['/%2e%2e/x', '/%2Fother', '/a\\b', '/a?outside', '//other']) await expect(h.channel.navigate(loc(path), 'push')).rejects.toThrow(/MFU-032/)
    await h.channel.navigate({ pathname: '/ok', search: '?q=%2F&x=1&x=2', hash: '#f' }, 'push')
    expect(h.channel.getLocation().search).toBe('?q=%2F&x=1&x=2')
  })

  it('Vue ready 等待期间宿主换路径，最新位置胜出，不回写初始路径', async () => {
    const h = host(); const router = vue()
    let release!: () => void
    const remove = router.beforeEach(() => new Promise<void>((r) => { release = r; remove() }))
    const conn = connectVueBridgeRouter(h.channel, router); cleanups.push(conn.dispose)
    await vi.waitFor(() => expect(release).toBeTypeOf('function'))
    h.broadcast(loc('/approval/detail/9')); release()
    await conn.ready
    await vi.waitFor(() => expect(router.currentRoute.value.fullPath).toBe('/detail/9'))
    expect(h.requests).toEqual([])
  })

  it.each(['vue', 'react'])('%s：mount signal 作废后不再写宿主', async (framework) => {
    const h = host(); const abort = new AbortController()
    if (framework === 'vue') {
      const router = vue(); const conn = connectVueBridgeRouter(h.channel, router, { signal: abort.signal }); cleanups.push(conn.dispose)
      await conn.ready; abort.abort(); await router.push('/late')
    } else {
      const conn = createReactBridgeRouter(h.channel, [{ path: '*', element: null }], { signal: abort.signal }); cleanups.push(conn.dispose)
      const router = (conn.element.props as { router: ReturnType<typeof createMemoryRouter> }).router
      abort.abort(); await router.navigate('/late')
    }
    expect(h.requests).toEqual([])
  })


  it('React 异步 loader 中作废：迟到结果不能提交原目标', async () => {
    let release!: () => void
    const router = createMemoryRouter([
      { path: '/approval/list', element: null },
      { path: '/approval/detail', loader: () => new Promise<void>((r) => { release = r }), element: null },
    ], { initialEntries: ['/approval/list'] }); cleanups.push(() => router.dispose())
    const abort = new AbortController()
    const task = createReactBridgeNavigation(router).navigate(loc('/approval/detail'), 'push', { signal: abort.signal })
    await vi.waitFor(() => expect(release).toBeTypeOf('function'))
    abort.abort(); expect((await task).status).toBe('cancelled'); release()
    await vi.waitFor(() => expect(router.state.navigation.state).toBe('idle'))
    expect(router.state.location.pathname).toBe('/approval/list')
  })


  it('React 请求入队后立即作废，原生 navigate 尚未开始时禁止执行', async () => {
    const router = createMemoryRouter([{ path: '*', element: null }], { initialEntries: ['/approval/list'] }); cleanups.push(() => router.dispose())
    const abort = new AbortController()
    const task = createReactBridgeNavigation(router).navigate(loc('/approval/two'), 'push', { signal: abort.signal })
    abort.abort()
    expect((await task).status).toBe('cancelled')
    await new Promise<void>((resolve) => setImmediate(resolve))
    expect(router.state.location.pathname).toBe('/approval/list')
  })

})

// ── MFU-033 降噪（5.5.0）：cancelled 分类 + 连续同文折叠 ──────────────────────────

describe('URL 同步诊断降噪（MFU-033）', () => {
  it('cancelled（子应用新导航取代广播应用）不报 MFU-033；aborted（守卫真拒绝）报一次', async () => {
    const h = host()
    const router = vue()
    // 造一个真实 cancelled failure（并发导航取代）
    const scratch = vue()
    const p1 = scratch.push('/x'); const p2 = scratch.push('/y')
    const cancelledFailure = await p1
    await p2
    expect(isNavigationFailure(cancelledFailure, NavigationFailureType.cancelled)).toBe(true)
    // apply 走的 replace（connect 时捕获的原始方法）第一次返回 cancelled
    const originalReplace = router.replace.bind(router)
    let stubCalls = 0
    router.replace = (async (...args: Parameters<typeof originalReplace>) => {
      if (stubCalls++ === 0) return cancelledFailure
      return originalReplace(...args)
    }) as typeof router.replace
    const conn = connectVueBridgeRouter(h.channel, router)
    cleanups.push(conn.dispose)
    await conn.ready
    const errors: string[] = []
    const spy = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { errors.push(a.map(String).join(' ')) })
    h.broadcast(loc('/approval/other')) // replace → cancelled：正常取消，不报错
    await Promise.resolve(); await new Promise((r) => setTimeout(r, 20))
    expect(errors.join('\n')).not.toContain('MFU-033')
    spy.mockRestore()
  })

  it('守卫真拒绝（aborted + 位置失步）报 MFU-033；同一错误连续两次只保留首条', async () => {
    const h = host()
    const router = vue()
    const conn = connectVueBridgeRouter(h.channel, router)
    cleanups.push(conn.dispose)
    await conn.ready
    router.beforeEach(() => false) // 守卫在 ready 后挂：只拦截后续广播应用，不破坏初始导航
    const errors: string[] = []
    const spy = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { errors.push(a.map(String).join(' ')) })
    h.broadcast(loc('/approval/blocked-1'))
    await new Promise((r) => setTimeout(r, 20))
    h.broadcast(loc('/approval/blocked-1')) // 同一位置再次广播 → 同文错误被折叠
    await new Promise((r) => setTimeout(r, 20))
    h.broadcast(loc('/approval/blocked-2')) // 不同失败事件：必须保留
    await new Promise((r) => setTimeout(r, 20))
    spy.mockRestore()
    const mfu033 = errors.filter((e) => e.includes('MFU-033'))
    expect(mfu033.length).toBe(2) // blocked-1 一条（折叠同文）+ blocked-2 一条
    expect(mfu033[0]).toContain('remote/bridge')
  })
})

// ── URL 重复前缀守卫（MFU-032 扩展）：子应用逻辑路径不得已包含 basePath ───────────────
// 缺陷史：业务子应用把宿主整段地址（含 basePath）当成自身路径 push 时，宿主 URL 会
// 叠加成 /flowable/flowable/...，且此后子/宿两侧自洽地保持错误前缀。守卫在第一次
// history 写入之前拒绝（错误目标 + 修法入诊断），宿主历史零污染。

describe('URL 重复前缀守卫（MFU-032）', () => {
  it.each(['vue', 'react'])('%s：携带前缀的子应用 push 在第一次宿主写入前被拒绝，子应用回滚且通道可继续', async (framework) => {
    const h = host()
    // 首写入证据：宿主导航端口记录每次写入的目标与真实调用栈
    const writes: { pathname: string; stack: string }[] = []
    const native = h.port.navigate
    h.port.navigate = async (target, action, context) => {
      writes.push({ pathname: target.pathname, stack: new Error('first-write').stack ?? '' })
      return native(target, action, context)
    }
    const errors: string[] = []
    const spy = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { errors.push(a.map(String).join(' ')) })
    if (framework === 'vue') {
      const router = vue(); const conn = connectVueBridgeRouter(h.channel, router); cleanups.push(conn.dispose); await conn.ready
      await expect(router.push('/approval/list')).rejects.toThrow(/MFU-032/)
      expect(router.currentRoute.value.fullPath).toBe('/list')
      await router.push('/two')
      expect(router.currentRoute.value.fullPath).toBe('/two')
    } else {
      const router = reactChild(h.channel)
      await expect(router.navigate('/approval/list')).rejects.toThrow(/MFU-032/)
      expect(router.state.location.pathname).toBe('/list')
      await router.navigate('/two')
      expect(router.state.location.pathname).toBe('/two')
    }
    spy.mockRestore()
    // 首次错误写入根本没有发生：宿主历史零污染（守卫前这里会写入 /approval/approval/list）
    expect(writes.map((w) => w.pathname)).toEqual(['/approval/two'])
    expect(writes[0]?.stack).toContain('first-write')
    expect(errors.join('\n')).toContain('MFU-032')
  })

  it('内核：精确 basePath 与带前缀子路径都被拒绝并给出可执行修法', async () => {
    const h = host()
    await expect(h.channel.navigate(loc('/approval'), 'push')).rejects.toThrow(/router\.push\("\/"\)/)
    await expect(h.channel.navigate(loc('/approval/list'), 'push')).rejects.toThrow(/router\.push\("\/list"\)/)
    await expect(h.channel.navigate(loc('/approval/list'), 'push')).rejects.toThrow(/已包含本实例前缀 "\/approval"/)
    expect(h.requests).toEqual([])
  })

  it('宿主地址栏粘贴的双前缀 URL 仍以宿主为准广播（不回弹、不循环）', async () => {
    const h = host()
    const router = vue(); const conn = connectVueBridgeRouter(h.channel, router); cleanups.push(conn.dispose); await conn.ready
    h.broadcast(loc('/approval/approval/list'))
    await vi.waitFor(() => expect(router.currentRoute.value.fullPath).toBe('/approval/list'))
    expect(h.requests).toEqual([])
  })
})

// ── 终验 E：广播应用的 duplicated 失败不再误报 MFU-033 ─────────────────────────────
// 缺陷：宿主广播字符串与子应用 fullPath 存在合法编码差异（中文 query：宿主持
// %E6%BC%94%E7%A4%BA、vue-router fullPath 保持演示），文本不等触发冗余 replace →
// vue-router 返回 duplicated(16)（路由级判定“已在目标位置”）→ apply() 只豁免
// cancelled(8)，把 duplicated 误报成“守卫拒绝”（MFU-033 ×2，无守卫子应用中枪）。

describe('广播应用 duplicated 失败不误报 MFU-033（终验 E）', () => {
  /** 真实历史语义的宿主端口（共享 host() 的 go 是 vi.fn 空实现，不驱动历史） */
  function historyHost(initial: BridgeLocation) {
    let index = 0
    const entries: BridgeLocation[] = [{ ...initial }]
    const listeners = new Set<(l: BridgeLocation) => void>()
    const port: BridgeHostNavigation = {
      getLocation: () => entries[index],
      subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) },
      async navigate(target, action) {
        if (action === 'push') { entries.splice(index + 1, entries.length - index - 1, { ...target }); index++ }
        else entries[index] = { ...target }
        listeners.forEach((fn) => fn(entries[index]))
        return { status: 'committed', location: entries[index] }
      },
      go(delta) {
        const next = index + delta
        if (next < 0 || next >= entries.length) return
        index = next
        listeners.forEach((fn) => fn(entries[index]))
      },
    }
    const channel = new RoutingChannel('test-e', '/approval', port, 'remote/bridge')
    cleanups.push(() => channel.dispose())
    return { port, channel }
  }

  it('vue：push(中文 query)→replace→go(-1)/go(1) 全程零误报，位置两侧一致', async () => {
    const h = historyHost(loc('/approval/orders'))
    const router = vue()
    router.beforeEach(() => {}) // 无拒绝守卫；占位证明报错与守卫无关
    const conn = connectVueBridgeRouter(h.channel, router)
    cleanups.push(conn.dispose)
    await conn.ready
    const errors: string[] = []
    const spy = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { errors.push(a.map(String).join(' ')) })
    try {
      await router.push('/orders?q=演示&page=2') // 修复前：push Promise 本身拒绝 MFU-033
      expect(router.currentRoute.value.fullPath).toBe('/orders?q=演示&page=2')
      expect(h.port.getLocation().search).toBe('?q=%E6%BC%94%E7%A4%BA&page=2')
      // POP 回退再前进：前进落点为宿主侧编码形态条目，广播目标与 child fullPath（解码显示）
      // 文本不同——修复前 apply() 把冗余 replace 的 duplicated(16) 误报成守卫拒绝（MFU-033），
      // 且子应用停在 /orders 不随前进同步。
      h.port.go(-1)
      await vi.waitFor(() => expect(router.currentRoute.value.fullPath).toBe('/orders'))
      h.port.go(1)
      // 前进落点为不同路由 → 真实 replace，子应用采纳宿主侧文本形态（编码）——两处同一路由
      await vi.waitFor(() => expect(router.currentRoute.value.fullPath).toBe('/orders?q=%E6%BC%94%E7%A4%BA&page=2'))
      await router.replace('/settings')
      expect(router.currentRoute.value.fullPath).toBe('/settings')
    } finally {
      spy.mockRestore()
    }
    expect(errors.join('\n')).not.toContain('MFU-033')
  })

  it('真实守卫拒绝（aborted≠duplicated）仍报 MFU-033，不被本次修复吞掉', async () => {
    const h = host()
    const router = vue()
    const conn = connectVueBridgeRouter(h.channel, router)
    cleanups.push(conn.dispose)
    await conn.ready
    router.beforeEach((to) => String((to as { fullPath?: string }).fullPath ?? '').includes('denied') ? false : undefined)
    const errors: string[] = []
    const spy = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { errors.push(a.map(String).join(' ')) })
    h.broadcast(loc('/approval/denied/x'))
    await new Promise((r) => setTimeout(r, 40))
    spy.mockRestore()
    expect(errors.join('\n')).toContain('MFU-033')
  })
})
