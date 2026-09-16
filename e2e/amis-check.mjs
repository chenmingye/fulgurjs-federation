// 检查待办列表 AMIS 行与页面状态
import { chromium } from '@playwright/test'
const BASE = process.env.BASE || 'http://localhost:8773'
const browser = await chromium.launchPersistentContext(`/tmp/fulgur-amischk-${Date.now()}`, {
  headless: true, args: ['--no-proxy-server'], viewport: { width: 1500, height: 900 },
})
const page = browser.pages()[0]
await page.goto(`${BASE}/main/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(8000)
await page.locator('input[placeholder*="账号"], input[placeholder*="用户名"]').first().fill('admin')
await page.locator('input[type="password"]').first().fill('Demo@123456')
await page.locator('button:has-text("登 录"), button:has-text("登录")').first().click()
await page.locator('input[type="password"]').first().waitFor({ state: 'hidden', timeout: 30000 }).catch(() => {})
await page.waitForTimeout(5000)
await page.locator('text=审批中心').first().click()
await page.waitForTimeout(1500)
await page.locator('text=待办任务').first().click()
await page.waitForTimeout(15000)
await page.screenshot({ path: `/tmp/amis-chk-${process.env.TAG || 'dev'}.png` })
const text = (await page.locator('body').innerText().catch(() => '')).replace(/\n/g, ' | ')
console.log(JSON.stringify({
  url: page.url(),
  hasAMIS: text.includes('AMIS'),
  rows: await page.locator('.ant-table-row, .el-table__row').count(),
  textHead: text.slice(0, 300),
}, null, 1))
await browser.close()
