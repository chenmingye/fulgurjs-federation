import { chromium } from '@playwright/test'
const BASE = 'http://localhost:8662'
const PROFILE = `/tmp/fulgur-diag-pg3-${Date.now()}`
const browser = await chromium.launchPersistentContext(PROFILE, { headless: true, args: ['--no-proxy-server'], viewport: { width: 1600, height: 900 } })
const page = browser.pages()[0]
const errs = []
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 400)) })
page.on('pageerror', (e) => errs.push('[pageerror] ' + String(e).slice(0, 400)))
await page.goto(`${BASE}/main/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(8000)
await page.locator('input[placeholder*="账号"], input[placeholder*="用户名"]').first().fill('admin')
await page.locator('input[type="password"]').first().fill('Demo@123456')
await page.locator('button:has-text("登 录"), button:has-text("登录")').first().click()
await page.waitForTimeout(8000)
await page.goto(`${BASE}/main/lowcode/lowdev/formDesign`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(30000)
const out = await page.evaluate(() => ({
  textLen: document.body.innerText.length,
  snippet: document.body.innerText.replace(/\s+/g, ' ').slice(60, 420),
  pg: document.querySelectorAll('.el-pagination').length,
}))
console.log(JSON.stringify(out, null, 1))
console.log('errs:', errs.slice(0, 5))
await browser.close()
