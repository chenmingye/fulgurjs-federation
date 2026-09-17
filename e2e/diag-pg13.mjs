import { chromium } from '@playwright/test'
const BASE = 'http://localhost:8662'
const PROFILE = `/tmp/fulgur-diag-pg13-${Date.now()}`
const browser = await chromium.launchPersistentContext(PROFILE, { headless: true, args: ['--no-proxy-server'], viewport: { width: 1600, height: 900 } })
const page = browser.pages()[0]
await page.addInitScript(() => {
  const orig = Symbol
  const wrapped = function (desc) {
    const s = orig(desc)
    if (desc === 'localeContextKey' || desc === 'configProviderContextKey') {
      ;(globalThis.__epSyms = globalThis.__epSyms || []).push({ desc, s, stack: String(new Error().stack).split('\n').slice(1, 4).join(' | ').slice(0, 220) })
    }
    return s
  }
  Object.setPrototypeOf(wrapped, orig)
  Object.assign(wrapped, orig)
  globalThis.Symbol = wrapped
})
await page.goto(`${BASE}/main/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(8000)
await page.locator('input[placeholder*="账号"], input[placeholder*="用户名"]').first().fill('admin')
await page.locator('input[type="password"]').first().fill('Demo@123456')
await page.locator('button:has-text("登 录"), button:has-text("登录")').first().click()
await page.waitForTimeout(8000)
await page.goto(`${BASE}/main/lowcode/lowdev/formDesign`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(25000)
const out = await page.evaluate(() => {
  const syms = globalThis.__epSyms || []
  const hostApp = globalThis.__FULGUR_HOST_APP__
  const provides = hostApp?._context?.provides
  const provideSyms = provides ? Object.getOwnPropertySymbols(provides).filter((s) => s.description === 'localeContextKey') : []
  return {
    createdCount: syms.length,
    creations: syms.map((x) => ({ desc: x.desc, src: (x.stack.match(/https?:\/\/[^ ]+/g) || []).slice(0, 2) })),
    provideSymsCount: provideSyms.length,
    provideMatchesCreation: provideSyms.length && syms.some((x) => x.s === provideSyms[0]),
    pgTotal: document.querySelector('.el-pagination__total')?.textContent?.trim(),
  }
})
console.log(JSON.stringify(out, null, 1))
await browser.close()
