/**
 * dev-runner（模板统一启动器）进程级回归。
 *
 * 全部用真实进程验证：runner 以子进程方式运行规范源，fixture 应用是独立 node http server，
 * 断言退出码、输出文案、端口释放与无进程残留——不允许只断言某个 kill 函数被调用。
 * 覆盖任务合同的失败矩阵：就绪前失败 / 就绪后宿主启动期间退出 / 全就绪后退出 / 探活超时 /
 * 包管理器缺失或启动失败 / 端口占用 / 孙进程孤儿（父进程退出后 dev server 仍监听）/
 * SIGTERM / 含空格与中文的路径。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_RUNNER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'dev-runner.mjs')

/** 专用端口池：与其他服务隔离；被占用即测试前置失败（不静默换端口掩盖问题） */
const POOL = [58131, 58132, 58133, 58134, 58135]

const isUp = (port) =>
  new Promise((resolve) => {
    const s = net.connect({ port, host: '127.0.0.1', timeout: 400 })
    s.on('connect', () => { s.destroy(); resolve(true) })
    s.on('error', () => resolve(false))
    s.on('timeout', () => { s.destroy(); resolve(false) })
  })

async function waitUntil(fn, timeoutMs, stepMs = 150) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await fn()) return true
    await new Promise((r) => setTimeout(r, stepMs))
  }
  return false
}

/** fixture 应用：独立 node server，支持延迟监听/定时退出/永不监听 */
const SERVER_MJS = `import http from 'node:http'
const args = process.argv.slice(2)
const arg = (k, d) => { const i = args.indexOf(k); return i > -1 ? args[i + 1] : d }
const port = Number(arg('--port', 0))
const delay = Number(arg('--delay-ms', 0))
const exitAfter = Number(arg('--exit-after-ms', 0))
const listen = !args.includes('--no-listen')
if (!listen) { setInterval(() => {}, 1000) } else {
  setTimeout(() => {
    const server = http.createServer((req, res) => { res.end('ok') })
    server.listen(port, () => {
      if (exitAfter > 0) setTimeout(() => { server.close(() => process.exit(Number(arg('--exit-code', 9)))) }, exitAfter)
    })
  }, delay)
}
`

/** 组一个可运行的 fixture 工程：scripts/dev.mjs（规范源副本）+ dev.config.json + 各 app 目录 */
function makeFixture({ appSpecs, readyTimeoutMs = 6000, dirname = 'fx' }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `fulgurjs-devrun-${dirname}-`))
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true })
  fs.copyFileSync(REPO_RUNNER, path.join(root, 'scripts', 'dev.mjs'))
  const apps = appSpecs.map(({ name, port, scriptExtra = '' }) => {
    const dir = path.join(root, name)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'server.mjs'), SERVER_MJS)
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ name: `fixture-${name}`, private: true, scripts: { dev: `node server.mjs --port ${port} ${scriptExtra}`.trim() } }),
    )
    return { name, dir: name, port }
  })
  fs.writeFileSync(
    path.join(root, 'scripts', 'dev.config.json'),
    JSON.stringify({ apps, readyTimeoutMs }),
  )
  return root
}

function runRunner(root, envExtra = {}) {
  const child = spawn(process.execPath, [path.join(root, 'scripts', 'dev.mjs')], {
    cwd: root,
    env: { ...process.env, ...envExtra },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  })
  let out = ''
  child.stdout.on('data', (c) => { out += c })
  child.stderr.on('data', (c) => { out += c })
  const killGroup = () => { try { process.kill(-child.pid, 'SIGKILL') } catch { try { child.kill('SIGKILL') } catch { /* 已退出 */ } } }
  return { child, output: async () => out, killGroup }
}

/** 等待 runner 退出（全局超时按失败处理，避免挂死整个测试） */
async function waitExit(child, timeoutMs) {
  const result = await Promise.race([
    new Promise((r) => child.once('exit', (code, signal) => r({ code, signal }))),
    new Promise((r) => setTimeout(() => r({ code: 'TIMEOUT' }), timeoutMs)),
  ])
  if (result.code === 'TIMEOUT') throw new Error(`runner 未在 ${timeoutMs}ms 内退出（挂起）`)
  return result
}

async function assertGroupStopped(ports, timeoutMs = 5000) {
  const allFree = await waitUntil(async () => {
    for (const p of ports) if (await isUp(p)) return false
    return true
  }, timeoutMs)
  assert.ok(allFree, `停止后端口仍未释放：${ports.join(',')}`)
}

test.before(async () => {
  const busy = []
  for (const p of POOL) if (await isUp(p)) busy.push(p)
  assert.equal(busy.length, 0, `测试端口池被占用，拒绝继续：${busy.join(',')}（先排查占用者，不能静默换端口）`)
})

test('正常全就绪 → SIGTERM 整组停止、端口释放、无残留', { timeout: 60000 }, async () => {
  const [p1, p2] = POOL
  const root = makeFixture({ appSpecs: [{ name: 'a', port: p1 }, { name: 'b', port: p2 }] })
  const { child, killGroup } = runRunner(root)
  try {
    assert.ok(await waitUntil(async () => (await isUp(p1)) && (await isUp(p2)), 15000), '两个端口都应就绪')
    const { code, signal } = await new Promise((resolve) => {
      child.once('exit', (c, s) => resolve({ code: c, signal: s }))
      child.kill('SIGTERM')
    })
    assert.equal(code, 143, `SIGTERM 处理后应以退出码 143 结束（实际 code=${code} signal=${signal}）`)
    await assertGroupStopped([p1, p2])
  } finally {
    if (child.exitCode === null && child.signalCode === null) killGroup()
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('远程就绪前失败 → 非零退出并指认应用，宿主端口从未监听', { timeout: 60000 }, async () => {
  const [p1, p2] = POOL
  const root = makeFixture({ appSpecs: [{ name: 'a', port: p1, scriptExtra: '--exit-after-ms 1 --exit-code 3' }, { name: 'b', port: p2 }] })
  const { child, output, killGroup } = runRunner(root)
  try {
    const { code } = await waitExit(child, 20000)
    assert.equal(code, 1, `就绪前失败应退出码 1（实际 ${code}）`)
    const out = await output()
    assert.match(out, /启动失败：a/)
    assert.match(out, /退出码 3|提前退出/)
    assert.equal(await isUp(p2), false, '宿主端口不应监听（远程失败时宿主不应被拉起或应被终止）')
  } finally {
    if (child.exitCode === null && child.signalCode === null) killGroup()
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('远程就绪后、宿主启动期间退出 → 不宣布全就绪、整组停止（监督空窗回归）', { timeout: 60000 }, async () => {
  const [p1, p2] = POOL
  // a：快速就绪后 800ms 退出；b：慢启动 2500ms 后才监听——退出落在 b 探活期间
  const root = makeFixture({
    appSpecs: [{ name: 'a', port: p1, scriptExtra: '--exit-after-ms 800' }, { name: 'b', port: p2, scriptExtra: '--delay-ms 2500' }],
  })
  const { child, output, killGroup } = runRunner(root)
  try {
    const { code } = await waitExit(child, 25000)
    assert.equal(code, 1, `监督到退出应非零（实际 ${code}）`)
    const out = await output()
    assert.match(out, /启动失败：a\s*——\s*意外退出/)
    assert.doesNotMatch(out, /全部应用已就绪/, '不允许在组内应用已死后宣布全部就绪')
    await assertGroupStopped([p1, p2])
  } finally {
    if (child.exitCode === null && child.signalCode === null) killGroup()
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('全部就绪后应用退出 → 整组停止、端口释放', { timeout: 60000 }, async () => {
  const [p1, p2] = POOL
  const root = makeFixture({
    appSpecs: [{ name: 'a', port: p1, scriptExtra: '--exit-after-ms 2500' }, { name: 'b', port: p2 }],
  })
  const { child, output, killGroup } = runRunner(root)
  try {
    assert.ok(await waitUntil(async () => (await isUp(p1)) && (await isUp(p2)), 15000), '先全就绪')
    const { code } = await waitExit(child, 20000)
    assert.equal(code, 1)
    assert.match(await output(), /意外退出/)
    await assertGroupStopped([p1, p2])
  } finally {
    if (child.exitCode === null && child.signalCode === null) killGroup()
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('探活超时 → 指认端口与超时原因、整组停止', { timeout: 60000 }, async () => {
  const [p1, p2] = POOL
  const root = makeFixture({ readyTimeoutMs: 1500, appSpecs: [{ name: 'a', port: p1, scriptExtra: '--no-listen' }, { name: 'b', port: p2 }] })
  const { child, output, killGroup } = runRunner(root)
  try {
    const { code } = await waitExit(child, 20000)
    assert.equal(code, 1)
    const out = await output()
    assert.match(out, /未就绪/)
    assert.match(out, new RegExp(`端口 ${p1}`))
    assert.equal(await isUp(p2), false, '超时后其余应用不应残留')
  } finally {
    if (child.exitCode === null && child.signalCode === null) killGroup()
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('端口占用 → 预检拒绝（退出码 2）、指认应用与端口、既有服务不受影响', { timeout: 60000 }, async () => {
  const [p1, p2] = POOL
  const squatter = net.createServer((socket) => { socket.on('error', () => {}); socket.end('occupied') })
  await new Promise((r) => squatter.listen(p1, '127.0.0.1', r))
  const root = makeFixture({ appSpecs: [{ name: 'a', port: p1 }, { name: 'b', port: p2 }] })
  const { child, output, killGroup } = runRunner(root)
  try {
    const { code } = await waitExit(child, 15000)
    assert.equal(code, 2, `端口占用应退出码 2（实际 ${code}）`)
    const out = await output()
    assert.match(out, new RegExp(`a → 端口 ${p1} 已监听`))
    assert.match(out, /lsof/)
    assert.equal(await isUp(p1), true, '占用端口的既有服务必须原样保留')
    assert.equal(await isUp(p2), false, '预检失败不应启动任何应用')
  } finally {
    squatter.close()
    if (child.exitCode === null && child.signalCode === null) killGroup()
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('包管理器父进程退出但孙进程（dev server）仍监听 → 整组停止且孙进程被终止（孤儿回归）', { timeout: 60000 }, async () => {
  const [p1, p2] = POOL
  // a 的 dev 脚本：后台起 server 后脚本自身退出——端口起来但直接子进程（pnpm）已死
  const root = makeFixture({
    appSpecs: [{ name: 'a', port: p1, scriptExtra: '& \n exit 0' }, { name: 'b', port: p2, scriptExtra: '--delay-ms 3000' }],
  })
  const { child, output, killGroup } = runRunner(root)
  try {
    const { code } = await waitExit(child, 25000)
    assert.equal(code, 1, `检测到脚本退出应整组停止（实际 ${code}）`)
    const out = await output()
    assert.match(out, /启动失败：a/)
    await assertGroupStopped([p1, p2], 8000)
  } finally {
    if (child.exitCode === null && child.signalCode === null) killGroup()
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('pnpm 不存在 → 明确报错、非零退出', { timeout: 60000 }, async () => {
  const [p1] = POOL
  const root = makeFixture({ appSpecs: [{ name: 'a', port: p1 }] })
  const { child, output } = runRunner(root, { PATH: '/usr/bin:/bin' })
  try {
    const { code } = await waitExit(child, 15000)
    assert.equal(code, 1)
    assert.match(await output(), /无法启动|pnpm -v/)
  } finally {
    if (child.exitCode === null && child.signalCode === null) killGroup()
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('包管理器启动失败（退出码 5）→ 日志尾部透出、非零退出', { timeout: 60000 }, async () => {
  const [p1] = POOL
  const fakeBin = fs.mkdtempSync(path.join(os.tmpdir(), 'fulgurjs-fakepnpm-'))
  fs.writeFileSync(path.join(fakeBin, 'pnpm'), '#!/bin/sh\necho "pnpm: simulated registry unreachable" >&2\nexit 5\n')
  fs.chmodSync(path.join(fakeBin, 'pnpm'), 0o755)
  const root = makeFixture({ appSpecs: [{ name: 'a', port: p1 }] })
  const { child, output } = runRunner(root, { PATH: `${fakeBin}:/usr/bin:/bin` })
  try {
    const { code } = await waitExit(child, 15000)
    assert.equal(code, 1)
    const out = await output()
    assert.match(out, /simulated registry unreachable/)
    assert.match(out, /启动失败：a/)
  } finally {
    if (child.exitCode === null && child.signalCode === null) killGroup()
    fs.rmSync(fakeBin, { recursive: true, force: true })
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('含空格与中文的路径正常启动与停止', { timeout: 60000 }, async () => {
  const [p1, p2] = POOL
  const root = makeFixture({ appSpecs: [{ name: 'a', port: p1 }, { name: 'b', port: p2 }], dirname: '中文 空格 dir' })
  const { child, killGroup } = runRunner(root)
  try {
    assert.ok(await waitUntil(async () => (await isUp(p1)) && (await isUp(p2)), 15000), '空格/中文路径下应正常就绪')
    await new Promise((resolve) => {
      child.once('exit', resolve)
      child.kill('SIGTERM')
    })
    await assertGroupStopped([p1, p2])
  } finally {
    if (child.exitCode === null && child.signalCode === null) killGroup()
    fs.rmSync(root, { recursive: true, force: true })
  }
})
