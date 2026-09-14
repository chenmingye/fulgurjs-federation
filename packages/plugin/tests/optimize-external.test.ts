import { describe, expect, it } from 'vitest'
import { federation } from '../src/index'
import { genSharedNsFacade } from '../src/virtual'
import { SHARED_NS_FACADE_PREFIX } from '../src/options'

const ROOT = process.cwd()

/** 模拟 esbuild 构建器，捕获 onResolve / onLoad 回调 */
function captureResolver(plugin: { name: string; setup: (b: unknown) => void }) {
  let resolver: ((args: { path: string; kind: string }) => { path: string; namespace: string } | null) | null = null
  let loader: ((args: { path: string }) => { contents: string; loader: string } | null) | null = null
  plugin.setup({
    onResolve: (_opts: unknown, cb: typeof resolver) => {
      resolver = cb
    },
    onLoad: (_opts: unknown, cb: typeof loader) => {
      loader = cb
    },
  })
  return {
    resolve: (path: string, kind = 'import-statement') => resolver?.({ path, kind }) ?? null,
    load: (path: string) => loader?.({ path }) ?? null,
  }
}

describe('optimizeDeps shared 外部化（dev 预构建协商门面）', () => {
  it('serve + exposes + 纯 remote：注入 esbuild resolver，shared 键改道到 re-export 桩', async () => {
    const [pre] = federation({
      name: 'remote-a',
      exposes: { './x': './src/x.ts' },
      shared: { 'magic-string': { singleton: true } },
    })
    const ret = (await pre.config?.({ root: ROOT }, { command: 'serve' } as never)) as Record<string, any>
    const plugins = ret?.optimizeDeps?.esbuildOptions?.plugins
    expect(Array.isArray(plugins)).toBe(true)
    expect(plugins[0].name).toBe('unifed:optimize-shared-external')

    const { resolve, load } = captureResolver(plugins[0])
    const r = resolve('magic-string')
    // 改道到 bundled 桩（非 external）：esbuild 对 CJS 依赖的 require(external) 会生成
    // 运行时抛错的动态 require 垫片，bundled 桩让门面 URL 被提升为 chunk 顶部静态 import
    expect(r?.namespace).toBe('unifed-opt-stub')
    expect(r?.path).toBe('unifed-stub:magic-string')

    const stub = load('unifed-stub:magic-string')
    expect(stub?.loader).toBe('js')
    expect(stub?.contents).toContain(
      `export * from "/@id/__x00__virtual:unifed-shared-ns:magic-string?import"`,
    )
    expect(stub?.contents).toContain(`export { default } from`)

    // 非 shared 键不拦截；入口解析放行（esbuild 禁止 entry point external）
    expect(resolve('axios')).toBeNull()
    expect(resolve('magic-string', 'entry-point')).toBeNull()
  })

  it('宿主（有 remotes，未开 devSharedSelf）不注入；build 不注入', async () => {
    const [pre] = federation({
      name: 'host',
      remotes: { 'remote-a': 'http://localhost:5101' },
      shared: { 'magic-string': {} },
    })
    const serveRet = (await pre.config?.({ root: ROOT }, { command: 'serve' } as never)) as Record<string, any>
    expect(serveRet?.optimizeDeps).toBeUndefined()

    const [pre2] = federation({
      name: 'remote-a',
      exposes: { './x': './src/x.ts' },
      shared: { 'magic-string': {} },
    })
    const buildRet = (await pre2.config?.({ root: ROOT }, { command: 'build' } as never)) as Record<string, any>
    expect(buildRet?.optimizeDeps).toBeUndefined()
  })

  it('import:false 的共享项不外部化', async () => {
    const [pre] = federation({
      name: 'remote-a',
      exposes: { './x': './src/x.ts' },
      shared: { 'magic-string': { import: false } },
    })
    const ret = (await pre.config?.({ root: ROOT }, { command: 'serve' } as never)) as Record<string, any>
    expect(ret?.optimizeDeps).toBeUndefined()
  })

  it('协商门面可被 load 生成：含 loadShare 协商 + CJS 导出枚举（本仓库可枚举包）', async () => {
    const [pre] = federation({
      name: 'remote-a',
      exposes: { './x': './src/x.ts' },
      shared: { 'magic-string': { singleton: true } },
    })
    await pre.config?.({ root: ROOT }, { command: 'serve' } as never)
    // resolveId：/@id/__x00__ 与 query 透传
    const resolved = pre.resolveId?.('/@id/__x00__virtual:unifed-shared-ns:magic-string?import', undefined, {}) as string
    expect(resolved).toBe('virtual:unifed-shared-ns:magic-string?import')
    const code = (await pre.load?.('virtual:unifed-shared-ns:magic-string')) as string
    expect(code).toContain('loadShare')
    expect(code).toContain('export default __unifed_d;')
    // magic-string 的 CJS 入口可枚举（含 default 与 MagicString）
    expect(code).toMatch(/export const \w+ = __unifed_d\[/)
  })

  it('vue 键自动补 vue-demi 兼容导出（isVue2/set/del 等缺失名致命问题）', async () => {
    const [pre] = federation({
      name: 'remote-a',
      exposes: { './x': './src/x.ts' },
      shared: { vue: { singleton: true } },
    })
    await pre.config?.({ root: ROOT }, { command: 'serve' } as never)
    // 枚举在插件包内可能失败（本包无 vue 依赖）走降级路径，但兼容名必须无条件补上
    const code = (await pre.load?.('virtual:unifed-shared-ns:vue')) as string
    expect(code).toContain('export const isVue2 = __unifed_d["isVue2"];')
    expect(code).toContain('export const isVue3 = __unifed_d["isVue3"];')
    expect(code).toContain('export const del = __unifed_d["del"];')
    expect(code).toContain('export const set = __unifed_d["set"];')
    expect(code).toContain('export const Vue2 = __unifed_d["Vue2"];')
  })

  it('枚举失败的包（ESM-only）降级为仅 default，不抛错', async () => {
    const [pre] = federation({
      name: 'remote-a',
      exposes: { './x': './src/x.ts' },
      shared: { '不存在的包-xyz': { singleton: true } },
    })
    await pre.config?.({ root: ROOT }, { command: 'serve' } as never)
    const code = (await pre.load?.('virtual:unifed-shared-ns:不存在的包-xyz')) as string
    expect(code).toContain('export default __unifed_d;')
    expect(code).not.toMatch(/export const /)
  })
})

describe('genSharedNsFacade 生成规则', () => {
  const item = {
    configKey: 'vue',
    shareKey: 'vue',
    aliases: ['vue'],
    version: '3.4.0',
    scope: null,
    import: 'vue',
    shareScope: 'default',
    requiredVersion: '^3.4.0' as const,
    singleton: true,
    strictVersion: false,
    eager: false,
  }
  it('命名导出全量转发、default 走 unwrapDefault、非法标识符跳过', () => {
    const code = genSharedNsFacade(item, '__unifed_loadShare("vue", {})', [
      'default',
      'ref',
      'reactive',
      'not-a-valid',
      'ref',
    ])
    expect(code).toContain('const __unifed_m = await __unifed_loadShare("vue", {});')
    expect(code).toContain('const __unifed_d = __unifedU(__unifed_m);')
    expect(code).toContain('export default __unifed_d;')
    expect(code).toContain('export const ref = __unifed_d["ref"];')
    expect(code).toContain('export const reactive = __unifed_d["reactive"];')
    expect(code).not.toContain('not-a-valid')
    expect(code.match(/export const ref/g)?.length).toBe(1)
  })
})

describe('CJS/UMD require(shared) 静态改写（防 commonjs 转换内联本地 vue）', () => {
  it('require("vue") 改写为协商门面命名空间导入', async () => {
    const { transformModule } = await import('../src/transform')
    const n = (await import('../src/options')).normalizeOptions(
      { name: 'remote-a', exposes: { './x': './src/x.ts' }, shared: { vue: { singleton: true } } },
      ROOT,
      'build',
    )
    const cjs = `!function(t,e){"object"==typeof exports?module.exports=e():e(require("vue"))}(this,function(Vue){return Vue.h})`
    const r = await transformModule(cjs, '/x/node_modules/@smallwei/avue/lib/avue.min.js', {
      options: n,
      rewriteShared: true,
      allowNodeModules: true,
      cjsRequireRewrite: true,
    })
    expect(r).not.toBeNull()
    expect(r!.code).toContain('require("virtual:unifed-cjs-ns:vue")')
    expect(r!.code).not.toContain('require("vue")')
    // 保持 require 调用形态：ESM import 前置会把文件变 mixed，commonjs 插件即跳过转换
  })

  it('node_modules 放行关闭时不改写（宿主场景守卫）', async () => {
    const { transformModule } = await import('../src/transform')
    const { normalizeOptions } = await import('../src/options')
    const n = normalizeOptions(
      { name: 'host', remotes: { a: 'http://localhost:5101' }, shared: { vue: {} } },
      ROOT,
      'build',
    )
    const cjs = `module.exports=e(require("vue"))`
    const r = await transformModule(cjs, '/x/node_modules/pkg/index.js', {
      options: n,
      rewriteShared: true,
      allowNodeModules: false,
    })
    expect(r).toBeNull()
  })
})
