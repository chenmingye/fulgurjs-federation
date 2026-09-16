// dev 06 iframe 归属诊断
import { chromium } from '@playwright/test'
const browser = await chromium.launchPersistentContext(`/tmp/fulgur-06dg-${Date.now()}`, {
  headless: true, args: ['--no-proxy-server'], viewport: { width: 1500, height: 900 },
})
const page = browser.pages()[0]
const errs = []
page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)))
await page.goto('http://localhost:8773/main/', { waitUntil: 'domcontentloaded', timeout: 90000 })
await page.waitForTimeout(15000)
const hasLogin = await page.locator('input[type="password"]').count()
if (hasLogin) {
  await page.locator('input[placeholder*="账号"], input[placeholder*="用户名"]').first().fill('admin', { timeout: 15000 })
  await page.locator('input[type="password"]').first().fill('Demo@123456', { timeout: 15000 })
  await page.locator('button:has-text("登 录"), button:has-text("登录")').first().click({ timeout: 15000 })
  await page.waitForTimeout(12000)
}
await page.goto('http://localhost:8773/flowable/bpm/process-instance/detail?id=60f405ed-b19e-11f1-bb90-1ad9e106d037', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {})
await page.waitForTimeout(15000)
const info = await page.evaluate(() => {
  const f = document.querySelector('iframe')
  return {
    iframeCount: document.querySelectorAll('iframe').length,
    iframeSrc: f?.src?.slice(0, 120) ?? '(none)',
    mainAppProps: !!window.mainAppProps,
    hostApp: !!window.__FULGUR_HOST_APP__,
    textLen: (document.body.innerText || '').length,
    hasAmis: (document.body.innerText || '').includes('AMIS'),
  }
})
console.log(JSON.stringify({ ...info, errs: errs.slice(0, 3) }, null, 1))
await page.screenshot({ path: '/tmp/diag06-dev.png' })
await browser.close()
