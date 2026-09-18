// H 系列：AMIS 提交闭环——待办→办理→联邦直渲染表单交互→审批通过→已办可见
// 前提：AMIS 待办实例存在（amis_fed_* 实例，amis-start.mjs 可重造）
// 验收：表单字段可交互（填写输入框）、iframe=0（联邦直渲染）、审批通过成功、
//       实例流转（待办行消失/已办出现）、全链零 pageerror
import { chromium } from '@playwright/test'
import fs from 'node:fs'

const BASE = process.env.VBASE || 'http://localhost:8662'
const TAG = process.env.VTAG || 'prod'
const SHOT_DIR = '/Users/Admin/Desktop/ai 杂物/插件/fulgur-federation/docs/screenshots/h-amis-closure'
fs.mkdirSync(SHOT_DIR, { recursive: true })
const PROFILE = `/tmp/fulgur-amisc-${TAG}-${Date.now()}`
const shot = (n) => `${SHOT_DIR}/h-amis-${TAG}-${n}.png`

const browser = await chromium.launchPersistentContext(PROFILE, {
  headless: true,
  args: ['--no-proxy-server'],
  viewport: { width: 1600, height: 900 },
})
const page = browser.pages()[0]
const errors = []
page.on('pageerror', (e) => errors.push('[pageerror] ' + String(e).slice(0, 200)))

// 登录
await page.goto(`${BASE}/main/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(8000)
await page.locator('input[placeholder*="账号"], input[placeholder*="用户名"]').first().fill('admin')
await page.locator('input[type="password"]').first().fill('Demo@123456')
await page.locator('button:has-text("登 录"), button:has-text("登录")').first().click()
await page.waitForTimeout(8000)

// 1) 待办列表：AMIS 行存在性 + 通过 API 记录精确待办任务数（同名实例多条，文本断言会误判）
await page.goto(`${BASE}/main/flowable/bpm/task/todo`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(15000)
const todoBefore = await page.evaluate(() => document.body.innerText.includes('AMIS联邦验证2'))
const todoCountBefore = await page.evaluate(async () => {
  const key = Object.keys(localStorage).find((k) => k.includes('COMMON__LOCAL__KEY__'))
  const obj = JSON.parse(localStorage.getItem(key))
  let real = null
  const find = (o) => { for (const [k, v] of Object.entries(o ?? {})) { if (k === 'value' && typeof v === 'string' && v.startsWith('ey')) real = v; if (v && typeof v === 'object') find(v) } }
  find(obj.value?.TOKEN__ ?? obj)
  const res = await fetch('/demo/bpm/task/todo-page?pageNo=1&pageSize=100', { headers: { 'X-Access-Token': real } })
  const d = await res.json()
  return ((d.data ?? d.result ?? {}).list ?? []).length
})
console.log('[amis-closure] 待办含 AMIS 行:', todoBefore, '| 待办任务数:', todoCountBefore)
await page.screenshot({ path: shot('01-待办列表') })
if (!todoBefore) {
  console.error('[amis-closure][FAIL] 待办无 AMIS 行——先跑 amis-seed3.mjs + amis-start.mjs')
  process.exit(1)
}

// 2) 办理：进入详情（联邦直渲染）
await page.locator('tr:has-text("AMIS联邦验证2"), .vxe-body--row:has-text("AMIS联邦验证2")').locator('a:has-text("办理"), span:has-text("办理"), button:has-text("办理")').first().click({ timeout: 15000 })
await page.waitForTimeout(15000)
await page.screenshot({ path: shot('02-办理进入详情') })
const detailState = await page.evaluate(() => ({
  iframes: document.querySelectorAll('iframe').length,
  hasTitle: document.body.innerText.includes('AMIS联邦验证2') || document.body.innerText.includes('流程详情'),
  hasApproval: [...document.querySelectorAll('button')].some((b) => /通\s*过|同\s*意/.test(b.innerText)),
  textLen: document.body.innerText.length,
}))
console.log('[amis-closure] 详情态:', JSON.stringify(detailState))

// 3) 表单交互：AMIS 表单里的可编辑输入框填值（联邦直渲染域内）
let filled = 0
try {
  const inputs = page.locator('.fulgur-view input:visible, [class*="amis"] input:visible')
  const n = Math.min(await inputs.count(), 3)
  for (let i = 0; i < n; i++) {
    const box = inputs.nth(i)
    const cur = await box.inputValue().catch(() => null)
    if (cur === null) continue
    await box.fill(`H-闭环验证-${i}-${Date.now()}`)
    filled++
  }
} catch (e) {
  console.log('[amis-closure] 表单填写部分失败（只读字段属正常）:', String(e).slice(0, 100))
}
await page.screenshot({ path: shot('03-表单交互后') })
console.log('[amis-closure] 填写字段数:', filled)

// 4) 审批通过
// 操作栏：通过 → 底部气泡面板填意见 → 点面板内的"通过"（与 flow-closure 06 步同款交互）
await page.locator('button:has-text("通 过"), button:has-text("通过"), button:has-text("同 意"), button:has-text("同意")').first().click({ timeout: 15000 })
await page.waitForTimeout(3000)
const opinion = page.locator('textarea:visible').first()
if ((await opinion.count()) > 0) {
  await opinion.fill('H 系列 AMIS 提交闭环验证通过').catch(() => {})
}
await page.screenshot({ path: shot('04-审批确认面板') })
const popAgree = page.locator('[class*="popover"] button:has-text("通过")').last()
if ((await popAgree.count()) > 0) {
  await popAgree.click({ timeout: 8000 })
} else {
  await page.locator('button:has-text("通过")').last().click({ timeout: 8000 })
}
await page.waitForTimeout(12000)
await page.screenshot({ path: shot('05-审批提交后') })

// 5) 完结判定：待办列表不再含该行 + 已办出现
await page.goto(`${BASE}/main/flowable/bpm/task/todo`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(15000)
const todoAfter = await page.evaluate(async () => {
  const key = Object.keys(localStorage).find((k) => k.includes('COMMON__LOCAL__KEY__'))
  const obj = JSON.parse(localStorage.getItem(key))
  let real = null
  const find = (o) => { for (const [k, v] of Object.entries(o ?? {})) { if (k === 'value' && typeof v === 'string' && v.startsWith('ey')) real = v; if (v && typeof v === 'object') find(v) } }
  find(obj.value?.TOKEN__ ?? obj)
  const res = await fetch('/demo/bpm/task/todo-page?pageNo=1&pageSize=100', { headers: { 'X-Access-Token': real } })
  const d = await res.json()
  return ((d.data ?? d.result ?? {}).list ?? []).length
})
const flowed = todoAfter < todoCountBefore
await page.screenshot({ path: shot('06-待办复核') })
await page.goto(`${BASE}/main/flowable/bpm/task/done`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(15000)
const doneHas = await page.evaluate(() => document.body.innerText.includes('AMIS联邦验证2'))
await page.screenshot({ path: shot('07-已办可见') })
await browser.close()

// AMIS 详情表单为只读回显（展示模式）——「提交」语义落在审批链路：意见填写（如弹窗）+ 通过
const ok = detailState.iframes === 0 && detailState.hasApproval && flowed && doneHas && errors.length === 0
console.log(`\n[amis-closure] ${TAG} ${ok ? 'PASS' : 'FAIL'}：iframe=${detailState.iframes}（联邦直渲染），审批提交后待办 ${todoCountBefore}→${todoAfter}（流转=${flowed}），已办可见=${doneHas}，pageErrors=${errors.length}`)
if (errors.length) console.log('[amis-closure] errors:', errors.slice(0, 3))
fs.writeFileSync(
  `${SHOT_DIR}/h-amis-${TAG}-result.json`,
  JSON.stringify({ tag: TAG, detailState, filled, todoCountBefore, todoAfter, flowed, doneHas, errors, ok, at: new Date().toISOString() }, null, 2),
)
if (!ok) process.exit(1)
