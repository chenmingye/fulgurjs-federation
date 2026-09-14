// D1 专项探针：创建/修改流程页表单不显示
// 用法：node probe-d1.mjs <base> <tag>
//   base: http://localhost:8773 (联邦 dev) | http://localhost:8661 (乾坤基线) | http://localhost:8662 (联邦 prod)
// 收集：[D1] 临时日志、全部 console.error/warning、pageerror、失败请求、表单可见性指标 + 截图
import { chromium } from '@playwright/test'
import fs from 'node:fs'

const BASE = process.argv[2] || 'http://localhost:8773'
const TAG = process.argv[3] || 'dev'
const DIR = `/tmp/probe-d1/${TAG}`
fs.mkdirSync(DIR, { recursive: true })

const browser = await chromium.launchPersistentContext(`/tmp/pd1-${TAG}-${Date.now()}`, {
  headless: true,
  args: ['--no-proxy-server'],
  viewport: { width: 1500, height: 950 },
})
const page = browser.pages()[0]

const consoleMsgs = []
const pageErrors = []
const failedReqs = []
const d1Logs = []
page.on('console', (m) => {
  const t = m.text()
  if (t.includes('[D1]')) d1Logs.push(t)
  if (m.type() === 'error' || m.type() === 'warning') consoleMsgs.push(`[${m.type()}] ${t.slice(0, 200)}`)
})
page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 300)))
page.on('response', (r) => {
  if (r.status() >= 400) failedReqs.push(`${r.status()} ${r.url().slice(0, 140)}`)
})

// 登录
await page.goto(`${BASE}/main/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(6000)
await page.locator('input[placeholder*="账号"], input[placeholder*="用户名"]').first().fill('admin')
await page.locator('input[type="password"]').first().fill('Demo@123456')
await page.locator('button:has-text("登 录"), button:has-text("登录")').first().click()
await page.waitForTimeout(9000)

// 真实列表页（带参深链接，与既有 probe-func 一致）
const LIST = `${BASE}/flowable/bpm/manager/model`
await page.goto(LIST, { waitUntil: 'domcontentloaded', timeout: 45000 })
await page.waitForTimeout(14000)
const listRows = await page.locator('.el-table__body tr.el-table__row').count()
console.log(`[${TAG}] 列表行数: ${listRows}`)
await page.screenshot({ path: `${DIR}/01-流程模型-列表.png` })

const measure = () =>
  page.evaluate(() => {
    const c = document.querySelector('.jeecg-layout-content')
    const inputs = [...document.querySelectorAll('.jeecg-layout-content input:not([type=hidden])')]
    return {
      visibleInputs: inputs.filter((i) => i.getBoundingClientRect().height > 0).length,
      totalInputs: inputs.length,
      contentLen: c ? c.innerText.trim().length : -1,
      stepTabs: [...document.querySelectorAll('.jeecg-layout-content span')]
        .filter((s) => ['基本信息', '表单设计', '流程设计', '更多设置'].includes(s.innerText.trim())).length,
    }
  })

// A. 新建模型（列表真实按钮进入）
await page.locator('button:has-text("新建模型"), span:has-text("新建模型")').first().click({ timeout: 8000 }).catch(() => {})
await page.waitForTimeout(12000)
console.log(`[${TAG}] A 新建模型 url: ${page.url()}`)
console.log(`[${TAG}] A 指标: ${JSON.stringify(await measure())}`)
await page.screenshot({ path: `${DIR}/02-创建流程-表单区.png` })

// B. 修改（回列表，点首行修改）
await page.goto(LIST, { waitUntil: 'domcontentloaded', timeout: 45000 })
await page.waitForTimeout(12000)
const upd = page.locator('.el-table__body tr.el-table__row').first().locator('a:has-text("修改"), span:has-text("修改"), button:has-text("修改")').first()
await upd.click({ timeout: 8000 }).catch((e) => console.log(`[${TAG}] 修改 click fail: ${e.message.slice(0, 80)}`))
await page.waitForTimeout(12000)
console.log(`[${TAG}] B 修改 url: ${page.url()}`)
console.log(`[${TAG}] B 指标: ${JSON.stringify(await measure())}`)
await page.screenshot({ path: `${DIR}/03-修改流程-表单区.png` })

console.log(`[${TAG}] ===== [D1] 日志 (${d1Logs.length}) =====`)
d1Logs.forEach((l) => console.log('  ' + l.slice(0, 250)))
console.log(`[${TAG}] ===== console.error/warning (${consoleMsgs.length}) =====`)
;[...new Set(consoleMsgs)].slice(0, 12).forEach((l) => console.log('  ' + l.slice(0, 220)))
console.log(`[${TAG}] ===== pageerror (${pageErrors.length}) =====`)
;[...new Set(pageErrors)].slice(0, 6).forEach((l) => console.log('  ' + l.slice(0, 220)))
console.log(`[${TAG}] ===== 失败请求 (${failedReqs.length}) =====`)
;[...new Set(failedReqs)].slice(0, 10).forEach((l) => console.log('  ' + l))
await browser.close()
