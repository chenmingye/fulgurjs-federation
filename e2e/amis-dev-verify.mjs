// dev 8773：AMIS 流程实例 详情页联邦直渲染验证
import { chromium } from '@playwright/test'
const BASE = process.env.VBASE || 'http://localhost:8773'
const TAG = process.env.VTAG || 'dev'
const PROFILE = `/tmp/unifed-amis-${TAG}-${Date.now()}`
const SHOT_DIR = '/Users/Admin/Desktop/ai 杂物/插件/fulgur-federation/docs/screenshots/migration1-dev'
const browser = await chromium.launchPersistentContext(PROFILE, { headless: true, args: ['--no-proxy-server'], viewport: { width: 1600, height: 900 } })
const page = browser.pages()[0]
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 250)) })
page.on('pageerror', (e) => errors.push('[pageerror] ' + String(e).slice(0, 250)))
page.on('requestfailed', (r) => console.log('[reqfail]', r.url().slice(0, 120), r.failure()?.errorText))
await page.goto(`${BASE}/main/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(8000)
await page.locator('input[placeholder*="账号"], input[placeholder*="用户名"]').first().fill('admin')
await page.locator('input[type="password"]').first().fill('Demo@123456')
await page.locator('button:has-text("登 录"), button:has-text("登录")').first().click()
await page.waitForTimeout(8000)
await page.locator('text=审批中心').first().click()
await page.waitForTimeout(1500)
await page.locator('text=待办任务').first().click()
await page.waitForTimeout(15000)
await page.screenshot({ path: `${SHOT_DIR}/t5-${TAG}-01-amis-todo.png` })
// 找 AMIS 行点办理
const clicked = await page.locator('tr:has-text("AMIS联邦验证2"), .vxe-body--row:has-text("AMIS联邦验证2")').locator('a:has-text("办理"), span:has-text("办理"), button:has-text("办理")').first().click({ timeout: 10000 }).then(() => true).catch((e) => { console.log('办理 click fail:', e.message.slice(0, 100)); return false })
await page.waitForTimeout(15000)
await page.screenshot({ path: `${SHOT_DIR}/t5-${TAG}-02-amis-detail.png`, fullPage: false })
const iframeCount = await page.locator('iframe').count()
const bodyText = await page.locator('body').innerText()
const hasTitle = bodyText.includes('AMIS 联邦验证表单') || bodyText.includes('AMIS联邦验证表单')
const hasFields = bodyText.includes('单据号') || bodyText.includes('产品型号') || bodyText.includes('承担部门')
console.log(JSON.stringify({ clicked, iframeCount, hasTitle, hasFields, errors: errors.slice(0, 6) }, null, 1))
await browser.close()
