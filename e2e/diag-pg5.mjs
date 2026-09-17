import { chromium } from '@playwright/test'
const BASE = 'http://localhost:8662'
const PROFILE = `/tmp/fulgur-diag-pg5-${Date.now()}`
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
  if (!rt) return { rt: false }
  const scope = rt.shareScopeMap?.default?.['element-plus'] || {}
  const versions = Object.keys(scope).map((v) => ({ v, loaded: scope[v].loaded, from: scope[v].from, getType: typeof scope[v].get }))
  try {
    const o = await rt.loadShare('element-plus', { shareScope: 'default', shareKey: 'element-plus', singleton: true, requiredVersion: '^2.10.2' })
    return { rt: true, versions, typeofPgc: typeof o?.provideGlobalConfig, nsKeys: Object.keys(o || {}).length, hasDefault: !!(o && o.default), sampleKeys: Object.keys(o || {}).filter((k) => /rovide|ocale|onfig/i.test(k)).slice(0, 10) }
  } catch (e) {
    return { rt: true, versions, loadErr: String(e).slice(0, 250) }
  }
})
console.log(JSON.stringify(out, null, 1))
await browser.close()
