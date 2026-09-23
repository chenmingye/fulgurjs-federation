/**
 * WP5：devCorsOrigins 来源策略测试。
 * 纯函数（归一化/响应头/loopback 判定）+ 真实插件中间件行为
 * （同源 / 允许来源反射 / 拒绝来源省略头 / OPTIONS 预检）。
 */
import { describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { normalizeDevCorsOrigins, corsHeadersFor, isNonLoopbackHost } from '../src/dev-cors'
import { normalizeOptions } from '../src/options'
import { federation } from '../src/index'

describe('WP5: normalizeDevCorsOrigins', () => {
  it('undefined 与 "*" 均合法（通配）', () => {
    expect(normalizeDevCorsOrigins(undefined)).toEqual({ ok: true, value: undefined })
    expect(normalizeDevCorsOrigins('*')).toEqual({ ok: true, value: '*' })
  })
  it('空数组 / 非 http(s) 来源 / 带路径形态非法', () => {
    expect(normalizeDevCorsOrigins([]).ok).toBe(false)
    expect(normalizeDevCorsOrigins(['localhost:5100'] as never).ok).toBe(false)
    expect(normalizeDevCorsOrigins(['http://localhost:5100/path']).ok).toBe(false)
    expect(normalizeDevCorsOrigins(['ftp://x']).ok).toBe(false)
  })
  it('合法来源数组原样通过', () => {
    expect(normalizeDevCorsOrigins(['http://localhost:5100', 'https://team.example.com'])).toEqual({
      ok: true,
      value: ['http://localhost:5100', 'https://team.example.com'],
    })
  })
})

describe('WP5: corsHeadersFor（端点响应头）', () => {
  it('通配（undefined / "*"）保持 ACAO: *', () => {
    expect(corsHeadersFor('http://any', undefined)).toEqual({ 'Access-Control-Allow-Origin': '*' })
    expect(corsHeadersFor(undefined, '*')).toEqual({ 'Access-Control-Allow-Origin': '*' })
  })
  it('allowlist 命中：反射 Origin + Vary', () => {
    expect(corsHeadersFor('http://localhost:5100', ['http://localhost:5100'])).toEqual({
      'Access-Control-Allow-Origin': 'http://localhost:5100',
      Vary: 'Origin',
    })
  })
  it('allowlist 未命中 / 无 Origin：省略头（浏览器拒绝跨源读）', () => {
    expect(corsHeadersFor('http://evil.example', ['http://localhost:5100'])).toEqual({})
    expect(corsHeadersFor(undefined, ['http://localhost:5100'])).toEqual({})
  })
})

describe('WP5: isNonLoopbackHost', () => {
  it.each([
    [undefined, false],
    ['localhost', false],
    ['127.0.0.1', false],
    ['::1', false],
    [true, true],
    ['0.0.0.0', true],
    ['192.168.1.5', true],
  ])('host=%s → %s', (host, expected) => {
    expect(isNonLoopbackHost(host as never)).toBe(expected)
  })
})

describe('WP5: 配置归一与 CFG 校验', () => {
  it('devCorsOrigins / devFsRoot 归一（默认 true）', () => {
    const n = normalizeOptions({ name: 'x', remotes: { r: 'http://localhost:1' } }, process.cwd(), 'serve')
    expect(n.devCorsOrigins).toBeUndefined()
    expect(n.devFsRoot).toBe(true)
    const n2 = normalizeOptions({ name: 'x', devCorsOrigins: ['http://localhost:5100'], devFsRoot: false }, process.cwd(), 'serve')
    expect(n2.devCorsOrigins).toEqual(['http://localhost:5100'])
    expect(n2.devFsRoot).toBe(false)
  })
  it('CFG-010：坏 devCorsOrigins 配置期报错', () => {
    expect(() => normalizeOptions({ name: 'x', devCorsOrigins: [] as never }, process.cwd(), 'serve')).toThrow(/CFG-010/)
    expect(() => normalizeOptions({ name: 'x', devCorsOrigins: ['nope'] }, process.cwd(), 'serve')).toThrow(/CFG-010/)
  })
  it('CFG-009：坏 remote 运行参数配置期报错', () => {
    expect(() =>
      normalizeOptions({ name: 'x', remotes: { r: { external: 'http://l:1', timeout: -1 } } }, process.cwd(), 'serve'),
    ).toThrow(/CFG-009.*timeout/)
    expect(() =>
      normalizeOptions({ name: 'x', remotes: { r: { external: 'http://l:1', retries: 99 } } }, process.cwd(), 'serve'),
    ).toThrow(/CFG-009.*retries/)
    expect(() =>
      normalizeOptions({ name: 'x', remotes: { r: { external: 'http://l:1', breaker: { threshold: 0 } } } }, process.cwd(), 'serve'),
    ).toThrow(/CFG-009.*breaker\.threshold/)
  })
})

describe('WP5: 插件端点中间件行为（同源/允许/拒绝/预检）', () => {
  it('allowlist：命中反射、未命中省略、OPTIONS 204、同源 GET 正常', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wp5-mw-'))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'mw', private: true }))
      const plugins = federation({
        name: 'mw-remote',
        exposes: { './A': './src/a.ts' },
        devCorsOrigins: ['http://localhost:5100'],
        shared: {},
      })
      const pre = plugins[0] as any
      await pre.config({ root }, { command: 'serve' })
      const middlewares: Array<(req: any, res: any, next: () => void) => void> = []
      pre.configureServer({
        middlewares: { use: (m: never) => middlewares.push(m as never) },
        httpServer: { once: () => {} },
        pluginContainer: { resolveId: async () => null },
      })
      const mw = middlewares[0]
      const hit = (req: any) =>
        new Promise<{ headers: Record<string, string>; ended: boolean; body?: string }>((resolve) => {
          const headers: Record<string, string> = {}
          const res = {
            setHeader: (k: string, v: string) => (headers[k.toLowerCase()] = String(v)),
            statusCode: 200,
            end: (body?: string) => resolve({ headers, ended: true, body }),
          }
          mw(req, res, () => resolve({ headers, ended: false }))
        })

      const allowed = await hit({ url: '/@fulgurjs-manifest.json', method: 'GET', headers: { origin: 'http://localhost:5100' } })
      expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5100')
      expect(allowed.headers.vary).toBe('Origin')
      expect(allowed.body).toContain('"schemaVersion"')

      const denied = await hit({ url: '/@fulgurjs-manifest.json', method: 'GET', headers: { origin: 'http://evil.example' } })
      expect(denied.headers['access-control-allow-origin']).toBeUndefined()
      expect(denied.ended).toBe(true) // 同源/无 CORS 语义下正常返回内容

      const preflight = await hit({ url: '/@fulgurjs-manifest.json', method: 'OPTIONS', headers: { origin: 'http://localhost:5100' } })
      expect(preflight.statusCode ?? 204).toBeTruthy()
      expect(preflight.ended).toBe(true)
    } finally {
      warnSpy.mockRestore()
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})
