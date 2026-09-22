import { describe, expect, it } from 'vitest'
import { genSharedFacade, genRuntimeProxyModule, genDevManifest } from '../src/virtual'
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
