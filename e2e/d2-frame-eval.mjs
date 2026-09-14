// D2 CDP 帧内求值：在抛错帧上检查 uo/p.default/i6e/oo 的运行时真身
import { chromium } from '@playwright/test'

const BASE = process.argv[2] || 'http://localhost:8662'
const RT_URL = `${BASE}/main/js/virtual_unifed-runtime-pkH-rS1N.js`
const browser = await chromium.launchPersistentContext(`/tmp/pd2e-${Date.now()}`, {
  headless: true, args: ['--no-proxy-server'], viewport: { width: 1500, height: 950 },
})
const page = browser.pages()[0]
const cdp = await page.context().newCDPSession(page)
await cdp.send('Debugger.enable')
let reported = false
cdp.on('Debugger.paused', async (ev) => {
  const exc = ev.data?.description || ''
  if (!reported && exc.includes('extend is not a function')) {
    reported = true
    const frame = ev.callFrames[0]
    const evals = ['typeof uo', 'uo && Object.keys(uo)', 'uo && String(uo.default).slice(0,120)',
      'typeof p', 'p && String(p.default).slice(0,120)', 'typeof oo', 'String(oo && oo.extend).slice(0,80)',
      'i6e && Object.keys(i6e)', 'typeof Zn', 'String(rC).slice(0,80)']
    for (const expr of evals) {
      try {
        const r = await cdp.send('Debugger.evaluateOnCallFrame', { callFrameId: frame.callFrameId, expression: expr })
        console.log(`> ${expr}\n  ${JSON.stringify(r.result.description ?? r.result.value)}`)
      } catch (e) { console.log(`> ${expr}\n  EVAL-ERR ${String(e).slice(0, 80)}`) }
    }
  }
  await cdp.send('Debugger.resume').catch(() => {})
})
await cdp.send('Debugger.setPauseOnExceptions', { state: 'all' })

await page.goto(`${BASE}/main/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(6000)
await page.locator('input[placeholder*="账号"], input[placeholder*="用户名"]').first().fill('admin')
await page.locator('input[type="password"]').first().fill('Demo@123456')
await page.locator('button:has-text("登 录"), button:has-text("登录")').first().click()
await page.waitForTimeout(9000)
await page.evaluate(async (rtUrl) => {
  const rt = await import(/* @vite-ignore */ rtUrl)
  await rt.v.loadRemote('mes-lowcode/pages/lowdev/formDesign').catch(() => {})
}, RT_URL)
await page.waitForTimeout(4000)
if (!reported) console.log('未捕获到目标异常')
await browser.close()
