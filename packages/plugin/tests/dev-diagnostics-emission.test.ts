import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { afterEach, expect, it, vi } from 'vitest'
import { createServer } from 'vite'
import { federation } from '../src/index'
import { normalizeOptions } from '../src/options'
import { probeRemotesAndBuildSchema } from '../src/remote-schema'

const cleanup: Array<() => void | Promise<void>> = []
afterEach(async () => {
  for (const stop of cleanup.reverse()) await stop()
  cleanup.length = 0
  vi.restoreAllMocks()
})
function project(dependencies: Record<string, string> = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fulgurjs-dev-diagnostic-'))
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'diagnostic-host', dependencies }))
  cleanup.push(() => fs.rmSync(root, { recursive: true, force: true }))
  return root
}
async function remote(status: number, body: object) {
  const server = http.createServer((_req, response) => {
    response.writeHead(status, { 'content-type': 'application/json' })
    response.end(JSON.stringify(body))
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  cleanup.push(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())))
  const port = (server.address() as { port: number }).port
  return { server, port, url: `http://127.0.0.1:${port}/remote` }
}
it('DEV-001：端口在监听但manifest HTTP503，输出具体状态而不误报端口关闭', async () => {
  const peer = await remote(503, {})
  const warnings = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const result = await probeRemotesAndBuildSchema(normalizeOptions({ name: 'host', remotes: { peer: peer.url } }, project(), 'serve'))
  const text = warnings.mock.calls.flat().join('\n')
  expect(result.peer.exists).toBe(false)
  expect(text).toContain('DEV-001')
  expect(text).toContain('HTTP 503')
  expect(text).not.toContain('DEV-005')
  expect(text).toContain('修法')
})
it('DEV-002：实际HTTP200返回不支持的manifest协议，明确拒绝结构', async () => {
  const peer = await remote(200, { schemaVersion: 999, name: 'peer' })
  const warnings = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const result = await probeRemotesAndBuildSchema(normalizeOptions({ name: 'host', remotes: { peer: peer.url } }, project(), 'serve'))
  expect(result.peer.exists).toBe(false)
  expect(warnings.mock.calls.flat().join('\n')).toContain('DEV-002')
})
it('DEV-005：真实无监听端口与manifest不可达分别报告', async () => {
  const probe = http.createServer()
  await new Promise<void>(resolve => probe.listen(0, '127.0.0.1', resolve))
  const port = (probe.address() as { port: number }).port
  await new Promise<void>(resolve => probe.close(() => resolve()))
  const warnings = vi.spyOn(console, 'warn').mockImplementation(() => {})
  await probeRemotesAndBuildSchema(normalizeOptions({ name: 'host', remotes: { peer: `http://127.0.0.1:${port}/remote` } }, project(), 'serve'))
  const text = warnings.mock.calls.flat().join('\n')
  expect(text).toContain('DEV-001')
  expect(text).toContain('DEV-005')
  expect(text).toContain(String(port))
})
it('DEV-004/010/011：实际Vite配置触发依赖与开发暴露诊断，loopback对照不误报', async () => {
  const peer = await remote(200, { schemaVersion: 1, name: 'peer', entry: '@fulgurjs-entry.js', exposes: {} })
  const warnings = vi.spyOn(console, 'warn').mockImplementation(() => {})
  for (const [host, deps] of [['0.0.0.0', { '@smallwei/avue': '^3.0.0' }], ['127.0.0.1', {}]] as const) {
    warnings.mockClear()
    const server = await createServer({
      root: project(deps), configFile: false, logLevel: 'silent',
      server: { host, middlewareMode: true, hmr: false },
      optimizeDeps: { noDiscovery: true },
      plugins: [federation({ name: 'host', dts: false, remotes: { peer: peer.url }, shared: {} })],
    })
    try {
      const text = warnings.mock.calls.flat().join('\n')
      expect(text).toContain('DEV-010')
      if (host === '0.0.0.0') {
        expect(text).toContain('DEV-004')
        expect(text).toContain('DEV-011')
        expect(text).toContain('optimizeDeps.include')
      } else {
        expect(text).not.toContain('DEV-004')
        expect(text).not.toContain('DEV-011')
      }
    } finally { await server.close() }
  }
})
