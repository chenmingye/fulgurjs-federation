/** Vite 5/plugin-react 4 的远程模块检查 preamble 标志，Vue 宿主必须提供。 */
import { describe, expect, it } from 'vitest'
import { createServer } from 'vite'
import path from 'node:path'
import { federation } from '../src/index'

describe('跨框架 React refresh preamble', () => {
  it.each([true, false])('shared 消费 React=%s：注入标志与 runtime，纯 Vue 不注入', async (react) => {
    const server = await createServer({
      configFile: false,
      root: path.resolve(import.meta.dirname, '../../../fixtures/host-bridge-vue'),
      plugins: [federation({ name: 'preamble-test', remotes: { remote: { dev: 'http://localhost:6199' } }, shared: react ? { react: { singleton: true } } : { vue: { singleton: true } } })],
      server: { middlewareMode: true },
      optimizeDeps: { noDiscovery: true },
    })
    try {
      const html = await server.transformIndexHtml('/', '<!doctype html><html><head></head><body></body></html>')
      if (react) {
        expect(html).toContain('window.__vite_plugin_react_preamble_installed__ = true')
        expect(html).toContain('http://localhost:6199/@react-refresh')
        expect(html).toContain('window.$RefreshReg$')
      } else {
        expect(html).not.toContain('preamble_installed')
        expect(html).not.toContain('/@react-refresh')
      }
    } finally { await server.close() }
  })
})
