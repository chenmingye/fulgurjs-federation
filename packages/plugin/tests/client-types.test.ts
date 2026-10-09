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
      'AppContext', 'FgRuntime',
      'LoadRemoteOptions', 'LoadShareOptions',
      'PageRouteLike', 'PageViolation', 'PagesOptions', 'PreloadRemoteOptions',
      'RemoteConfig', 'RemoteDebugInfo',
      'RemoteSchema', 'RemoteSchemaEntry', 'RemoteSetupContext', 'RemoteSetupModule',
      'RuntimeHooks', 'RuntimePlugin',
      'ShareEntry', 'ShareScope', 'ShareScopeMap',
    ].sort())
    // 注册表三类型经包内共享子路径再导出（独立 export-from 语句；见 types/registry.d.ts）
    expect(text).toContain("export { FgRemoteModule, FgRemoteTypes, FgStaticEntry } from '@fulgurjs/federation/internal/registry.js'")
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
      'AppContext', 'BridgeApp', 'BridgeErrorFallback', 'BridgeHostRouting',
      'FgBridgeAppProps', 'FgBridgeEntry', 'FgBridgePropsOf', 'FgComponentEntry',
      'FgReactRemoteProps', 'FgRuntime',
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
    expect(text).toContain("export { FgRemoteModule, FgRemoteTypes, FgStaticEntry } from '@fulgurjs/federation/internal/registry.js'")
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
      'AppContext', 'BridgeApp', 'BridgeHostRouting',
      'FgBridgeAppProps', 'FgBridgeEntry', 'FgBridgePropsOf', 'FgComponentEntry',
      'FgRemoteVueComponent', 'FgRuntime', 'FgVueBridgeWrapper',
      'HostPages', 'HostPagesOptions',
      'LoadRemoteOptions', 'LoadShareOptions',
      'PageRouteLike', 'PageViolation', 'PagesOptions', 'PreloadRemoteOptions',
      'RemoteComponentOptions', 'RemoteConfig', 'RemoteDebugInfo',
      'RemoteSchema', 'RemoteSchemaEntry', 'RemoteSetupContext', 'RemoteSetupModule',
      'ResolvedHostPage', 'RuntimeHooks', 'RuntimePlugin',
      'ShareEntry', 'ShareScope', 'ShareScopeMap', 'VueBridgeAppFactory', 'VueBridgeAppOptions',
      'VueBridgeRouterConnection',
    ].sort())
    // 注册表三类型经包内共享子路径再导出（与 /runtime、/react 同一声明）
    expect(text).toContain("export { FgRemoteModule, FgRemoteTypes, FgStaticEntry } from '@fulgurjs/federation/internal/registry.js'")
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


describe('包根类型面（模板 fulgurjs.config.ts 依赖）', () => {
  it('包根导出 FederationOptions 与 PageRouteLike（配置文件按四入口合同从包根取类型；缺 TS2614）', () => {
    const text = readFileSync(join(PKG, 'dist/index.d.ts'), 'utf8')
    expect(text).toContain('FederationOptions')
    expect(text).toContain('PageRouteLike')
  })
})
