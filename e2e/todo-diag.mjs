// 待办页数据加载诊断：console + 请求 + token 检查
import { chromium } from '@playwright/test'
const BASE = process.env.BASE || 'http://localhost:8773'
const browser = await chromium.launchPersistentContext(`/tmp/fulgur-tododiag-${Date.now()}`, {
  headless: true, args: ['--no-proxy-server'], viewport: { width: 1500, height: 900 },
})
const page = browser.pages()[0]
const events = []
const reqs = []
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') events.push(`[${m.type()}] ${m.text().slice(0, 200)}`) })
page.on('pageerror', (e) => events.push(`[pageerror] ${String(e).slice(0, 300)}`))
page.on('response', (r) => {
  const u = r.url()
  if (u.includes('/bpm/') || u.includes('task/') || r.status() >= 400) {
    reqs.push(`${r.status()} ${r.request().method()} ${u.slice(0, 130)}`)
  }
})

await page.goto(`${BASE}/main/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(8000)
await page.locator('input[placeholder*="账号"], input[placeholder*="用户名"]').first().fill('admin')
await page.locator('input[type="password"]').first().fill('Demo@123456')
await page.locator('button:has-text("登 录"), button:has-text("登录")').first().click()
await page.locator('input[type="password"]').first().waitFor({ state: 'hidden', timeout: 30000 }).catch(() => {})
await page.waitForTimeout(5000)
reqs.length = 0
await page.locator('text=审批中心').first().click()
await page.waitForTimeout(1500)
await page.locator('text=待办任务').first().click()
await page.waitForTimeout(15000)

const tok = await page.evaluate(() => ({
  hasAccess: !!localStorage.getItem('ACCESS_TOKEN'),
  accessHead: (localStorage.getItem('ACCESS_TOKEN') || '').slice(0, 60),
  hasUser: !!localStorage.getItem('user'),
}))
console.log('== 请求（bpm 相关/≥400） ==')
console.log(reqs.slice(0, 12).join('\n') || '(无)')
console.log('== console/pageerror ==')
console.log(events.slice(0, 8).join('\n') || '(无)')
console.log('== token ==')
console.log(JSON.stringify(tok))
await browser.close()
