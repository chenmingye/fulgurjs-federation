import { chromium } from '@playwright/test'
const BASE = 'http://localhost:8662'
const DIR = '/tmp/probe-visual'
import fs from 'node:fs'; fs.mkdirSync(DIR, { recursive: true })
const browser = await chromium.launchPersistentContext(`/tmp/probe-vis-${Date.now()}`, { headless: true, args: ['--no-proxy-server'], viewport: { width: 1500, height: 950 } })
const page = browser.pages()[0]
await page.goto(`${BASE}/main/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(6000)
await page.locator('input[placeholder*="账号"], input[placeholder*="用户名"]').first().fill('admin')
await page.locator('input[type="password"]').first().fill('Demo@123456')
await page.locator('button:has-text("登 录"), button:has-text("登录")').first().click()
await page.waitForTimeout(8000)
const pages = [
  ['copy', '/flowable/bpm/task/copy'],
  ['create', '/flowable/bpm/task/create'],
  ['model-create', '/flowable/bpm/manager/model/create'],
  ['model-update', '/flowable/bpm/manager/model/update/5c0fd82d-4849-11f0-8041-f8e43be98cda'],
]
for (const [n, r] of pages) {
  await page.goto(`${BASE}${r}`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {})
  await page.waitForTimeout(14000)
  await page.screenshot({ path: `${DIR}/${n}.png` })
  console.log('shot', n)
}
await browser.close()
