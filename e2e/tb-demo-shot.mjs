// fulgur-demo 演示页验证：免登录路由 + 双远程组件 + 交互
import { chromium } from '@playwright/test'

const BASE = process.env.VBASE || 'http://localhost:8773'
const OUT = process.env.VOUT || '/tmp/tb-demo.png'
const browser = await chromium.launchPersistentContext(`/tmp/tb-demo-${Date.now()}`, {
  headless: true,
  args: ['--no-proxy-server'],
  viewport: { width: 1600, height: 900 },
})
const page = browser.pages()[0]
const errors = []
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)))

await page.goto(`${BASE}/main/fulgur-demo`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(12000)
await page.screenshot({ path: OUT })
const text = await page.locator('body').innerText().catch(() => '')
let clickResult = 'n/a'
const btn = page.locator('button:has-text("推进 10%")')
if (await btn.count()) {
  await btn.first().click()
  await page.waitForTimeout(600)
  await btn.first().click()
  await page.waitForTimeout(600)
  await page.screenshot({ path: OUT.replace('.png', '-clicked.png') })
  const progressText = await page.locator('.fulgur-task-card').innerText().catch(() => '')
  clickResult = progressText.includes('20%') ? '推进两次后 20% ✓' : progressText.slice(0, 80)
}
console.log(JSON.stringify({
  url: page.url(),
  hasTaskCard: text.includes('TaskCard'),
  hasInfoCard: text.includes('InfoCard'),
  clickResult,
  pageErrors: errors.slice(0, 3),
}, null, 2))
await browser.close()
