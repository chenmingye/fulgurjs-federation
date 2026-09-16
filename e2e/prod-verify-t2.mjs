// 任务2 prod 验证：8662 联邦待办页 → 办理 → 详情业务表单区，断言无 'ce' 错误
import { chromium } from '@playwright/test'
import fs from 'node:fs'

const SHOT_DIR = '/Users/Admin/Desktop/ai 杂物/插件/fulgur-federation/docs/screenshots/migration1-dev'
const PROFILE = `/tmp/unifed-prod-prof-${Date.now()}`
const BASE = 'http://localhost:8662'

const logs = []
const errors = []
const push = (tag, text) => {
  logs.push(`[${tag}] ${String(text).slice(0, 300)}`)
  if (/ce'\)|reading 'ce'|pageerror|MFU|Failed to fetch|加载失败/i.test(String(text))) errors.push(`[${tag}] ${String(text).slice(0, 300)}`)
}

const browser = await chromium.launchPersistentContext(PROFILE, {
  headless: true,
  args: ['--no-proxy-server'],
  viewport: { width: 1600, height: 900 },
})
const page = browser.pages()[0]
page.on('console', (m) => push(m.type(), m.text()))
page.on('pageerror', (e) => push('pageerror', e))
page.on('requestfailed', (r) => push('reqfail', `${r.url().slice(0, 150)} ${r.failure()?.errorText}`))

const shot = (name) => page.screenshot({ path: `${SHOT_DIR}/${name}`, fullPage: false })

try {
  // 1. 登录页
  await page.goto(`${BASE}/main/`, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(4000)
  await shot('p2-prod-01-login.png')

  // 2. UI 登录 admin / Demo@123456
  const user = page.locator('input[placeholder*="账号"], input[placeholder*="用户名"]').first()
  await user.fill('admin')
  const pwd = page.locator('input[type="password"]').first()
  await pwd.fill('Demo@123456')
  await shot('p2-prod-02-login-filled.png')
  await page.locator('button:has-text("登 录"), button:has-text("登录"), .ant-btn:has-text("登")').first().click()
  await page.waitForTimeout(6000)
  await shot('p2-prod-03-after-login.png')
  console.log('URL after login:', page.url())

  // 3. 菜单导航：审批中心 → 待办任务
  const menuClicked = await page
    .locator('text=审批中心')
    .first()
    .click({ timeout: 8000 })
    .then(() => true)
    .catch(() => false)
  console.log('menu 审批中心 clicked:', menuClicked)
  await page.waitForTimeout(1500)
  const todoClicked = await page
    .locator('text=待办任务')
    .first()
    .click({ timeout: 8000 })
    .then(() => true)
    .catch(() => false)
  console.log('menu 待办任务 clicked:', todoClicked)
  await page.waitForTimeout(8000)
  await shot('p2-prod-04-todo-list.png')

  // 4. 断言待办列表数据行
  const rows = await page.locator('.ant-table-tbody tr, .vxe-table--body tbody tr').count()
  const bodyText = (await page.locator('body').innerText()).slice(0, 100)
  console.log('todo rows:', rows)
  console.log('body head:', bodyText.replace(/\n/g, ' | '))

  // 5. 点第一行“办理”
  const handleClicked = await page
    .locator('a:has-text("办理"), button:has-text("办理"), span:has-text("办理")')
    .first()
    .click({ timeout: 8000 })
    .then(() => true)
    .catch(() => false)
  console.log('办理 clicked:', handleClicked)
  await page.waitForTimeout(9000)
  await shot('p2-prod-05-detail.png')

  // 6. 详情页断言：iframe 数、业务表单区文本
  const iframeCount = await page.locator('iframe').count()
  const detailText = (await page.locator('body').innerText()).slice(0, 400)
  console.log('iframe count:', iframeCount)
  console.log('detail text head:', detailText.replace(/\n/g, ' | '))
  await shot('p2-prod-06-detail-form.png')
} catch (e) {
  push('script-error', e)
  await shot('p2-prod-99-error.png').catch(() => {})
} finally {
  fs.writeFileSync('/tmp/prod-verify-t2-result.json', JSON.stringify({ errors, logs }, null, 2))
  console.log('=== errors ===')
  for (const e of errors) console.log(e)
  console.log('=== all logs tail ===')
  for (const l of logs.slice(-15)) console.log(l)
  await browser.close()
}
