// 登录后状态诊断
import { chromium } from '@playwright/test'
const browser = await chromium.launchPersistentContext(`/tmp/fulgur-postlogin-${Date.now()}`, {
  headless: true, args: ['--no-proxy-server'], viewport: { width: 1400, height: 900 },
})
const page = browser.pages()[0]
const errs = []
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)) })
page.on('pageerror', (e) => errs.push('[pageerror] ' + String(e).slice(0, 300)))
await page.goto('http://localhost:8773/main/', { waitUntil: 'domcontentloaded', timeout: 90000 })
await page.waitForTimeout(15000)
const hasLogin = await page.locator('input[type="password"]').count()
if (hasLogin) {
  await page.locator('input[placeholder*="账号"], input[placeholder*="用户名"]').first().fill('admin', { timeout: 15000 })
  await page.locator('input[type="password"]').first().fill('Demo@123456', { timeout: 15000 })
  await page.locator('button:has-text("登 录"), button:has-text("登录")').first().click({ timeout: 15000 })
  await page.waitForTimeout(25000)
}
const state = await page.evaluate(() => ({
  url: location.href,
  textLen: (document.body.innerText || '').length,
  hasSidebarMenu: (document.body.innerText || '').includes('审批中心'),
  textHead: (document.body.innerText || '').slice(0, 200),
}))
console.log(JSON.stringify(state, null, 1))
console.log('== errors ==')
console.log(errs.slice(0, 5).join('\n---\n') || '(无)')
await page.screenshot({ path: '/tmp/postlogin-state.png' })
await browser.close()
