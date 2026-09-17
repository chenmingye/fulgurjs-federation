import { chromium } from '@playwright/test'
const BASE = 'http://localhost:8662'
const PROFILE = `/tmp/fulgur-diag-pg7-${Date.now()}`
const browser = await chromium.launchPersistentContext(PROFILE, { headless: true, args: ['--no-proxy-server'], viewport: { width: 1600, height: 900 } })
const page = browser.pages()[0]
await page.goto(`${BASE}/main/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(8000)
await page.locator('input[placeholder*="账号"], input[placeholder*="用户名"]').first().fill('admin')
await page.locator('input[type="password"]').first().fill('Demo@123456')
await page.locator('button:has-text("登 录"), button:has-text("登录")').first().click()
await page.waitForTimeout(8000)
await page.goto(`${BASE}/main/lowcode/lowdev/formDesign`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(20000)
const out = await page.evaluate(async () => {
  const res = {}
  try {
    const m = await import('/lowcode/assets/virtual_fulgur-shared_element-plus-D7makIBd.js')
    await m.__tla
    res.facade = { keys: Object.keys(m).length, pgc: typeof m.provideGlobalConfig, elBtn: typeof m.ElButton, hasTla: '__tla' in m }
  } catch (e) { res.facadeErr = String(e).slice(0, 150) }
  try {
    const ix = await import('/lowcode/assets/index-DKRCPYQT.js')
    await ix.__tla
    res.index = { keys: Object.keys(ix), typeofUnderscore: typeof ix._ }
    if (ix._ && typeof ix._ === 'object') res.indexUnder = { keys: Object.keys(ix._).length, pgc: typeof ix._.provideGlobalConfig, elBtn: typeof ix._.ElButton }
    else if (typeof ix._ === 'function') res.indexUnder = 'function/thenable?'
  } catch (e) { res.indexErr = String(e).slice(0, 150) }
  return res
})
console.log(JSON.stringify(out, null, 1))
await browser.close()
