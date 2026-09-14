import { chromium } from '@playwright/test'
const BASE = 'http://localhost:8661'
const browser = await chromium.launchPersistentContext(`/tmp/p8661b-${Date.now()}`, { headless: true, args: ['--no-proxy-server'], viewport: { width: 1500, height: 950 } })
const page = browser.pages()[0]
await page.goto(`${BASE}/main/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(6000)
await page.locator('input[placeholder*="账号"], input[placeholder*="用户名"]').first().fill('admin')
await page.locator('input[type="password"]').first().fill('Demo@123456')
await page.locator('button:has-text("登 录"), button:has-text("登录")').first().click()
await page.waitForTimeout(10000)
await page.locator('text=审批中心').first().click()
await page.waitForTimeout(2000)
// 找流程模型菜单项
const hit = await page.locator('text=流程模型').first().click({ timeout: 8000 }).then(() => true).catch(() => false)
console.log('流程模型 clicked:', hit)
await page.waitForTimeout(14000)
console.log('url now:', page.url())
await page.screenshot({ path: '/tmp/probe-8661/10-model-list.png' })
// 点"新建模型"
const newHit = await page.locator('button:has-text("新建模型"), span:has-text("新建模型")').first().click({ timeout: 8000 }).then(() => true).catch((e) => { console.log('新建 click fail:', e.message.slice(0, 80)); return false })
console.log('新建模型 clicked:', newHit)
await page.waitForTimeout(12000)
console.log('url after new:', page.url())
await page.screenshot({ path: '/tmp/probe-8661/11-model-create.png' })
const m = await page.evaluate(() => {
  const c = document.querySelector('.jeecg-layout-content')
  return {
    contentLen: c ? c.innerText.trim().length : -1,
    inputs: document.querySelectorAll('.jeecg-layout-content input:not([type=hidden])').length,
    labels: [...document.querySelectorAll('.jeecg-layout-content label')].map((l) => l.innerText.trim()).filter(Boolean).slice(0, 20),
  }
})
console.log('create page:', JSON.stringify(m))
await browser.close()
