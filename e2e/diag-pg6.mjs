import { chromium } from '@playwright/test'
const BASE = 'http://localhost:8662'
const PROFILE = `/tmp/fulgur-diag-pg6-${Date.now()}`
const browser = await chromium.launchPersistentContext(PROFILE, { headless: true, args: ['--no-proxy-server'], viewport: { width: 1600, height: 900 } })
const page = browser.pages()[0]
await page.goto(`${BASE}/main/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(8000)
await page.locator('input[placeholder*="账号"], input[placeholder*="用户名"]').first().fill('admin')
await page.locator('input[type="password"]').first().fill('Demo@123456')
await page.locator('button:has-text("登 录"), button:has-text("登录")').first().click()
await page.waitForTimeout(8000)
await page.goto(`${BASE}/main/lowcode/lowdev/formDesign`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(25000)
const out = await page.evaluate(async () => {
  const rt = globalThis.__FULGUR_RUNTIME__
  const o = await rt.loadShare('element-plus', { shareScope: 'default', shareKey: 'element-plus', singleton: true, requiredVersion: '^2.10.2' })
  const probe = ['provideGlobalConfig', 'useGlobalConfig', 'localeContextKey', 'configProviderContextKey', 'ElConfigProvider', 'ElButton', 'ElPagination', 'version', 'dayjs']
  const types = {}
  for (const k of probe) types[k] = typeof o?.[k]
  const d = o?.default
  return { types, defaultKeys: d ? Object.keys(d).length : 0, defaultPgc: typeof d?.provideGlobalConfig, defaultElBtn: typeof d?.ElButton }
})
console.log(JSON.stringify(out, null, 1))
await browser.close()
