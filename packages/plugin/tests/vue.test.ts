/**
 * remoteComponent（@fulgurjs/federation/vue）单测：default 解包 / opts 透传 /
 * 显式错误态（H3）/ 模块去重。每 case 通过 vi.resetModules + 动态 import 获得全新
 * runtime 实例（隔离 globalThis 单例），容器经 registerRemote promise 注入。
 */
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'

vi.mock('../src/runtime/index', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/runtime/index')>()
  return { ...actual, loadRemote: vi.fn(actual.loadRemote) }
})

async function fresh() {
  vi.resetModules()
  ;(globalThis as any).__FULGURJS_RUNTIME__ = undefined
  return import('../src/runtime/index')
}

async function mount(Comp: any): Promise<HTMLElement> {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const app = createApp({ render: () => h(Comp) })
  app.config.warnHandler = () => {}
  app.mount(el)
  await new Promise(r => setTimeout(r, 0))
  await nextTick()
  return el
}

describe('remoteComponent（@fulgurjs/federation/vue）', () => {
  beforeEach(async () => {
    await fresh()
  })

  it('V-1 loader 解包 default 导出', async () => {
    const rt = await import('../src/runtime/index')
    const Marker = { template: '<span>remote-default</span>' }
    rt.registerRemote({
      name: 'r1',
      entry: '',
      promise: async () => ({ name: 'r1', init: async () => {}, get: async () => ({ default: Marker }) }),
    })
    const { remoteComponent } = await import('../src/vue')
    const el = await mount(remoteComponent('r1/Card'))
    expect(el.innerHTML).toContain('remote-default')
  })

  it('V-2 无 default 时使用命名空间本体', async () => {
    const rt = await import('../src/runtime/index')
    const Plain = { template: '<span>remote-plain</span>' }
    rt.registerRemote({
      name: 'r2',
      entry: '',
      promise: async () => ({ name: 'r2', init: async () => {}, get: async () => ({ ...Plain }) }),
    })
    const { remoteComponent } = await import('../src/vue')
    const el = await mount(remoteComponent('r2/Card'))
    expect(el.innerHTML).toContain('remote-plain')
  })

  it('V-3 retries 透传 loadRemote', async () => {
    const rt = await import('../src/runtime/index')
    rt.registerRemote({
      name: 'r3',
      entry: '',
      promise: async () => ({ name: 'r3', init: async () => {}, get: async () => ({ default: { template: '<i/>' } }) }),
    })
    const { remoteComponent } = await import('../src/vue')
    const el = await mount(remoteComponent('r3/Card', { retries: 5 }))
    expect(el.querySelector('i')).toBeTruthy()
    expect(rt.loadRemote).toHaveBeenCalledWith('r3/Card', { retries: 5 })
  })

  it('V-4 加载失败 → 默认错误占位（错误码+根因+修法）+ fulgurjs:error 显式', async () => {
    const rt = await import('../src/runtime/index')
    rt.registerRemote({
      name: 'r4',
      entry: '',
      promise: async () => {
        throw new Error('container unreachable')
      },
    })
    const { remoteComponent } = await import('../src/vue')
    const onEvent = vi.fn()
    window.addEventListener('fulgurjs:error', onEvent)
    const el = await mount(remoteComponent('r4/Card', { retries: 0 }))
    window.removeEventListener('fulgurjs:error', onEvent)
    expect(el.innerHTML).toContain('MFU-001')
    expect(el.innerHTML).toContain('远程组件加载失败')
    expect(el.innerHTML).toContain('修法')
    expect(onEvent).toHaveBeenCalledTimes(1)
  })

  it('V-5 自定义 errorComponent 生效（替换默认占位）', async () => {
    const rt = await import('../src/runtime/index')
    rt.registerRemote({
      name: 'r5',
      entry: '',
      promise: async () => Promise.reject(new Error('nope')),
    })
    const { remoteComponent } = await import('../src/vue')
    const MyError = { props: ['error'], template: '<b class="my-err">自定义错误</b>' }
    const el = await mount(remoteComponent('r5/Card', { retries: 0, errorComponent: MyError }))
    expect(el.querySelector('.my-err')).toBeTruthy()
    expect(el.innerHTML).not.toContain('修法')
  })

  it('V-6 loadingComponent 在 loader 完成前渲染', async () => {
    const rt = await import('../src/runtime/index')
    rt.registerRemote({
      name: 'r6',
      entry: '',
      promise: async () => {
        await new Promise(r => setTimeout(r, 80))
        return { name: 'r6', init: async () => {}, get: async () => ({ default: { template: '<span>ok</span>' } }) }
      },
    })
    const { remoteComponent } = await import('../src/vue')
    const Loading = { template: '<em class="loading">载入中</em>' }
    const el = await mount(remoteComponent('r6/Card', { loadingComponent: Loading, delay: 0 }))
    expect(el.querySelector('.loading')).toBeTruthy()
    await new Promise(r => setTimeout(r, 120))
    await nextTick()
    expect(el.innerHTML).toContain('ok')
  })

  it('V-7 同 spec 模块去重：两个组件实例共享一次容器 get', async () => {
    const rt = await import('../src/runtime/index')
    let gets = 0
    rt.registerRemote({
      name: 'r7',
      entry: '',
      promise: async () => ({
        name: 'r7',
        init: async () => {},
        get: async () => {
          gets++
          return { default: { template: `<b>gets-${gets}</b>` } }
        },
      }),
    })
    const { remoteComponent } = await import('../src/vue')
    const elA = await mount(remoteComponent('r7/Card'))
    const elB = await mount(remoteComponent('r7/Card'))
    expect(gets).toBe(1)
    expect(elA.innerHTML).toBe(elB.innerHTML)
  })

  it('V-8 使用处 props 透传到远程组件', async () => {
    const rt = await import('../src/runtime/index')
    rt.registerRemote({
      name: 'r8',
      entry: '',
      promise: async () => ({
        name: 'r8',
        init: async () => {},
        get: async () => ({
          default: { props: ['formParams'], template: '<span class="fp">{{ formParams.id }}</span>' },
        }),
      }),
    })
    const { remoteComponent } = await import('../src/vue')
    const Comp = remoteComponent('r8/Card')
    const el = document.createElement('div')
    document.body.appendChild(el)
    const app = createApp({ render: () => h(Comp, { formParams: { id: 42 } }) })
    app.config.warnHandler = () => {}
    app.mount(el)
    await new Promise(r => setTimeout(r, 0))
    await nextTick()
    expect(el.querySelector('.fp')?.textContent).toBe('42')
  })
})
