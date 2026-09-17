import { chromium } from '@playwright/test'
const BASE = 'http://localhost:8662'
const PROFILE = `/tmp/fulgur-diag-pg12-${Date.now()}`
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
  const res = {}
  const rt = globalThis.__FULGUR_RUNTIME__
  const scopeVue = rt?.shareScopeMap?.default?.vue || {}
  res.vueScope = Object.keys(scopeVue).map((v) => ({ v, from: scopeVue[v].from, loaded: scopeVue[v].loaded }))
  try {
    const negotiated = await rt.loadShare('vue', { shareScope: 'default', shareKey: 'vue', singleton: true, requiredVersion: '^3.4.0' })
    res.negotiatedVersion = negotiated?.version
    const own = await import('/lowcode/assets/vue.runtime.esm-bundler-QhwONLpd.js')
    res.ownVersion = own?.version
    res.sameInstance = negotiated === own || negotiated?.reactive === own?.reactive
    res.ownReactiveType = typeof own?.reactive
  } catch (e) { res.err = String(e).slice(0, 150) }
  // host app 的 vue：从 hostApp 组件树侧无法直接取，但 admin 的 vue chunk URL 已知 main/js/vue-vendor-*.js
  res.pgTotal = document.querySelector('.el-pagination__total')?.textContent?.trim()
  return res
})
console.log(JSON.stringify(out, null, 1))
await browser.close()
