import { chromium } from '@playwright/test'
const BASE = process.env.VBASE || 'http://localhost:8773'
const browser = await chromium.launchPersistentContext(`/tmp/fulgur-diagf-${Date.now()}`, { headless: true, args: ['--no-proxy-server'], viewport: { width: 1600, height: 900 } })
const page = browser.pages()[0]
const errs = []
page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)))
page.on('console', (m) => { if (m.type() === 'error') errs.push('[console] ' + m.text().slice(0, 200)) })
await page.goto(`${BASE}/main/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(8000)
await page.locator('input[placeholder*="账号"], input[placeholder*="用户名"]').first().fill('admin')
await page.locator('input[type="password"]').first().fill('Demo@123456')
await page.locator('button:has-text("登 录"), button:has-text("登录")').first().click()
for (let attempt = 0; attempt < 3; attempt++) {
  const gone = await page.locator('input[type="password"]').first().waitFor({ state: 'hidden', timeout: 30000 }).then(() => true).catch(() => false)
  if (gone) break
  await page.locator('button:has-text("登 录"), button:has-text("登录")').first().click().catch(() => {})
}
await page.waitForTimeout(3000)
for (const route of ['/flowable/bpm/task/create', '/flowable/bpm/manager/model', '/flowable/bpm/task/todo']) {
  await page.goto(`${BASE}/main${route}`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {})
  await page.waitForTimeout(12000)
  const out = await page.evaluate(() => ({
    textLen: document.body.innerText.length,
    snippet: document.body.innerText.replace(/\s+/g, ' ').slice(60, 340),
    rows: document.querySelectorAll('.el-table__row, .vxe-body--row').length,
  }))
  console.log(route, JSON.stringify(out))
}
console.log('errs:', errs.slice(0, 5))
await browser.close()
