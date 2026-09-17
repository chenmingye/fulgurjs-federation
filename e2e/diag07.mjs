// 诊断探针：dev 07 审批操作页 pageerror 完整堆栈
import { chromium } from '@playwright/test'
const BASE = process.env.VBASE || 'http://localhost:8773'
const TAG = process.env.VTAG || 'dev'
const PROFILE = `/tmp/fulgur-diag07-${TAG}-${Date.now()}`
const browser = await chromium.launchPersistentContext(PROFILE, { headless: true, args: ['--no-proxy-server'], viewport: { width: 1600, height: 900 } })
const page = browser.pages()[0]
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push('[console.error] ' + m.text()) })
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.stack))
await page.goto(`${BASE}/main/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(8000)
await page.locator('input[placeholder*="账号"], input[placeholder*="用户名"]').first().fill('admin')
await page.locator('input[type="password"]').first().fill('Demo@123456')
await page.locator('button:has-text("登 录"), button:has-text("登录")').first().click()
await page.waitForTimeout(8000)
// 直达 07 路由
await page.goto(`${BASE}/main/flowable/bpm/manager/action?processsKey=demo_leave`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(20000)
const info = await page.evaluate(() => ({
  url: location.href.slice(0, 200),
  textLen: document.body.innerText.length,
  snippet: document.body.innerText.replace(/\s+/g, ' ').slice(0, 300),
  iframes: document.querySelectorAll('iframe').length,
}))
console.log(JSON.stringify(info, null, 1))
console.log('---- errors ----')
console.log(errors.slice(0, 8).join('\n\n'))
await page.screenshot({ path: `/tmp/fulgur-diag07-${TAG}.png` })
await browser.close()
