// 待办列表渲染验证：行数 + 行内容
import { chromium } from '@playwright/test'
const BASE = process.env.BASE || 'http://localhost:8773'
const browser = await chromium.launchPersistentContext(`/tmp/fulgur-rows-${Date.now()}`, {
  headless: true, args: ['--no-proxy-server'], viewport: { width: 1500, height: 900 },
})
const page = browser.pages()[0]
await page.goto(`${BASE}/main/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(8000)
await page.locator('input[placeholder*="账号"], input[placeholder*="用户名"]').first().fill('admin')
await page.locator('input[type="password"]').first().fill('Demo@123456')
await page.locator('button:has-text("登 录"), button:has-text("登录")').first().click()
await page.locator('input[type="password"]').first().waitFor({ state: 'hidden', timeout: 30000 }).catch(() => {})
await page.waitForTimeout(10000)
await page.locator('text=审批中心').first().click({ timeout: 60000 })
await page.waitForTimeout(1500)
await page.locator('text=待办任务').first().click({ timeout: 60000 })
// 等表格行真正出现
let rows = 0
for (let i = 0; i < 20; i++) {
  rows = await page.locator('.el-table__row').count()
  if (rows > 0) break
  await page.waitForTimeout(1500)
}
await page.waitForTimeout(2000)
const firstRows = await page.locator('.el-table__row').first().innerText().catch(() => '(none)')
console.log(JSON.stringify({ rows, firstRow: firstRows.replace(/\n/g, ' | ').slice(0, 150) }, null, 1))
await page.screenshot({ path: `/tmp/todo-rows-${process.env.TAG || 'dev'}.png` })
await browser.close()
