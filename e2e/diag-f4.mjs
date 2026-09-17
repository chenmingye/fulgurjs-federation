import { chromium } from '@playwright/test'
const BASE = 'http://localhost:8773'
const browser = await chromium.launchPersistentContext(`/tmp/fulgur-diagf4-${Date.now()}`, { headless: true, args: ['--no-proxy-server'], viewport: { width: 1600, height: 900 } })
const page = browser.pages()[0]
const logs = []
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text().slice(0, 200)}`))
page.on('pageerror', (e) => logs.push('[pageerror] ' + String(e).slice(0, 300)))
page.on('response', (r) => { if (r.url().includes('/demo/bpm/')) logs.push(`[api ${r.status()}] ` + r.url().slice(0, 130)) })
page.on('request', (r) => { if (r.url().includes('/demo/bpm/')) logs.push(`[req] ` + r.url().slice(0, 130)) })
await page.goto(`${BASE}/main/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(8000)
await page.locator('input[placeholder*="账号"], input[placeholder*="用户名"]').first().fill('admin')
await page.locator('input[type="password"]').first().fill('Demo@123456')
await page.locator('button:has-text("登 录"), button:has-text("登录")').first().click()
await page.locator('input[type="password"]').first().waitFor({ state: 'hidden', timeout: 30000 }).catch(() => {})
await page.waitForTimeout(3000)
// 先访问 20-流程定义（同为 bpm manager 页，验证 bpm API 通道正常）
await page.goto(`${BASE}/main/flowable/bpm/manager/definition`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {})
await page.waitForTimeout(10000)
const defRows = await page.evaluate(() => document.querySelectorAll('.el-table__row, .vxe-body--row').length)
await page.goto(`${BASE}/main/flowable/bpm/manager/model`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {})
await page.waitForTimeout(15000)
const st = await page.evaluate(() => ({
  mask: !!document.querySelector('.el-loading-mask'),
  maskVisible: (() => { const m = document.querySelector('.el-loading-mask'); return m ? getComputedStyle(m).display !== 'none' : false })(),
  catCards: document.querySelectorAll('.rounded-lg').length,
  textLen: document.body.innerText.length,
}))
console.log('definition rows:', defRows, '| model state:', JSON.stringify(st))
console.log(logs.filter((l) => /\[api|\[req|\[pageerror|error/.test(l)).slice(0, 14).join('\n'))
await browser.close()
