import { chromium } from '@playwright/test'
const browser = await chromium.launchPersistentContext(`/tmp/prod-login-${Date.now()}`, {
  headless: true, args: ['--no-proxy-server'], viewport: { width: 1600, height: 900 },
})
const page = browser.pages()[0]
const logs = []
page.on('console', (m) => { if (['error'].includes(m.type())) logs.push('console-error: ' + String(m.text()).slice(0, 200)) })
page.on('response', (r) => { if (r.url().includes('/demo/sys/login')) logs.push('LOGIN ' + r.status() + ' ' + r.request().method()) })
await page.goto('http://localhost:8662/main/', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(10000)
await page.screenshot({ path: '/tmp/prod-login-1.png' })
await page.locator('input[placeholder*="账号"], input[placeholder*="用户名"]').first().fill('admin')
await page.locator('input[type="password"]').first().fill('Demo@123456')
await page.locator('button:has-text("登 录"), button:has-text("登录")').first().click()
await page.waitForTimeout(15000)
await page.screenshot({ path: '/tmp/prod-login-2.png' })
console.log('after-login URL:', page.url())
await page.goto('http://localhost:8662/flowable/bpm/task/todo', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(15000)
console.log('deep URL:', page.url())
await page.screenshot({ path: '/tmp/prod-login-3.png' })
console.log('textLen:', (await page.locator('body').innerText()).length)
console.log('logs:', JSON.stringify(logs.slice(0, 8), null, 1))
await browser.close()
