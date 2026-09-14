// D2 原始堆栈探针 v2：页面内直接 import 依赖 domUtils 的 chunk，绕过运行时包装
import { chromium } from '@playwright/test'

const BASE = process.argv[2] || 'http://localhost:8662'
const browser = await chromium.launchPersistentContext(`/tmp/pd2c-${Date.now()}`, {
  headless: true, args: ['--no-proxy-server'], viewport: { width: 1500, height: 950 },
})
const page = browser.pages()[0]
await page.goto(`${BASE}/main/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(6000)
await page.locator('input[placeholder*="账号"], input[placeholder*="用户名"]').first().fill('admin')
await page.locator('input[type="password"]').first().fill('Demo@123456')
await page.locator('button:has-text("登 录"), button:has-text("登录")').first().click()
await page.waitForTimeout(9000)

const result = await page.evaluate(async (base) => {
  const out = {}
  try {
    await import(/* @vite-ignore */ `${base}/lowcode/assets/403-DyyLI1zu.js`)
    out.ok = true
  } catch (e) {
    out.err = String(e).slice(0, 200)
    out.stack = String(e.stack || '').slice(0, 2500)
  }
  return out
}, BASE)
console.log(JSON.stringify(result, null, 2))
await browser.close()
