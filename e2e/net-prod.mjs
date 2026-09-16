// prod 网络全捕获：/demo 请求 + 状态 + body 头
import { chromium } from '@playwright/test'
const browser = await chromium.launchPersistentContext(`/tmp/fulgur-net-${Date.now()}`, {
  headless: true, args: ['--no-proxy-server'], viewport: { width: 1500, height: 900 },
})
const page = browser.pages()[0]
const net = []
page.on('response', async (r) => {
  const u = r.url()
  if (u.includes('/demo/') && (u.includes('task') || u.includes('auth') || r.status() >= 400)) {
    let bh = ''
    try { bh = (await r.text()).slice(0, 120) } catch { bh = '(body err)' }
    net.push(`${r.status()} ${r.request().method()} ${u.slice(u.indexOf('/demo/'), u.indexOf('/demo/') + 80)}\n    auth=${(r.request().headers()['authorization'] || 'NONE').slice(0, 30)} body=${bh}`)
  }
})

await page.goto('http://localhost:8662/main/', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(8000)
await page.locator('input[placeholder*="账号"], input[placeholder*="用户名"]').first().fill('admin')
await page.locator('input[type="password"]').first().fill('Demo@123456')
await page.locator('button:has-text("登 录"), button:has-text("登录")').first().click()
await page.locator('input[type="password"]').first().waitFor({ state: 'hidden', timeout: 30000 }).catch(() => {})
await page.waitForTimeout(6000)
net.length = 0
await page.goto('http://localhost:8662/flowable/bpm/task/todo', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {})
await page.waitForTimeout(15000)
console.log('== /demo task/auth/≥400 ==')
console.log(net.slice(0, 12).join('\n') || '(无)')
const rows = await page.locator('.el-table__row').count()
console.log('rows:', rows)
await browser.close()
