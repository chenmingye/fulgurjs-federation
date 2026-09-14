// 功能深度探针：逐页统计「接口是否成功 / 有无数据行 / 有无操作按钮 / 内容区是否空白」
// 用法：VBASE=http://localhost:8662 VTAG=prod node probe-depth.mjs
// 目的：把"页面能打开"与"功能可用"区分开——产出证据而非猜测
import { chromium } from '@playwright/test'
import fs from 'node:fs'

const BASE = process.env.VBASE || 'http://localhost:8662'
const TAG = process.env.VTAG || 'prod'
const OUT = `/tmp/probe-depth-${TAG}.json`
const PROFILE = `/tmp/unifed-depth-${TAG}-${Date.now()}`

const PAGES = [
  ['todo', '/flowable/bpm/task/todo'],
  ['done', '/flowable/bpm/task/done'],
  ['my', '/flowable/bpm/task/my'],
  ['copy', '/flowable/bpm/task/copy'],
  ['create', '/flowable/bpm/task/create'],
  ['model', '/flowable/bpm/manager/model'],
  ['form', '/flowable/bpm/manager/form'],
  ['category', '/flowable/bpm/manager/category'],
  ['user-group', '/flowable/bpm/manager/user-group'],
  ['process-listener', '/flowable/bpm/manager/process-listener'],
  ['process-expression', '/flowable/bpm/manager/process-expression'],
  ['instance-manager', '/flowable/bpm/manager/process-instance/manager'],
  ['task-manager', '/flowable/bpm/manager/process-tasnk'],
  ['definition', '/flowable/bpm/manager/definition'],
  ['model-create', '/flowable/bpm/manager/model/create'],
  ['model-update', '/flowable/bpm/manager/model/update/5c0fd82d-4849-11f0-8041-f8e43be98cda'],
]

const browser = await chromium.launchPersistentContext(PROFILE, {
  headless: true,
  args: ['--no-proxy-server'],
  viewport: { width: 1600, height: 1000 },
})
const page = browser.pages()[0]
let apiCalls = []
page.on('response', (r) => {
  const u = r.url()
  if (!/\.(js|css|png|svg|woff2?|ico|json)(\?|$)/.test(u) && /\/(bpm|system|lowcode|lowdesign|report|amis)\//.test(u)) {
    apiCalls.push({ url: u.replace(BASE, '').split('?')[0], status: r.status() })
  }
})
const pageErrors = []
page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 150)))

await page.goto(`${BASE}/main/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(6000)
await page.locator('input[placeholder*="账号"], input[placeholder*="用户名"]').first().fill('admin')
await page.locator('input[type="password"]').first().fill('Demo@123456')
await page.locator('button:has-text("登 录"), button:has-text("登录")').first().click()
await page.waitForTimeout(8000)

const results = {}
for (const [name, route] of PAGES) {
  apiCalls = []
  pageErrors.length = 0
  await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {})
  await page.waitForTimeout(11000)
  // 主内容区（排除左侧菜单）的可见文本量
  const mainText = await page
    .locator('.ant-layout-content, .jeecg-layout-content, #app .ant-layout-content')
    .first()
    .innerText()
    .catch(() => '')
  const rows = await page.locator('.ant-table-tbody tr:not(.ant-table-placeholder), .vxe-table--body tbody tr').count()
  const buttons = await page.locator('.ant-layout-content button, .ant-layout-content .ant-btn').count()
  const inputs = await page.locator('.ant-layout-content input:not([type=hidden]), .ant-layout-content textarea, .ant-layout-content .ant-select').count()
  const failApi = apiCalls.filter((c) => c.status >= 400)
  results[name] = {
    route,
    mainTextLen: mainText.trim().length,
    tableRows: rows,
    buttons,
    inputs,
    apiTotal: apiCalls.length,
    apiFailed: failApi.map((c) => `${c.status} ${c.url}`),
    pageErrors: [...new Set(pageErrors)].slice(0, 3),
  }
  console.log(name, JSON.stringify(results[name]))
}
fs.writeFileSync(OUT, JSON.stringify({ base: BASE, tag: TAG, results }, null, 2))
console.log('SAVED', OUT)
await browser.close()
