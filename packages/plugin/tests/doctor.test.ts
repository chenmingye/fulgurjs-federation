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
    serve('/a/fulgurjs-remoteEntry.js', 200, {
      'cache-control': 'no-cache',
      'access-control-allow-origin': '*',
    }, 'import"./chunk-x.js";export default 1')
    serve('/a/fulgurjs-manifest.json', 200, { 'cache-control': 'no-cache' }, JSON.stringify({
      schemaVersion: 1,
      name: 'a',
      entry: 'fulgurjs-remoteEntry.js',
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
    serve('/a/fulgurjs-remoteEntry.js', 200, { 'cache-control': 'public, max-age=31536000, immutable' }, 'export default 1')
    serve('/a/fulgurjs-manifest.json', 200, { 'cache-control': 'no-cache' }, JSON.stringify({ schemaVersion: 1, name: 'a', entry: 'fulgurjs-remoteEntry.js', exposes: {}, shared: [] }))
    serve('/a/index.html', 200, { 'cache-control': 'no-cache' }, '<html></html>')
    const { checks, failed } = await runDoctor({ base: base(), apps: ['a'] })
    expect(failed).toBe(true)
    const immutable = checks.find((c) => c.item === 'fulgurjs-remoteEntry.js' && c.level === 'FAIL')
    expect(immutable?.symptom).toContain('immutable')
    expect(immutable?.fix).toContain('no-cache')
  })

  it('注入 chunk 404 → FAIL（删一个 chunk 故障复刻）', async () => {
    routes.clear()
    serve('/a/fulgurjs-remoteEntry.js', 200, { 'cache-control': 'no-cache' }, 'import"./missing-chunk.js"')
    serve('/a/fulgurjs-manifest.json', 200, { 'cache-control': 'no-cache' }, JSON.stringify({ schemaVersion: 1, name: 'a', entry: 'fulgurjs-remoteEntry.js', exposes: {}, shared: [] }))
    serve('/a/index.html', 200, { 'cache-control': 'no-cache' }, '<html></html>')
    const { checks, failed } = await runDoctor({ base: base(), apps: ['a'] })
    expect(failed).toBe(true)
    expect(checks.some((c) => c.item.includes('missing-chunk.js') && c.level === 'FAIL')).toBe(true)
  })

  it('remoteEntry 回退成 HTML（深链回退过宽）→ FAIL', async () => {
    routes.clear()
    serve('/a/fulgurjs-remoteEntry.js', 200, { 'cache-control': 'no-cache' }, '<!DOCTYPE html><html></html>')
    serve('/a/fulgurjs-manifest.json', 200, { 'cache-control': 'no-cache' }, JSON.stringify({ schemaVersion: 1, name: 'a', entry: 'fulgurjs-remoteEntry.js', exposes: {}, shared: [] }))
    serve('/a/index.html', 200, { 'cache-control': 'no-cache' }, '<html></html>')
    const { checks, failed } = await runDoctor({ base: base(), apps: ['a'] })
    expect(failed).toBe(true)
    const html = checks.find((c) => c.item === 'fulgurjs-remoteEntry.js' && c.level === 'FAIL')
    expect(html?.cause).toContain('index.html')
  })

  it('报告格式：三段式（现象/根因/修法）+ 汇总行', async () => {
    routes.clear()
    serve('/a/fulgurjs-remoteEntry.js', 200, { 'cache-control': 'public, max-age=31536000, immutable' }, 'export default 1')
    serve('/a/fulgurjs-manifest.json', 200, { 'cache-control': 'no-cache' }, JSON.stringify({ schemaVersion: 1, name: 'a', entry: 'fulgurjs-remoteEntry.js', exposes: {}, shared: [] }))
    serve('/a/index.html', 200, { 'cache-control': 'no-cache' }, '<html></html>')
    const { checks } = await runDoctor({ base: base(), apps: ['a'] })
    const report = formatDoctorReport(checks)
    expect(report).toContain('[fulgurjs:doctor] FAIL [a] fulgurjs-remoteEntry.js')
    expect(report).toContain('根因：')
    expect(report).toContain('修法：')
    expect(report).toMatch(/汇总：\d+ PASS \/ \d+ WARN \/ \d+ FAIL/)
  })
})

describe('doctor 部署体检：选项分支与未覆盖面（终验 F 补单测）', () => {
  const base = () => `http://127.0.0.1:${port}`
  const validManifest = JSON.stringify({ schemaVersion: 1, name: 'a', entry: 'fulgurjs-remoteEntry.js', exposes: {}, shared: [] })

  it('--no-entry 纯宿主：remoteEntry 404 也不误报缺失', async () => {
    routes.clear()
    const { checks, failed } = await runDoctor({ base: base(), apps: ['host'], noEntry: true, noManifest: true, noHtml: true })
    expect(failed).toBe(false)
    expect(checks).toHaveLength(0)
  })

  it('--no-manifest / --no-html：对应检查跳过不误报；未加旗标的 manifest 404 仍 FAIL', async () => {
    routes.clear()
    serve('/h/fulgurjs-remoteEntry.js', 200, { 'cache-control': 'no-cache' }, 'export default 1')
    const skip = await runDoctor({ base: base(), apps: ['h'], noManifest: true, noHtml: true })
    expect(skip.failed).toBe(false)
    expect(skip.checks.some((c) => c.item.includes('manifest'))).toBe(false)
    expect(skip.checks.some((c) => c.item === 'index.html')).toBe(false)
    const with404 = await runDoctor({ base: base(), apps: ['h'] })
    expect(with404.failed).toBe(true)
    expect(with404.checks.some((c) => c.item === 'fulgurjs-manifest.json' && c.level === 'FAIL')).toBe(true)
    expect(with404.checks.some((c) => c.item === 'index.html' && c.level === 'FAIL')).toBe(true)
  })

  it('--entry 自定义入口文件名被采用（默认名 404 不检查）', async () => {
    routes.clear()
    serve('/a/my-entry.js', 200, { 'cache-control': 'no-cache', 'access-control-allow-origin': '*' }, 'export default 1')
    serve('/a/fulgurjs-manifest.json', 200, { 'cache-control': 'no-cache' }, validManifest)
    serve('/a/index.html', 200, { 'cache-control': 'no-cache' }, '<html></html>')
    // 成功不产生检查记录（doctor 只报异常面）；若 --entry 未被采用，默认名 404 必产生 FAIL
    const { checks, failed } = await runDoctor({ base: base(), apps: ['a'], entry: 'my-entry.js' })
    expect(failed).toBe(false)
    expect(checks.some((c) => c.item === 'fulgurjs-remoteEntry.js')).toBe(false)
  })

  it("'.' 站点根部署与完整 URL 应用条目：root 解析正确", async () => {
    routes.clear()
    serve('/fulgurjs-remoteEntry.js', 200, { 'cache-control': 'no-cache' }, 'export default 1')
    serve('/fulgurjs-manifest.json', 200, { 'cache-control': 'no-cache' }, validManifest)
    serve('/index.html', 200, { 'cache-control': 'no-cache' }, '<html></html>')
    const dot = await runDoctor({ base: base(), apps: ['.'], noHtml: true })
    expect(dot.failed).toBe(false)
    routes.clear()
    serve('/fulgurjs-remoteEntry.js', 200, { 'cache-control': 'no-cache' }, 'export default 1')
    serve('/fulgurjs-manifest.json', 200, { 'cache-control': 'no-cache' }, validManifest)
    serve('/index.html', 200, { 'cache-control': 'no-cache' }, '<html></html>')
    const abs = await runDoctor({ base: base(), apps: [base()] })
    expect(abs.failed).toBe(false)
  })

  it('--dev：检查 @fulgurjs-entry.js 形态；缓存头与 CORS 检查按 dev 口径豁免', async () => {
    routes.clear()
    // dev 口径：默认 remoteEntry 与 @fulgurjs-entry.js 都查形态；缓存头/CORS 豁免
    serve('/a/fulgurjs-remoteEntry.js', 200, {}, 'export default 1')
    serve('/a/@fulgurjs-entry.js', 200, {}, 'export default 1')
    serve('/a/fulgurjs-manifest.json', 200, {}, JSON.stringify({ schemaVersion: 1, name: 'a', entry: 'fulgurjs-remoteEntry.js', exposes: {}, shared: [] }))
    const { checks, failed } = await runDoctor({ base: base(), apps: ['a'], dev: true })
    // 成功面不产生检查记录（doctor 只报异常）；下方 HTML 形态子例证明入口确被检查
    expect(failed).toBe(false)
    expect(checks.some((c) => c.item === 'remoteEntry CORS')).toBe(false)
    expect(checks.some((c) => c.level === 'WARN' && c.symptom.includes('no-cache'))).toBe(false)
    // dev 入口回 HTML → FAIL（default remoteEntry 正常在位，FAIL 可归因到入口形态）
    routes.clear()
    serve('/a/fulgurjs-remoteEntry.js', 200, {}, 'export default 1')
    serve('/a/fulgurjs-manifest.json', 200, {}, JSON.stringify({ schemaVersion: 1, name: 'a', entry: 'fulgurjs-remoteEntry.js', exposes: {}, shared: [] }))
    serve('/a/@fulgurjs-entry.js', 200, {}, '<!DOCTYPE html>')
    const bad = await runDoctor({ base: base(), apps: ['a'], dev: true })
    expect(bad.failed).toBe(true)
    expect(bad.checks.some((c) => c.item.includes('@fulgurjs-entry.js') && c.level === 'FAIL' && c.symptom.includes('HTML'))).toBe(true)
  })

  it('nginx 回退把 chunk 兜成 200 HTML → FAIL 且修法指向精确匹配（首层 GET 查形态）', async () => {
    routes.clear()
    serve('/a/fulgurjs-remoteEntry.js', 200, { 'cache-control': 'no-cache' }, 'import"./assets/gone.js"')
    serve('/a/fulgurjs-manifest.json', 200, { 'cache-control': 'no-cache' }, validManifest)
    serve('/a/index.html', 200, { 'cache-control': 'no-cache' }, '<html></html>')
    serve('/a/assets/gone.js', 200, { 'cache-control': 'no-cache' }, '<!DOCTYPE html><html>fallback</html>')
    const { checks, failed } = await runDoctor({ base: base(), apps: ['a'] })
    expect(failed).toBe(true)
    const masked = checks.find((c) => c.item.includes('assets/gone.js'))
    expect(masked?.level).toBe('FAIL')
    expect(masked?.symptom).toContain('200 但内容是 HTML')
  })

  it('manifest 坏 JSON 与未知 schemaVersion → 分别 FAIL（契约模块口径）', async () => {
    routes.clear()
    serve('/a/fulgurjs-remoteEntry.js', 200, { 'cache-control': 'no-cache' }, 'export default 1')
    serve('/a/fulgurjs-manifest.json', 200, { 'cache-control': 'no-cache' }, '{not-json')
    serve('/a/index.html', 200, { 'cache-control': 'no-cache' }, '<html></html>')
    const bad = await runDoctor({ base: base(), apps: ['a'] })
    expect(bad.checks.some((c) => c.item === 'manifest 解析' && c.symptom.includes('不是合法 JSON'))).toBe(true)

    routes.clear()
    serve('/a/fulgurjs-remoteEntry.js', 200, { 'cache-control': 'no-cache' }, 'export default 1')
    serve('/a/fulgurjs-manifest.json', 200, { 'cache-control': 'no-cache' }, JSON.stringify({ schemaVersion: 99, name: 'a' }))
    serve('/a/index.html', 200, { 'cache-control': 'no-cache' }, '<html></html>')
    const unsupported = await runDoctor({ base: base(), apps: ['a'] })
    expect(unsupported.checks.some((c) => c.item === 'manifest 契约' && c.symptom.includes('schemaVersion=99'))).toBe(true)
  })

  it('缺 no-cache（非 immutable）→ WARN 不 FAIL；多应用 shared 版本 skew → WARN', async () => {
    routes.clear()
    serve('/a/fulgurjs-remoteEntry.js', 200, { 'cache-control': 'public, max-age=60' }, 'export default 1')
    serve('/a/fulgurjs-manifest.json', 200, { 'cache-control': 'public, max-age=60' }, JSON.stringify({ schemaVersion: 1, name: 'a', entry: 'fulgurjs-remoteEntry.js', exposes: {}, shared: [{ name: 'vue', version: '3.4.21' }] }))
    serve('/a/index.html', 200, {}, '<html></html>')
    serve('/b/fulgurjs-remoteEntry.js', 200, { 'cache-control': 'public, max-age=60' }, 'export default 1')
    serve('/b/fulgurjs-manifest.json', 200, { 'cache-control': 'public, max-age=60' }, JSON.stringify({ schemaVersion: 1, name: 'b', entry: 'fulgurjs-remoteEntry.js', exposes: {}, shared: [{ name: 'vue', version: '3.5.0' }] }))
    serve('/b/index.html', 200, {}, '<html></html>')
    const { checks, failed } = await runDoctor({ base: base(), apps: ['a', 'b'] })
    expect(failed).toBe(false)
    expect(checks.filter((c) => c.level === 'WARN' && c.symptom.includes('no-cache')).length).toBeGreaterThanOrEqual(3)
    expect(checks.some((c) => c.level === 'WARN' && c.item.includes('shared 版本 skew'))).toBe(true)
  })
})
