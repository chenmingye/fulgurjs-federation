import { chromium } from '@playwright/test'
const browser = await chromium.launchPersistentContext(`/tmp/fulgur-diagf6-${Date.now()}`, { headless: true, args: ['--no-proxy-server'], viewport: { width: 1600, height: 900 } })
const page = browser.pages()[0]
await page.goto('http://localhost:8773/main/', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(8000)
await page.locator('input[placeholder*="账号"], input[placeholder*="用户名"]').first().fill('admin')
await page.locator('input[type="password"]').first().fill('Demo@123456')
await page.locator('button:has-text("登 录"), button:has-text("登录")').first().click()
await page.locator('input[type="password"]').first().waitFor({ state: 'hidden', timeout: 30000 }).catch(() => {})
await page.waitForTimeout(3000)
for (const route of ['/flowable/bpm/task/copy']) {
  await page.goto(`http://localhost:8773/main${route}`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {})
  await page.waitForTimeout(15000)
  const out = await page.evaluate(() => {
    const empties = Array.from(document.querySelectorAll('.el-table__empty-text, .vxe-table--empty-content, .vxe-table--empty-block, .el-empty__description')).filter((n) => n.offsetParent !== null).map((n) => n.textContent.trim().slice(0, 20))
    const emptyTextAll = Array.from(document.querySelectorAll('*')).filter((n) => n.children.length === 0 && /暂无数据|No Data/.test(n.textContent)).map((n) => `${n.tagName}.${String(n.className).slice(0,40)}`)
    return { rows: document.querySelectorAll('.el-table__row, .vxe-body--row').length, tableEmptyEls: empties, emptyNodeSamples: emptyTextAll.slice(0, 4), textLen: document.body.innerText.length }
  })
  console.log(route, JSON.stringify(out))
}
await browser.close()
