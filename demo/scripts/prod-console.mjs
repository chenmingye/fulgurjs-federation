/** 生产页 console 采集（独立进程不受页面 reload 影响）：node demo/scripts/prod-console.mjs <url> */
import { chromium } from 'file:///Users/Admin/Desktop/ai_project/Plugin_Workshop/fulgurjs-federation/e2e/node_modules/@playwright/test/index.mjs'

const url = process.argv[2] ?? 'http://localhost:5391/jeecg-a/'
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()
const logs = []
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(`${m.type()}: ${m.text().slice(0, 300)} @${JSON.stringify(m.location())}`) })
page.on('pageerror', (e) => logs.push(`pageerror: [${e.name}] ${e.message} :: ${String(e.stack ?? '').slice(0, 400)}`))
page.on('requestfailed', (r) => logs.push(`reqfail: ${r.url().slice(-60)} ${r.failure()?.errorText}`))
page.on('error', (e) => logs.push(`window.onerror: ${JSON.stringify(e).slice(0, 300)}`))
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(18000)
const state = await page.evaluate(() => {
  window.__errs = window.__errs ?? []
  return {
    appLen: document.getElementById('app')?.innerHTML?.length ?? 0,
    hasLogin: document.body.innerText.includes('登'),
    errs: window.__errs,
  }
})
console.log('=== console/pageerror ===')
for (const l of logs.slice(0, 20)) console.log(l)
console.log('=== state ===', JSON.stringify(state))
await browser.close()
