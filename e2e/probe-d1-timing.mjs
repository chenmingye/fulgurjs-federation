// D1 计时探针：点击"新建模型"后每秒轮询表单可见输入框数，记录表单出现耗时
// 用法：node probe-d1-timing.mjs <base> <tag> [等待秒数=45]
import { chromium } from '@playwright/test'
import fs from 'node:fs'

const BASE = process.argv[2] || 'http://localhost:8773'
const TAG = process.argv[3] || 'dev'
const MAXWAIT = parseInt(process.argv[4] || '45', 10)
const DIR = `/tmp/probe-d1/${TAG}`
fs.mkdirSync(DIR, { recursive: true })

const browser = await chromium.launchPersistentContext(`/tmp/pd1t-${TAG}-${Date.now()}`, {
  headless: true, args: ['--no-proxy-server'], viewport: { width: 1500, height: 950 },
})
const page = browser.pages()[0]
const consoleErrs = []
page.on('console', (m) => { if (m.type() === 'error') consoleErrs.push(m.text().slice(0, 150)) })
page.on('pageerror', (e) => consoleErrs.push('PAGEERROR ' + String(e).slice(0, 150)))

await page.goto(`${BASE}/main/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(6000)
await page.locator('input[placeholder*="账号"], input[placeholder*="用户名"]').first().fill('admin')
await page.locator('input[type="password"]').first().fill('Demo@123456')
await page.locator('button:has-text("登 录"), button:has-text("登录")').first().click()
await page.waitForTimeout(9000)

await page.goto(`${BASE}/flowable/bpm/manager/model`, { waitUntil: 'domcontentloaded', timeout: 45000 })
await page.waitForTimeout(15000)

await page.locator('button:has-text("新建模型"), span:has-text("新建模型")').first().click({ timeout: 8000 })
const t0 = Date.now()
let appeared = -1
const timeline = []
while (Date.now() - t0 < MAXWAIT * 1000) {
  const n = await page.evaluate(() => {
    const inputs = [...document.querySelectorAll('.jeecg-layout-content input:not([type=hidden])')]
    return inputs.filter((i) => i.getBoundingClientRect().height > 0).length
  })
  timeline.push(`${Math.round((Date.now() - t0) / 1000)}s:${n}`)
  if (n > 0) { appeared = Math.round((Date.now() - t0) / 1000); break }
  await page.waitForTimeout(1000)
}
console.log(`[${TAG}] 表单出现耗时: ${appeared > 0 ? appeared + 's' : '未出现(' + MAXWAIT + 's内)'}`)
console.log(`[${TAG}] 轮询序列: ${timeline.join(' ')}`)
await page.screenshot({ path: `${DIR}/05-创建流程-最终态.png` })
console.log(`[${TAG}] console.error 数: ${new Set(consoleErrs).size}`)
;[...new Set(consoleErrs)].slice(0, 5).forEach((e) => console.log('  ' + e))
await browser.close()
