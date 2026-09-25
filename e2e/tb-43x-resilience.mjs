// tb-43x-resilience.mjs —— 4.3.0 快速韧性验收：BPM 401 诚实失败 + 远程故障 MFU-001 + 恢复
// 复用既有验收的判定口径：401 → 无 refresh-token 伪造 + relogin 框；故障 → MFU-001 三段式；恢复 → 页面数据回来
import { chromium } from '/Users/Admin/Desktop/ai_project/Plugin_Workshop/fulgurjs-federation/e2e/node_modules/@playwright/test/index.mjs'
import fs from 'node:fs'
import path from 'node:path'

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : d }
const BASE = arg('--base', 'http://localhost:8773/main')
const OUT = arg('--out', '/Users/Admin/Desktop/ai_project/Plugin_Workshop/fulgurjs-federation/docs/func-results/4.3.x-resilience.json')
const ENV = /8662/.test(BASE) ? '8662-prod' : 'dev'
fs.mkdirSync(path.dirname(OUT), { recursive: true })
const report = { env: ENV, base: BASE, ts: new Date().toISOString(), results: [] }
const record = (n, ok, d = '') => { report.results.push({ n, ok, d }); console.log(`${ok ? 'PASS' : 'FAIL'} ${n}${d ? ' — ' + d : ''}`) }

const browser = await chromium.launchPersistentContext(`/tmp/tb-43x-res-${ENV}-${Date.now()}`, {
  headless: true, args: ['--no-proxy-server'], viewport: { width: 1600, height: 950 },
})
const page = browser.pages()[0] ?? (await browser.newPage())

async function login() {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.locator('input[placeholder*="账号"]').first().waitFor({ state: 'visible', timeout: 60000 })
  await page.locator('input[placeholder*="账号"]').first().fill('admin')
  await page.locator('input[type="password"]').first().fill('P@ssw0rd')
  await page.locator('button:has-text("登 录"), button:has-text("登录")').first().click()
  for (let i = 0; i < 90; i++) { await page.waitForTimeout(1000); if (!/login/.test(page.url())) return true }
  return false
}

// ═══ 场景一：BPM 401 诚实失败（网络层注入 yudao 形态 code=401）═══
{
  const ok = await login()
  record('401 前置：登录', ok)
  await page.goto(`${BASE}/flowable/bpm/task/todo`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  for (let i = 0; i < 40; i++) { await page.waitForTimeout(1000); if ((await page.locator('.ant-table-row, .vxe-body--row, .el-table__row').count()) > 0) break }
  record('401 前置：BPM 待办渲染', (await page.locator('.ant-table-row, .vxe-body--row, .el-table__row').count()) > 0)

  const refreshReqs = []
  page.on('request', (r) => { if (/refresh-token|auth\/refresh/i.test(r.url())) refreshReqs.push(r.url()) })
  await page.route('**/bpm/task/todo-page*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 401, data: null, msg: '账号未登录' }) }),
  )
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(12000)
  const st = await page.evaluate(() => ({
    relogin: document.body.innerText.includes('重新登录') || !!document.querySelector('.el-message-box, .el-overlay.is-message-box'),
    refreshResidue: ['ACCESS_TOKEN', 'REFRESH_TOKEN'].filter((k) => window.localStorage.getItem(k) !== null),
  }))
  record('401：无 refresh-token 请求（不伪造刷新）', refreshReqs.length === 0, refreshReqs.join(','))
  record('401：重新登录框弹出（handleAuthorized）', st.relogin)
  await page.unroute('**/bpm/task/todo-page*')
  await page.screenshot({ path: `/tmp/43-res-401-${ENV}.png` })
}

// ═══ 场景二：远程故障 MFU-001 三段式 + 恢复（网络层注入，不改服务状态）═══
{
  let blocked = 0
  await page.route('**/flowable/fulgurjs-remoteEntry.js*', (route) => { blocked++; return route.abort('failed') })
  await page.route('**/flowable/@fulgurjs-entry.js*', (route) => { blocked++; return route.abort('failed') })
  await page.goto(`${BASE}/flowable/bpm/manager/model`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(18000)
  const st = await page.evaluate(() => {
    const v = document.querySelector('.fulgurjs-view')
    const t = v?.textContent ?? ''
    return {
      mfu001: /MFU-001/.test(t),
      hasErrorCode: /MFU-\d{3}/.test(t),
      hasFix: /修法|remedy|检查|核对/.test(t),
      text: t.replace(/\s+/g, ' ').slice(0, 220),
    }
  })
  record('故障：remoteEntry 被注入失败（拦截生效）', blocked > 0, `blocked=${blocked}`)
  record('故障：联邦错误占位显式三段式（MFU-001 + 根因 + 修法）', st.mfu001 && st.hasFix, st.text.slice(0, 100))
  await page.screenshot({ path: `/tmp/43-res-fault-${ENV}.png` })
  await page.unroute('**/flowable/fulgurjs-remoteEntry.js*')
  await page.unroute('**/flowable/@fulgurjs-entry.js*')
  // 恢复
  await page.goto(`${BASE}/flowable/bpm/manager/model`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(20000)
  const rows = await page.locator('.ant-table-row, .vxe-body--row, .el-table__row').count()
  record('恢复：模型列表数据回来', rows > 0, `rows=${rows}`)
  await page.screenshot({ path: `/tmp/43-res-recover-${ENV}.png` })
}

fs.writeFileSync(OUT, JSON.stringify(report, null, 2))
console.log(`[report] ${OUT}`)
await browser.close()
process.exit(report.results.some((r) => !r.ok) ? 1 : 0)
