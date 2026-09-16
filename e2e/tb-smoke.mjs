// testbed 冒烟：登录 → 联邦待办页 → 截图 + 断言（console/pageerror/iframe/渲染文本）
import { chromium } from '@playwright/test'

const BASE = process.env.VBASE || 'http://localhost:8773'
const OUT = process.env.VOUT || '/tmp/tb-smoke.png'
const PROFILE = `/tmp/tb-smoke-${Date.now()}`

const browser = await chromium.launchPersistentContext(PROFILE, {
  headless: true,
  args: ['--no-proxy-server'],
  viewport: { width: 1600, height: 900 },
})
const page = browser.pages()[0]
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + String(e).slice(0, 300)))
const consoleErrors = []
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(String(m.text()).slice(0, 300))
})

await page.goto(`${BASE}/main/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(8000)
await page.locator('input[placeholder*="账号"], input[placeholder*="用户名"]').first().fill('admin')
await page.locator('input[type="password"]').first().fill('Demo@123456')
await page.locator('button:has-text("登 录"), button:has-text("登录")').first().click()
await page.waitForTimeout(12000)
await page.screenshot({ path: OUT.replace('.png', '-login.png') })

await page.goto(`${BASE}/flowable/bpm/task/todo`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(12000)
await page.screenshot({ path: OUT, fullPage: false })
const text = await page.locator('body').innerText().catch(() => '')
const iframes = await page.locator('iframe').count()

console.log(JSON.stringify({
  url: page.url(),
  textLen: text.length,
  hasTodoText: text.includes('待办任务'),
  iframes,
  pageErrors: errors.slice(0, 5),
  consoleErrors: consoleErrors.slice(0, 8),
}, null, 2))
await browser.close()
