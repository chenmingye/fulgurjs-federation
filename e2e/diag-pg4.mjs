import { chromium } from '@playwright/test'
const BASE = 'http://localhost:8662'
const PROFILE = `/tmp/fulgur-diag-pg4-${Date.now()}`
const browser = await chromium.launchPersistentContext(PROFILE, { headless: true, args: ['--no-proxy-server'], viewport: { width: 1600, height: 900 } })
const page = browser.pages()[0]
await page.goto(`${BASE}/main/fulgur-demo`, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {})
await page.goto(`${BASE}/main/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(6000)
const out = await page.evaluate(async () => {
  const rt = globalThis.__FULGUR_RUNTIME__
  if (!rt) return { rt: false }
  const scope = rt.shareScopeMap?.default?.['element-plus'] || {}
  const versions = Object.keys(scope).map((v) => ({ v, loaded: scope[v].loaded, from: scope[v].from }))
  try {
    const o = await rt.loadShare('element-plus', { shareScope: 'default', shareKey: 'element-plus', singleton: true, requiredVersion: '^2.10.2' })
    return {
      rt: true, versions,
      typeofPgc: typeof o?.provideGlobalConfig,
      nsKeys: Object.keys(o || {}).length,
      hasDefault: !!(o && o.default),
      defaultType: typeof o?.default,
      sampleKeys: Object.keys(o || {}).slice(0, 8),
    }
  } catch (e) {
    return { rt: true, versions, loadErr: String(e).slice(0, 200) }
  }
})
console.log(JSON.stringify(out, null, 1))
await browser.close()
