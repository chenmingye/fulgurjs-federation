import { chromium } from '@playwright/test'
const BASE = 'http://localhost:8773'
const browser = await chromium.launchPersistentContext(`/tmp/fulgur-diagf3-${Date.now()}`, { headless: true, args: ['--no-proxy-server'], viewport: { width: 1600, height: 900 } })
const page = browser.pages()[0]
const logs = []
page.on('console', (m) => { if (['error','warning'].includes(m.type())) logs.push(`[${m.type()}] ${m.text().slice(0,220)}`) })
page.on('pageerror', (e) => logs.push('[pageerror] ' + String(e).slice(0, 300)))
page.on('requestfailed', (r) => logs.push('[reqfail] ' + r.url().slice(0, 140) + ' :: ' + (r.failure()?.errorText ?? '')))
page.on('response', (r) => { if (r.url().includes('/demo/')) logs.push(`[api ${r.status()}] ` + r.url().slice(0, 140)) })
await page.goto(`${BASE}/main/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(8000)
await page.locator('input[placeholder*="账号"], input[placeholder*="用户名"]').first().fill('admin')
await page.locator('input[type="password"]').first().fill('Demo@123456')
await page.locator('button:has-text("登 录"), button:has-text("登录")').first().click()
await page.locator('input[type="password"]').first().waitFor({ state: 'hidden', timeout: 30000 }).catch(() => {})
await page.waitForTimeout(3000)
await page.goto(`${BASE}/main/flowable/bpm/manager/model`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {})
await page.waitForTimeout(15000)
const state = await page.evaluate(() => ({ textLen: document.body.innerText.length, catCards: document.querySelectorAll('.rounded-lg').length }))
console.log(JSON.stringify(state))
console.log(logs.filter((l) => !/single-spa|MFU-010/.test(l)).slice(0, 12).join('\n'))
await browser.close()
