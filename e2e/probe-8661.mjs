import { chromium } from '@playwright/test'
const BASE = 'http://localhost:8661'
import fs from 'node:fs'; fs.mkdirSync('/tmp/probe-8661', { recursive: true })
const browser = await chromium.launchPersistentContext(`/tmp/p8661-${Date.now()}`, { headless: true, args: ['--no-proxy-server'], viewport: { width: 1500, height: 950 } })
const page = browser.pages()[0]
await page.goto(`${BASE}/main/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(6000)
await page.screenshot({ path: '/tmp/probe-8661/00-entry.png' })
console.log('url:', page.url(), '| title:', await page.title())
// 走 UI 登录（乾坤站点账户同名）
const hasUser = await page.locator('input[placeholder*="账号"], input[placeholder*="用户名"]').count()
console.log('login inputs:', hasUser)
if (hasUser) {
  await page.locator('input[placeholder*="账号"], input[placeholder*="用户名"]').first().fill('admin')
  await page.locator('input[type="password"]').first().fill('Demo@123456')
  await page.locator('button:has-text("登 录"), button:has-text("登录")').first().click()
  await page.waitForTimeout(10000)
}
console.log('after login url:', page.url())
await page.screenshot({ path: '/tmp/probe-8661/01-after-login.png' })
// 乾坤站菜单进入流程模型
const menuOk = await page.locator('text=审批中心').first().click({ timeout: 8000 }).then(() => true).catch(() => false)
await page.waitForTimeout(2000)
console.log('审批中心 clicked:', menuOk)
const names = await page.locator('a, span, li').allInnerTexts().catch(() => [])
console.log('menu-ish texts:', [...new Set(names.filter((t) => t && t.length < 12))].slice(0, 40).join(' | '))
await browser.close()
