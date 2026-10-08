import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const PKG = join(__dirname, '..')

describe('runtime 物理入口类型', () => {
  it('声明文件与公开类型真实存在', () => {
    const file = join(PKG, 'dist/runtime-entry.d.ts')
    expect(existsSync(file)).toBe(true)
    const text = readFileSync(file, 'utf8')
    for (const name of ['loadRemote', 'provideAppContext', 'definePages', 'remoteSchema', 'RemoteConfig', 'LoadRemoteOptions']) {
      expect(text).toContain(name)
    }
    // 6.0.0：/runtime 框架无关——Vue 适配符号不得再出现在导出绑定里（迁移到 /vue）
    const exportNames = new Set(
      [...text.matchAll(/\b(remoteComponent|createHostPages|defineBridgeApp)\s*[,}]/g)].map((m) => m[1]),
    )
    expect([...exportNames], '/runtime 导出绑定不应再含 Vue 适配符号').toEqual([])
  })

  it('package.json 不再导出 client 虚拟类型垫片', () => {
    const pkg = JSON.parse(readFileSync(join(PKG, 'package.json'), 'utf8'))
    expect(pkg.exports['./client']).toBeUndefined()
    expect(pkg.files).not.toContain('client.d.ts')
  })

  it('type-only 导出面与批准清单相同', () => {
    const text = readFileSync(join(PKG, 'dist/runtime-entry.d.ts'), 'utf8')
    const exports = text.match(/^export \{([^\n]+)\};$/m)?.[1] ?? ''
    const names = [...exports.matchAll(/\btype ([A-Za-z_$][\w$]*)/g)].map((m) => m[1]).sort()
    expect(names).toEqual([
      'AppContext', 'FgRuntime', 'LoadRemoteOptions', 'LoadShareOptions',
      'PageRouteLike', 'PageViolation', 'PagesOptions', 'PreloadRemoteOptions',
      'RemoteConfig', 'RemoteDebugInfo',
      'RemoteSchema', 'RemoteSchemaEntry', 'RemoteSetupContext', 'RemoteSetupModule',
      'RuntimeHooks', 'RuntimePlugin',
      'ShareEntry', 'ShareScope', 'ShareScopeMap',
    ].sort())
  })
})

describe('/react 物理入口类型', () => {
  it('声明文件与公开类型真实存在', () => {
    const file = join(PKG, 'dist/react.d.ts')
    expect(existsSync(file)).toBe(true)
    const text = readFileSync(file, 'utf8')
    for (const name of ['loadRemote', 'provideAppContext', 'definePages', 'remoteComponent', 'useLoadRemote', 'RemoteErrorBoundary', 'createReactHostPages', 'remoteSchema']) {
      expect(text).toContain(name)
    }
  })

  it('type-only 导出面与批准清单相同（不含 Vue 专属类型）', () => {
    const text = readFileSync(join(PKG, 'dist/react.d.ts'), 'utf8')
    const exports = text.match(/^export \{([^\n]+)\};$/m)?.[1] ?? ''
    const names = [...exports.matchAll(/\btype ([A-Za-z_$][\w$]*)/g)].map((m) => m[1]).sort()
    expect(names).toEqual([
      'AppContext', 'BridgeApp', 'BridgeErrorFallback', 'BridgeHostRouting', 'FgRuntime',
      'LoadRemoteOptions', 'LoadShareOptions',
      'PageRouteLike', 'PageViolation', 'PagesOptions', 'PreloadRemoteOptions',
      'ReactBridgeAppFactory', 'ReactBridgeAppOptions', 'ReactBridgeCancelPolicy', 'ReactBridgeRouterConnection',
      'ReactHostPages', 'ReactHostPagesOptions', 'ReactRemoteComponentOptions',
      'RemoteConfig', 'RemoteDebugInfo', 'RemoteErrorBoundaryProps', 'RemoteErrorFallback',
      'RemoteSchema', 'RemoteSchemaEntry', 'RemoteSetupContext', 'RemoteSetupModule',
      'ResolvedHostPage', 'RuntimeHooks', 'RuntimePlugin',
      'ShareEntry', 'ShareScope', 'ShareScopeMap',
      'UseLoadRemoteOptions', 'UseLoadRemoteResult',
    ].sort())
    expect(text).toContain('defineBridgeApp')
    expect(text).toContain('createReactBridgeApp')
    expect(text).toContain('createReactBridgeNavigation')
    expect(text).toContain('createReactBridgeRouter')
    // Vue 专属类型不得混入 React 入口（type HostPages, 与 type ReactHostPages, 区分）。
    // 绑定级判定与 /vue 检查同型：JSDoc 散文提及不算导出（consumerApp 合同文档确实会
    // 提到 createHostPages 不传 consumerApp——原始 substring 断言会被散文误触发）。
    for (const vueOnlyType of ['HostPagesOptions', 'RemoteComponentOptions', 'HostPages', 'keepAliveNames']) {
      expect(names).not.toContain(vueOnlyType)
    }
    const vueOnlyBindings = new Set(
      [...text.matchAll(/\bcreateHostPages\s*[,}]/g)].map((m) => m[0]),
    )
    expect([...vueOnlyBindings], '/react 导出绑定不应含 Vue 适配符号').toEqual([])
  })

  it('package.json 导出 /react 与内部 react-adapter', () => {
    const pkg = JSON.parse(readFileSync(join(PKG, 'package.json'), 'utf8'))
    expect(pkg.exports['./react'].import).toBe('./dist/react.js')
    expect(pkg.exports['./react'].types).toBe('./dist/react.d.ts')
    expect(pkg.exports['./internal/react-adapter.js'].import).toBe('./dist/react-adapter.js')
    expect(pkg.typesVersions['*'].react).toEqual(['dist/react.d.ts'])
    expect(pkg.peerDependenciesMeta.react?.optional).toBe(true)
    expect(pkg.peerDependenciesMeta['react-dom']?.optional).toBe(true)
  })
})

describe('/vue 物理入口类型（6.0.0 统一入口）', () => {
  it('声明文件真实存在且导出 Vue 全量能力（组件/页面/桥接/路由同步）', () => {
    const file = join(PKG, 'dist/vue.d.ts')
    expect(existsSync(file)).toBe(true)
    const text = readFileSync(file, 'utf8')
    for (const name of ['loadRemote', 'provideAppContext', 'definePages', 'remoteComponent', 'createHostPages', 'defineBridgeApp', 'createVueBridgeApp', 'createVueBridgeNavigation', 'connectVueBridgeRouter', 'remoteSchema']) {
      expect(text, name).toContain(name)
    }
    // /vue 不得混入 React 适配绑定（JSDoc 散文提及不算导出）
    const reactBindings = new Set(
      [...text.matchAll(/\b(useLoadRemote|RemoteErrorBoundary|createReactBridgeApp|createReactBridgeRouter|createReactBridgeNavigation|createReactHostPages)\s*[,}]/g)].map((m) => m[1]),
    )
    expect([...reactBindings], '/vue 导出绑定不应含 React 适配符号').toEqual([])
  })

  it('type-only 导出面与批准清单相同', () => {
    const text = readFileSync(join(PKG, 'dist/vue.d.ts'), 'utf8')
    const exports = text.match(/^export \{([^\n]+)\};$/m)?.[1] ?? ''
    const names = [...exports.matchAll(/\btype ([A-Za-z_$][\w$]*)/g)].map((m) => m[1]).sort()
    expect(names).toEqual([
      'AppContext', 'BridgeApp', 'BridgeHostRouting', 'FgRuntime', 'HostPages', 'HostPagesOptions',
      'LoadRemoteOptions', 'LoadShareOptions',
      'PageRouteLike', 'PageViolation', 'PagesOptions', 'PreloadRemoteOptions',
      'RemoteComponentOptions', 'RemoteConfig', 'RemoteDebugInfo',
      'RemoteSchema', 'RemoteSchemaEntry', 'RemoteSetupContext', 'RemoteSetupModule',
      'ResolvedHostPage', 'RuntimeHooks', 'RuntimePlugin',
      'ShareEntry', 'ShareScope', 'ShareScopeMap', 'VueBridgeAppFactory', 'VueBridgeAppOptions',
      'VueBridgeRouterConnection',
    ].sort())
  })

  it('package.json 导出 /vue 与桥接 internals；/vue 浏览器 ESM 不承诺 require', () => {
    const pkg = JSON.parse(readFileSync(join(PKG, 'package.json'), 'utf8'))
    expect(pkg.exports['./vue'].import).toBe('./dist/vue.js')
    expect(pkg.exports['./vue'].types).toBe('./dist/vue.d.ts')
    expect(pkg.exports['./vue'].require).toBeUndefined()
    expect(pkg.exports['./internal/bridge-router-vue.js'].import).toBe('./dist/bridge-router-vue.js')
    expect(pkg.exports['./internal/bridge-router-react.js'].import).toBe('./dist/bridge-router-react.js')
    expect(pkg.typesVersions['*'].vue).toEqual(['dist/vue.d.ts'])
  })
})

describe('dts 生成路径规则（skipLibCheck 静默失败回归）', () => {
  it('非 .vue 源码 re-export 去掉 .ts 扩展名（默认禁 allowImportingTsExtensions）', async () => {
    const { sourceImportPath, stripTsExtension } = await import('../src/dts')
    expect(stripTsExtension(sourceImportPath('../remote/src/SharedState.ts'))).toBe('../remote/src/SharedState')
    expect(stripTsExtension(sourceImportPath('src/x.ts'))).toBe('./src/x')
    expect(sourceImportPath('../remote/src/Button.vue')).toBe('../remote/src/Button.vue')
  })
})

describe('extractTsExportNames（环境模块显式重导出）', () => {
  it('枚举 const/function/interface/type 与 export {} 形式，忽略 default', async () => {
    const { extractTsExportNames } = await import('../src/dts')
    const text = [
      `import { ref } from 'vue'`,
      `export const sharedCount = ref(0)`,
      `export function helper() {}`,
      `export interface Props { a: number }`,
      `export type Maybe<T> = T | null`,
      `const hidden = 1`,
      `export { hidden as shown, default } from './other'`,
    ].join('\n')
    const names = extractTsExportNames(text)
    for (const name of ['sharedCount', 'helper', 'Props', 'Maybe', 'shown']) {
      expect(names).toContain(name)
    }
    expect(names).not.toContain('default')
    expect(names).not.toContain('hidden')
  })
})

describe('dts 默认目录收敛到根目录点文件夹（src 零污染）', () => {
  it('默认 .fulgurjs/types；dts.dir 可覆盖；dts:false 不生成', async () => {
    const { resolveDtsDir } = await import('../src/dts')
    expect(resolveDtsDir(undefined, true)).toBe('src/fulgurjs/types')
    expect(resolveDtsDir(true, true)).toBe('src/fulgurjs/types')
    expect(resolveDtsDir(undefined, false)).toBe('.fulgurjs/types')
    expect(resolveDtsDir(true, false)).toBe('.fulgurjs/types')
    expect(resolveDtsDir({ dir: 'types/federation' })).toBe('types/federation')
    expect(resolveDtsDir(false)).toBe('')
  })
})

describe('包根类型面（模板 fulgurjs.config.ts 依赖）', () => {
  it('包根导出 FederationOptions 与 PageRouteLike（配置文件按四入口合同从包根取类型；缺 TS2614）', () => {
    const text = readFileSync(join(PKG, 'dist/index.d.ts'), 'utf8')
    expect(text).toContain('FederationOptions')
    expect(text).toContain('PageRouteLike')
  })
})
