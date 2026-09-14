// H3 验证：流程详情页（CUSTOM 业务表单联邦直渲染）删兜底后功能正常
// 用法：node h3-detail-verify.mjs <base> <tag>
import { chromium } from '@playwright/test'

const BASE = process.argv[2] || 'http://localhost:8773'
const TAG = process.argv[3] || 'dev'
const browser = await chromium.launchPersistentContext(`/tmp/ph3-${TAG}-${Date.now()}`, {
  headless: true, args: ['--no-proxy-server'], viewport: { width: 1500, height: 950 },
})
const page = browser.pages()[0]
const errs = []
const failed = []
page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)))
page.on('response', (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url().slice(0, 110)}`) })

await page.goto(`${BASE}/main/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(6000)
await page.locator('input[placeholder*="账号"], input[placeholder*="用户名"]').first().fill('admin')
await page.locator('input[type="password"]').first().fill('Demo@123456')
await page.locator('button:has-text("登 录"), button:has-text("登录")').first().click()
await page.waitForTimeout(9000)

// 待办任务 → 第一行 办理/详情 → 详情页
await page.goto(`${BASE}/flowable/bpm/task/todo`, { waitUntil: 'domcontentloaded', timeout: 45000 })
await page.waitForTimeout(15000)
const rows = await page.locator('[class*="table__body"] tr, .el-table__row').count()
console.log(`[${TAG}] 待办行数: ${rows}`)
await page.screenshot({ path: `/tmp/probe-h3/${TAG}-todo.png` }).catch(() => {})
const btn = page.locator('[class*="table__body"] tr, .el-table__row').first().locator('a:has-text("办理"), span:has-text("办理"), button:has-text("办理"), a:has-text("详情"), span:has-text("详情"), button:has-text("详情")').first()
await btn.click({ timeout: 10000 }).catch(async (e) => {
  console.log(`[${TAG}] 办理点击失败: ${e.message.slice(0, 80)}`)
})
await page.waitForTimeout(18000)
console.log(`[${TAG}] url: ${page.url()}`)
const m = await page.evaluate(() => {
  const c = document.querySelector('.jeecg-layout-content')
  const inp = [...document.querySelectorAll('input, textarea, select')]
  return {
    vis: inp.filter((i) => i.getBoundingClientRect().height > 0).length,
    len: c ? c.innerText.trim().length : -1,
    hasFormBox: !!document.querySelector('.form-box'),
    iframes: document.querySelectorAll('iframe').length,
  }
})
console.log(`[${TAG}] 详情页: 可见输入=${m.vis} 内容=${m.len} form-box=${m.hasFormBox} iframe=${m.iframes}`)
await page.screenshot({ path: `/tmp/probe-h3/${TAG}-detail.png` })
console.log(`[${TAG}] pageerror=${new Set(errs).size} 失败请求=${new Set(failed).size}`)
;[...new Set(errs)].slice(0, 4).forEach((e) => console.log('  PE: ' + e.slice(0, 160)))
;[...new Set(failed)].slice(0, 4).forEach((e) => console.log('  REQ: ' + e))
await browser.close()
