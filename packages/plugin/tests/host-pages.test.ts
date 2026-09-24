/**
 * createHostPages 宿主页面适配器单测（§3.2 契约）。
 * 覆盖：definePages 校验复用 / 最长前缀匹配（非先到先得）/ 无匹配前缀 fail fast /
 * base 剥离与深链 / 参数解码失败不崩 / keepAliveNames / 会话切换组件缓存失效 /
 * 包装组件 name 稳定且不改远程模块导出 / beforeLoad 时序 / 组件复用。
 */
// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { createHostPages } from '../src/vue-adapter'

const load = vi.fn(async (spec: string) => ({ default: { name: 'Inner', __spec: spec } }))

async function mount(Comp: any): Promise<HTMLElement> {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const app = createApp({ render: () => h(Comp) })
  app.config.warnHandler = () => {}
  app.mount(el)
  await new Promise((r) => setTimeout(r, 0))
  await nextTick()
  return el
}

const basePages = [
  { route: '/remote-a/home', name: 'Home', title: '首页' },
  { route: '/remote-a/detail/:id', name: 'Detail', spec: 'pages/detail', title: '详情' },
  { route: '/b/list', name: 'BList', keepAlive: true },
]

function make(overrides: Partial<Parameters<typeof createHostPages>[0]> = {}) {
  return createHostPages(
    {
      pages: basePages,
      remotePrefixes: { '/remote-a/': 'remote-a', '/b/': 'remote-b' },
      ...overrides,
    } as Parameters<typeof createHostPages>[0],
    load,
  )
}

describe('createHostPages：resolve 与前缀归属', () => {
  it('静态路由与带参路由解析（显式 spec 优先，参数解码）', () => {
    const hp = make()
    const home = hp.resolve('/remote-a/home')!
    expect(home.remote).toBe('remote-a')
    expect(home.spec).toBe('remote-a/home')
    const detail = hp.resolve('/remote-a/detail/%E4%B8%AD')!
    expect(detail.params).toEqual({ id: '中' })
    expect(detail.spec).toBe('remote-a/pages/detail')
  })

  it('最长前缀匹配：/b/ 不被更短的误配归给错误远程', () => {
    const hp = createHostPages(
      {
        pages: [
          { route: '/b/list', name: 'L' },
          { route: '/other', name: 'O' },
        ],
        remotePrefixes: { '/': 'fallback-r', '/b/': 'remote-b' },
      } as Parameters<typeof createHostPages>[0],
      load,
    )
    expect(hp.resolve('/b/list')!.remote).toBe('remote-b')
    expect(hp.resolve('/other')!.remote).toBe('fallback-r')
  })

  it('页面路由无匹配前缀 → 创建期 fail fast（报具体路由与前缀表）', () => {
    expect(() =>
      createHostPages(
        { pages: [{ route: '/x/y' }], remotePrefixes: { '/remote-a/': 'r' } } as Parameters<typeof createHostPages>[0],
        load,
      ),
    ).toThrow(/\/x\/y[\s\S]*remotePrefixes/)
  })

  it('base 剥离：/main 前缀的 prod 深链与 dev 直链解析到同一条目', () => {
    const hp = make({ base: '/main' })
    expect(hp.resolve('/main/remote-a/home')!.page.name).toBe('Home')
    expect(hp.resolve('/remote-a/home')!.page.name).toBe('Home')
  })

  it('参数解码失败只让该次匹配失败（返回 null），不让整表解析崩溃', () => {
    const hp = make()
    expect(hp.resolve('/remote-a/detail/%')).toBeNull()
    expect(hp.resolve('/remote-a/detail/ok')).not.toBeNull()
  })

  it('无匹配返回 null；尾斜杠与 query/hash 剥离', () => {
    const hp = make()
    expect(hp.resolve('/nothing/here')).toBeNull()
    expect(hp.resolve('/remote-a/home/')!.page.name).toBe('Home')
    expect(hp.resolve('/remote-a/home?x=1#f')!.page.name).toBe('Home')
  })
})

describe('createHostPages：校验复用与保活名称', () => {
  it('R4 路由遮蔽 / R1 剥参冲突在创建期抛出（definePages 校验复用）', () => {
    expect(() =>
      createHostPages(
        {
          pages: [
            { route: '/a/:id/x' },
            { route: '/a/1/x' },
          ],
          remotePrefixes: { '/a/': 'r' },
        } as Parameters<typeof createHostPages>[0],
        load,
      ),
    ).toThrow(/R4/)
  })

  it('keepAliveNames 与组件缓存键一致（KeepAlive include 可直接绑定）', () => {
    const hp = make()
    expect(hp.keepAliveNames).toEqual(['Fulgurjs_remote-b_list'])
    const comp: any = hp.component('remote-b/list')
    expect(comp.name).toBe('Fulgurjs_remote-b_list')
  })
})

describe('createHostPages：组件加载与会话感知缓存', () => {
  it('渲染时序：beforeLoad → loadRemote → 取 default 导出（骨架/错误经 async 组件语义）', async () => {
    const order: string[] = []
    const hp = createHostPages(
      { pages: basePages, remotePrefixes: { '/remote-a/': 'remote-a', '/b/': 'remote-b' }, beforeLoad: () => { order.push('beforeLoad') } } as Parameters<typeof createHostPages>[0],
      async (spec) => {
        order.push('load:' + spec)
        return { default: { name: 'Inner' } }
      },
    )
    const comp = hp.component('remote-a/home')
    expect(order).toEqual([]) // loader 惰性：创建组件不触发
    await mount(comp)
    expect(order).toEqual(['beforeLoad', 'load:remote-a/home'])
  })

  it('同 spec 复用组件实例；无 sessionKey 时缓存永不失效', () => {
    const hp = make()
    const a = hp.component('remote-a/home')
    const b = hp.component('remote-a/home')
    expect(a).toBe(b)
  })

  it('sessionKey 变化后组件缓存失效（下次 component() 重建，触发新代次 onSession）', () => {
    const hp = make()
    const g = globalThis as any
    g.__FULGURJS_APP_CONFIG__ = { sessionKey: 's-1' }
    const a = hp.component('remote-a/home')
    g.__FULGURJS_APP_CONFIG__ = { sessionKey: 's-2' }
    const b = hp.component('remote-a/home')
    expect(a).not.toBe(b)
    // 同代次内再次获取：复用
    expect(hp.component('remote-a/home')).toBe(b)
    // 退出（context 清空）：sessionKey 回到 undefined ≠ 's-2' → 再次失效
    delete g.__FULGURJS_APP_CONFIG__
    expect(hp.component('remote-a/home')).not.toBe(b)
  })

  it('包装组件不改写远程模块导出对象（load 返回的模块保持原样）', async () => {
    const hp = make()
    const el = await mount(hp.component('remote-a/home'))
    await vi.waitFor(() => expect(load).toHaveBeenCalled())
    const mod = await load.mock.results[0]!.value
    expect((mod.default as any).name).toBe('Inner') // 未被改成 Fulgurjs_*
    expect(el.innerHTML).not.toBe('')
  })
})
