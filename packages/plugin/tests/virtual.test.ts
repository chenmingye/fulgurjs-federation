import { describe, expect, it } from 'vitest'
import { genBindingFacade, genRemoteBindingFacade, genSharedFacade, genSharedNsFacade, genRuntimeProxyModule, genDevManifest, genInitModule } from '../src/virtual'
import { scanExposeRequiredProps } from '../src/diagnostics'
import { normalizeOptions } from '../src/options'

const ROOT = process.cwd()

/**
 * U-7 回归防线：rolldown 产物下 `export *` + TLA 展开会丢掉全部命名绑定
 * （provider 注册后 loadShare 拿到的命名空间只有 default）。genSharedFacade 对可枚举包
 * 必须生成枚举式再导出（`export const X = ns.X`），生成物里不允许再出现 `export *`。
 */
describe('W3/U-7: genSharedFacade 枚举式再导出', () => {
  const EP_EXPORTS = [
    'ElButton',
    'ElInput',
    'provideGlobalConfig',
    'ElLoading',
    'zhCn',
    // 非法标识符与 default 应被过滤
    'default',
    'not a ident',
    '1bad',
  ]

  it('provider 路径门面不含 export *（rolldown U-7 缺陷规避）', () => {
    const code = genSharedFacade('element-plus', EP_EXPORTS)
    expect(code).not.toContain('export *')
  })

  it('全部合法命名导出逐一显式转发（loadShare 后命名导出非 undefined 的生成物前提）', () => {
    const code = genSharedFacade('element-plus', EP_EXPORTS)
    for (const name of ['ElButton', 'ElInput', 'provideGlobalConfig', 'ElLoading', 'zhCn']) {
      expect(code).toContain(`export const ${name} = __fulgurjs_facade[${JSON.stringify(name)}]`)
    }
  })

  it('default 走 interop（ns.default ?? ns）', () => {
    const code = genSharedFacade('element-plus', EP_EXPORTS)
    expect(code).toContain('export default __fulgurjs_facade.default ?? __fulgurjs_facade;')
  })

  it('非法导出名被过滤（default / 含空格 / 数字开头）', () => {
    const code = genSharedFacade('element-plus', EP_EXPORTS)
    expect(code).not.toContain('export const default')
    expect(code).not.toContain('export const not a ident')
    expect(code).not.toContain('export const 1bad')
  })

  it('无法枚举（ESM-only/相对路径）回退 export * 形态保持可用', () => {
    const code = genSharedFacade('./src/relative-module.ts', [])
    expect(code).toContain('export * from "./src/relative-module.ts"')
    expect(code).toContain('export default __fulgurjs_facade.default ?? __fulgurjs_facade;')
  })
})

/** W5/BLD-003：expose 目标必填 props 启发式（07 误挂子组件事故的回归防线） */
describe('W5/BLD-003: scanExposeRequiredProps', () => {
  it('类型声明：无 ? 的 props 视为必填（07 事故原型 selectProcessDefinition）', () => {
    const src = `const props = defineProps<{
  selectProcessDefinition: any
}>()`
    expect(scanExposeRequiredProps(src)).toEqual(['selectProcessDefinition'])
  })

  it('类型声明：可选 props（?:）不告警（合法 expose 目标 formParams 形态）', () => {
    const src = `const props = defineProps<{ formParams?: Record<string, any> }>();`
    expect(scanExposeRequiredProps(src)).toEqual([])
  })

  it('运行时声明：required: true 视为必填', () => {
    const src = `defineProps({ foo: { type: String, required: true }, bar: { type: Number } })`
    expect(scanExposeRequiredProps(src)).toEqual(['foo'])
  })

  it('无 defineProps 的文件返回空', () => {
    expect(scanExposeRequiredProps('export default { template: "<div/>" }')).toEqual([])
  })
})

/** 0.4.1：expose 目标静态导入运行时 → 自动改写为惰性单例委托（原 DEV-008 硬规则自动化） */
describe('运行时惰性委托模块（genRuntimeProxyModule）', () => {
  it('求值期零副作用：不 import 运行时、不创建副本，仅调用期动态转发', () => {
    const code = genRuntimeProxyModule()
    // 动态 import 只能出现在惰性函数体内
    expect(code).toContain("import('virtual:fulgurjs-runtime')")
    expect(code).not.toMatch(/^import\s/m)
    for (const api of ['loadRemote', 'loadShare', 'preloadRemote', 'getContainer', 'registerRemote']) {
      expect(code).toContain(`export const ${api} =`)
    }
  })

  it('委托模块走全局单例（不再携带跨应用配置 API——已收编至 context 子路径）', () => {
    const code = genRuntimeProxyModule()
    expect(code).toContain('__FULGURJS_RUNTIME__')
    expect(code).not.toContain('AppConfig')
  })
})

describe('dev manifest file 字段 = 真实可请求 URL（preloadRemote 回归）', () => {
  it('exposes[].file 是裸模块 URL（含 base），不是 dts 虚拟路径', () => {
    const opts = normalizeOptions({
      name: 'remote-a',
      exposes: { './Button': './src/Button.vue' },
    }, ROOT, 'serve')
    const m = genDevManifest(opts, '/remote-a/') as { exposes: Array<{ file: string }> }
    expect(m.exposes[0].file).toBe('/remote-a/src/Button.vue')
    expect(m.exposes[0].file).not.toContain('@fulgurjs-src')
  })
})

describe('prod manifest URL in generated init', () => {
  it('root-relative remote base keeps a root-relative manifest URL', () => {
    const options = normalizeOptions(
      { name: 'host', remotes: { lowcode: { prod: '/lowcode' } } },
      ROOT,
      'build',
    )
    const code = genInitModule(options, 'build')
    expect(code).toContain('"manifestUrl":"/lowcode/fulgurjs-manifest.json"')
  })

  it('absolute remote base keeps its origin in the manifest URL', () => {
    const options = normalizeOptions(
      { name: 'host', remotes: { lowcode: { prod: 'https://cdn.example.test/lowcode' } } },
      ROOT,
      'build',
    )
    const code = genInitModule(options, 'build')
    expect(code).toContain('"manifestUrl":"https://cdn.example.test/lowcode/fulgurjs-manifest.json"')
  })
})

/**
 * D6（2026-09-22）回归防线：双向宿主开启 devSharedSelf 后 node_modules 参与门面化。
 * 门面若静态 import 运行时/shared 本体，会与用户 manualChunks 强制分组互锁成 chunk 环
 * （实测：vue-vendor ⇄ antd-vue-vendor，运行时 TypeError：协商函数未初始化）。
 * 门面生成物必须把 runtime / shared 本体的依赖全部放进 TLA 动态 import——
 * 门面 chunk 因此对任何用户分组「零对外静态依赖」，与 manualChunks 正交。
 */
describe('D6: 门面动态化（runtime/本体均 await import，防 chunk 循环）', () => {
  it('genBindingFacade 不静态 import 运行时', () => {
    const code = genBindingFacade(
      { shareScope: 'default', shareKey: 'vue', import: 'vue', requiredVersion: false, singleton: true, strictVersion: false, eager: false, version: '3.5.0', aliases: ['vue'], configKey: 'vue' } as never,
      ['ref'],
      '__fulgurjs_loadShare("vue", {})',
      true,
    )
    expect(code).not.toMatch(/import\s*{[^}]*}\s*from\s*["']virtual:fulgurjs-runtime["']/)
    expect(code).toContain('await import("virtual:fulgurjs-runtime")')
    expect(code).toContain('export const ref = __fulgurjs_m.ref;')
  })

  it('genBindingFacade 默认（非 dynamic）保持 2.0.0 静态形态（纯 remote 行为不变）', () => {
    const code = genBindingFacade(
      { shareScope: 'default', shareKey: 'vue', import: 'vue', requiredVersion: false, singleton: true, strictVersion: false, eager: false, version: '3.5.0', aliases: ['vue'], configKey: 'vue' } as never,
      ['ref'],
      '__fulgurjs_loadShare("vue", {})',
    )
    expect(code).toContain('import { loadShare as __fulgurjs_loadShare, unwrapDefault as __fulgurjsU } from "virtual:fulgurjs-runtime";')
    expect(code).not.toContain('await import')
  })

  it('genSharedNsFacade 不静态 import 运行时', () => {
    const code = genSharedNsFacade(
      { shareScope: 'default', shareKey: 'vue', import: 'vue', requiredVersion: false, singleton: true, strictVersion: false, eager: false, version: '3.5.0', aliases: ['vue'], configKey: 'vue' } as never,
      '__fulgurjs_loadShare("vue", {})',
      ['ref'],
      true,
    )
    expect(code).not.toMatch(/import\s*{[^}]*}\s*from\s*["']virtual:fulgurjs-runtime["']/)
    expect(code).toContain('await import("virtual:fulgurjs-runtime")')
  })

  it('genRemoteBindingFacade 不静态 import 运行时', () => {
    const code = genRemoteBindingFacade('remote-a/./Button', ['default'], true)
    expect(code).not.toMatch(/import\s*{[^}]*}\s*from\s*["']virtual:fulgurjs-runtime["']/)
    expect(code).toContain('await import("virtual:fulgurjs-runtime")')
  })

  it('genSharedFacade（可枚举，dynamic）shared 本体走动态 import，不再静态依赖本体', () => {
    const code = genSharedFacade('element-plus', ['ElButton'], true)
    expect(code).not.toContain('import * as')
    expect(code).toContain(`await import("element-plus")`)
    // D6 补丁：导出必须取自本地复制对象（{ ...ns }），防 rollup 把纯透传模块内联进
    // 本体 chunk → fallback 动态 import 指回本体 → TLA 混合环死锁（实机复现）
    expect(code).toContain(`const __fulgurjs_ns = { ...__fulgurjs_facade };`)
    expect(code).toContain(`export const ElButton = __fulgurjs_ns["ElButton"];`)
  })

  it('genSharedFacade（无法枚举）保持 export * 回退形态，行为不变', () => {
    const code = genSharedFacade('some/esm-only', [], true)
    expect(code).toContain('export * from "some/esm-only"')
    expect(code).toContain('await import("some/esm-only")')
  })
})
