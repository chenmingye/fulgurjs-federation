import { chromium } from '@playwright/test'
const BASE = 'http://localhost:8662'
const browser = await chromium.launchPersistentContext(`/tmp/pfunc2-${Date.now()}`, { headless: true, args: ['--no-proxy-server'], viewport: { width: 1500, height: 950 } })
const page = browser.pages()[0]
await page.goto(`${BASE}/main/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(6000)
await page.locator('input[placeholder*="账号"], input[placeholder*="用户名"]').first().fill('admin')
await page.locator('input[type="password"]').first().fill('Demo@123456')
await page.locator('button:has-text("登 录"), button:has-text("登录")').first().click()
await page.waitForTimeout(9000)

// 1) 搜索是否真过滤：输入不可能匹配的关键字 → 行数应变 0
await page.goto(`${BASE}/flowable/bpm/task/todo`, { waitUntil: 'domcontentloaded', timeout: 45000 })
await page.waitForTimeout(13000)
const before = await page.locator('.el-table__body tr.el-table__row').count()
await page.locator('.jeecg-layout-content input').first().fill('zzz不存在的任务名zzz')
await page.waitForTimeout(500)
await page.locator('button:has-text("搜索")').first().click()
await page.waitForTimeout(6000)
const after = await page.locator('.el-table__body tr.el-table__row').count()
console.log('搜索过滤: rows', before, '->', after, after === 0 ? '✅ 生效' : '⚠️ 未生效/需复查')

// 2) 模型创建页 0×0 成因：测祖先链尺寸
await page.goto(`${BASE}/flowable/bpm/manager/model/create`, { waitUntil: 'domcontentloaded', timeout: 45000 })
await page.waitForTimeout(13000)
const chain = await page.evaluate(() => {
  const inp = document.querySelector('.jeecg-layout-content input:not([type=hidden])')
  if (!inp) return { err: 'no input' }
  const out = []
  let el = inp
  for (let i = 0; i < 14 && el; i++) {
    const cs = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    out.push({
      tag: el.tagName.toLowerCase(),
      cls: String(el.className || '').slice(0, 60),
      w: Math.round(r.width), h: Math.round(r.height),
      display: cs.display, height: cs.height, minHeight: cs.minHeight, flex: cs.flex,
    })
    el = el.parentElement
  }
  return out
})
console.log('祖先链（input → up）:')
for (const n of chain.err ? [chain] : chain) console.log(' ', JSON.stringify(n))
await browser.close()
