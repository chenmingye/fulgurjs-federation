import { chromium } from '@playwright/test'
const BASE = 'http://localhost:8662'
const PROFILE = `/tmp/fulgur-diag-pg8-${Date.now()}`
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
    if (m.__tla && typeof m.__tla.then === 'function') await m.__tla
    else res.tlaShape = typeof m.__tla
    res.facade = { keys: Object.keys(m).length, pgc: typeof m.provideGlobalConfig, elBtn: typeof m.ElButton, hasTla: '__tla' in m }
    await new Promise((r) => setTimeout(r, 3000))
    res.facadeAfterWait = { pgc: typeof m.provideGlobalConfig, elBtn: typeof m.ElButton }
  } catch (e) { res.facadeErr = String(e).slice(0, 200) }
  return res
})
console.log(JSON.stringify(out, null, 1))
await browser.close()
