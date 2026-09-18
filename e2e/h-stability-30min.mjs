// H 系列：多标签长稳 30 分钟——双标签交替操作（admin 宿主页 ↔ lowcode/bpm 联邦页）
// 采样：每循环 pageerror/console error/request 失败 + usedJSHeapSize 内存趋势；
// 产出：docs/screenshots/h-stability/*.png（起止+中段）+ h-stability-result.json
// 用法：node h-stability-30min.mjs [--base http://localhost:8662] [--minutes 30]
import { chromium } from '@playwright/test'
import fs from 'node:fs'

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : d }
const BASE = arg('--base', 'http://localhost:8662')
const MINUTES = Number(arg('--minutes', '30'))
const SHOT_DIR = '/Users/Admin/Desktop/ai 杂物/插件/fulgur-federation/docs/screenshots/h-stability'
fs.mkdirSync(SHOT_DIR, { recursive: true })
const PROFILE = `/tmp/fulgur-stab-${Date.now()}`
const startedAt = new Date()

const browser = await chromium.launchPersistentContext(PROFILE, {
  headless: true,
  args: ['--no-proxy-server'],
  viewport: { width: 1500, height: 900 },
})
const pageA = browser.pages()[0]
const pageB = await browser.newPage()

const tally = { pageErrors: 0, consoleErrors: 0, reqFailures: 0 }
const wire = (page, label) => {
  page.on('pageerror', (e) => { tally.pageErrors++; console.log(`[stab][${label}][pageerror]`, String(e).slice(0, 160)) })
  page.on('console', (m) => { if (m.type() === 'error') { tally.consoleErrors++; console.log(`[stab][${label}][console]`, m.text().slice(0, 160)) } })
  page.on('requestfailed', (r) => { tally.reqFailures++; console.log(`[stab][${label}][reqfail]`, r.url().slice(0, 120)) })
}
wire(pageA, 'A')
wire(pageB, 'B')

// 登录（A 标签登录，storage 共享给 B）
await pageA.goto(`${BASE}/main/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await pageA.waitForTimeout(8000)
await pageA.locator('input[placeholder*="账号"], input[placeholder*="用户名"]').first().fill('admin')
await pageA.locator('input[type="password"]').first().fill('Demo@123456')
await pageA.locator('button:has-text("登 录"), button:has-text("登录")').first().click()
await pageA.waitForTimeout(9000)

const routes = [
  ['/main/flowable/bpm/task/todo', '待办任务'],
  ['/main/lowcode/lowdev/formDesign', '表单设计'],
  ['/main/flowable/bpm/manager/user-group', '用户分组'],
  ['/main/lowcode/lowdev/moduleDesign', '模块设计'],
]
let cycle = 0
const samples = []
const endAt = startedAt.getTime() + MINUTES * 60000
let shotToggle = 0

while (Date.now() < endAt) {
  cycle++
  const [routeA, routeB] = [routes[cycle % routes.length], routes[(cycle + 1) % routes.length]]
  // A 标签：admin 宿主页导航
  await pageA.goto(`${BASE}${routeA[0]}`, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {})
  // B 标签：联邦页面导航（与 A 并存，交替操作语义）
  await pageB.goto(`${BASE}${routeB[0]}`, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {})
  await pageA.waitForTimeout(8000)
  await pageB.waitForTimeout(8000)
  // B 标签交互：刷新数据按钮（如存在）
  await pageB.locator('button:has-text("刷新"), [icon*="refresh"]').first().click({ timeout: 2000 }).catch(() => {})
  await pageA.waitForTimeout(4000)
  const mem = await pageA.evaluate(() => performance?.memory?.usedJSHeapSize ?? 0).catch(() => 0)
  samples.push({ cycle, at: new Date().toISOString(), routeA: routeA[1], routeB: routeB[1], heapMB: Math.round(mem / 1048576) })
  const elapsedMin = Math.round((Date.now() - startedAt.getTime()) / 60000)
  console.log(`[stab] cycle ${cycle} (${elapsedMin}min): A=${routeA[1]} B=${routeB[1]} heap=${samples[samples.length - 1].heapMB}MB err=${tally.pageErrors}/${tally.consoleErrors}/${tally.reqFailures}`)
  if (cycle % 10 === 5) {
    shotToggle = cycle
    await pageA.screenshot({ path: `${SHOT_DIR}/stab-mid-A-${cycle}.png` }).catch(() => {})
  }
  // 精确节奏：剩余时间不足一个循环则提前收尾
  if (endAt - Date.now() < 25000) break
  await pageA.waitForTimeout(15000)
}

await pageA.screenshot({ path: `${SHOT_DIR}/stab-end-A.png`, fullPage: false }).catch(() => {})
await pageB.screenshot({ path: `${SHOT_DIR}/stab-end-B.png`, fullPage: false }).catch(() => {})
await browser.close()

const heapTrend = samples.length > 1 ? samples[samples.length - 1].heapMB - samples[0].heapMB : 0
const ok = tally.pageErrors === 0 && tally.reqFailures === 0
const result = {
  base: BASE, minutes: MINUTES, cycles: cycle, startedAt: startedAt.toISOString(),
  finishedAt: new Date().toISOString(), tally,
  heapStartMB: samples[0]?.heapMB ?? 0, heapEndMB: samples[samples.length - 1]?.heapMB ?? 0, heapTrendMB: heapTrend,
  ok, at: new Date().toISOString(),
}
fs.writeFileSync(`${SHOT_DIR}/h-stability-result.json`, JSON.stringify({ ...result, samples }, null, 2))
console.log(`\n[stab] ${ok ? 'PASS' : 'FAIL'}：${MINUTES} 分钟 ${cycle} 循环，pageErrors=${tally.pageErrors}，consoleErrors=${tally.consoleErrors}，reqFailures=${tally.reqFailures}，heap ${samples[0]?.heapMB ?? 0}→${samples[samples.length - 1]?.heapMB ?? 0}MB（趋势 ${heapTrend}MB）`)
if (!ok) process.exit(1)
