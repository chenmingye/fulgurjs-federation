// 登录后取真实 token，供 curl 直接测后端接口
import { chromium } from '@playwright/test'
const BASE = process.argv[2] || 'http://localhost:8773'
const browser = await chromium.launchPersistentContext(`/tmp/pd1tok-${Date.now()}`, {
  headless: true, args: ['--no-proxy-server'], viewport: { width: 1400, height: 900 },
})
const page = browser.pages()[0]
await page.goto(`${BASE}/main/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(6000)
await page.locator('input[placeholder*="账号"], input[placeholder*="用户名"]').first().fill('admin')
await page.locator('input[type="password"]').first().fill('Demo@123456')
await page.locator('button:has-text("登 录"), button:has-text("登录")').first().click()
await page.waitForTimeout(9000)
const ls = await page.evaluate(() => {
  const out = {}
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k.includes('COMMON__LOCAL__KEY__')) out[k] = localStorage.getItem(k)
  }
  return out
})
for (const [k, v] of Object.entries(ls)) {
  try {
    const obj = JSON.parse(v)
    const token = obj?.value?.TOKEN__?.value
    if (token) console.log(`TOKEN_${BASE.includes('8773') ? 'DEV' : 'OTHER'}=${token}`)
  } catch {}
}
await browser.close()
