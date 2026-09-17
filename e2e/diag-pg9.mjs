import { chromium } from '@playwright/test'
const BASE = 'http://localhost:8662'
const PROFILE = `/tmp/fulgur-diag-pg9-${Date.now()}`
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
  const hostApp = globalThis.__FULGUR_HOST_APP__
  const provides = hostApp?._context?.provides
  const syms = provides ? Object.getOwnPropertySymbols(provides).map((s) => s.description) : null
  let localeVal = 'n/a'
  if (provides) {
    for (const s of Object.getOwnPropertySymbols(provides)) {
      if (s.description === 'localeContextKey') {
        const v = provides[s]
        localeVal = v && typeof v === 'object' && 'value' in v ? (v.value?.name ?? String(v.value)) : typeof v
      }
    }
  }
  // 分页组件的实际渲染文案来源：看 EP use-locale 是否另有模块副本——探测 window 上已加载脚本数量级
  const scripts = performance.getEntriesByType('resource').filter((r) => /lowcode\/assets\/.*\.js$/.test(r.name)).length
  return { hasHostApp: !!hostApp, syms, localeVal, lowcodeScriptsLoaded: scripts, pgTotal: document.querySelector('.el-pagination__total')?.textContent?.trim() }
})
console.log(JSON.stringify(out, null, 1))
await browser.close()
