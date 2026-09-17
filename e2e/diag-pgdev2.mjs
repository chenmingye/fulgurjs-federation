import { chromium } from '@playwright/test'
const browser = await chromium.launchPersistentContext(`/tmp/fulgur-pgdev2-${Date.now()}`, { headless: true, args: ['--no-proxy-server'], viewport: { width: 1600, height: 900 } })
const page = browser.pages()[0]
await page.goto('http://localhost:8773/main/', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(8000)
await page.locator('input[placeholder*="账号"], input[placeholder*="用户名"]').first().fill('admin')
await page.locator('input[type="password"]').first().fill('Demo@123456')
await page.locator('button:has-text("登 录"), button:has-text("登录")').first().click()
await page.waitForTimeout(8000)
await page.goto('http://localhost:8773/main/lowcode/lowdev/formDesign', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(25000)
const out = await page.evaluate(() => ({
  totals: Array.from(document.querySelectorAll('.el-pagination__total')).map((n) => n.textContent.trim()),
  pgTexts: Array.from(document.querySelectorAll('.el-pagination span, .el-pagination button')).map((n) => n.textContent.trim()).filter(Boolean).slice(0, 8),
}))
console.log(JSON.stringify(out, null, 1))
await browser.close()
