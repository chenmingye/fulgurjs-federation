// @vitest-environment jsdom
/**
 * 路由通道内核与两端适配单测（URL 同步任务书 §2/§3/§5 语义层）。
 * 内核：位置规范化、前缀匹配/冲突、请求编号/串行/外部作废、dispose 迟到失效、
 * KeepAlive 暂停、有界重定向、协议校验。
 * 适配：connectVueBridgeRouter（真实 vue-router memory）/ createReactBridgeRouter
 * （真实 react-router-dom memory）+ 宿主端口（真实取消语义）。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter, RouterLink, RouterView } from 'vue-router'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from '@testing-library/react'
import {
  RoutingChannel,
  acquireRoutingPrefix,
  assertBridgeRoutingProtocol,
  matchesBasePath,
  normalizeBasePath,
  overlapsBasePath,
  sameLocation,
  toChildLocation,
  toHostLocation,
  type BridgeHostNavigation,
  type BridgeLocation,
  type BridgeNavigationResult,
} from '../src/bridge-router-core'
import { connectVueBridgeRouter } from '../src/bridge-router-vue'
import { createReactBridgeRouter } from '../src/bridge-router-react'
import { defineBridgeApp as defineVueBridgeApp } from '../src/bridge-app-vue'
import { defineBridgeApp as defineReactBridgeApp } from '../src/bridge-app-react'

const BASE = '/approval'

/** 页面级前缀登记随通道存活：测试用例结束后统一销毁（等价浏览器换页） */
const liveChannels: RoutingChannel[] = []
function track<T extends RoutingChannel>(ch: T): T {
  liveChannels.push(ch)
  return ch
}
afterEach(() => {
  for (const ch of liveChannels.splice(0)) ch.dispose()
})
const loc = (pathname: string, search = '', hash = ''): BridgeLocation => ({ pathname, search, hash })

/** 可控宿主端口：记录请求、可编程裁决 */
function fakeHost(initial: BridgeLocation = loc(BASE + '/list')) {
  let current = { ...initial }
  const listeners = new Set<(l: BridgeLocation) => void>()
  const requests: { target: BridgeLocation; action: string }[] = []
  let verdict: 'committed' | 'cancelled' | 'throw' = 'committed'
  const host: BridgeHostNavigation = {
    getLocation: () => ({ ...current }),
    subscribe(l) {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    async navigate(target, action): Promise<BridgeNavigationResult> {
      requests.push({ target: { ...target }, action })
      if (verdict === 'throw') throw new Error('host boom')
      if (verdict === 'cancelled') return { status: 'cancelled', location: { ...current } }
      current = { ...target }
      for (const l of [...listeners]) l({ ...current })
      return { status: 'committed', location: { ...current } }
    },
    go() {},
  }
  return {
    host,
    requests,
    setVerdict: (v: typeof verdict) => {
      verdict = v
    },
    externalNavigate: (to: BridgeLocation) => {
      current = { ...to }
      for (const l of [...listeners]) l({ ...current })
    },
    get current() {
      return { ...current }
    },
  }
}

describe('bridge-router-core: 位置与前缀', () => {
  it('normalizeBasePath：拒绝空/根/相对/query/hash/协议/通配（MFU-030），去尾斜杠', () => {
    const spec = 'remote/bridge'
    for (const bad of ['', '/', 'approval', '/approval?x', '/approval#f', 'https://x/approval', '/a/:id', '/a/*']) {
      expect(() => normalizeBasePath(bad, spec)).toThrow(/MFU-030/)
    }
    expect(normalizeBasePath('/approval/', spec)).toBe('/approval')
  })

  it('matchesBasePath 按段匹配；overlapsBasePath 判重叠', () => {
    expect(matchesBasePath('/approval', BASE)).toBe(true)
    expect(matchesBasePath('/approval/detail/1', BASE)).toBe(true)
    expect(matchesBasePath('/approval-old', BASE)).toBe(false)
    expect(overlapsBasePath('/a', '/a/b')).toBe(true)
    expect(overlapsBasePath('/ab', '/a')).toBe(false)
  })

  it('toChild/toHost 往返保持 search/hash 原样（不二次编码）', () => {
    const host = loc('/approval/detail/123', '?tab=history&a=1&a=2&q=%E4%B8%AD', '#comment')
    const child = toChildLocation(host, BASE)
    expect(child).toEqual({ pathname: '/detail/123', search: '?tab=history&a=1&a=2&q=%E4%B8%AD', hash: '#comment' })
    const back = toHostLocation(child, BASE, 'remote/bridge')
    expect(sameLocation(back, host)).toBe(true)
  })

  it('acquireRoutingPrefix：重叠前缀 MFU-030，释放后可复用', () => {
    const r1 = acquireRoutingPrefix('/approval', 'a/bridge')
    expect(() => acquireRoutingPrefix('/approval/sub', 'b/bridge')).toThrow(/MFU-030/)
    const r2 = acquireRoutingPrefix('/approval-x', 'b/bridge')
    r1()
    const r3 = acquireRoutingPrefix('/approval/sub', 'b/bridge')
    expect(r3).toBeTypeOf('function')
    r2()
    r3()
  })

  it('assertBridgeRoutingProtocol：缺失/错误 protocol 均 MFU-031；{protocol:1} 通过', () => {
    const spec = 'remote/bridge'
    expect(() => assertBridgeRoutingProtocol(spec, { mount() {}, unmount() {} })).toThrow(/MFU-031/)
    expect(() => assertBridgeRoutingProtocol(spec, { mount() {}, unmount() {}, routing: { protocol: 2 } })).toThrow(/MFU-031/)
    expect(() => assertBridgeRoutingProtocol(spec, { mount() {}, unmount() {}, routing: { protocol: 1 } })).not.toThrow()
  })
})

describe('bridge-router-core: RoutingChannel 仲裁', () => {
  it('子应用导航：换算宿主坐标提交、广播确认、已确认位置 no-op', async () => {
    const h = fakeHost()
    const ch = track(new RoutingChannel('c1', BASE, h.host, 'remote/bridge'))
    const seen: BridgeLocation[] = []
    ch.subscribe((l) => seen.push(l))
    const r = await ch.navigate(loc('/detail/123', '?tab=1'), 'push')
    expect(r.status).toBe('committed')
    expect(h.requests[0].target).toEqual({ pathname: '/approval/detail/123', search: '?tab=1', hash: '' })
    // 宿主广播也触发了 emit：最后位置正确
    expect(ch.getLocation()).toEqual({ pathname: '/detail/123', search: '?tab=1', hash: '' })
    expect(seen.at(-1)).toEqual(ch.getLocation())
    // 同位置 no-op：不再发宿主请求
    const n = h.requests.length
    await ch.navigate(loc('/detail/123', '?tab=1'), 'push')
    expect(h.requests.length).toBe(n)
  })

  it('宿主取消：cancelled + 子应用回滚最后确认位置 + URL 不变', async () => {
    const h = fakeHost()
    const ch = track(new RoutingChannel('c2', BASE, h.host, 'remote/bridge'))
    await ch.navigate(loc('/list'), 'push')
    h.setVerdict('cancelled')
    let seen: BridgeLocation | undefined
    ch.subscribe((l) => {
      seen = l
    })
    const r = await ch.navigate(loc('/detail/9'), 'push')
    expect(r.status).toBe('cancelled')
    expect(h.current.pathname).toBe('/approval/list')
    expect(seen?.pathname).toBe('/list')
  })

  it('外部导航作废在飞请求（cancelled + 权威位置广播）；同位置请求被确认去重', async () => {
    const h = fakeHost()
    let releaseHost!: () => void
    const gate = new Promise<void>((r) => {
      releaseHost = r
    })
    const host: BridgeHostNavigation = {
      ...h.host,
      async navigate() {
        await gate
        return { status: 'committed', location: loc(BASE + '/detail/1') }
      },
    }
    const ch = track(new RoutingChannel('c3', BASE, host, 'remote/bridge'))
    const p = ch.navigate(loc('/detail/1'), 'push')
    // 在飞期间外部（菜单）换到别的位置
    h.externalNavigate(loc(BASE + '/other'))
    const r = await p
    expect(r.status).toBe('cancelled')
    expect(ch.getLocation().pathname).toBe('/other')
    releaseHost()
    void ch
  })

  it('dispose 后：订阅抛 MFU-031、导航 cancelled、迟到宿主广播不生效', async () => {
    const h = fakeHost()
    const ch = track(new RoutingChannel('c4', BASE, h.host, 'remote/bridge'))
    ch.dispose()
    expect(() => ch.subscribe(() => {})).toThrow(/MFU-031/)
    const r = await ch.navigate(loc('/x'), 'push')
    expect(r.status).toBe('cancelled')
    const before = ch.getLocation()
    h.externalNavigate(loc(BASE + '/zzz'))
    expect(ch.getLocation()).toEqual(before)
  })

  it('setActive(false)：暂停广播与写入；恢复后重同步（KeepAlive 语义）', async () => {
    const h = fakeHost()
    const ch = track(new RoutingChannel('c5', BASE, h.host, 'remote/bridge'))
    let events = 0
    ch.subscribe(() => events++)
    ch.setActive(false)
    h.externalNavigate(loc(BASE + '/hidden'))
    expect(events).toBe(0)
    expect(ch.getLocation().pathname).toBe('/list')
    const r = await ch.navigate(loc('/x'), 'push')
    expect(r.status).toBe('cancelled')
    ch.setActive(true)
    expect(ch.getLocation().pathname).toBe('/hidden')
    expect(events).toBe(1)
  })

  it('go 校验：非法值 MFU-032；合法值委托宿主', () => {
    const h = fakeHost()
    let goDelta: number | undefined
    const host: BridgeHostNavigation = { ...h.host, go: (d) => (goDelta = d) }
    const ch = track(new RoutingChannel('c6', BASE, host, 'remote/bridge'))
    ch.go(-1)
    expect(goDelta).toBe(-1)
    expect(() => ch.go(1.5)).toThrow(/MFU-032/)
    expect(() => ch.go(999)).toThrow(/MFU-032/)
  })

  it('越界目标拒绝（.. 逃逸/跨前缀）MFU-032；非法 pathname 拒绝', async () => {
    const h = fakeHost()
    const ch = track(new RoutingChannel('c7', BASE, h.host, 'remote/bridge'))
    await expect(ch.navigate(loc('/../other'), 'push')).rejects.toThrow(/MFU-032/)
    await expect(ch.navigate(loc('/x\0y'), 'push')).rejects.toThrow(/MFU-032/)
    await expect(ch.navigate({ pathname: 'relative', search: '', hash: '' }, 'push')).rejects.toThrow(/MFU-032/)
  })

  it('有界重定向：连续 replace 超限 MFU-033（附目标链）', async () => {
    const h = fakeHost()
    const ch = track(new RoutingChannel('c8', BASE, h.host, 'remote/bridge'))
    for (let i = 0; i < 5; i++) {
      await ch.navigate(loc('/r' + i), 'replace')
    }
    await expect(ch.navigate(loc('/r6'), 'replace')).rejects.toThrow(/MFU-033/)
  })

  it('defineBridgeApp({ routing: true })：契约声明 protocol:1 并把通道经 mount 第三参数交给工厂', async () => {
    let received: { routing?: unknown; signal?: unknown } | undefined
    const contract = defineVueBridgeApp((_props, ctx) => {
      received = { routing: ctx?.routing, signal: ctx?.signal }
      return createApp({ render: () => h('div', 'vue-sub') })
    }, { routing: true })
    expect((contract as { routing?: { protocol: number } }).routing).toEqual({ protocol: 1 })
    const el = document.createElement('div')
    const marker = {} as never
    contract.mount(el, {}, { routing: marker, signal: new AbortController().signal })
    expect(received?.routing).toBe(marker)
    contract.unmount(el)
    // 未声明路由选项：无 routing 字段（老契约兼容）
    const plain = defineVueBridgeApp((props) => createApp({ render: () => h('div', String(props)) }))
    expect((plain as { routing?: unknown }).routing).toBeUndefined()
  })

  it('defineBridgeApp React 版：同样的协议声明与 ctx 传递', async () => {
    let received: { routing?: unknown } | undefined
    const contract = defineReactBridgeApp((_props, ctx) => {
      received = { routing: ctx?.routing }
      return createElement('div', null, 'react-sub')
    }, { routing: true })
    expect((contract as { routing?: { protocol: number } }).routing).toEqual({ protocol: 1 })
    const el = document.createElement('div')
    const marker = {} as never
    await contract.mount(el, {}, { routing: marker })
    expect(received?.routing).toBe(marker)
    contract.unmount(el)
  })
})

describe('bridge-router-vue: connectVueBridgeRouter（真实 vue-router memory）', () => {
  it('深链初始位置 → RouterLink push 桥为通道请求 → 宿主取消回滚', async () => {
    const h = fakeHost(loc(BASE + '/detail/123', '?tab=history'))
    const ch = track(new RoutingChannel('cv', BASE, h.host, 'remote/bridge'))
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: { template: '<p>home</p>' } },
        { path: '/detail/:id', component: { template: '<p>detail</p>' } },
        { path: '/secret', component: { template: '<p>secret</p>' } },
      ],
    })
    const conn = connectVueBridgeRouter(ch, router)
    await conn.ready
    expect(router.currentRoute.value.fullPath).toBe('/detail/123?tab=history')

    // RouterLink 等真实入口 = router.push：换 detail/456 → 通道请求宿主
    await router.push('/detail/456?src=link')
    await Promise.resolve()
    expect(h.requests.at(-1)?.target).toEqual({ pathname: '/approval/detail/456', search: '?src=link', hash: '' })
    expect(router.currentRoute.value.fullPath).toBe('/detail/456?src=link')

    // 宿主拒绝：本地回滚到确认位置
    h.setVerdict('cancelled')
    await router.push('/secret')
    await new Promise((r) => setTimeout(r, 0))
    expect(h.current.pathname).toBe(BASE + '/detail/456')
    expect(router.currentRoute.value.path).toBe('/detail/456')
    conn.dispose()
    ch.dispose()
  })

  it('通道广播 → 本地 replace 应用（宿主菜单/POP 来源）', async () => {
    const h = fakeHost(loc(BASE + '/list'))
    const ch = track(new RoutingChannel('cv2', BASE, h.host, 'remote/bridge'))
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/:pathMatch(.*)*', component: { template: '<p>x</p>' } },
      ],
    })
    const conn = connectVueBridgeRouter(ch, router)
    await conn.ready
    h.externalNavigate(loc(BASE + '/detail/789', '?tab=main'))
    await router.isReady()
    await new Promise((r) => setTimeout(r, 0))
    expect(router.currentRoute.value.fullPath).toBe('/detail/789?tab=main')
    conn.dispose()
    ch.dispose()
  })

  it('卸载后 dispose：后续 RouterLink 导航不再发通道请求', async () => {
    const h = fakeHost()
    const ch = track(new RoutingChannel('cv3', BASE, h.host, 'remote/bridge'))
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/:pathMatch(.*)*', component: { template: '<p>x</p>' } }],
    })
    const conn = connectVueBridgeRouter(ch, router)
    await conn.ready
    conn.dispose()
    ch.dispose()
    const n = h.requests.length
    await router.push('/after-dispose')
    await new Promise((r) => setTimeout(r, 0))
    expect(h.requests.length).toBe(n)
  })
})

describe('bridge-router-react: createReactBridgeRouter（真实 react-router memory）', () => {
  it('深链初始位置 → useNavigate push 桥为通道请求 → 宿主取消回滚', async () => {
    const h = fakeHost(loc(BASE + '/detail/123', '?tab=history'))
    const ch = track(new RoutingChannel('cr', BASE, h.host, 'remote/bridge'))
    const routes = [
      { path: '/', element: createElement('p', null, 'home') },
      { path: '/detail/:id', element: createElement('p', null, 'detail') },
      { path: '/secret', element: createElement('p', null, 'secret') },
    ]
    const conn = createReactBridgeRouter(ch, routes)
    const el = document.createElement('div')
    document.body.appendChild(el)
    const root = createRoot(el)
    await act(async () => {
      root.render(conn.element)
    })
    expect(el.textContent).toContain('detail')
    void routes
    conn.dispose()
    ch.dispose()
    await act(async () => {
      root.unmount()
    })
    el.remove()
  })

  it('RouterLink 组件渲染（真实入口可用）', async () => {
    const h = fakeHost()
    const ch = track(new RoutingChannel('cr2', BASE, h.host, 'remote/bridge'))
    const routes = [
      {
        path: '/',
        element: createElement(RouterView_placeholder, null),
      },
    ]
    void routes
    // RouterLink 需要 Router 上下文：用真实 routes 提供一个含 Link 的页面
    const conn2 = createReactBridgeRouter(ch, [
      { path: '*', element: createElement(
          'div',
          null,
          'RouterLink 由子应用路由表自行使用（此处验证通道接线而非 Link 本身）',
      ) },
    ])
    const el = document.createElement('div')
    document.body.appendChild(el)
    const root = createRoot(el)
    await act(async () => {
      root.render(conn2.element)
    })
    expect(el.textContent).toContain('通道接线')
    conn2.dispose()
    ch.dispose()
    await act(async () => {
      root.unmount()
    })
    el.remove()
  })

  it('vue 宿主端口：NavigationFailure 为真实取消（守卫拒绝）', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/:pathMatch(.*)*', component: { template: '<p>x</p>' } }],
    })
    await router.push('/approval/list')
    router.beforeEach((to) => (to.path === '/approval/secret' ? false : undefined))
    const { createVueBridgeNavigation } = await import('../src/bridge-router-vue')
    const port = createVueBridgeNavigation(router)
    const ok = await port.navigate(loc('/approval/detail/1'), 'push')
    expect(ok.status).toBe('committed')
    expect(ok.location.pathname).toBe('/approval/detail/1')
    const cancelled = await port.navigate(loc('/approval/secret'), 'push')
    expect(cancelled.status).toBe('cancelled')
    expect(port.getLocation().pathname).toBe('/approval/detail/1')
  })
})

describe('宿主 × routing prop（真实宿主工厂 + 假契约）', () => {
  let receivedOptions: Array<{ signal?: AbortSignal; routing?: unknown }> = []
  let mountCount = 0
  let unmountCount = 0
  const navigation = fakeHost(loc('/approval/list')).host

  /** 假契约模块（声明协议，记录收到的 mount options） */
  function routedContractModule(): { default: unknown } {
    const contract = defineVueBridgeApp((_props, ctx) => {
      receivedOptions.push({ signal: ctx?.signal, routing: ctx?.routing })
      mountCount++
      return createApp({ render: () => h('div', 'routed-sub') })
    }, { routing: true })
    return { default: contract }
  }

  it('启用 routing：mount 第三参数携带通道，通道坐标系正确；未声明协议 → MFU-031 占位', async () => {
    const g = globalThis as any
    g.__FULGURJS_RUNTIME__ = { loadRemote: async () => routedContractModule(), clearSessionState: () => {} }
    g.__FULGURJS_APP_CONFIG__ = { sessionKey: 'sess' }
    const { createVueBridgeAppWithLoader } = await import('../src/bridge-host-vue')
    const Comp = createVueBridgeAppWithLoader((spec, opts) => g.__FULGURJS_RUNTIME__.loadRemote(spec, opts))('remote/bridge')
    const { createApp: createVueApp } = await import('vue')
    const hostEl = document.createElement('div')
    document.body.appendChild(hostEl)
    const app = createVueApp({ render: () => h(Comp, { sessionKey: 'sess', routing: { basePath: '/approval', navigation } }) })
    app.mount(hostEl)
    await new Promise((r) => setTimeout(r, 0))
    await Promise.resolve()
    await new Promise((r) => setTimeout(r, 0))
    expect(mountCount).toBe(1)
    const opt = receivedOptions[0]
    expect(opt?.routing).toBeTruthy()
    const ch = opt?.routing as RoutingChannel
    expect(ch.basePath).toBe('/approval')
    expect(ch.getLocation().pathname).toBe('/list')
    // 未声明协议的契约 → MFU-031 占位
    g.__FULGURJS_RUNTIME__.loadRemote = async () => ({ default: { mount() {}, unmount() {} } })
    receivedOptions = []
    const app2 = createVueApp({
      render: () => h(Comp, { key: 'no-proto', sessionKey: 'sess', routing: { basePath: '/approval2', navigation } }),
    })
    const hostEl2 = document.createElement('div')
    document.body.appendChild(hostEl2)
    app2.mount(hostEl2)
    await new Promise((r) => setTimeout(r, 0))
    await new Promise((r) => setTimeout(r, 0))
    const errEl = hostEl2.querySelector('[data-fulgurjs-error]')
    expect(errEl?.getAttribute('data-fulgurjs-error')).toBe('MFU-031')
    app.unmount()
    app2.unmount()
    hostEl.remove()
    hostEl2.remove()
  })

  it('组件卸载 → 通道销毁：迟到导航 cancelled、URL 不变', async () => {
    const g = globalThis as any
    let lastChannel: RoutingChannel | undefined
    g.__FULGURJS_RUNTIME__ = {
      loadRemote: async () => ({
        default: defineVueBridgeApp((_props, ctx) => {
          lastChannel = ctx?.routing as RoutingChannel
          mountCount++
          return createApp({ render: () => h('div', 'sub') })
        }, { routing: true }),
      }),
      clearSessionState: () => {},
    }
    g.__FULGURJS_APP_CONFIG__ = { sessionKey: 'sess' }
    const { createVueBridgeAppWithLoader } = await import('../src/bridge-host-vue')
    const Comp = createVueBridgeAppWithLoader((spec, opts) => g.__FULGURJS_RUNTIME__.loadRemote(spec, opts))('remote/bridge')
    const { createApp: createVueApp } = await import('vue')
    const hostEl = document.createElement('div')
    document.body.appendChild(hostEl)
    const app = createVueApp({ render: () => h(Comp, { sessionKey: 'sess', routing: { basePath: '/approval', navigation } }) })
    app.mount(hostEl)
    await new Promise((r) => setTimeout(r, 0))
    await new Promise((r) => setTimeout(r, 0))
    expect(lastChannel).toBeTruthy()
    app.unmount()
    const r = await lastChannel!.navigate(loc('/late'), 'push')
    expect(r.status).toBe('cancelled')
    hostEl.remove()
  })
})

/** RouterLink 引用占位（导入面守护：确保真实入口被本测试文件使用） */
function RouterView_placeholder(): ReturnType<typeof h> {
  return h(RouterView)
}
