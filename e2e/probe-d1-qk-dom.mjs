// 8661 创建流程页 DOM 诊断
import { chromium } from '@playwright/test'
const BASE = 'http://localhost:8661'
const browser = await chromium.launchPersistentContext(`/tmp/pd1dom-${Date.now()}`, {
  headless: true, args: ['--no-proxy-server'], viewport: { width: 1500, height: 950 },
})
const page = browser.pages()[0]
await page.goto(`${BASE}/main/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(6000)
await page.locator('input[placeholder*="账号"], input[placeholder*="用户名"]').first().fill('admin')
await page.locator('input[type="password"]').first().fill('Demo@123456')
await page.locator('button:has-text("登 录"), button:has-text("登录")').first().click()
await page.waitForTimeout(10000)
await page.goto(`${BASE}/main/flowable/bpm/manager/model`, { waitUntil: 'domcontentloaded', timeout: 45000 })
await page.waitForTimeout(15000)
await page.locator('button:has-text("新建模型"), span:has-text("新建模型")').first().click()
await page.waitForTimeout(20000)
const info = await page.evaluate(() => ({
  inputs: [...document.querySelectorAll('input:not([type=hidden])')].map((i) => ({
    ph: i.placeholder || null, cls: i.className.slice(0, 40), vis: i.getBoundingClientRect().height > 0,
  })).filter((x) => x.vis),
  labels: [...document.querySelectorAll('label')].map((l) => ({ t: l.innerText.trim(), cls: l.className.slice(0, 40) })),
}))
console.log(JSON.stringify(info, null, 1).slice(0, 3000))
await browser.close()
