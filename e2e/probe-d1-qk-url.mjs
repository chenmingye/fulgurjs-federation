// 8661 直链进入流程模型列表 + 新建模型计时
import { chromium } from '@playwright/test'
import fs from 'node:fs'
const BASE = 'http://localhost:8661'
const DIR = '/tmp/probe-d1/qiankun'
fs.mkdirSync(DIR, { recursive: true })
const browser = await chromium.launchPersistentContext(`/tmp/pd1u-${Date.now()}`, {
  headless: true, args: ['--no-proxy-server'], viewport: { width: 1500, height: 950 },
})
const page = browser.pages()[0]
await page.goto(`${BASE}/main/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(6000)
await page.locator('input[placeholder*="账号"], input[placeholder*="用户名"]').first().fill('admin')
await page.locator('input[type="password"]').first().fill('Demo@123456')
await page.locator('button:has-text("登 录"), button:has-text("登录")').first().click()
await page.waitForTimeout(10000)

// 直链（先登录再进，路由已注册后跳转）
for (const candidate of [
  `${BASE}/main/flowable/bpm/manager/model`,
  `${BASE}/main/flowable/bpm/model/index`,
]) {
  await page.goto(candidate, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {})
  await page.waitForTimeout(15000)
  const rows = await page.locator('.el-table__body tr.el-table__row').count()
  const btn = await page.locator('button:has-text("新建模型"), span:has-text("新建模型")').count()
  console.log(`try ${candidate} -> url=${page.url()} rows=${rows} 新建模型按钮=${btn}`)
  await page.screenshot({ path: `${DIR}/qk-直链-${candidate.split('/').slice(3).join('_')}.png` })
  if (btn > 0) {
    await page.locator('button:has-text("新建模型"), span:has-text("新建模型")').first().click({ timeout: 8000 })
    const t0 = Date.now()
    let appeared = -1
    const timeline = []
    while (Date.now() - t0 < 45 * 1000) {
      const n = await page.evaluate(() => {
        const inputs = [...document.querySelectorAll('input:not([type=hidden])')]
        return inputs.filter((i) => i.getBoundingClientRect().height > 0 && i.offsetParent !== null).length
      })
      timeline.push(`${Math.round((Date.now() - t0) / 1000)}s:${n}`)
      if (n >= 5) { appeared = Math.round((Date.now() - t0) / 1000); break }
      await page.waitForTimeout(1000)
    }
    console.log(`[qiankun] 表单出现耗时: ${appeared > 0 ? appeared + 's' : '45s内未出现'}`)
    console.log(`[qiankun] 轮询: ${timeline.join(' ')}`)
    await page.waitForTimeout(3000)
    await page.screenshot({ path: `${DIR}/qk-创建流程-最终态.png` })
    break
  }
}
await browser.close()
