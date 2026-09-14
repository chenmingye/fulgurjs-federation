import { chromium } from '@playwright/test'
const BASE = 'http://localhost:8662'
const browser = await chromium.launchPersistentContext(`/tmp/probe-dom-${Date.now()}`, { headless: true, args: ['--no-proxy-server'], viewport: { width: 1600, height: 1000 } })
const page = browser.pages()[0]
await page.goto(`${BASE}/main/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(6000)
await page.locator('input[placeholder*="账号"], input[placeholder*="用户名"]').first().fill('admin')
await page.locator('input[type="password"]').first().fill('Demo@123456')
await page.locator('button:has-text("登 录"), button:has-text("登录")').first().click()
await page.waitForTimeout(8000)

// 1) todo 页（已知有 10 行数据）——找出真实的表格/行/按钮选择器
await page.goto(`${BASE}/flowable/bpm/task/todo`, { waitUntil: 'domcontentloaded', timeout: 45000 })
await page.waitForTimeout(12000)
const probe = await page.evaluate(() => {
  const classes = new Set()
  document.querySelectorAll('table, [class*=table], [class*=vxe]').forEach((el) => {
    String(el.className || '').split(/\s+/).filter(Boolean).slice(0, 3).forEach((c) => classes.add(c))
  })
  const trCount = document.querySelectorAll('tr').length
  const btns = [...document.querySelectorAll('button, a[class*=btn], .ant-btn')].map((b) => (b.innerText || '').trim()).filter(Boolean)
  // 找主内容区容器
  const cont = document.querySelector('.jeecg-layout-content, .ant-layout-content, main, .p-2')
  return {
    tableishClasses: [...classes].slice(0, 20),
    trCount,
    buttonTexts: [...new Set(btns)].slice(0, 25),
    contentCls: cont ? cont.className : null,
    contentTextLen: cont ? cont.innerText.trim().length : null,
  }
})
console.log('TODO page:', JSON.stringify(probe, null, 1))
await browser.close()
