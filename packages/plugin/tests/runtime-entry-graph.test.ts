import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { init, parse } from 'es-module-lexer'
import { describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '..')
const dist = path.join(root, 'dist')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))

describe('/runtime 发布物', () => {
  it('JS 值导出面与批准清单相同', async () => {
    const entry = path.join(root, pkg.exports['./runtime'].import)
    const mod = await import(pathToFileURL(entry).href)
    expect(Object.keys(mod).sort()).toEqual([
      'initSharing', 'registerShare', 'registerRemotes', 'registerRemote', 'registerPlugins',
      'loadShare', 'loadRemote', 'getContainer', 'preloadRemote', 'parseSpec',
      'getRuntime', 'shareScopeMap', 'unwrapDefault', 'version',
      'provideAppContext', 'getAppContext', 'requireAppContext', 'clearAppContext',
      'clearSessionState',
      'definePages', 'validatePages', 'remoteComponent', 'createHostPages', 'defineBridgeApp', 'remoteSchema',
    ].sort())
    expect(mod.remoteSchema).toEqual({})
    expect(typeof mod.defineBridgeApp).toBe('function')
  })

  it('静态 ESM 图只引用一份 runtime 内核', async () => {
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
    walk(path.join(root, pkg.exports['./runtime'].import))
    expect([...visited].filter((file) => file === path.join(dist, 'runtime.js'))).toHaveLength(1)
    for (const file of visited) {
      if (file.endsWith('/runtime.js')) continue
      expect(fs.readFileSync(file, 'utf-8'), file).not.toContain('function createRuntime(')
    }
    expect(fs.readFileSync(path.join(dist, 'vue.js'), 'utf-8')).toContain('from "./runtime.js"')
  })
})

describe('/react 发布物', () => {
  it('JS 值导出面与批准清单相同', async () => {
    const entry = path.join(root, pkg.exports['./react'].import)
    const mod = await import(pathToFileURL(entry).href)
    expect(Object.keys(mod).sort()).toEqual([
      'initSharing', 'registerShare', 'registerRemotes', 'registerRemote', 'registerPlugins',
      'loadShare', 'loadRemote', 'getContainer', 'preloadRemote', 'parseSpec',
      'getRuntime', 'shareScopeMap', 'unwrapDefault', 'version',
      'provideAppContext', 'getAppContext', 'requireAppContext', 'clearAppContext',
      'definePages', 'validatePages', 'remoteComponent', 'useLoadRemote',
      'RemoteErrorBoundary', 'createReactHostPages', 'defineBridgeApp', 'remoteSchema',
    ].sort())
    expect(mod.remoteSchema).toEqual({})
    expect(typeof mod.remoteComponent).toBe('function')
    expect(typeof mod.useLoadRemote).toBe('function')
    expect(typeof mod.RemoteErrorBoundary).toBe('function')
    expect(typeof mod.defineBridgeApp).toBe('function')
  })

  it('静态 ESM 图只引用一份 runtime 内核，且不出现 Vue', async () => {
    await init
    const visited = new Set<string>()
    const walk = (file: string) => {
      if (visited.has(file)) return
      visited.add(file)
      const source = fs.readFileSync(file, 'utf-8')
      const [imports] = parse(source)
      for (const item of imports) {
        if (item.d !== -1 || !item.n?.startsWith('.')) continue
        walk(path.resolve(path.dirname(file), item.n))
      }
    }
    walk(path.join(root, pkg.exports['./react'].import))
    expect([...visited].filter((file) => file === path.join(dist, 'runtime.js'))).toHaveLength(1)
    for (const file of visited) {
      if (file.endsWith('/runtime.js')) continue
      expect(fs.readFileSync(file, 'utf-8'), file).not.toContain('function createRuntime(')
      // React 入口的传递图不得引用 Vue（纯 React 消费者不应解析 Vue）
      expect(fs.readFileSync(file, 'utf-8'), file).not.toMatch(/from\s+["']vue["']/)
    }
    expect(fs.readFileSync(path.join(dist, 'react.js'), 'utf-8')).toContain('from "./runtime.js"')
  })

  it('/runtime 静态图不出现 React（纯 Vue 消费者不应解析 React）', async () => {
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
    walk(path.join(root, pkg.exports['./runtime'].import))
    for (const file of visited) {
      expect(fs.readFileSync(file, 'utf8'), file).not.toMatch(/from\s+["']react["']/)
      expect(fs.readFileSync(file, 'utf8'), file).not.toMatch(/from\s+["']react-dom["']/)
    }
  })
})

describe('/bridge 发布物（任务书 §3.1/BR12）', () => {
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

  it('三个入口都只引用一份 runtime 内核', async () => {
    for (const key of ['./bridge', './bridge/vue', './bridge/react']) {
      const visited = await walkGraph(path.join(root, pkg.exports[key].import))
      expect([...visited].filter((file) => file === path.join(dist, 'runtime.js')), key).toHaveLength(1)
      for (const file of visited) {
        if (file.endsWith('/runtime.js')) continue
        expect(fs.readFileSync(file, 'utf-8'), file).not.toContain('function createRuntime(')
      }
    }
  })

  it('/bridge/vue 静态图零 React；/bridge/react 静态图零 Vue（BR12）', async () => {
    const vueGraph = await walkGraph(path.join(root, pkg.exports['./bridge/vue'].import))
    for (const file of vueGraph) {
      const source = fs.readFileSync(file, 'utf-8')
      expect(source, `${file} 引用了 React`).not.toMatch(/from\s+["']react/)
      expect(source, `${file} 引用了 react-dom`).not.toMatch(/from\s+["']react-dom/)
    }
    const reactGraph = await walkGraph(path.join(root, pkg.exports['./bridge/react'].import))
    for (const file of reactGraph) {
      const source = fs.readFileSync(file, 'utf-8')
      expect(source, `${file} 引用了 Vue`).not.toMatch(/from\s+["']vue["']/)
    }
    // 聚合入口两个适配器都携带（加载代价由 README 说明，推荐分离入口）
    const aggSource = fs.readFileSync(path.join(dist, 'bridge.js'), 'utf-8')
    expect(aggSource).toContain('bridge-host-vue.js')
    expect(aggSource).toContain('bridge-host-react.js')
  })

  it('react 子应用桥接适配不静态引入 react-dom/client（mount 时动态取得，BR01）', async () => {
    const source = fs.readFileSync(path.join(dist, 'bridge-app-react.js'), 'utf-8')
    expect(source).toMatch(/import\(\s*["']react-dom\/client["']\s*\)/)
    expect(source, 'bridge-app-react 不得静态 import react-dom/client').not.toMatch(/from\s+["']react-dom\/client["']/)
  })
})
