import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { init, parse } from 'es-module-lexer'
import { describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '..')
const dist = path.join(root, 'dist')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))

/** 收集一个 dist 入口的静态 ESM 相对导入闭包 */
async function walkGraph(entryFile: string): Promise<Set<string>> {
  await init
  const visited = new Set<string>()
  const walk = (file: string) => {
    if (visited.has(file)) return
    visited.add(file)
    const source = fs.readFileSync(file, 'utf8')
    const [imports] = parse(source)
    for (const item of imports) {
      if (item.d !== -1 || !item.n?.startsWith('.')) continue
      walk(path.resolve(path.dirname(file), item.n))
    }
  }
  walk(entryFile)
  return visited
}

describe('/runtime 发布物（6.0.0：真正框架无关）', () => {
  it('JS 值导出面与批准清单相同（零 Vue/React 适配导出）', async () => {
    const entry = path.join(root, pkg.exports['./runtime'].import)
    const mod = await import(pathToFileURL(entry).href)
    expect(Object.keys(mod).sort()).toEqual([
      'initSharing', 'registerShare', registerRemotesKey(), 'registerRemote', 'registerPlugins',
      'loadShare', 'loadRemote', 'getLoadedShare', 'pinLoadedShare', 'getContainer',
      'preloadRemote', 'parseSpec', 'getRuntime', 'shareScopeMap', 'unwrapDefault', 'version',
      'clearSessionState',
      'provideAppContext', 'getAppContext', 'requireAppContext', 'clearAppContext',
      'definePages', 'validatePages', 'remoteSchema',
    ].sort())
    expect(mod.remoteSchema).toEqual({})
  })

  it('静态 ESM 图只引用一份 runtime 内核，且零 Vue / 零 React / 零框架 router', async () => {
    const visited = await walkGraph(path.join(root, pkg.exports['./runtime'].import))
    expect([...visited].filter((file) => file === path.join(dist, 'runtime.js'))).toHaveLength(1)
    for (const file of visited) {
      if (file.endsWith('/runtime.js')) continue
      expect(fs.readFileSync(file, 'utf-8'), file).not.toContain('function createRuntime(')
      // /runtime 静态图不得引用任何框架或框架 router（纯 JS/TS 消费者不应解析它们）
      expect(fs.readFileSync(file, 'utf-8'), file).not.toMatch(/from\s+["']vue["']/)
      expect(fs.readFileSync(file, 'utf-8'), file).not.toMatch(/from\s+["']react["']/)
      expect(fs.readFileSync(file, 'utf-8'), file).not.toMatch(/from\s+["']react-dom["']/)
      expect(fs.readFileSync(file, 'utf-8'), file).not.toMatch(/from\s+["']vue-router["']/)
      expect(fs.readFileSync(file, 'utf-8'), file).not.toMatch(/from\s+["']react-router-dom["']/)
    }
  })
})

describe('/vue 发布物（6.0.0 统一入口）', () => {
  it('JS 值导出面与批准清单相同（运行时 + Vue 适配 + 桥接 + 路由同步）', async () => {
    const entry = path.join(root, pkg.exports['./vue'].import)
    const mod = await import(pathToFileURL(entry).href)
    expect(Object.keys(mod).sort()).toEqual([
      'initSharing', 'registerShare', registerRemotesKey(), 'registerRemote', 'registerPlugins',
      'loadShare', 'loadRemote', 'getLoadedShare', 'pinLoadedShare', 'getContainer',
      'preloadRemote', 'parseSpec', 'getRuntime', 'shareScopeMap', 'unwrapDefault', 'version',
      'clearSessionState',
      'provideAppContext', 'getAppContext', 'requireAppContext', 'clearAppContext',
      'definePages', 'validatePages',
      'remoteComponent', 'createHostPages', 'defineBridgeApp', 'remoteSchema',
      'createVueBridgeApp', 'createVueBridgeNavigation', 'connectVueBridgeRouter',
    ].sort())
    expect(mod.remoteSchema).toEqual({})
    expect(typeof mod.remoteComponent).toBe('function')
    expect(typeof mod.createHostPages).toBe('function')
    expect(typeof mod.defineBridgeApp).toBe('function')
    expect(typeof mod.createVueBridgeApp).toBe('function')
    expect(typeof mod.createVueBridgeNavigation).toBe('function')
    expect(typeof mod.connectVueBridgeRouter).toBe('function')
  })

  it('静态图只引用一份 runtime 内核、零 React；bridge-router-vue 不做 vue-router 值导入', async () => {
    const visited = await walkGraph(path.join(root, pkg.exports['./vue'].import))
    expect([...visited].filter((file) => file === path.join(dist, 'runtime.js'))).toHaveLength(1)
    for (const file of visited) {
      if (file.endsWith('/runtime.js')) continue
      expect(fs.readFileSync(file, 'utf-8'), file).not.toContain('function createRuntime(')
      // /vue 统一入口不得把 React 拉进 Vue 应用的模块图（BR12 延续）
      expect(fs.readFileSync(file, 'utf-8'), file).not.toMatch(/from\s+["']react/)
      expect(fs.readFileSync(file, 'utf-8'), file).not.toMatch(/from\s+["']react-dom/)
      // 可选依赖边界：bridge-router-vue 仅类型导入 vue-router——静态图不得出现值导入
      expect(fs.readFileSync(file, 'utf-8'), file).not.toMatch(/import\s+\{[^}]*\}\s+from\s+["']vue-router["']/)
    }
  })
})

describe('/react 发布物（6.0.0 统一入口）', () => {
  it('JS 值导出面与批准清单相同（运行时 + React 适配 + 桥接 + 路由同步）', async () => {
    const entry = path.join(root, pkg.exports['./react'].import)
    const mod = await import(pathToFileURL(entry).href)
    expect(Object.keys(mod).sort()).toEqual([
      'initSharing', 'registerShare', registerRemotesKey(), 'registerRemote', 'registerPlugins',
      'loadShare', 'loadRemote', 'getLoadedShare', 'pinLoadedShare', 'getContainer',
      'preloadRemote', 'parseSpec', 'getRuntime', 'shareScopeMap', 'unwrapDefault', 'version',
      'clearSessionState',
      'provideAppContext', 'getAppContext', 'requireAppContext', 'clearAppContext',
      'definePages', 'validatePages', 'remoteComponent', 'useLoadRemote',
      'RemoteErrorBoundary', 'createReactHostPages', 'defineBridgeApp', 'remoteSchema',
      'createReactBridgeApp', 'createReactBridgeNavigation', 'createReactBridgeRouter',
    ].sort())
    expect(mod.remoteSchema).toEqual({})
    expect(typeof mod.remoteComponent).toBe('function')
    expect(typeof mod.useLoadRemote).toBe('function')
    expect(typeof mod.RemoteErrorBoundary).toBe('function')
    expect(typeof mod.defineBridgeApp).toBe('function')
    expect(typeof mod.createReactBridgeApp).toBe('function')
    expect(typeof mod.createReactBridgeNavigation).toBe('function')
    expect(typeof mod.createReactBridgeRouter).toBe('function')
  })

  it('静态图只引用一份 runtime 内核、零 Vue；react-router-dom 不做静态值导入（模块级按需预热）', async () => {
    const visited = await walkGraph(path.join(root, pkg.exports['./react'].import))
    expect([...visited].filter((file) => file === path.join(dist, 'runtime.js'))).toHaveLength(1)
    for (const file of visited) {
      if (file.endsWith('/runtime.js')) continue
      expect(fs.readFileSync(file, 'utf-8'), file).not.toContain('function createRuntime(')
      // React 入口的传递图不得引用 Vue（纯 React 消费者不应解析 Vue）
      expect(fs.readFileSync(file, 'utf-8'), file).not.toMatch(/from\s+["']vue["']/)
      // 可选依赖边界：react-router-dom 只允许动态 import（模块级预热），不得静态值导入
      expect(fs.readFileSync(file, 'utf-8'), file).not.toMatch(/import\s+\{[^}]*\}\s+from\s+["']react-router-dom["']/)
    }
    expect(
      fs.readFileSync(path.join(dist, 'bridge-router-react.js'), 'utf-8'),
    ).toMatch(/import\(\s*["']react-router-dom["']\s*\)/)
  })

  it('react 子应用桥接适配不静态引入 react-dom/client（mount 时动态取得，BR01）', async () => {
    const source = fs.readFileSync(path.join(dist, 'bridge-app-react.js'), 'utf-8')
    expect(source).toMatch(/import\(\s*["']react-dom\/client["']\s*\)/)
    expect(source, 'bridge-app-react 不得静态 import react-dom/client').not.toMatch(/from\s+["']react-dom\/client["']/)
  })
})

function registerRemotesKey(): string {
  return 'registerRemotes'
}
