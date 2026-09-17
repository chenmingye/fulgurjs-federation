// 诊断探针：06 详情页 iframe 来源与联邦 realm 状态
import { chromium } from '@playwright/test'
const BASE = process.env.VBASE || 'http://localhost:8773'
const TAG = process.env.VTAG || 'dev'
const PROFILE = `/tmp/fulgur-diag06b-${TAG}-${Date.now()}`
const browser = await chromium.launchPersistentContext(PROFILE, { headless: true, args: ['--no-proxy-server'], viewport: { width: 1600, height: 900 } })
const page = browser.pages()[0]
const logs = []
page.on('console', (m) => { logs.push(`[${m.type()}] ${m.text().slice(0, 300)}`) })
page.on('pageerror', (e) => logs.push('[pageerror] ' + String(e).slice(0, 400)))
await page.goto(`${BASE}/main/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(8000)
await page.locator('input[placeholder*="账号"], input[placeholder*="用户名"]').first().fill('admin')
await page.locator('input[type="password"]').first().fill('Demo@123456')
await page.locator('button:has-text("登 录"), button:has-text("登录")').first().click()
await page.waitForTimeout(8000)
await page.locator('text=审批中心').first().click()
await page.waitForTimeout(1500)
await page.locator('text=待办任务').first().click()
await page.waitForTimeout(12000)
const rows = await page.locator('tr:has-text("AMIS联邦验证2"), .vxe-body--row:has-text("AMIS联邦验证2")').count()
console.log('amis rows:', rows)
await page.locator('tr:has-text("AMIS联邦验证2"), .vxe-body--row:has-text("AMIS联邦验证2")').locator('a:has-text("办理"), span:has-text("办理"), button:has-text("办理")').first().click({ timeout: 10000 })
await page.waitForTimeout(15000)
const diag = await page.evaluate(() => {
  const iframes = Array.from(document.querySelectorAll('iframe')).map((f) => ({
    src: (f.getAttribute('src') || '').slice(0, 220),
    visible: !!(f.offsetWidth || f.offsetHeight),
    cls: f.className,
  }))
  return {
    url: location.href.slice(0, 200),
    hasRuntime: !!(globalThis).__FULGUR_RUNTIME__,
    runtimeVersion: (globalThis).__FULGUR_RUNTIME__?.version ?? null,
    hasMainAppProps: !!(globalThis).mainAppProps,
    amisRouterEl: !!document.querySelector('.amis-form-router-page'),
    amisSchemaPre: !!document.querySelector('.schema-preview'),
    iframes,
    bodySnippet: document.body.innerText.replace(/\s+/g, ' ').slice(0, 400),
  }
})
console.log(JSON.stringify(diag, null, 1))
console.log('---- relevant logs ----')
console.log(logs.filter((l) => /getApprovalDetail|mainAppProps|fulgur|AMIS|formId|error/i.test(l)).slice(0, 15).join('\n'))
await page.screenshot({ path: '/tmp/fulgur-diag06b.png' })
await browser.close()
