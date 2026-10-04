/**
 * Demo 展示中心共享库：场景启动/停止/探活（仅管理本任务启动的进程）。
 * PID 登记在 demo/.run/demo-pids.json，日志在 demo/.run/logs/。
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DEMO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const RUN_DIR = path.join(DEMO_ROOT, '.run')
const LOG_DIR = path.join(RUN_DIR, 'logs')
const PID_FILE = path.join(RUN_DIR, 'demo-pids.json')

export function loadScenarios() {
  return JSON.parse(fs.readFileSync(path.join(DEMO_ROOT, 'scenarios.json'), 'utf8')).scenarios
}

const readPids = () => (fs.existsSync(PID_FILE) ? JSON.parse(fs.readFileSync(PID_FILE, 'utf8')) : {})
const writePids = (data) => {
  fs.mkdirSync(RUN_DIR, { recursive: true })
  fs.writeFileSync(PID_FILE, JSON.stringify(data, null, 2))
}

export const isPortUp = (port) =>
  Promise.any([
    // vite6/node24 下 dev server 可能只绑 IPv6 回环（::1），双栈探测
    probeHost(port, '127.0.0.1'),
    probeHost(port, '::1'),
  ]).catch(() => false)

const probeHost = (port, host) =>
  new Promise((resolve, reject) => {
    const s = net.connect({ port, host, timeout: 800 })
    s.on('connect', () => { s.destroy(); resolve(true) })
    s.on('error', reject)
    s.on('timeout', () => { s.destroy(); reject(new Error('timeout')) })
  })

const waitPort = async (port, timeoutMs = 120000) => {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    if (await isPortUp(port)) return true
    await new Promise((r) => setTimeout(r, 500))
  }
  return false
}

const alive = (pid) => {
  try { process.kill(pid, 0); return true } catch { return false }
}

/** package.json 声明的 @fulgurjs/federation 版本与 node_modules 实装不一致时要求重装（升级后 node_modules 残留旧版） */
async function installedVersionMatches(cwd) {
  if (!fs.existsSync(path.join(cwd, 'node_modules'))) return false
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'))
    const spec = pkg.dependencies?.['@fulgurjs/federation'] ?? pkg.devDependencies?.['@fulgurjs/federation']
    if (!spec) return true
    const installed = JSON.parse(fs.readFileSync(path.join(cwd, 'node_modules/@fulgurjs/federation/package.json'), 'utf8')).version
    return spec === installed
  } catch { return false }
}

/** 单个应用：npm run dev（已监听则跳过）。返回 {name, pid?, skipped?, error?} */
async function startApp(app, log) {
  if (await isPortUp(app.port)) {
    log(`[skip] ${app.name} 端口 ${app.port} 已被占用（视为已在运行）`)
    return { name: app.name, skipped: true }
  }
  const cwd = path.resolve(DEMO_ROOT, '..', app.dir)
  if (!(await installedVersionMatches(cwd))) {
    log(`[install] ${app.name}: npm install --no-audit --no-fund`)
    await new Promise((resolve) => {
      const p = spawn('npm', ['install', '--no-audit', '--no-fund'], { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
      p.stdout.on('data', (d) => log(`[install ${app.name}] ${d}`.trimEnd()))
      p.stderr.on('data', (d) => log(`[install ${app.name}] ${d}`.trimEnd()))
      p.on('close', (code) => resolve(code === 0 ? null : new Error(`${app.name} npm install 退出码 ${code}`)))
    })
  }
  fs.mkdirSync(LOG_DIR, { recursive: true })
  const logFile = path.join(LOG_DIR, `${app.name}.log`)
  const out = fs.openSync(logFile, 'a')
  // role:service 的 node 服务（如 jeecg data-service）：无 package.json，直接 node server.mjs
  const isNodeService = app.role === 'service' && !fs.existsSync(path.join(cwd, 'package.json'))
  const child = isNodeService
    ? spawn('node', ['server.mjs'], { cwd, stdio: ['ignore', out, out], detached: false })
    : spawn('npm', ['run', 'dev'], { cwd, stdio: ['ignore', out, out], detached: false })
  const pids = readPids()
  pids[app.name] = { pid: child.pid, port: app.port, dir: app.dir, startedAt: new Date().toISOString(), logFile }
  writePids(pids)
  child.on('exit', (code) => log(`[exit] ${app.name} (pid ${child.pid}) 退出码 ${code}`))
  const up = await waitPort(app.port)
  if (!up) return { name: app.name, pid: child.pid, error: `端口 ${app.port} ${120}s 内未就绪，查看 ${logFile}` }
  log(`[up] ${app.name}: http://localhost:${app.port}/ (pid ${child.pid}, log ${logFile})`)
  return { name: app.name, pid: child.pid, logFile }
}

/** 启动一个场景（按注册表顺序：远程在前宿主在后）。 */
export async function startScenario(scenarioId, log = console.log) {
  const sc = loadScenarios().find((s) => s.id === scenarioId)
  if (!sc) throw new Error(`未知场景：${scenarioId}`)
  const results = []
  for (const app of sc.apps) {
    const r = await startApp(app, log)
    results.push(r)
    if (r.error) log(`[warn] ${app.name} 启动异常：${r.error}`)
  }
  return { scenario: sc.title, results }
}

/** 停止本任务登记的进程（只动 PID 文件里的，不碰任何其他端口）。 */
export async function stopApps(names = null, log = console.log) {
  const pids = readPids()
  let stopped = 0
  for (const [name, rec] of Object.entries(pids)) {
    if (names && !names.includes(name)) continue
    if (rec.pid && alive(rec.pid)) {
      try { process.kill(rec.pid, 'SIGTERM'); log(`[stop] ${name} (pid ${rec.pid})`) ; stopped++ } catch { /* 已退出 */ }
    } else {
      log(`[clean] ${name} 记录存在但进程已不在`)
    }
    delete pids[name]
  }
  writePids(pids)
  return stopped
}

/** 探活：场景全部应用端口状态。 */
export async function probeScenarios() {
  const scenarios = loadScenarios()
  const out = []
  for (const sc of scenarios) {
    const apps = []
    for (const app of sc.apps) apps.push({ ...app, up: await isPortUp(app.port) })
    out.push({
      id: sc.id, column: sc.column, title: sc.title, desc: sc.desc, source: sc.source,
      apps,
      ready: apps.length === 0 ? null : apps.every((a) => a.up),
    })
  }
  return out
}
