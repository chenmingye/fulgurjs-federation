// 用户路径重现：8662 登录后真实点击侧栏菜单（非直达 URL），逐菜单抓报错
import { chromium } from '@playwright/test'
const BASE = 'http://localhost:8662'
const PROFILE = `/tmp/fulgur-menuclick-${Date.now()}`
const browser = await chromium.launchPersistentContext(PROFILE, { headless: true, args: ['--no-proxy-server'], viewport: { width: 1600, height: 900 } })
const page = browser.pages()[0]
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push('[console] ' + m.text().slice(0, 200)) })
page.on('pageerror', (e) => errors.push('[pageerror] ' + String(e).slice(0, 300)))
page.on('requestfailed', (r) => errors.push('[reqfail] ' + r.url().slice(0, 140) + ' :: ' + (r.failure()?.errorText ?? '')))
await page.goto(`${BASE}/main/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(8000)
await page.locator('input[placeholder*="账号"], input[placeholder*="用户名"]').first().fill('admin')
await page.locator('input[type="password"]').first().fill('Demo@123456')
await page.locator('button:has-text("登 录"), button:has-text("登录")').first().click()
await page.locator('input[type="password"]').first().waitFor({ state: 'hidden', timeout: 30000 }).catch(() => {})
await page.waitForTimeout(5000)

const clickMenu = async (label) => {
  errors.length = 0
  const el = page.locator(`text=${label}`).first()
  await el.click({ timeout: 10000 }).catch((e) => errors.push('[click-fail] ' + label + ' ' + e.message.slice(0, 80)))
  await page.waitForTimeout(6000)
  const state = await page.evaluate(() => ({
    textLen: document.body.innerText.length,
    rows: document.querySelectorAll('.el-table__row, .vxe-body--row, .el-card').length,
    fulgurErr: /联邦页面加载失败/.test(document.body.innerText),
  }))
  console.log(`MENU ${label}:`, JSON.stringify(state), '| errs:', errors.slice(0, 3))
}

await clickMenu('审批中心')
await clickMenu('待办任务')
await clickMenu('已办任务')
await clickMenu('我的流程')
// bpm manager 菜单组
await page.locator('text=流程管理').first().click({ timeout: 8000 }).catch(() => {})
await page.waitForTimeout(2000)
await clickMenu('流程模型')
await clickMenu('流程表单')
await clickMenu('流程定义')
// lowcode 菜单组
await page.locator('text=Online表单开发').first().click({ timeout: 8000 }).catch(() => {})
await page.waitForTimeout(2000)
await clickMenu('表单设计')
await clickMenu('模块设计')
await page.screenshot({ path: '/tmp/fulgur-menuclick-final.png' })
await browser.close()
