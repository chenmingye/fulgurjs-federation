#!/usr/bin/env node
/**
 * 模板统一 dev 启动器（规范源）。
 *
 * 本文件经 examples/scripts/sync-template-scripts.mjs 同步到五个模板的 scripts/dev.mjs；
 * 模板内副本必须与规范源逐字节一致（check-catalog.mjs 校验哈希），模板复制出仓库后独立可用——
 * 只依赖同目录 dev.config.json 与 Node 内置模块，不依赖仓库其他文件。
 *
 * 行为契约（与模板 README 一致）：
 * - 启动前预检全部端口：任何端口被占用则拒绝启动并指认处理方法（绝不按端口杀别人的进程）；
 * - 按 dev.config.json 顺序（远程在前宿主在后）启动各应用，逐个探活；
 * - 每个进程从 spawn 起就进入全生命周期监督（启动前/探活中/部分就绪/全组就绪/关闭中）：
 *   任一应用在任何阶段异常退出 → 整组停止（只杀本次启动的子进程），非零退出并打印该应用日志尾部；
 *   不存在「探活通过后、全组就绪前」的监督空窗；
 * - Ctrl+C / SIGTERM：清理本次启动的全部子进程后退出；不依赖 PID 文件；
 * - 停止采用 POSIX 进程组信号：即使包管理器父进程已退出，同组的孙进程（dev server）也会被终止，
 *   不留下仍监听端口的孤儿；Windows 走 taskkill /T /F 兜底路径（父进程已退出时无法追溯孙进程，见 README）；
 * - 全部就绪后打印访问入口；探活 = 端口可连接（dev server 已监听），页面可用以浏览器验收为准。
 *
 * 平台：macOS/Linux 实测；Windows 走 taskkill 兜底路径，未经验证（见模板 README）。
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const templateRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const { apps, readyTimeoutMs = 120000 } = JSON.parse(
  fs.readFileSync(path.join(templateRoot, 'scripts', 'dev.config.json'), 'utf8'),
)
const isTTY = process.stdout.isTTY
const color = (code, text) => (isTTY ? `\x1b[${code}m${text}\x1b[0m` : text)
const EXIT = { ok: 0, startupFailed: 1, portConflict: 2, signal: 130 }

/** 双栈端口探测（vite 可能只绑 IPv4 或 IPv6 回环） */
function isPortUp(port) {
  const probe = (host) =>
    new Promise((resolve, reject) => {
      const s = net.connect({ port, host, timeout: 800 })
      s.on('connect', () => { s.destroy(); resolve(true) })
      s.on('error', reject)
      s.on('timeout', () => { s.destroy(); reject(new Error('timeout')) })
    })
  return Promise.any([probe('127.0.0.1'), probe('::1')]).catch(() => false)
}

const tailOf = new Map()
const children = new Map()
let shuttingDown = false

function recordOutput(name, chunk) {
  const lines = (tailOf.get(name) ?? [])
  for (const line of String(chunk).split('\n')) {
    if (line === '') continue
    lines.push(line)
  }
  while (lines.length > 60) lines.shift()
  tailOf.set(name, lines)
}

function printAppLine(name, text) {
  process.stdout.write(`${color('2', `[${name}]`)} ${text}\n`)
}

async function preflight() {
  const conflicts = []
  for (const app of apps) {
    if (await isPortUp(app.port)) conflicts.push(app)
  }
  if (conflicts.length === 0) return
  console.error(color('31', '[dev] 启动前检查失败：以下端口已被占用（不区分占用者，一律不启动）：'))
  for (const app of conflicts) {
    const posix = `lsof -nP -iTCP:${app.port} -sTCP:LISTEN`
    const win = `netstat -ano | findstr :${app.port}`
    console.error(
      `  ${app.name} → 端口 ${app.port} 已监听。查看占用：${process.platform === 'win32' ? win : posix}；` +
        `结束占用进程，或同步修改以下整组配置后重试：${app.dir}/package.json 的 dev/preview --port、` +
        `宿主 fulgurjs.config.ts 的 remotes dev 地址、scripts/dev.config.json 里该应用的 port`,
    )
  }
  console.error('[dev] 本启动器只清理自己启动的进程，不会替你结束端口上的既有服务。')
  process.exit(EXIT.portConflict)
}

function spawnApp(app) {
  const child = spawn('pnpm', ['--dir', app.dir, 'run', 'dev'], {
    cwd: templateRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    // POSIX：独立进程组，便于整组终止；Windows：shell 解析 pnpm.cmd，树杀交给 taskkill
    detached: true,
    shell: process.platform === 'win32',
  })
  children.set(app.name, child)
  child.stdout.on('data', (c) => { recordOutput(app.name, c); String(c).split('\n').filter(Boolean).forEach((l) => printAppLine(app.name, l)) })
  child.stderr.on('data', (c) => { recordOutput(app.name, c); String(c).split('\n').filter(Boolean).forEach((l) => printAppLine(app.name, l)) })
  // spawn 起即全生命周期监督：探活中、部分就绪、全组就绪、关闭中任何阶段退出都不漏
  child.once('exit', (code, signal) => {
    if (!shuttingDown) {
      void failStartup(
        app.name,
        `意外退出（退出码 ${code ?? 'null'}${signal ? `，信号 ${signal}` : ''}）——整组停止；若是启动命令失败，看下方日志尾部`,
      )
    }
  })
  child.once('error', (e) => {
    if (!shuttingDown) void failStartup(app.name, `进程无法启动：${e.message}（检查 pnpm 是否可用：pnpm -v）`)
  })
  return child
}

const exitedOnce = (child) =>
  new Promise((resolve) => {
    child.once('exit', (code, signal) => resolve({ code, signal }))
    child.once('error', (e) => resolve({ code: -1, signal: null, error: e }))
  })

async function waitReady(app, child) {
  const exited = exitedOnce(child)
  const deadline = Date.now() + readyTimeoutMs
  while (Date.now() < deadline) {
    if (await isPortUp(app.port)) return { ok: true }
    const done = await Promise.race([exited.then(() => 'exit'), new Promise((r) => setTimeout(() => r('tick'), 400))])
    if (done === 'exit') return { ok: false, reason: `进程提前退出（启动命令失败——看下方日志尾部）` }
  }
  return { ok: false, reason: `${Math.round(readyTimeoutMs / 1000)}s 内端口 ${app.port} 未就绪（dev server 未监听）` }
}

/**
 * 整组终止：向进程组发信号（detached 子进程是组长；组长已退出时组内孙进程仍在，组信号依然送达）。
 * 不检查直接子进程是否已退出——那会跳过组信号、留下仍监听端口的孙进程。
 * Windows 用 taskkill /T /F 树杀；父进程已退出时 taskkill 无法追溯，属平台兜底限制。
 */
function killTree(appName) {
  const child = children.get(appName)
  if (!child) return Promise.resolve()
  const pid = child.pid
  const isWin = process.platform === 'win32'
  const directDead = child.exitCode !== null || child.signalCode !== null
  const signalGroup = (hard) => {
    try {
      if (isWin) {
        if (!directDead) spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' })
      } else {
        process.kill(-pid, hard ? 'SIGKILL' : 'SIGTERM')
      }
    } catch {
      /* ESRCH：组内已无进程 */
    }
  }
  return new Promise((resolve) => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      clearTimeout(forceTimer)
      resolve()
    }
    // 这些定时器必须是 ref 的：直接子进程已退出时它们是事件循环里唯一的句柄，
    // unref 会让循环提前 drain（进程以退出码 13 结束），shutdown 的收尾就永远走不完
    const forceTimer = setTimeout(() => {
      signalGroup(true)
      setTimeout(finish, 500)
    }, 3000)
    if (!directDead) child.once('exit', finish)
    signalGroup(false)
    if (directDead || isWin) {
      // 直接子进程已退出（或 Windows 树杀无法等 exit 事件）：给组信号固定传播宽限
      setTimeout(finish, 500)
    }
  })
}

/** 统一失败通道：任何阶段的失败都从这里走（shuttingDown 幂等，多事件并发不冲突） */
async function failStartup(name, reason) {
  if (shuttingDown) return
  console.error(color('31', `\n[dev] 启动失败：${name} —— ${reason}`))
  const tail = tailOf.get(name) ?? []
  if (tail.length) {
    console.error(color('31', `[dev] ${name} 日志尾部（最后 ${tail.length} 行）：`))
    for (const line of tail) console.error(`  [${name}] ${line}`)
  }
  await shutdown(EXIT.startupFailed, `[dev] 正在停止本次启动的其余应用…`)
}

async function shutdown(exitCode, reason) {
  if (shuttingDown) return
  shuttingDown = true
  if (reason) console.log(`[dev] ${reason}`)
  console.log(`[dev] 正在停止本次启动的 ${children.size} 个应用…`)
  // 看门狗：清理最多等 15s，绝不因单个 killTree 挂起而无法退出
  const watchdog = setTimeout(() => process.exit(exitCode), 15000)
  watchdog.unref()
  await Promise.all([...children.keys()].map(killTree))
  clearTimeout(watchdog)
  console.log('[dev] 已全部停止。')
  process.exit(exitCode)
}

process.on('SIGINT', () => void shutdown(EXIT.signal, '收到 Ctrl+C'))
process.on('SIGTERM', () => void shutdown(143, '收到 SIGTERM'))

await preflight()

console.log(`[dev] 模板 ${path.basename(templateRoot)}：按顺序启动 ${apps.map((a) => a.name).join(' → ')}`)
for (const app of apps) {
  printAppLine(app.name, `启动（pnpm --dir ${app.dir} run dev），等待端口 ${app.port} 就绪…`)
  const child = spawnApp(app)
  const ready = await waitReady(app, child)
  if (!ready.ok) {
    await failStartup(app.name, ready.reason)
  }
  if (shuttingDown) {
    // 失败通道已接管（含并发事件抢先置位的情况）：停在这里等 shutdown 退出，绝不宣布就绪
    await new Promise(() => {})
  }
  printAppLine(app.name, `就绪 → http://localhost:${app.port}/`)
}

console.log(color('32', '\n[dev] 全部应用已就绪（持续监督中，任一应用退出会整组停止）：'))
for (const app of [...apps].reverse()) {
  console.log(`  http://localhost:${app.port}/    ${app.name}`)
}
console.log('[dev] Ctrl+C 停止全部应用（只清理本次启动的进程）。dev server 已监听 ≠ 页面必然可用，验收请以浏览器实际加载为准。\n')

await new Promise(() => {})
