import { chromium } from '@playwright/test'
const BASE = process.env.VBASE || 'http://localhost:8773'
const PROFILE = `/tmp/fulgur-diag-pg2-${Date.now()}`
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
await page.goto(`${BASE}/main/lowcode/lowdev/formDesign`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(30000)
const out = await page.evaluate(() => {
  const el = document.querySelector('.el-pagination')
  let compNames = []
  let appSyms = null
  let appProvidesFrom = null
  if (el) {
    let inst = el.__vueParentComponent
    while (inst) {
      if (inst.type?.__name) compNames.push(inst.type.__name)
      if (inst.type?.name) compNames.push(inst.type.name)
      inst = inst.parent
    }
    const appCtx = el.__vueParentComponent?.appContext
    const provides = appCtx?.app?._context?.provides
    if (provides) {
      appSyms = Object.getOwnPropertySymbols(provides).map((s) => s.description)
      appProvidesFrom = 'app._context.provides'
    }
  }
  return { found: !!el, compNames: [...new Set(compNames)].slice(0, 14), appSyms, appProvidesFrom, total: document.querySelector('.el-pagination__total')?.textContent?.trim() }
})
console.log(JSON.stringify(out, null, 1))
console.log('errs:', errs.slice(0, 4))
await browser.close()
