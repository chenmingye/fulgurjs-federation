// D2 探针：低码 6 页活体复现，抓完整 pageerror 堆栈
// 用法：node d2-probe.mjs <base> <tag>
import { chromium } from '@playwright/test'

const BASE = process.argv[2] || 'http://localhost:8662'
const TAG = process.argv[3] || 'prod'
const PAGES = [
  ['moduleDesign', `${BASE}/main/lowcode/lowdev/moduleDesign`],
  ['form_external', `${BASE}/main/lowcode/form/form_external`],
  ['formDesign', `${BASE}/lowcode/lowdev/formDesign`],
  ['reportDesign', `${BASE}/lowcode/lowdev/reportDesign`],
  ['graphReportDesign', `${BASE}/lowcode/lowdev/graphReportDesign`],
  ['moduleDesign', `${BASE}/lowcode/lowdev/moduleDesign`],
  ['reportTest', `${BASE}/lowcode/lowdev/reportTest/problemReport`],
  ['form_external', `${BASE}/lowcode/form/form_external`],
]

const browser = await chromium.launchPersistentContext(`/tmp/pd2-${TAG}-${Date.now()}`, {
  headless: true, args: ['--no-proxy-server'], viewport: { width: 1500, height: 950 },
})
const page = browser.pages()[0]
const consoleErrs = []
const pageErrors = []
page.on('console', (m) => { if (m.type() === 'error') consoleErrs.push(m.text().slice(0, 500)) })
page.on('pageerror', (e) => pageErrors.push(e.stack || String(e)))

await page.goto(`${BASE}/main/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(6000)
await page.locator('input[placeholder*="账号"], input[placeholder*="用户名"]').first().fill('admin')
await page.locator('input[type="password"]').first().fill('Demo@123456')
await page.locator('button:has-text("登 录"), button:has-text("登录")').first().click()
await page.waitForTimeout(9000)

for (const [name, url] of PAGES) {
  const before = pageErrors.length
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {})
  await page.waitForTimeout(12000)
  const inputs = await page.evaluate(() => {
    const c = document.querySelector('.jeecg-layout-content')
    const inp = [...document.querySelectorAll('input:not([type=hidden])')]
    return { visible: inp.filter((i) => i.getBoundingClientRect().height > 0).length, len: c ? c.innerText.trim().length : -1 }
  })
  console.log(`\n== [${TAG}] ${name}: 可见输入=${inputs.visible} 内容长度=${inputs.len} 新增pageerror=${pageErrors.length - before}`)
  pageErrors.slice(before).slice(0, 2).forEach((s) => console.log('STACK: ' + s.slice(0, 800).replace(/\n/g, ' | ')))
  await page.screenshot({ path: `/tmp/probe-d2/${TAG}-${name}.png` }).catch(() => {})
}
console.log('\n===== console.error 汇总 =====')
;[...new Set(consoleErrs)].slice(0, 8).forEach((e) => console.log('CE: ' + e.slice(0, 300)))
await browser.close()
