// D2 CDP 探针：异常暂停抓原始堆栈（错误在运行时被包装吞栈，只能这样拿）
import { chromium } from '@playwright/test'

const BASE = process.argv[2] || 'http://localhost:8662'
const RT_URL = `${BASE}/main/js/virtual_fulgur-runtime-pkH-rS1N.js`
const browser = await chromium.launchPersistentContext(`/tmp/pd2cdp-${Date.now()}`, {
  headless: true, args: ['--no-proxy-server'], viewport: { width: 1500, height: 950 },
})
const page = browser.pages()[0]
const cdp = await page.context().newCDPSession(page)
await cdp.send('Debugger.enable')
const hits = []
cdp.on('Debugger.paused', async (ev) => {
  const exc = ev.data?.description || ''
  if (exc.includes('extend is not a function') || exc.includes('destructure')) {
    hits.push(exc.slice(0, 2000))
    const top = ev.callFrames[0]
    hits.push(`THROW SITE: ${top.url}:${top.location.lineNumber + 1}:${top.location.columnNumber + 1}`)
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

// 通过运行时加载故障模块
const triggered = await page.evaluate(async (rtUrl) => {
  const rt = await import(/* @vite-ignore */ rtUrl)
  try {
    await rt.v.loadRemote('mes-lowcode/pages/lowdev/formDesign')
    return 'loaded-ok'
  } catch (e) {
    return 'wrapped: ' + String(e).slice(0, 160)
  }
}, RT_URL)
await page.waitForTimeout(3000)
await cdp.send('Debugger.setPauseOnExceptions', { state: 'none' })
console.log('trigger:', triggered)
console.log(`捕获异常 ${hits.length} 条:`)
hits.slice(0, 6).forEach((h, i) => console.log(`\n-- #${i} --\n${h}`))
await browser.close()
