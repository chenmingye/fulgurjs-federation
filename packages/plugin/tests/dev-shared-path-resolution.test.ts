import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { createServer } from 'vite'
import { federation } from '../src/index'

const cleanups: Array<() => void | Promise<void>> = []
afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup()
  cleanups.length = 0
  vi.restoreAllMocks()
})

for (const role of ['consumer-default', 'consumer-disabled', 'provider-default', 'provider-enabled'] as const) {
  it(`共享路径探测不提前启动依赖优化：${role}`, async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fulgurjs-path-resolution-'))
    cleanups.push(() => fs.rmSync(root, { recursive: true, force: true }))
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'path-probe', type: 'module' }))
    const provider = role.startsWith('provider')
    const plugins = federation({
      name: 'path-probe', dts: false,
      ...(provider ? { exposes: { './Probe': './Probe.vue' } } : { remotes: { peer: 'http://127.0.0.1:1' } }),
      ...(role.endsWith('disabled') ? { devSharedSelf: false } : role.endsWith('enabled') ? { devSharedSelf: true } : {}),
      shared: { vue: { singleton: true } },
    })
    const core = plugins.find(plugin => plugin.name === 'fulgurjs:core')!
    const original = core.configureServer
    if (typeof original !== 'function') throw new Error('缺少真实configureServer钩子')
    const resolutions: Array<{ source: string; scan: boolean }> = []
    core.configureServer = function (server) {
      const container = new Proxy(server.pluginContainer, {
        get(target, key, receiver) {
          if (key !== 'resolveId') return Reflect.get(target, key, receiver)
          return (...args: Parameters<typeof target.resolveId>) => {
            resolutions.push({ source: args[0], scan: !!args[2] && Reflect.get(args[2], 'scan') === true })
            return Promise.resolve({ id: path.join(root, 'node_modules/vue/index.js') })
          }
        },
      })
      return original.call(this, new Proxy(server, {
        get(target, key, receiver) {
          return key === 'pluginContainer' ? container : Reflect.get(target, key, receiver)
        },
      }))
    }
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const server = await createServer({
      root, configFile: false, logLevel: 'silent', plugins,
      server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true },
    })
    cleanups.push(() => server.close())
    await Promise.resolve()
    // 普通resolveId可向Vite登记“新依赖”；这里只需解析路径，不能改变预构建批次。
    expect(resolutions.filter(call => !call.scan)).toEqual([])
    if (provider) expect(resolutions).toEqual([{ source: 'vue', scan: true }])
    else expect(resolutions).toEqual([])
  })
}
