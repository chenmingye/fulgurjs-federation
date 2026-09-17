import { chromium } from '@playwright/test'
const BASE = 'http://localhost:8773'
const browser = await chromium.launchPersistentContext(`/tmp/fulgur-diagf2-${Date.now()}`, { headless: true, args: ['--no-proxy-server'], viewport: { width: 1600, height: 900 } })
const page = browser.pages()[0]
const nets = []
page.on('response', async (r) => {
  const u = r.url()
  if (/\/demo\/bpm\/(category|model)/.test(u)) {
    let body = ''
    try { body = (await r.text()).slice(0, 200) } catch {}
    nets.push(`${r.status()} ${u.replace('http://localhost:8773', '')} :: ${body}`)
  }
})
await page.goto(`${BASE}/main/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(8000)
await page.locator('input[placeholder*="账号"], input[placeholder*="用户名"]').first().fill('admin')
await page.locator('input[type="password"]').first().fill('Demo@123456')
await page.locator('button:has-text("登 录"), button:has-text("登录")').first().click()
await page.locator('input[type="password"]').first().waitFor({ state: 'hidden', timeout: 30000 }).catch(() => {})
await page.waitForTimeout(3000)
await page.goto(`${BASE}/main/flowable/bpm/manager/model`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {})
await page.waitForTimeout(12000)
console.log(nets.join('\n'))
await browser.close()
