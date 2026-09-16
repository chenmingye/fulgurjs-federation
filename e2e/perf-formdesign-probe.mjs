// 表单设计页加载性能对比探针：联邦(8662) vs 乾坤基线(8661)
// 流程：登录 → 记录资源快照 → 点菜单（二次开发→Online表单开发→表单设计）→ 等表格行出现
//       → 输出耗时 + /lowcode/ 资源统计（请求数/传输字节/最慢 Top）→ 再测一次热加载
import { chromium } from '@playwright/test'

const BASE = process.env.SITE || 'http://localhost:8662'
const TAG = process.env.TAG || 'fed'
const browser = await chromium.launchPersistentContext(`/tmp/fulgur-perf-${TAG}-${Date.now()}`, {
  headless: true,
  args: ['--no-proxy-server'],
  viewport: { width: 1600, height: 1000 },
})
const page = browser.pages()[0]

const t = Date.now()
await page.goto(`${BASE}/main/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(8000)
await page.locator('input[placeholder*="账号"], input[placeholder*="用户名"]').first().fill('admin')
await page.locator('input[type="password"]').first().fill('Demo@123456')
await page.locator('button:has-text("登 录"), button:has-text("登录")').first().click()
await page.locator('input[type="password"]').first().waitFor({ state: 'hidden', timeout: 30000 }).catch(() => {})
await page.waitForTimeout(5000)
console.log(`[${TAG}] login done +${((Date.now() - t) / 1000).toFixed(1)}s`)

const stats = async (sinceCount) => {
  return page.evaluate((since) => {
    const all = performance.getEntriesByType('resource').slice(since)
    const low = all.filter((e) => e.name.includes('/lowcode/'))
    const kb = (n) => Math.round(n / 1024)
    const top = [...low]
      .sort((a, b) => b.responseEnd - b.startTime - (a.responseEnd - a.startTime))
      .slice(0, 8)
      .map((e) => `${kb(e.transferSize)}KB/${kb(e.decodedBodySize)}KB ${((e.responseEnd - e.startTime) / 1000).toFixed(2)}s ${e.name.split('/').pop().slice(0, 46)}`)
    return {
      reqTotal: all.length,
      reqLow: low.length,
      transferKB: kb(low.reduce((a, e) => a + (e.transferSize || 0), 0)),
      decodedKB: kb(low.reduce((a, e) => a + (e.decodedBodySize || 0), 0)),
      spanSec: low.length ? +((Math.max(...low.map((e) => e.responseEnd)) - Math.min(...low.map((e) => e.startTime))) / 1000).toFixed(2) : 0,
      top,
    }
  }, sinceCount)
}

const runOnce = async (label) => {
  const before = await page.evaluate(() => {
    performance.setResourceTimingBufferSize(20000)
    performance.clearResourceTimings()
    return 0
  })
  const t0 = Date.now()
  // 展开菜单：二次开发 → Online表单开发 → 表单设计（jeecg 自定义菜单类，逐级点 title 展开）
  for (const item of ['二次开发', 'Online表单开发']) {
    await page
      .locator('li.jeecg-menu-submenu', { hasText: item })
      .locator('.jeecg-menu-submenu-title')
      .first()
      .click({ timeout: 15000 })
    await page.waitForTimeout(1200)
  }
  // 叶子项：在可见的 .jeecg-menu-item 里找"表单设计"
  const leaf = page.locator('li.jeecg-menu-item:visible', { hasText: '表单设计' }).first()
  await leaf.click({ timeout: 15000 })
  // 等表格行出现（avue/el-table 共用 el-table），最长 60s
  let waited
  try {
    await page.waitForSelector('.el-table__row', { timeout: 60000 })
    waited = ((Date.now() - t0) / 1000).toFixed(2)
  } catch {
    waited = 'timeout(60s)'
  }
  await page.waitForTimeout(4000) // 让残余请求落账
  const s = await stats(before)
  console.log(`\n[${TAG}] ${label}: 点击→表格行 ${waited}s`)
  console.log(JSON.stringify(s, null, 1))
  // 离开页面（热加载测试用）
  await page.locator('text=首页').first().click({ timeout: 10000 }).catch(() => {})
  await page.waitForTimeout(2500)
}

await runOnce('冷加载（首次点菜单）')
await runOnce('热加载（二次点菜单）')
await browser.close()
