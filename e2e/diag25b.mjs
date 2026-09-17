import { chromium } from '@playwright/test'
const BASE = 'http://localhost:8662'
const PROFILE = `/tmp/fulgur-diag25b-${Date.now()}`
const browser = await chromium.launchPersistentContext(PROFILE, { headless: true, args: ['--no-proxy-server'], viewport: { width: 1600, height: 900 } })
const page = browser.pages()[0]
const errs = []
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 150)) })
await page.goto(`${BASE}/main/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(8000)
await page.locator('input[placeholder*="账号"], input[placeholder*="用户名"]').first().fill('admin')
await page.locator('input[type="password"]').first().fill('Demo@123456')
await page.locator('button:has-text("登 录"), button:has-text("登录")').first().click()
await page.waitForTimeout(8000)
await page.goto(`${BASE}/main/lowcode/lowdev/moduleDesign`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(25000)
const out = await page.evaluate(() => {
  const names = new Set()
  const tooltipEls = []
  for (const el of document.querySelectorAll('*')) {
    const inst = el.__vueParentComponent
    if (!inst?.type) continue
    const n = inst.type.__name || inst.type.name
    if (n) names.add(n)
    if (n && /Tooltip|Popper|OnlyChild/i.test(n)) {
      tooltipEls.push({ comp: n, tag: el.tagName, cls: String(el.className).slice(0, 60) })
    }
  }
  return { comps: [...names].filter((n) => /Tooltip|Popper|Table|Tree|Crud|Select|Input/i.test(n)).slice(0, 30), tooltipEls: tooltipEls.slice(0, 10) }
})
console.log(JSON.stringify(out, null, 1))
console.log('errs:', errs.slice(0, 3))
await browser.close()
