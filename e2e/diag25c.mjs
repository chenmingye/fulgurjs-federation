import { chromium } from '@playwright/test'
const BASE = 'http://localhost:8662'
const PROFILE = `/tmp/fulgur-diag25c-${Date.now()}`
const browser = await chromium.launchPersistentContext(PROFILE, { headless: true, args: ['--no-proxy-server'], viewport: { width: 1600, height: 900 } })
const page = browser.pages()[0]
const errs = []
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 120)) })
await page.goto(`${BASE}/main/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(8000)
await page.locator('input[placeholder*="账号"], input[placeholder*="用户名"]').first().fill('admin')
await page.locator('input[type="password"]').first().fill('Demo@123456')
await page.locator('button:has-text("登 录"), button:has-text("登录")').first().click()
await page.waitForTimeout(8000)
await page.goto(`${BASE}/main/lowcode/lowdev/moduleDesign`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(25000)
const out = await page.evaluate(() => ({
  boxItem: document.querySelectorAll('.box-item').length,
  infoFilledSvg: document.querySelectorAll('svg.iconify, i[class*="iconify"], [data-icon="ep:info-filled"], svg').length,
  thCount: document.querySelectorAll('th').length,
  thTexts: Array.from(document.querySelectorAll('th')).map((t) => t.innerText.trim()).slice(0, 12),
  elTooltipAttr: document.querySelectorAll('[class*="el-tooltip"], [aria-describedby]').length,
  commentProbe: 'n/a',
}))
console.log(JSON.stringify(out, null, 1))
console.log('errCount:', errs.length, '| firstErr:', errs[0]?.slice(0, 80) ?? 'none')
await browser.close()
