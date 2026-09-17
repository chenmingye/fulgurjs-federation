import { chromium } from '@playwright/test'
const BASE = 'http://localhost:8662'
const PROFILE = `/tmp/fulgur-diag25d-${Date.now()}`
const browser = await chromium.launchPersistentContext(PROFILE, { headless: true, args: ['--no-proxy-server'], viewport: { width: 1600, height: 900 } })
const page = browser.pages()[0]
await page.goto(`${BASE}/main/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(8000)
await page.locator('input[placeholder*="账号"], input[placeholder*="用户名"]').first().fill('admin')
await page.locator('input[type="password"]').first().fill('Demo@123456')
await page.locator('button:has-text("登 录"), button:has-text("登录")').first().click()
await page.waitForTimeout(8000)
await page.goto(`${BASE}/main/lowcode/lowdev/moduleDesign`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(25000)
const out = await page.evaluate(() => {
  const boxItem = document.querySelectorAll('.box-item').length
  const tt = Array.from(document.querySelectorAll('[class*="el-tooltip"], [aria-describedby]')).map((n) => ({
    tag: n.tagName, cls: String(n.className).slice(0, 70), html: n.outerHTML.slice(0, 120),
  }))
  return { boxItem, tt }
})
console.log(JSON.stringify(out, null, 1))
await browser.close()
