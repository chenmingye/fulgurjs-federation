// 补拍 prod t6-18/19（重打 bpm 后）+ t6-26 reportTest（真实报表 code）
import { chromium } from '@playwright/test'
const BASE = 'http://localhost:8662'
const TAG = 'prod'
const SHOT_DIR = '/Users/Admin/Desktop/ai 杂物/插件/vite-plugin-unifed/docs/screenshots/migration1-dev'
const browser = await chromium.launchPersistentContext(`/tmp/t6-shot3-${Date.now()}`, { headless: true, args: ['--no-proxy-server'], viewport: { width: 1600, height: 900 } })
const page = browser.pages()[0]
const errors = []
page.on('pageerror', (e) => errors.push(String(e).slice(0, 150)))
await page.goto(`${BASE}/main/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(6000)
await page.locator('input[placeholder*="账号"], input[placeholder*="用户名"]').first().fill('admin')
await page.locator('input[type="password"]').first().fill('Demo@123456')
await page.locator('button:has-text("登 录"), button:has-text("登录")').first().click()
await page.waitForTimeout(10000)
const MODEL_ID = '5c0fd82d-4849-11f0-8041-f8e43be98cda'
const jobs = [
  ['t6-18-model-update', `/flowable/bpm/manager/model/update/${MODEL_ID}`, '修改流程'],
  ['t6-19-model-copy', `/flowable/bpm/manager/model/copy/${MODEL_ID}`, '复制流程'],
  ['t6-26-reportTest', '/lowcode/lowdev/reportTest/problemReport', ''],
  ['t6-27-form-external', '/lowcode/form/external/view/1', ''],
]
for (const [name, route, expect] of jobs) {
  errors.length = 0
  await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {})
  await page.waitForTimeout(10000)
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png` })
  const text = await page.locator('body').innerText().catch(() => '')
  const hasExpect = expect ? text.includes(expect) : null
  console.log(JSON.stringify({ name, textLen: text.trim().length, hasExpect, pageErrors: errors.slice(0, 2) }))
}
await browser.close()
