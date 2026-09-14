// D1 计时探针（乾坤基线版）：菜单导航 审批中心→流程模型→新建模型，轮询表单出现耗时
// 用法：node probe-d1-qiankun-timing.mjs <base> <tag> [等待秒数=45]
import { chromium } from '@playwright/test'
import fs from 'node:fs'

const BASE = process.argv[2] || 'http://localhost:8661'
const TAG = process.argv[3] || 'qiankun'
const MAXWAIT = parseInt(process.argv[4] || '45', 10)
const DIR = `/tmp/probe-d1/${TAG}`
fs.mkdirSync(DIR, { recursive: true })

const browser = await chromium.launchPersistentContext(`/tmp/pd1q-${TAG}-${Date.now()}`, {
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
await page.waitForTimeout(10000)

// 菜单导航
await page.locator('text=审批中心').first().click()
await page.waitForTimeout(2500)
await page.locator('.ant-menu li, .el-menu li, [class*="menu"] >> text=流程模型').first().click({ timeout: 15000 }).catch(async () => {
  await page.locator('text=流程模型').nth(1).click({ timeout: 10000 }).catch(() => {})
})
await page.waitForTimeout(15000)
console.log(`[${TAG}] url: ${page.url()}`)
const rows = await page.locator('.el-table__body tr.el-table__row').count()
console.log(`[${TAG}] 列表行数: ${rows}`)
await page.screenshot({ path: `${DIR}/06-qiankun-流程模型列表.png` })

await page.locator('button:has-text("新建模型"), span:has-text("新建模型")').first().click({ timeout: 10000 })
const t0 = Date.now()
let appeared = -1
const timeline = []
while (Date.now() - t0 < MAXWAIT * 1000) {
  const n = await page.evaluate(() => {
    const inputs = [...document.querySelectorAll('input:not([type=hidden])')]
    return inputs.filter((i) => i.getBoundingClientRect().height > 0 && i.offsetParent !== null).length
  })
  timeline.push(`${Math.round((Date.now() - t0) / 1000)}s:${n}`)
  if (n >= 5) { appeared = Math.round((Date.now() - t0) / 1000); break }
  await page.waitForTimeout(1000)
}
console.log(`[${TAG}] 表单出现耗时: ${appeared > 0 ? appeared + 's' : '未出现(' + MAXWAIT + 's内)'}`)
console.log(`[${TAG}] 轮询序列: ${timeline.join(' ')}`)
await page.waitForTimeout(3000)
await page.screenshot({ path: `${DIR}/07-qiankun-创建流程最终态.png` })
console.log(`[${TAG}] console.error 数: ${new Set(consoleErrs).size}`)
;[...new Set(consoleErrs)].slice(0, 5).forEach((e) => console.log('  ' + e))
await browser.close()
