/**
 * V8 同步门面执行回归（20261003 语义补修）：genBindingFacadeSync / genSharedNsFacadeSync
 * 的**真实生成产物**与**真实 runtime**（loadShareSync/pinLoadedShare）在同一执行环境中
 * 协作——验证门面执行时语义而非生成字符串：
 * - strictVersion 版本冲突传播为 MFU-003（本地副本存在也不吞）；
 * - resolveShare 快照复用与同步决策参与首次静态消费；
 * - 静态消费（门面）与动态消费（loadShare）实例严格相等（对象身份）；
 * - 非 singleton（strictVersion 默认 true）+ 已注册未加载本地版本 → 本地交付并 pin（B-2/B-8）。
 * import 行替换为注入的真实 runtime 绑定（new Function 无模块语义），其余代码原样执行。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { genBindingFacadeSync, genSharedNsFacadeSync } from '../src/virtual'

type Runtime = typeof import('../src/runtime/index')

async function fresh(): Promise<Runtime> {
  vi.resetModules()
  ;(globalThis as any).__FULGURJS_RUNTIME__ = undefined
  return import('../src/runtime/index')
}

/** 把门面生成代码转为可执行函数：import 行替换为真实 runtime 解构；export 转为返回绑定 */
function facadeFn(code: string): (...args: unknown[]) => Record<string, unknown> {
  const names: string[] = []
  const body = code
    .replace(/^import \{[^}]*\} from "virtual:fulgurjs-runtime";$/m, '')
    .replace(/^import \* as __fulgurjs_local from .*;$/m, '')
    .replace(/^export const (\w+)/gm, (_m: string, n: string) => {
      names.push(n)
      return `const ${n}`
    })
    .replace(/^export default /m, 'const __fg_default = ')
  // 门面内部使用生成期别名（__fulgurjs_ls/_pin/__fulgurjsU）——统一以解构注入真实 runtime
  const prelude = `const { loadShareSync: __fulgurjs_ls, pinLoadedShare: __fulgurjs_pin, unwrapDefault: __fulgurjsU, loadShare: __fulgurjs_dyn } = __rt;`
  return new Function(
    '__rt', '__fulgurjs_local',
    `${prelude}\n${body}\nreturn { ${names.join(', ')}, __fg_default, __rt };`,
  ) as never
}

describe('sync facade × real runtime（执行级回归）', () => {
  let rt: Runtime
  beforeEach(async () => {
    rt = await fresh()
  })

  it('绑定门面：singleton strictVersion 冲突传播 MFU-003（本地副本存在也不吞），拒绝后不污染作用域', async () => {
    rt.initSharing('default')
    const hostReact = { createElement: () => 'host19', version: '19.3.0' }
    rt.registerShare('default', 'react', '19.3.0', async () => hostReact, { from: 'host' })
    expect(await rt.loadShare('react', { shareKey: 'react', requiredVersion: '^19.0.0', singleton: true })).toBe(hostReact)

    const item = {
      shareScope: 'default', shareKey: 'react', import: 'react', requiredVersion: '^18.0.0',
      singleton: true, strictVersion: true, eager: false, version: '18.3.1', aliases: ['react'], configKey: 'react',
    } as never
    const local = { createElement: () => 'local18', version: '18.3.1' }
    const fn = facadeFn(genBindingFacadeSync(item, ['createElement', 'default'], 'react'))
    let threw: any = null
    try {
      fn(rt, local)
    } catch (e) { threw = e }
    expect(threw).not.toBeNull()
    expect(threw.code).toBe('MFU-003')
    expect(threw.message).toContain('19.3.0')
    // 拒绝后不污染作用域：本地 18 未被 pin（strictVersion 冲突不得留下半初始化实例）
    const scope = (rt.shareScopeMap as any).default.react
    expect(Object.keys(scope).sort()).toEqual(['19.3.0'])
  })

  it('绑定门面：hook 快照复用 + 静态/动态实例严格相等（同一对象，非同形字符串）', async () => {
    rt.initSharing('default')
    const low = { pick: { where: 'low' } }
    const high = { pick: { where: 'high' } }
    rt.registerShare('default', 'lib', '1.0.0', async () => low, { from: 'a' })
    rt.registerShare('default', 'lib', '2.0.0', async () => high, { from: 'b' })
    rt.registerPlugins([{ name: 'pick-low', init: (h: any) => { h.resolveShare = (ctx: any) => ctx.available.find((e: any) => e.version === '1.0.0') } }])
    const viaDynamic = await rt.loadShare('lib', { shareKey: 'lib', requiredVersion: '^1.0.0' })
    expect(viaDynamic).toBe(low) // hook 决策在动态路径生效

    const item = {
      shareScope: 'default', shareKey: 'lib', import: 'lib', requiredVersion: '^1.0.0',
      singleton: false, strictVersion: false, eager: false, version: '0.9.0', aliases: ['lib'], configKey: 'lib',
    } as never
    const local = { pick: { where: 'local' } }
    const fn = facadeFn(genBindingFacadeSync(item, ['pick', 'default'], 'lib'))
    const out = fn(rt, local)
    expect(out.pick).toBe(low.pick) // 静态门面消费 === 动态 loadShare 结果（属性值对象身份严格相等）
    expect(out.pick.where).toBe('low')
    expect(out.__fg_default).toBe(low)
  })

  it('命名空间门面：B-2/B-8 形态（非 singleton strictVersion 默认 true + 本地版本已注册未加载）→ 本地交付并 pin', async () => {
    rt.initSharing('default')
    const host35 = { version: '3.5.42' }
    let bGetCalls = 0
    rt.registerShare('default', 'vue', '3.5.42', async () => host35, { from: 'host' })
    rt.registerShare('default', 'vue', '3.4.38', async () => {
      bGetCalls++
      return { version: '3.4.38-from-get' }
    }, { from: 'remote-b' })
    await rt.loadShare('vue', { shareKey: 'vue', requiredVersion: '^3.5.0', singleton: true })

    const item = {
      shareScope: 'default', shareKey: 'vue', import: 'vue34', requiredVersion: '~3.4.0',
      singleton: false, strictVersion: true, eager: false, version: '3.4.38', aliases: [], configKey: 'vue34',
    } as never
    const local = { version: '3.4.38' }
    const fn = facadeFn(genSharedNsFacadeSync(item, ['version', 'defineComponent'], 'vue34'))
    const out = fn(rt, local)
    expect(bGetCalls).toBe(0) // 本地交付，get 未被调用
    expect(out.version).toBe('3.4.38')
    expect(out.__fg_default).not.toBe(host35) // 非单例多版本共存：remote-b 持有自己的 3.4.38
    // pin 生效：3.4.38 条目 value = 门面本地副本，后续协商收敛同一实例
    const scope = (out.__rt as any).shareScopeMap.default.vue
    expect(scope['3.4.38'].value).toBe(local)
    expect(scope['3.4.38'].loaded).toBe(true)
  })

  it('命名空间门面：resolveShare 同步决策参与首次静态导入（无快照），hook 选外部就绪条目', async () => {
    rt.initSharing('default')
    const low = { pick: { where: 'low' } }
    const high = { pick: { where: 'high' } }
    rt.registerShare('default', 'lib', '1.0.0', async () => low, { from: 'a' })
    rt.registerShare('default', 'lib', '2.0.0', async () => high, { from: 'b' })
    // 让 hook 要选的 1.0.0 先就绪（异步协商 ^1.0.0 → 1.0.0）；2.0.0 保持未就绪
    await rt.loadShare('lib', { shareKey: 'lib', requiredVersion: '^1.0.0' })
    rt.registerPlugins([{ name: 'pick-low', init: (h: any) => { h.resolveShare = (ctx: any) => ctx.available.find((e: any) => e.version === '1.0.0') } }])

    const item = {
      shareScope: 'default', shareKey: 'lib', import: 'lib', requiredVersion: '^1.0.0',
      singleton: false, strictVersion: false, eager: false, version: '0.9.0', aliases: [], configKey: 'lib',
    } as never
    const local = { pick: { where: 'local' } }
    const fn = facadeFn(genSharedNsFacadeSync(item, ['pick'], 'lib'))
    const out = fn(rt, local)
    expect(out.pick).toBe(low.pick) // hook 同步决策被遵循（无快照、无预置协商）
    expect(out.pick).not.toBe(local.pick)
    expect(out.pick).not.toBe(high.pick)
  })
})
