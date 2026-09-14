// D2 原始堆栈探针：页面内直接调 runtime loadRemote，打印底层 cause 堆栈
import { chromium } from '@playwright/test'

const BASE = process.argv[2] || 'http://localhost:8662'
const browser = await chromium.launchPersistentContext(`/tmp/pd2raw-${Date.now()}`, {
  headless: true, args: ['--no-proxy-server'], viewport: { width: 1500, height: 950 },
})
const page = browser.pages()[0]
await page.goto(`${BASE}/main/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(6000)
await page.locator('input[placeholder*="账号"], input[placeholder*="用户名"]').first().fill('admin')
await page.locator('input[type="password"]').first().fill('Demo@123456')
await page.locator('button:has-text("登 录"), button:has-text("登录")').first().click()
await page.waitForTimeout(9000)

const RT_URL = `${BASE}/main/js/virtual_unifed-runtime-pkH-rS1N.js`
const result = await page.evaluate(async (rtUrl) => {
  const rt = await import(/* @vite-ignore */ rtUrl)
  const out = { keys: Object.keys(rt) }
  const load = rt.loadRemote || rt.loadRemoteModule
  try {
    const mod = await load('mes-lowcode/pages/lowdev/formDesign')
    out.ok = Object.keys(mod)
  } catch (e) {
    out.err = String(e)
    let c = e.cause
    out.chain = []
    while (c) {
      out.chain.push({ msg: String(c).slice(0, 200), stack: String(c.stack || '').slice(0, 1200) })
      c = c.cause
    }
  }
  return out
}, RT_URL)
console.log(JSON.stringify(result, null, 2).slice(0, 4000))
await browser.close()
