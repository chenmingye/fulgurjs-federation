// todo-page 请求/响应详情 + localStorage 检查
import { chromium } from '@playwright/test'
const BASE = process.env.BASE || 'http://localhost:8773'
const browser = await chromium.launchPersistentContext(`/tmp/fulgur-td2-${Date.now()}`, {
  headless: true, args: ['--no-proxy-server'], viewport: { width: 1500, height: 900 },
})
const page = browser.pages()[0]
let body = null
let reqHeaders = null

await page.goto(`${BASE}/main/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(8000)
await page.locator('input[placeholder*="账号"], input[placeholder*="用户名"]').first().fill('admin')
await page.locator('input[type="password"]').first().fill('Demo@123456')
await page.locator('button:has-text("登 录"), button:has-text("登录")').first().click()
await page.locator('input[type="password"]').first().waitFor({ state: 'hidden', timeout: 30000 }).catch(() => {})
await page.waitForTimeout(5000)

page.on('response', async (r) => {
  if (r.url().includes('todo-page')) {
    try { body = await r.json() } catch { body = 'non-json' }
    reqHeaders = r.request().headers()
  }
})

await page.locator('text=审批中心').first().click()
await page.waitForTimeout(1500)
await page.locator('text=待办任务').first().click()
await page.waitForTimeout(15000)

const ls = await page.evaluate(() => {
  const keys = Object.keys(localStorage)
  return {
    allKeys: keys.filter((k) => !k.startsWith('vite') && !k.startsWith('uni')).slice(0, 20),
    accessRaw: (localStorage.getItem('ACCESS_TOKEN') || '').slice(0, 80),
  }
})
console.log(JSON.stringify({
  bodyHead: typeof body === 'object' ? JSON.stringify(body).slice(0, 200) : body,
  authHeader: reqHeaders?.['authorization']?.slice(0, 40),
  xToken: reqHeaders?.['x-token']?.slice(0, 30),
  ls,
}, null, 1))
await browser.close()
