import { chromium } from '@playwright/test'
const browser = await chromium.launchPersistentContext(`/tmp/fulgur-pgdev-${Date.now()}`, { headless: true, args: ['--no-proxy-server'], viewport: { width: 1600, height: 900 } })
const page = browser.pages()[0]
const errs = []
page.on('pageerror', (e) => errs.push(String(e).slice(0, 150)))
await page.goto('http://localhost:8773/main/', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(8000)
await page.locator('input[placeholder*="账号"], input[placeholder*="用户名"]').first().fill('admin')
await page.locator('input[type="password"]').first().fill('Demo@123456')
await page.locator('button:has-text("登 录"), button:has-text("登录")').first().click()
await page.waitForTimeout(8000)
await page.goto('http://localhost:8773/main/lowcode/lowdev/formDesign', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(25000)
const out = await page.evaluate(() => ({
  textLen: document.body.innerText.length,
  snippet: document.body.innerText.replace(/\s+/g, ' ').slice(80, 400),
  elPg: document.querySelectorAll('.el-pagination').length,
  avueCrud: document.querySelectorAll('.avue-crud').length,
}))
console.log(JSON.stringify(out, null, 1)); console.log('errs:', errs.slice(0, 3))
await browser.close()
