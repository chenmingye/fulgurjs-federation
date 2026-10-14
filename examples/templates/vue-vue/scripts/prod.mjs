#!/usr/bin/env node
/** Standalone template production launcher. Uses only Node and the existing dev.config.json. */
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const { apps } = JSON.parse(fs.readFileSync(path.join(root, 'scripts/dev.config.json'), 'utf8'))
if (!Array.isArray(apps) || !apps.length) throw new Error('dev.config.json 未登记应用。')

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff': 'font/woff', '.woff2': 'font/woff2', '.map': 'application/json' }
const inside = (file, directory) => file === directory || file.startsWith(directory + path.sep)
const mounts = apps.map(app => {
  const dir = path.resolve(root, app.dir, 'dist')
  if (!inside(dir, root)) throw new Error(`${app.name}: 构建目录超出模板。`)
  const index = path.join(dir, 'index.html')
  if (!fs.existsSync(index)) throw new Error(`${app.name}: 缺少 dist/index.html，请先 pnpm build。`)
  const html = fs.readFileSync(index, 'utf8')
  const tags = [...html.matchAll(/<script\b[^>]*>/gi)]
  const tag = tags.find(item => /\btype=["']module["']/i.test(item[0]))?.[0]
  const src = tag?.match(/\bsrc=["']([^"']+)["']/i)?.[1]
  if (!src || /^(?:https?:)?\/\//.test(src)) throw new Error(`${app.name}: 无可本地挂载的模块入口。`)
  // Resolve the actual emitted file suffix, rather than guessing base from an app name.
  const pathname = decodeURIComponent(new URL(src, 'http://template.local/').pathname)
  const parts = pathname.split('/').filter(Boolean)
  const bases = []
  for (let i = 0; i < parts.length; i++) {
    const file = path.resolve(dir, ...parts.slice(i))
    if (inside(file, dir) && fs.existsSync(file) && fs.statSync(file).isFile()) bases.push('/' + parts.slice(0, i).join('/') + (i ? '/' : ''))
  }
  if (bases.length !== 1) throw new Error(`${app.name}: 无法唯一对应构建入口 ${src}；检查 Vite base 和干净构建输出。`)
  return { ...app, dir, prefix: bases[0] }
})
const hosts = mounts.filter(app => app.host)
if (!hosts.length) throw new Error('dev.config.json 未登记 host:true 的宿主。')
const ports = new Set()
const servers = []
let stopping = false
function stop(code = 0) {
  if (stopping) return
  stopping = true
  for (const server of servers) server.close()
  const timer = setTimeout(() => {
    for (const server of servers) server.closeAllConnections?.()
    process.exit(code)
  }, 1000)
  timer.unref()
  process.exitCode = code
}
process.once('SIGINT', () => stop(0))
process.once('SIGTERM', () => stop(0))
process.once('uncaughtException', error => { console.error(error); stop(1) })

for (const host of hosts) {
  if (!Number.isInteger(host.port) || host.port < 1 || host.port > 65535 || ports.has(host.port)) throw new Error(`无效或重复宿主端口：${host.port}`)
  ports.add(host.port)
  const site = [host, ...mounts.filter(app => !app.host)].sort((a, b) => b.prefix.length - a.prefix.length)
  const prefixes = new Set()
  for (const app of site) {
    if (prefixes.has(app.prefix)) throw new Error(`${host.name}: 构建 base ${app.prefix} 冲突；宿主和远程不能部署在同一路径。`)
    prefixes.add(app.prefix)
  }
  const server = http.createServer((req, res) => {
    try {
      const url = new URL(req.url, `http://localhost:${host.port}`)
      if (url.pathname === '/' && host.prefix !== '/') {
        res.writeHead(302, { location: host.prefix, 'cache-control': 'no-cache' })
        return res.end()
      }
      const app = site.find(item => url.pathname === item.prefix.slice(0, -1) || url.pathname.startsWith(item.prefix))
      if (!app) { res.writeHead(404); return res.end('未登记此部署路径') }
      const relative = decodeURIComponent(url.pathname.slice(app.prefix.length)) || 'index.html'
      let file = path.resolve(app.dir, relative)
      if (!inside(file, app.dir)) { res.writeHead(403); return res.end() }
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        if (path.extname(relative)) { res.writeHead(404); return res.end('资源不存在；不会回退成HTML') }
        file = path.join(app.dir, 'index.html')
      }
      const stable = /(?:^|\/)(?:index\.html|fulgurjs-(?:remoteEntry\.js|manifest\.json)|_app\.config\.js)$/.test(file)
      res.writeHead(200, {
        'content-type': mime[path.extname(file)] ?? 'application/octet-stream',
        'cache-control': stable ? 'no-cache' : 'public, max-age=31536000, immutable',
        'access-control-allow-origin': '*',
      })
      res.end(fs.readFileSync(file))
    } catch (error) {
      console.error(`生产请求失败：${error.message}`)
      if (!res.headersSent) res.writeHead(400)
      res.end('无效请求或资源不可读')
    }
  })
  servers.push(server)
  server.on('error', error => {
    console.error(`${host.name}:${host.port} 启动失败：${error.message}；停止本次全部生产服务器，不会按端口杀已有进程。`)
    stop(1)
  })
  server.listen(host.port, '127.0.0.1', () => {
    if (!stopping) console.log(`生产宿主 ${host.name}: http://localhost:${host.port}${host.prefix}（仅dist，无开发服务器）`)
  })
}
