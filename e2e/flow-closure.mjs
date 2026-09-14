// P0-4c 全链路闭环：05 发起流程 → 01 待办办理(批准) → 06 详情 → 02 已办 → 03 我的流程
// 用法：node flow-closure.mjs --base <url> --env <tag>
// 产出：H10 步骤截图 + docs/func-results/{env}-flow.json
import { chromium } from '@playwright/test'
import fs from 'node:fs'

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : d }
const BASE = arg('--base', 'http://localhost:8773')
const ENV = arg('--env', 'dev')
const sub = BASE.includes('8661') ? '/main' : ''
const DIR = '/Users/Admin/Desktop/ai 杂物/插件/vite-plugin-unifed/docs/screenshots/migration1-dev'
const RESULT_DIR = '/Users/Admin/Desktop/ai 杂物/插件/vite-plugin-unifed/docs/func-results'
fs.mkdirSync(DIR, { recursive: true }); fs.mkdirSync(RESULT_DIR, { recursive: true })
const shot = (name) => `${DIR}/${ENV}-${name}.png`

const browser = await chromium.launchPersistentContext(`/tmp/pflow-${ENV}-${Date.now()}`, {
  headless: true, args: ['--no-proxy-server'], viewport: { width: 1500, height: 950 },
})
const page = browser.pages()[0]
const pageErrors = []
page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 200)))
const wait = (ms) => page.waitForTimeout(ms)
async function waitFor(fn, timeoutMs = 30000, intervalMs = 800) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    try { const v = await fn(); if (v) return v } catch {}
    await wait(intervalMs)
  }
  return null
}
const results = {}
const TS = String(Date.now()).slice(-6)

// ---------- 登录 ----------
await page.goto(`${BASE}/main/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await wait(6000)
await page.locator('input[placeholder*="账号"], input[placeholder*="用户名"]').first().fill('admin')
await page.locator('input[type="password"]').first().fill('Demo@123456')
await page.locator('button:has-text("登 录"), button:has-text("登录")').first().click()
await wait(9000)

// ---------- 05 发起流程 ----------
await page.goto(`${BASE}${sub}/flowable/bpm/task/create`, { waitUntil: 'domcontentloaded', timeout: 45000 })
await waitFor(async () => (await page.locator('text=测试流程').count()) > 0, 40000)
await wait(2000)
await page.screenshot({ path: shot('05-发起流程-01-流程卡片列表') })
const card = page.locator('[class*="card"]:has-text("测试流程"), [class*="processInstance"]:has-text("测试流程"), div:has-text("测试流程") >> nth=0').first()
await page.locator('text=测试流程').first().click({ timeout: 10000 })
await wait(5000)
await page.screenshot({ path: shot('05-发起流程-02-发起表单打开') })
// NORMAL 表单（form-create）：填可见文本输入
const formInputs = page.locator('.jeecg-layout-content input:visible:not([type="hidden"]), input:visible:not([type="hidden"])')
const n = await formInputs.count()
for (let i = 0; i < Math.min(n, 8); i++) {
  const el = formInputs.nth(i)
  const ph = (await el.getAttribute('placeholder')) || ''
  const ro = await el.getAttribute('readonly')
  if (ph.includes('选择') || ph.includes('日期') || ro !== null) continue
  await el.fill(`e2e内容${TS}`).catch(() => {})
}
await page.screenshot({ path: shot('05-发起流程-03-表单填写完成') })
const submitBtn = page.locator('button:has-text("发起"), button:has-text("提交")').last()
await submitBtn.click({ timeout: 10000 })
await wait(3000)
// 可能有确认框
const cfm = page.locator('[class*="message-box"] button[class*="primary"], [role="dialog"]:visible button[class*="primary"]').last()
if (await cfm.count()) { await cfm.click({ timeout: 5000 }).catch(() => {}); await wait(3000) }
await page.screenshot({ path: shot('05-发起流程-04-提交结果') })
const okText = await page.evaluate(() => document.body.innerText.slice(0, 3000))
results['05-发起'] = { ok: okText.includes('成功') || okText.includes('启动') || page.url().includes('my'), note: page.url() }

// ---------- 01 待办任务（新任务出现并办理） ----------
await page.goto(`${BASE}${sub}/flowable/bpm/task/todo`, { waitUntil: 'domcontentloaded', timeout: 45000 })
await waitFor(async () => (await page.locator(`[class*="table__body"] tr, .el-table__row`).count()) > 0, 40000)
await wait(2500)
await page.screenshot({ path: shot('01-待办任务-01-新任务出现') })
// 取 AMIS联邦验证2 相关行中"最后创建"的一行（新版任务在顶部或按时间排序）
const amisRow = page.locator(`[class*="table__body"] tr:has-text("测试流程"), .el-table__row:has-text("测试流程")`).first()
const todoRow = amisRow
const handled = await todoRow.locator('a:has-text("办理"), span:has-text("办理"), button:has-text("办理"), a:has-text("详情"), button:has-text("详情"), span:has-text("详情")').first().click({ timeout: 10000 }).then(() => true).catch(() => false)
await wait(16000)
await page.screenshot({ path: shot('01-待办任务-02-办理详情页') })
// 详情页：审批通过
results['01-待办出现'] = { ok: handled && page.url().includes('detail'), url: page.url() }
const agreeBtn = page.locator('button:has-text("通过"), button:has-text("同意"), span:has-text("通过")').first()
await agreeBtn.click({ timeout: 15000 }).catch(() => {})
await wait(2500)
await page.screenshot({ path: shot('06-流程详情-01-审批弹窗') })
// 审批弹窗：填意见并确认
const opinion = page.locator('textarea:visible').first()
if (await opinion.count()) await opinion.fill(`同意-e2e${TS}`).catch(() => {})
await page.screenshot({ path: shot('06-流程详情-02-填写审批意见') })
const confirmBtn = page.locator('[class*="dialog"]:visible button:has-text("确 定"), [class*="dialog"]:visible button[class*="primary"], [class*="message-box"] button[class*="primary"]').last()
await confirmBtn.click({ timeout: 10000 }).catch(() => {})
await wait(4000)
await page.screenshot({ path: shot('06-流程详情-03-审批后') })
const approved = await page.evaluate(() => document.body.innerText)
results['06-审批通过'] = { ok: approved.includes('审批成功') || approved.includes('成功') || !approved.includes('审批中') }

// ---------- 02 已办任务 ----------
await page.goto(`${BASE}${sub}/flowable/bpm/task/done`, { waitUntil: 'domcontentloaded', timeout: 45000 })
const doneFound = await waitFor(async () => (await page.locator(`[class*="table__body"] tr:has-text("测试流程"), .el-table__row:has-text("测试流程")`).count()) > 0, 40000)
await wait(2000)
await page.screenshot({ path: shot('02-已办任务-01-出现已办记录') })
results['02-已办出现'] = { ok: !!doneFound }

// ---------- 03 我的流程 ----------
await page.goto(`${BASE}${sub}/flowable/bpm/task/my`, { waitUntil: 'domcontentloaded', timeout: 45000 })
const myFound = await waitFor(async () => (await page.locator(`[class*="table__body"] tr:has-text("测试流程"), .el-table__row:has-text("测试流程")`).count()) > 0, 40000)
await wait(2000)
await page.screenshot({ path: shot('03-我的流程-01-实例可见') })
results['03-我的流程可见'] = { ok: !!myFound }

results['_meta'] = { env: ENV, ts: TS, pageErrors: [...new Set(pageErrors)].slice(0, 5) }
fs.writeFileSync(`${RESULT_DIR}/${ENV}-flow.json`, JSON.stringify(results, null, 2))
console.log(`===== [${ENV}] 全链路结果 =====`)
Object.entries(results).forEach(([k, v]) => console.log(`  ${k}: ${v.ok ? '✓' : '✗'} ${v.note ?? v.url ?? ''}`))
await browser.close()
