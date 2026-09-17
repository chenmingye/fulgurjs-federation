import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import http from 'node:http'
import { extractChunkRefs, compareSharedVersions, runDoctor, formatDoctorReport } from '../src/doctor'

let server: http.Server
let port = 0
const routes = new Map<string, { status: number; headers?: Record<string, string>; body?: string }>()

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const r = routes.get(req.url ?? '') ?? { status: 404, body: 'not found' }
    res.writeHead(r.status, r.headers ?? {})
    res.end(r.body ?? '')
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  port = (server.address() as { port: number }).port
})
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))

function serve(url: string, status: number, headers?: Record<string, string>, body?: string) {
  routes.set(url, { status, headers, body })
}

describe('W2 doctor: extractChunkRefs', () => {
  it('从 remoteEntry 与 manifest 抽取 chunk 引用（./ 前缀归一去重）', () => {
    const body = `import"./chunk-b-XyZ.js";import"./assets/nested/chunk-a-BcD.js";const s="lazy-c-123.js"`
    const manifest = { exposes: { './A': { file: 'assets/expose-a.js' } } }
    const refs = extractChunkRefs(body, JSON.stringify(manifest))
    expect(refs).toContain('chunk-b-XyZ.js')
    expect(refs).toContain('assets/nested/chunk-a-BcD.js')
    expect(refs).toContain('lazy-c-123.js')
    expect(refs).toContain('assets/expose-a.js')
    expect(refs.filter((r) => r.startsWith('./'))).toHaveLength(0)
  })
})

describe('W2 doctor: compareSharedVersions（版本协商 skew 预演）', () => {
  it('同键不同版本 → WARN，附各应用分布', () => {
    const out = compareSharedVersions([
      { app: 'host', shared: [{ name: 'vue', version: '3.4.21', singleton: true }] },
      { app: 'remote', shared: [{ name: 'vue', version: '3.5.0', singleton: true }] },
    ])
    expect(out).toHaveLength(1)
    expect(out[0].level).toBe('WARN')
    expect(out[0].symptom).toContain('vue')
    expect(out[0].fix).toBeTruthy()
  })

  it('版本一致 → 无告警', () => {
    const out = compareSharedVersions([
      { app: 'a', shared: [{ name: 'vue', version: '3.4.21' }] },
      { app: 'b', shared: [{ name: 'vue', version: '3.4.21' }] },
    ])
    expect(out).toHaveLength(0)
  })
})

describe('W2 doctor: runDoctor 故障注入（本地 http 形态）', () => {
  const base = () => `http://127.0.0.1:${port}`

  it('健康站点全 PASS（no-cache + JS 形态 + CORS + chunk 可达）', async () => {
    routes.clear()
    serve('/a/fulgur-remoteEntry.js', 200, {
      'cache-control': 'no-cache',
      'access-control-allow-origin': '*',
    }, 'import"./chunk-x.js";export default 1')
    serve('/a/fulgur-manifest.json', 200, { 'cache-control': 'no-cache' }, JSON.stringify({
      name: 'a',
      exposes: { './X': { file: 'chunk-expose.js' } },
      shared: [{ name: 'vue', version: '3.4.21' }],
    }))
    serve('/a/index.html', 200, { 'cache-control': 'no-cache' }, '<html></html>')
    serve('/a/chunk-x.js', 200, { 'cache-control': 'no-cache' }, 'ok')
    serve('/a/chunk-expose.js', 200, { 'cache-control': 'no-cache' }, 'ok')
    const { checks, failed } = await runDoctor({ base: base(), apps: ['a'] })
    expect(failed).toBe(false)
    expect(checks.some((c) => c.item === 'remoteEntry CORS' && c.level === 'PASS')).toBe(true)
  })

  it('注入 immutable 头 → FAIL 且修法指向 no-cache（2026-09-17 用户踩坑复刻）', async () => {
    routes.clear()
    serve('/a/fulgur-remoteEntry.js', 200, { 'cache-control': 'public, max-age=31536000, immutable' }, 'export default 1')
    serve('/a/fulgur-manifest.json', 200, { 'cache-control': 'no-cache' }, JSON.stringify({ name: 'a', exposes: {}, shared: [] }))
    serve('/a/index.html', 200, { 'cache-control': 'no-cache' }, '<html></html>')
    const { checks, failed } = await runDoctor({ base: base(), apps: ['a'] })
    expect(failed).toBe(true)
    const immutable = checks.find((c) => c.item === 'fulgur-remoteEntry.js' && c.level === 'FAIL')
    expect(immutable?.symptom).toContain('immutable')
    expect(immutable?.fix).toContain('no-cache')
  })

  it('注入 chunk 404 → FAIL（删一个 chunk 故障复刻）', async () => {
    routes.clear()
    serve('/a/fulgur-remoteEntry.js', 200, { 'cache-control': 'no-cache' }, 'import"./missing-chunk.js"')
    serve('/a/fulgur-manifest.json', 200, { 'cache-control': 'no-cache' }, JSON.stringify({ name: 'a', exposes: {}, shared: [] }))
    serve('/a/index.html', 200, { 'cache-control': 'no-cache' }, '<html></html>')
    const { checks, failed } = await runDoctor({ base: base(), apps: ['a'] })
    expect(failed).toBe(true)
    expect(checks.some((c) => c.item.includes('missing-chunk.js') && c.level === 'FAIL')).toBe(true)
  })

  it('remoteEntry 回退成 HTML（深链回退过宽）→ FAIL', async () => {
    routes.clear()
    serve('/a/fulgur-remoteEntry.js', 200, { 'cache-control': 'no-cache' }, '<!DOCTYPE html><html></html>')
    serve('/a/fulgur-manifest.json', 200, { 'cache-control': 'no-cache' }, JSON.stringify({ name: 'a', exposes: {}, shared: [] }))
    serve('/a/index.html', 200, { 'cache-control': 'no-cache' }, '<html></html>')
    const { checks, failed } = await runDoctor({ base: base(), apps: ['a'] })
    expect(failed).toBe(true)
    const html = checks.find((c) => c.item === 'fulgur-remoteEntry.js' && c.level === 'FAIL')
    expect(html?.cause).toContain('index.html')
  })

  it('报告格式：三段式（现象/根因/修法）+ 汇总行', async () => {
    routes.clear()
    serve('/a/fulgur-remoteEntry.js', 200, { 'cache-control': 'public, max-age=31536000, immutable' }, 'export default 1')
    serve('/a/fulgur-manifest.json', 200, { 'cache-control': 'no-cache' }, JSON.stringify({ name: 'a', exposes: {}, shared: [] }))
    serve('/a/index.html', 200, { 'cache-control': 'no-cache' }, '<html></html>')
    const { checks } = await runDoctor({ base: base(), apps: ['a'] })
    const report = formatDoctorReport(checks)
    expect(report).toContain('[fulgur:doctor] FAIL [a] fulgur-remoteEntry.js')
    expect(report).toContain('根因：')
    expect(report).toContain('修法：')
    expect(report).toMatch(/汇总：\d+ PASS \/ \d+ WARN \/ \d+ FAIL/)
  })
})
