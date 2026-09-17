import { chromium } from '@playwright/test'
const BASE = process.env.VBASE || 'http://localhost:8773'
const PROFILE = `/tmp/fulgur-diag07b-${Date.now()}`
const browser = await chromium.launchPersistentContext(PROFILE, { headless: true, args: ['--no-proxy-server'], viewport: { width: 1600, height: 900 } })
const page = browser.pages()[0]
const errors = []
const logs = []
page.on('console', (m) => { if (m.type() === 'error') errors.push('[console.error] ' + m.text()); if (m.type() === 'log') logs.push(m.text().slice(0, 200)) })
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.stack))
await page.goto(`${BASE}/main/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(8000)
await page.locator('input[placeholder*="账号"], input[placeholder*="用户名"]').first().fill('admin')
await page.locator('input[type="password"]').first().fill('Demo@123456')
await page.locator('button:has-text("登 录"), button:has-text("登录")').first().click()
await page.waitForTimeout(8000)
await page.goto(`${BASE}/main/flowable/bpm/manager/action?processsKey=demo_leave`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(30000)
const info = await page.evaluate(() => ({
  url: location.href.slice(0, 180),
  textLen: document.body.innerText.length,
  snippet: document.body.innerText.replace(/\s+/g, ' ').slice(100, 500),
  masterEl: !!document.querySelector('.ProcessDefinitionDetailMaster'),
  iframes: document.querySelectorAll('iframe').length,
}))
console.log(JSON.stringify(info, null, 1))
console.log('---- errors ----'); console.log(errors.slice(0, 6).join('\n'))
console.log('---- master logs ----'); console.log(logs.filter((l) => /从当前页面获取|getApprovalDetail-data/.test(l)).slice(0, 4).join('\n'))
await browser.close()
