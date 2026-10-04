/**
 * 生产静态部署服务器（端口 5391）：演示本轮生产产物的真实 HTTP 部署。
 * - 按目录前缀挂载：/jeecg-a/ /jeecg-b/ /react-c/ /jeecg-react-host/（构建产物 examples/integrations/jeecg/<inst>/dist）
 * - SPA fallback：各前缀内未命中文件回退该应用 index.html（绝不跨应用回退）
 * - no-cache：fulgurjs-remoteEntry.js / fulgurjs-manifest.json / index.html；其余长缓存
 * 启动：node examples/scripts/serve-prod.mjs
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PORT = 5391
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const APPS = [
  { prefix: '/jeecg-a/', dir: 'integrations/jeecg/app-a/dist' },
  { prefix: '/jeecg-b/', dir: 'integrations/jeecg/app-b/dist' },
  { prefix: '/react-c/', dir: 'integrations/jeecg/react-c/dist' },
  { prefix: '/jeecg-react-host/', dir: 'integrations/jeecg/react-host/dist' },
]
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.map': 'application/json' }
const NO_CACHE = /fulgurjs-remoteEntry\.js$|fulgurjs-manifest\.json$|\/index\.html$|^\/$/ // eslint-disable-line no-useless-escape

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  // API 反代：/jeecgboot-b → 5380/jeecg-boot-b；/jeecgboot → 5380/jeecg-boot（长前缀先匹配）
  const apiMatch = url.pathname.match(/^\/(jeecgboot-b|jeecgboot)(\/|$)/)
  if (apiMatch) {
    const target = `http://localhost:5380/${apiMatch[1] === 'jeecgboot' ? 'jeecg-boot' : 'jeecg-boot-b'}${url.pathname.slice(apiMatch[1].length + 1)}${url.search}`
    const upstream = await fetch(target, {
      method: req.method,
      headers: { ...req.headers, host: 'localhost:5380', origin: req.headers.origin ?? '', referer: req.headers.referer ?? '' },
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : req,
      duplex: 'half',
    }).catch((e) => { res.writeHead(502); res.end(String(e)); return null })
    if (!upstream) return
    const headers = Object.fromEntries(upstream.headers)
    delete headers['content-encoding']; delete headers['content-length']; delete headers['transfer-encoding']
    res.writeHead(upstream.status, headers)
    return res.end(Buffer.from(await upstream.arrayBuffer()))
  }
  const app = APPS.find((a) => url.pathname === a.prefix.slice(0, -1) || url.pathname.startsWith(a.prefix))
    ?? (url.pathname === '/' ? APPS[0] : null)
  if (!app) { res.writeHead(404); return res.end('not found (use /jeecg-a/ /jeecg-b/ /react-c/ /jeecg-react-host/)') }
  const rel = url.pathname.slice(app.prefix.length) || 'index.html'
  let fp = path.resolve(ROOT, app.dir, path.normalize(rel).replace(/^([/\\]|\.\.)+/, ''))
  if (!fp.startsWith(path.resolve(ROOT, app.dir))) { res.writeHead(403); return res.end() }
  if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) fp = path.resolve(ROOT, app.dir, 'index.html') // SPA fallback
  if (!fs.existsSync(fp)) { res.writeHead(404); return res.end('not found') }
  const isNoCache = NO_CACHE.test(url.pathname) || fp.endsWith('index.html')
  console.log(`[serve] ${req.method} ${url.pathname}${url.search} -> ${path.relative(ROOT, fp)} ${isNoCache ? 'no-cache' : 'immutable'}`)
  // Jeecg 子应用被嵌时其 index.html（含 _app.config.js）不会加载，config 全局缺失：
  // 在 remoteEntry 响应体前前置该应用的 _app.config.js（window.__PRODUCTION__*__CONF__ = {...}）
  if (fp.endsWith('fulgurjs-remoteEntry.js')) {
    const cfg = path.resolve(path.dirname(fp), '_app.config.js')
    if (fs.existsSync(cfg)) {
      res.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'no-cache' })
      return res.end(fs.readFileSync(cfg) + '\n' + fs.readFileSync(fp))
    }
  }
  res.writeHead(200, {
    'content-type': MIME[path.extname(fp)] ?? 'application/octet-stream',
    'cache-control': isNoCache ? 'no-cache' : 'public, max-age=31536000, immutable',
  })
  res.end(fs.readFileSync(fp))
})

server.listen(PORT, () => console.log(`生产部署预览: http://localhost:${PORT}/jeecg-a/ (SPA fallback + remoteEntry no-cache)`))
