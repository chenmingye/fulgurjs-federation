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
      'definePages', 'validatePages', 'remoteComponent', 'createHostPages', 'remoteSchema',
    ].sort())
    expect(mod.remoteSchema).toEqual({})
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
      expect(fs.readFileSync(file, 'utf8'), file).not.toContain('function createRuntime(')
    }
    expect(fs.readFileSync(path.join(dist, 'vue.js'), 'utf8')).toContain('from "./runtime.js"')
  })
})
