/**
 * Demo 展示中心共享库：场景启动/停止/探活（仅管理本任务启动的进程）。
 * PID 登记在 examples/.run/demo-pids.json，日志在 examples/.run/logs/。
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
const REPO_ROOT = path.resolve(DEMO_ROOT, '..')
const pendingInstalls = new Map()

/** 场景表是工程位置和包管理器的唯一来源；模板在 workspace 根安装。 */
export function appLocation(app) {
  const cwd = path.resolve(REPO_ROOT, app.dir)
  const installDir = path.resolve(REPO_ROOT, app.installDir ?? app.dir)
  const packageManager = app.packageManager ?? 'npm'
  if (!['npm', 'pnpm'].includes(packageManager)) throw new Error(`未知包管理器：${packageManager}`)
  return { cwd, installDir, packageManager }
}

export function runCommand(command, args, cwd, log = console.log) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    child.stdout.on('data', (data) => log(String(data).trimEnd()))
    child.stderr.on('data', (data) => log(String(data).trimEnd()))
    child.once('error', reject)
    child.once('close', (code) => code === 0 ? resolve() : reject(new Error(`${command} ${args.join(' ')} 退出码 ${code}`)))
  })
}

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

const waitPort = async (port, timeoutMs = 120000, stopped = () => false) => {
  const t0 = Date.now()
  while (!stopped() && Date.now() - t0 < timeoutMs) {
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

/** 安装失败必须中止启动；同一 workspace 的并发请求共用一次安装。 */
export async function ensureInstalled(app, log = console.log) {
  const { cwd, installDir, packageManager } = appLocation(app)
  if (app.role === 'service' && !fs.existsSync(path.join(cwd, 'package.json'))) return
  if (await installedVersionMatches(cwd)) return
  let pending = pendingInstalls.get(installDir)
  if (!pending) {
    const args = packageManager === 'pnpm'
      ? ['install', '--frozen-lockfile']
      : [fs.existsSync(path.join(installDir, 'package-lock.json')) ? 'ci' : 'install', '--no-audit', '--no-fund']
    log(`[install] ${app.name}: ${packageManager} ${args.join(' ')} (${path.relative(REPO_ROOT, installDir)})`)
    pending = runCommand(packageManager, args, installDir, log)
    pendingInstalls.set(installDir, pending)
  }
  try { await pending } finally {
    if (pendingInstalls.get(installDir) === pending) pendingInstalls.delete(installDir)
  }
  if (!(await installedVersionMatches(cwd))) throw new Error(`${app.name} 安装后插件版本仍与声明不一致`)
}

/** 单个应用：按场景包管理器启动（已监听则跳过）。返回 {name, pid?, skipped?, error?} */
async function startApp(app, log) {
  if (await isPortUp(app.port)) {
    log(`[skip] ${app.name} 端口 ${app.port} 已被占用（视为已在运行）`)
    return { name: app.name, skipped: true }
  }
  const { cwd, packageManager } = appLocation(app)
  try { await ensureInstalled(app, log) } catch (error) { return { name: app.name, error: error.message } }
  fs.mkdirSync(LOG_DIR, { recursive: true })
  const logFile = path.join(LOG_DIR, `${app.name}.log`)
  const out = fs.openSync(logFile, 'a')
  // role:service 的 node 服务（如 jeecg data-service）：无 package.json，直接 node server.mjs
  const isNodeService = app.role === 'service' && !fs.existsSync(path.join(cwd, 'package.json'))
  const child = isNodeService
    ? spawn('node', ['server.mjs'], { cwd, stdio: ['ignore', out, out], detached: false })
    : spawn(packageManager, ['run', 'dev'], { cwd, stdio: ['ignore', out, out], detached: false })
  fs.closeSync(out)
  const pids = readPids()
  pids[app.name] = { pid: child.pid, port: app.port, dir: app.dir, startedAt: new Date().toISOString(), logFile }
  writePids(pids)
  let childStopped = false
  const exited = new Promise((resolve) => {
    child.once('error', (error) => { childStopped = true; log(`[error] ${app.name}: ${error.message}`); resolve(false) })
    child.once('exit', (code) => { childStopped = true; log(`[exit] ${app.name} (pid ${child.pid}) 退出码 ${code}`); resolve(false) })
  })
  const up = await Promise.race([waitPort(app.port, 120000, () => childStopped), exited])
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
