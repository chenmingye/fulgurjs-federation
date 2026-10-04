/** 本场景浏览器验收；只启动/停止自身进程，不复用占用端口。 */
import { chromium, expect } from '@playwright/test'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
const mode = process.argv[2] || 'dev'
if (!['dev', 'prod'].includes(mode)) throw new Error('用法：node verify.mjs dev|prod')
const apps = [['remote18', 5441], ['remote18-strict', 5442], ['remote19', 5443], ['host', 5440], ['vue-host', 5445]]
const engineVersion = JSON.parse(fs.readFileSync(path.join(root, 'host/node_modules/vite/package.json'), 'utf8')).version
const evidence = path.resolve(root, '../../.run/react-versions', engineVersion, mode)
fs.mkdirSync(evidence, { recursive: true })
const children = []
let browser, server, cleanupPromise
const cleanup = () => cleanupPromise ||= (async () => {
  await browser?.close()
  if (server?.listening) await new Promise((resolve) => server.close(resolve))
  for (const child of children) {
    if (!child.pid) continue
    try { process.kill(-child.pid, 'SIGTERM') } catch (error) { if (error.code !== 'ESRCH') throw error }
  }
})()
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  cleanup().finally(() => process.exit(130))
})
const isUp = (port) => new Promise((resolve) => {
  const socket = net.connect({ port, host: '127.0.0.1' })
  socket.once('connect', () => { socket.destroy(); resolve(true) })
  socket.once('error', () => resolve(false))
})
const run = (app, args) => new Promise((resolve, reject) => {
  const child = spawn('npm', args, { cwd: path.join(root, app), stdio: 'inherit' })
  child.on('error', reject)
  child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`${app}: ${args.join(' ')} exit ${code}`)))
})
try {
  for (const port of mode === 'dev' ? apps.map(([, p]) => p) : [5444]) {
    if (await isUp(port)) throw new Error(`端口 ${port} 已被占用；请停止该服务或调整本场景端口，不复用未知实例`)
  }
  if (mode === 'dev') {
    for (const [app, port] of apps) {
      const fd = fs.openSync(path.join(evidence, `${app}.log`), 'w')
      const child = spawn('npm', ['run', 'dev'], { cwd: path.join(root, app), detached: true, stdio: ['ignore', fd, fd] })
      fs.closeSync(fd)
      children.push(child)
      const deadline = Date.now() + 60000
      while (!await isUp(port)) {
        if (child.exitCode !== null || Date.now() > deadline) throw new Error(`${app} 未就绪，查看日志`)
        await new Promise((resolve) => setTimeout(resolve, 200))
      }
    }
  } else {
    for (const [app] of apps) await run(app, ['run', 'build'])
    const mime = { '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.html': 'text/html', '.svg': 'image/svg+xml' }
    server = http.createServer((req, res) => {
      const [prefix, ...parts] = new URL(req.url, 'http://localhost').pathname.slice(1).split('/')
      const app = apps.find(([name]) => `rv-${name}` === prefix)?.[0]
      if (!app) { res.writeHead(404); res.end(); return }
      const dist = path.join(root, app, 'dist')
      const file = path.resolve(dist, decodeURIComponent(parts.join('/')) || 'index.html')
      if (!file.startsWith(dist + path.sep)) { res.writeHead(403); res.end(); return }
      const target = fs.existsSync(file) && fs.statSync(file).isFile() ? file : !path.extname(file) ? path.join(dist, 'index.html') : null
      if (!target) { res.writeHead(404); res.end(); return }
      res.setHeader('Content-Type', mime[path.extname(target)] || 'application/octet-stream')
      fs.createReadStream(target).pipe(res)
    })
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(5444, '127.0.0.1', resolve) })
  }
  browser = await chromium.launch({ headless: true })
  // 冷启动先打开每个远程，完成 JSX/client 等按需依赖预构建，避免后续
  // HMR 整页 reload 重置测试中的业务状态；正式断言仍在新宿主页面执行。
  if (mode === 'dev') {
    for (const [, port] of apps.filter(([app]) => app.startsWith('remote'))) {
      const warm = await browser.newPage()
      const warmErrors = []
      warm.on('pageerror', (error) => { warmErrors.push(String(error)); console.log(`warm ${port}: ${error}`) })
      warm.on('console', (message) => { if (message.type() === 'error') warmErrors.push(message.text()) })
      await warm.goto(`http://localhost:${port}/`)
      await expect(warm.getByTestId('child-counter')).toBeVisible({ timeout: 60000 }).catch(async (error) => {
        fs.writeFileSync(path.join(evidence, `warm-${port}-error.json`), JSON.stringify({ errors: warmErrors, html: await warm.content() }, null, 2))
        await warm.screenshot({ path: path.join(evidence, `warm-${port}-failure.png`) }); throw error
      })
      await warm.waitForLoadState('networkidle')
      await warm.close()
    }
  }
  const page = await browser.newPage()
  const pageErrors = [], consoleErrors = []
  page.on('pageerror', (e) => pageErrors.push(String(e)))
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()) })
  await page.goto(mode === 'dev' ? 'http://localhost:5440/' : 'http://127.0.0.1:5444/rv-host/')
  await expect(page.getByTestId('async-choice')).toHaveText('异步选择的策略（1.0.0）', { timeout: 30000 })
  await expect(page.getByTestId('isolated').getByTestId('child-version')).toContainText('18.3.1', { timeout: 30000 })
  await page.waitForFunction(() => window.__RV?.isolated && window.__RV.hostDynamicSame === true)
  expect(await page.evaluate(() => ({
    isolated: window.__RV.isolated.react !== window.__RV.hostReact,
    dynamicSame: window.__RV.isolated.dynamicSame,
    context: window.__RV.isolated.context,
  }))).toEqual({ isolated: true, dynamicSame: true, context: 'remote18 自有 Context' })
  expect(await page.evaluate(() => window.__RV.isolated.rendererVersion)).toMatch(/^18\.3\.1(?:-|$)/)
  await page.getByTestId('host-counter').click()
  await page.getByTestId('isolated').getByTestId('child-counter').click()
  await expect(page.getByTestId('host-counter')).toContainText('1')
  await expect(page.getByTestId('isolated').getByTestId('child-counter')).toContainText('1')
  await page.screenshot({ path: path.join(evidence, 'isolated.png'), fullPage: true })
  expect(consoleErrors).toEqual([])
  const before = page.url()
  await page.getByTestId('reject').click()
  await expect(page.getByTestId('recovery')).toContainText('MFU-003', { timeout: 30000 })
  expect(await page.getByTestId('recovery').getByTestId('child-version').count()).toBe(0)
  await expect(page.getByTestId('host-counter')).toBeEnabled()
  await page.screenshot({ path: path.join(evidence, 'rejected.png'), fullPage: true })
  const expectedErrors = consoleErrors.splice(0)
  for (const error of expectedErrors) expect(error).toContain('MFU-003')
  await page.getByTestId('recover').click()
  await expect(page.getByTestId('recovery').getByTestId('child-version')).toContainText('19.3.0', { timeout: 30000 }).catch(async (error) => {
    console.log(await page.locator('main').innerText()); console.log(JSON.stringify({ pageErrors, consoleErrors }));
    await page.screenshot({ path: path.join(evidence, 'failure.png'), fullPage: true }); throw error
  })
  await page.waitForFunction(() => window.__RV?.corrected)
  expect(await page.evaluate(() => window.__RV.corrected.react === window.__RV.hostReact && window.__RV.corrected.dynamicSame)).toBe(true)
  await page.getByTestId('recovery').getByTestId('child-counter').click()
  await expect(page.getByTestId('recovery').getByTestId('child-counter')).toContainText('1')
  await expect(page.getByTestId('host-counter')).toContainText('1')
  await expect(page.getByTestId('isolated').getByTestId('child-counter')).toContainText('1')
  expect(page.url()).toBe(before)
  await page.screenshot({ path: path.join(evidence, 'recovered.png'), fullPage: true })
  expect(pageErrors).toEqual([])
  expect(consoleErrors).toEqual([])
  const vuePage = await browser.newPage()
  vuePage.on('pageerror', (e) => pageErrors.push(String(e)))
  vuePage.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()) })
  await vuePage.goto(mode === 'dev' ? 'http://localhost:5445/' : 'http://127.0.0.1:5444/rv-vue-host/')
  await expect(vuePage.getByTestId('child-version')).toContainText('18.3.1', { timeout: 30000 })
  await vuePage.waitForFunction(() => window.__VUE_R18?.dynamicSame)
  await vuePage.getByTestId('vue-counter').click()
  await vuePage.getByTestId('child-counter').click()
  await expect(vuePage.getByTestId('vue-counter')).toContainText('1')
  await expect(vuePage.getByTestId('child-counter')).toContainText('1')
  expect(pageErrors).toEqual([])
  expect(consoleErrors).toEqual([])
  await vuePage.screenshot({ path: path.join(evidence, 'vue-host-react18.png'), fullPage: true })
  const runtimeVersion = await page.evaluate(() => window.__RV.pluginVersion)
  const installedVersion = JSON.parse(fs.readFileSync(path.join(root, 'host/node_modules/@fulgurjs/federation/package.json'), 'utf8')).version
  const vite = JSON.parse(fs.readFileSync(path.join(root, 'host/node_modules/vite/package.json'), 'utf8')).version
  const stage = process.env.FULGURJS_ACCEPTANCE_STAGE || (runtimeVersion === installedVersion ? 'registry-installed' : 'source-candidate')
  fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify({ mode, vite, stage, runtimeVersion, installedVersion, pass: true, checks: ['async hook overrides first static import', 'real React/renderer 18+19', 'distinct scoped React identity', 'static/dynamic identity', 'Context+Hooks+state', 'strict refusal before mount', 'corrected remote recovery without reload', 'Vue host aligned React18 bridge'], expectedErrors, pageErrors, consoleErrors }, null, 2))
  console.log(`${mode}: React 隔离、严格拒绝、对齐版本恢复全部通过；证据 ${evidence}`)
 } finally {
  await cleanup()
}
