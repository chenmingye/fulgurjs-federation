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

  it('多远程宿主（5.4.2 回归）：标志同步先设 + 动态 import 容错，错源远程不阻塞 preamble', async () => {
    const server = await createServer({
      configFile: false,
      root: path.resolve(import.meta.dirname, '../../../fixtures/host-bridge-vue'),
      // 首个远程是 Vue 远程（6199，无 /@react-refresh），第二个才是 React 远程（6299）
      plugins: [federation({
        name: 'preamble-multi-remote-test',
        remotes: { 'vue-remote': { dev: 'http://localhost:6199' }, 'react-remote': { dev: 'http://localhost:6299' } },
        shared: { vue: { singleton: true }, react: { singleton: true }, 'react-dom': { singleton: true } },
      })],
      server: { middlewareMode: true },
      optimizeDeps: { noDiscovery: true },
    })
    try {
      const html = await server.transformIndexHtml('/', '<!doctype html><html><head></head><body></body></html>')
      // 标志与注册器必须是同步语句（不依赖任何 import 的求值结果）
      const flagIdx = html.indexOf('window.__vite_plugin_react_preamble_installed__ = true')
      expect(flagIdx).toBeGreaterThan(-1)
      const scriptStart = html.lastIndexOf('<script', flagIdx)
      const scriptSlice = html.slice(scriptStart, flagIdx)
      expect(scriptSlice).not.toMatch(/\bimport\s+\*\s+as\s/)
      // 5.5.2：多 http 远程时不再跨源导入（origin 无歧义才导入）——猜错虽被 catch，
      // 浏览器仍记录 404 网络噪声；同步标志已保证 preamble 硬检查，真实实例由
      // React 远程自带 origin 的 shim 自举兜底。断言：多远程下零跨源 import、零 404 面。
      expect(html).not.toContain('/@react-refresh')
      expect(html).not.toContain('http://localhost:6199')
      expect(html).not.toContain('http://localhost:6299')
    } finally { await server.close() }
  })

  it('单一 http 远程宿主（5.5.2 回归）：origin 无歧义，跨源动态导入保留', async () => {
    const server = await createServer({
      configFile: false,
      root: path.resolve(import.meta.dirname, '../../../fixtures/host-bridge-vue'),
      plugins: [federation({
        name: 'preamble-single-remote-test',
        remotes: { 'react-remote': { dev: 'http://localhost:6299' } },
        shared: { vue: { singleton: true }, react: { singleton: true }, 'react-dom': { singleton: true } },
      })],
      server: { middlewareMode: true },
      optimizeDeps: { noDiscovery: true },
    })
    try {
      const html = await server.transformIndexHtml('/', '<!doctype html><html><head></head><body></body></html>')
      expect(html).toContain('window.__vite_plugin_react_preamble_installed__ = true')
      expect(html).toContain('await import("http://localhost:6299/@react-refresh")')
      expect(html).toMatch(/\}\s*catch\s*\{\s*\}\s*\}\)\(\);/)
    } finally { await server.close() }
  })
})
