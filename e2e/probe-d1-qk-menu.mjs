// 8661 菜单诊断：dump 菜单项文本，逐步截图
import { chromium } from '@playwright/test'
const BASE = 'http://localhost:8661'
const browser = await chromium.launchPersistentContext(`/tmp/pd1m-${Date.now()}`, {
  headless: true, args: ['--no-proxy-server'], viewport: { width: 1500, height: 950 },
})
const page = browser.pages()[0]
await page.goto(`${BASE}/main/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(6000)
await page.locator('input[placeholder*="账号"], input[placeholder*="用户名"]').first().fill('admin')
await page.locator('input[type="password"]').first().fill('Demo@123456')
await page.locator('button:has-text("登 录"), button:has-text("登录")').first().click()
await page.waitForTimeout(10000)
await page.screenshot({ path: '/tmp/probe-d1/qk-00-after-login.png' })
console.log('url after login:', page.url())
// dump 顶层菜单
const tops = await page.evaluate(() =>
  [...document.querySelectorAll('.ant-menu-submenu-title, .ant-menu-item, [class*="menu"] li, [class*="menu"] *')]
    .map((e) => e.innerText?.trim()).filter((t) => t && t.length > 1 && t.length < 12).slice(0, 60)
)
console.log('菜单候选:', JSON.stringify([...new Set(tops)]))
// 点审批中心
const c1 = await page.locator('text=审批中心').first().click({ timeout: 8000 }).then(() => true).catch((e) => { console.log('审批中心 click fail', e.message.slice(0, 60)); return false })
console.log('审批中心 clicked:', c1)
await page.waitForTimeout(2500)
await page.screenshot({ path: '/tmp/probe-d1/qk-01-after-审批中心.png' })
const subs = await page.evaluate(() =>
  [...document.querySelectorAll('.ant-menu-submenu-popup li, .ant-menu-sub li, .ant-menu li, [class*="menu"] li')]
    .map((e) => e.innerText?.trim().replace(/\n/g, '/')).filter((t) => t && t.length > 1 && t.length < 15).slice(0, 60)
)
console.log('子菜单候选:', JSON.stringify([...new Set(subs)]))
const c2 = await page.locator('text=流程模型').first().click({ timeout: 8000 }).then(() => true).catch((e) => { console.log('流程模型 click fail', e.message.slice(0, 60)); return false })
console.log('流程模型 clicked:', c2)
await page.waitForTimeout(15000)
console.log('url now:', page.url())
const rows = await page.locator('.el-table__body tr.el-table__row').count()
console.log('行数:', rows)
await page.screenshot({ path: '/tmp/probe-d1/qk-02-model-list.png' })
await browser.close()
