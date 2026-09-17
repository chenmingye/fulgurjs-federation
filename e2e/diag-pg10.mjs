import { chromium } from '@playwright/test'
const BASE = 'http://localhost:8662'
const PROFILE = `/tmp/fulgur-diag-pg10-${Date.now()}`
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
    // 找到含 EP 的 index chunk（健康的 _ 命名空间）
    const chunks = performance.getEntriesByType('resource').map((r) => r.name).filter((n) => /lowcode\/assets\/index-.*\.js$/.test(n))
    for (const url of chunks) {
      const mod = await import(/* @vite-ignore */ url)
      if (mod.__tla) await mod.__tla
      const ns = mod._
      if (ns && ns.provideGlobalConfig) {
        const zhCn = (await import(/* @vite-ignore */ url.replace(/index-[^/]+\.js$/, ''))) // noop
        res.foundChunk = url.split('/').pop()
        res.nsKeys = Object.keys(ns).length
        res.globalConfigSetter = typeof ns.useGlobalConfig
        // 模块级 globalConfig：通过 useGlobalConfig()（无实例上下文）读取并试探写入
        const cfg = ns.useGlobalConfig()
        res.cfgBefore = cfg.value ?? null
        // provideGlobalConfig global 写入：用第三个参数 global=true 需 app；直接改返回的 ref
        cfg.value = { locale: ns.zhCn ?? undefined }
        res.cfgAfter = cfg.value
        break
      }
    }
  } catch (e) { res.err = String(e).slice(0, 150) }
  await new Promise((r) => setTimeout(r, 500))
  res.after = document.querySelector('.el-pagination__total')?.textContent?.trim()
  return res
})
console.log(JSON.stringify(out, null, 1))
await browser.close()
