/**
 * Demo 展示中心门户服务（端口 5390）：静态页面 + 探活/启动/停止 API。
 * 启动：node examples/portal/server.mjs  （或 npm start）
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { probeScenarios, startScenario, stopApps } from '../scripts/lib.mjs'

const PORTAL_ROOT = path.dirname(fileURLToPath(import.meta.url))
const PORT = 5390
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' }

const json = (res, code, data) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)) }
const readBody = (req) => new Promise((r) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { try { r(JSON.parse(b || '{}')) } catch { r({}) } }) })

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  if (url.pathname === '/api/scenarios') return json(res, 200, await probeScenarios())
  if (url.pathname === '/api/start' && req.method === 'POST') {
    const { scenario } = await readBody(req)
    try {
      const result = await startScenario(scenario)
      return json(res, result.results.some((app) => app.error) ? 503 : 200, result)
    } catch (e) { return json(res, 400, { error: String(e.message ?? e) }) }
  }
  if (url.pathname === '/api/stop' && req.method === 'POST') {
    const { scenario, apps } = await readBody(req)
    if (scenario) {
      const { loadScenarios } = await import('../scripts/lib.mjs')
      const sc = loadScenarios().find((s) => s.id === scenario)
      const names = sc ? sc.apps.map((a) => a.name) : null
      return json(res, 200, { stopped: await stopApps(names) })
    }
    return json(res, 200, { stopped: await stopApps(apps ?? null) })
  }
  const file = url.pathname === '/' ? '/index.html' : url.pathname
  const fp = path.join(PORTAL_ROOT, 'public', path.normalize(file).replace(/^([/\\]|\.\.)+/, ''))
  if (!fp.startsWith(path.join(PORTAL_ROOT, 'public')) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
    res.writeHead(404); return res.end('not found')
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(fp)] ?? 'application/octet-stream' })
  res.end(fs.readFileSync(fp))
})

server.listen(PORT, () => console.log(`Demo 展示中心: http://localhost:${PORT}/`))
