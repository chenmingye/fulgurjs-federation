// D 项：分页中文复验（el-pagination 显示「共 N 条」而非 Total）
import { chromium } from '@playwright/test'
const BASE = process.env.VBASE || 'http://localhost:8662'
const TAG = process.env.VTAG || 'prod'
const PROFILE = `/tmp/fulgur-diag-pg-${TAG}-${Date.now()}`
const browser = await chromium.launchPersistentContext(PROFILE, { headless: true, args: ['--no-proxy-server'], viewport: { width: 1600, height: 900 } })
const page = browser.pages()[0]
await page.goto(`${BASE}/main/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(8000)
await page.locator('input[placeholder*="账号"], input[placeholder*="用户名"]').first().fill('admin')
await page.locator('input[type="password"]').first().fill('Demo@123456')
await page.locator('button:has-text("登 录"), button:has-text("登录")').first().click()
await page.waitForTimeout(8000)
await page.goto(`${BASE}/main/lowcode/lowdev/formDesign`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(30000)
const out = await page.evaluate(() => {
  const totals = Array.from(document.querySelectorAll('.el-pagination__total')).map((n) => n.textContent.trim())
  const pagers = document.querySelectorAll('.el-pagination').length
  const epLocaleText = Array.from(document.querySelectorAll('.el-pagination span, .el-pagination button')).map((n) => n.textContent.trim()).filter(Boolean).slice(0, 8)
  return { pagers, totals, epLocaleText, bodyHasGong: document.body.innerText.includes('共'), bodyHasTotal: /\bTotal\b/.test(document.body.innerText) }
})
console.log(JSON.stringify(out, null, 1))
await page.screenshot({ path: `/tmp/fulgur-diag-pg-${TAG}.png` })
await browser.close()
