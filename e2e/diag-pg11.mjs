import { chromium } from '@playwright/test'
const BASE = 'http://localhost:8662'
const PROFILE = `/tmp/fulgur-diag-pg11-${Date.now()}`
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
  const res = { before: document.querySelector('.el-pagination__total')?.textContent?.trim() }
  try {
    const mod = await import('/lowcode/assets/index-33lCojUg.js')
    if (mod.__tla) await mod.__tla
    const ns = mod._
    res.nsKeys = ns ? Object.keys(ns).length : 0
    res.pgc = typeof ns?.provideGlobalConfig
    res.ugc = typeof ns?.useGlobalConfig
    if (ns?.useGlobalConfig) {
      const cfg = ns.useGlobalConfig()
      res.cfgShape = cfg && typeof cfg === 'object' && 'value' in cfg ? 'ref' : typeof cfg
      res.cfgBefore = JSON.stringify(cfg?.value ?? null).slice(0, 80)
      // 写模块级 globalConfig：EP zhCn 从同一 ns 取
      const zh = Object.keys(ns).find((k) => /zh/i.test(k))
      res.zhExport = zh
      const zhCn = ns[zh]
      cfg.value = { locale: zhCn }
      res.cfgAfter = JSON.stringify(cfg?.value ?? null).slice(0, 80)
      await new Promise((r) => setTimeout(r, 800))
      res.after = document.querySelector('.el-pagination__total')?.textContent?.trim()
    }
  } catch (e) { res.err = String(e).slice(0, 200) }
  return res
})
console.log(JSON.stringify(out, null, 1))
await browser.close()
