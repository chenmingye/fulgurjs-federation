// D2 六页 H10 截图产出：dev + prod 双环境，§1.1 命名规范
// 用法：node d2-shot.mjs <base> <env>   （env: dev | prod）
// 页面页码沿用 27 页矩阵：22 formDesign / 23 reportDesign / 24 graphReportDesign /
// 25 moduleDesign / 26 reportTest / 27 form_external
import { chromium } from '@playwright/test'
import fs from 'node:fs'

const BASE = process.argv[2] || 'http://localhost:8773'
const ENV = process.argv[3] || 'dev'
const DIR = '/Users/Admin/Desktop/ai 杂物/插件/vite-plugin-unifed/docs/screenshots/migration1-dev'
fs.mkdirSync(DIR, { recursive: true })
const shot = (pageNo, page, step) => `${DIR}/${ENV}-${pageNo}-${page}-${step}.png`

const PAGES = [
  ['22', '表单设计', '/lowcode/lowdev/formDesign'],
  ['23', '报表设计', '/lowcode/lowdev/reportDesign'],
  ['24', '图形报表设计', '/lowcode/lowdev/graphReportDesign'],
  ['25', '模块设计', '/lowcode/lowdev/moduleDesign'],
  ['26', '报表测试', '/lowcode/lowdev/reportTest/problemReport'],
  ['27', '外部表单', '/lowcode/form/form_external'],
]

const browser = await chromium.launchPersistentContext(`/tmp/pd2s-${ENV}-${Date.now()}`, {
  headless: true, args: ['--no-proxy-server'], viewport: { width: 1500, height: 950 },
})
const page = browser.pages()[0]
const consoleErrs = []
const pageErrors = []
const failedReqs = []
page.on('console', (m) => { if (m.type() === 'error') consoleErrs.push(m.text().slice(0, 200)) })
page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 200)))
page.on('response', (r) => { if (r.status() >= 400) failedReqs.push(`${r.status()} ${r.url().slice(0, 120)}`) })

await page.goto(`${BASE}/main/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(6000)
await page.locator('input[placeholder*="账号"], input[placeholder*="用户名"]').first().fill('admin')
await page.locator('input[type="password"]').first().fill('Demo@123456')
await page.locator('button:has-text("登 录"), button:has-text("登录")').first().click()
await page.waitForTimeout(9000)

const results = []
for (const [no, name, path] of PAGES) {
  const before = pageErrors.length
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {})
  await page.waitForTimeout(15000)
  const m = await page.evaluate(() => {
    const c = document.querySelector('.jeecg-layout-content')
    const inp = [...document.querySelectorAll('input:not([type=hidden])')]
    const rows = document.querySelectorAll('[class*="table__body"] tr, .el-table__row').length
    return { vis: inp.filter((i) => i.getBoundingClientRect().height > 0).length, len: c ? c.innerText.trim().length : -1, rows }
  })
  await page.screenshot({ path: shot(no, name, '01-页面整览') })
  const newErrs = pageErrors.length - before
  results.push(`${no} ${name}: 可见输入=${m.vis} 内容=${m.len} 行=${m.rows} 新增pageerror=${newErrs} iframe=${await page.locator('iframe').count()}`)
}

console.log(`===== [${ENV}] D2 六页截图与指标 =====`)
results.forEach((r) => console.log('  ' + r))
console.log(`console.error=${new Set(consoleErrs).size} pageerror=${new Set(pageErrors).size} 失败请求=${new Set(failedReqs).size}`)
;[...new Set(pageErrors)].slice(0, 6).forEach((e) => console.log('  PE: ' + e.slice(0, 160)))
;[...new Set(failedReqs)].slice(0, 6).forEach((e) => console.log('  REQ: ' + e))
await browser.close()
