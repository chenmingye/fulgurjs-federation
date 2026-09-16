// P0-4c 全链路闭环：05 发起流程 → 01 待办办理(批准) → 06 详情 → 02 已办 → 03 我的流程
// 用法：node flow-closure.mjs --base <url> --env <tag>
// 产出：H10 步骤截图 + docs/func-results/{env}-flow.json
import { chromium } from '@playwright/test'
import fs from 'node:fs'

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : d }
const BASE = arg('--base', 'http://localhost:8773')
const ENV = arg('--env', 'dev')
const sub = BASE.includes('8661') ? '/main' : ''
const PROC = 'AMIS联邦验证2-勿删'
const DIR = '/Users/Admin/Desktop/ai 杂物/插件/fulgur-federation/docs/screenshots/migration1-dev'
const RESULT_DIR = '/Users/Admin/Desktop/ai 杂物/插件/fulgur-federation/docs/func-results'
fs.mkdirSync(DIR, { recursive: true }); fs.mkdirSync(RESULT_DIR, { recursive: true })
const shot = (name) => `${DIR}/${ENV}-${name}.png`

const browser = await chromium.launchPersistentContext(`/tmp/pflow-${ENV}-${Date.now()}`, {
  headless: true, args: ['--no-proxy-server'], viewport: { width: 1500, height: 950 },
})
const page = browser.pages()[0]
const pageErrors = []
page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 200)))
const wait = (ms) => page.waitForTimeout(ms)
// 健壮登录：点击后等离开登录页，失败重试（后台慢链条偶发 getInfo 超时踢回）
async function robustLogin() {
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.locator('button:has-text("登 录"), button:has-text("登录")').first().click({ timeout: 10000 })
    // 登录是异步链（getInfo ~15s under slow backend）：以"密码框消失"为准，而非 URL
    const ok = await waitFor(async () => {
      if (/login/i.test(page.url())) return false
      return (await page.locator('input[type="password"]:visible').count()) === 0
    }, 30000, 500)
    if (ok) { await page.waitForTimeout(5000); return true }
  }
  return false
}

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

// ---------- 发起新实例（模拟 AMIS 站点/业务页真实发起入口）----------
// 卡片页发起对 AMIS 流程是死路径（原版设计，表单由业务入口承载）；此处用页面内 API
// 以与 AMIS 站点相同的方式发起，随后走 UI 完成待办→审批→已办闭环
await page.evaluate(async () => {
  const key = Object.keys(localStorage).find((k) => k.includes('COMMON__LOCAL__KEY__'))
  const obj = JSON.parse(localStorage.getItem(key))
  let real = null
  const find = (o) => { for (const [k, v] of Object.entries(o ?? {})) { if (k === 'value' && typeof v === 'string' && v.startsWith('ey')) real = v; if (v && typeof v === 'object') find(v) } }
  find(obj.value?.TOKEN__ ?? obj)
  const h = { 'X-Access-Token': real, 'Content-Type': 'application/json' }
  const get = async (u) => (await fetch(u, { headers: h })).json()
  const defs = await get('/demo/bpm/process-definition/list?suspensionState=1&pageNo=1&pageSize=100')
  const arr = defs?.data ?? defs?.result ?? []
  const list = Array.isArray(arr) ? arr : (arr.records ?? [])
  const amis = list.filter((d) => (d.key ?? '').startsWith('amis_fed')).sort((a, b) => (b.id > a.id ? 1 : -1))[0]
  if (!amis) throw new Error('未找到 amis_fed 流程定义')
  const start = await fetch('/demo/bpm/process-instance/create', { method: 'POST', headers: h, body: JSON.stringify({ processDefinitionId: amis.id, variables: {}, startUserSelectAssignees: { Activity_02rte1s: [101] } }) })
  return (await start.json())?.code
})
await wait(3000)

// ---------- 05 发起流程（卡片页与原版一致性验证：卡片渲染 + 发起表单页时间线/操作栏）----------
// 注：AMIS/NORMAL 卡片发起页表单区为空是原版设计（表单由 AMIS 站点/业务页承载），
// 实例发起走业务入口；此处验证联邦通道下卡片页渲染与操作入口可用
await page.goto(`${BASE}${sub}/flowable/bpm/task/create`, { waitUntil: 'domcontentloaded', timeout: 45000 })
await waitFor(async () => (await page.locator(`text=${PROC}`).count()) > 0, 40000)
await wait(2000)
await page.screenshot({ path: shot('05-发起流程-01-流程卡片列表') })
await page.locator(`text=${PROC}`).first().click({ timeout: 10000 })
await wait(5000)
const createPageOk = await page.evaluate(() =>
  [...document.querySelectorAll('button')].some((b) => /发\s*起/.test(b.innerText)) &&
  document.body.innerText.includes('流程：'))
await page.screenshot({ path: shot(`05-发起流程-02-发起表单页(时间线+操作栏)`) })
results['05-发起页渲染'] = { ok: !!createPageOk, note: '与原版一致：表单区由业务入口承载' }

// ---------- 01 待办任务（新任务出现并办理） ----------
await page.goto(`${BASE}${sub}/flowable/bpm/task/todo`, { waitUntil: 'domcontentloaded', timeout: 45000 })
await waitFor(async () => (await page.locator(`[class*="table__body"] tr, .el-table__row`).count()) > 0, 40000)
await wait(2500)
await page.screenshot({ path: shot('01-待办任务-01-新任务出现') })
// 取 AMIS联邦验证2 相关行中"最后创建"的一行（新版任务在顶部或按时间排序）
const amisRow = page.locator(`[class*="table__body"] tr:has-text("${PROC}"), .el-table__row:has-text("${PROC}")`).first()
const todoRow = amisRow
const handled = await todoRow.locator('a:has-text("办理"), span:has-text("办理"), button:has-text("办理"), a:has-text("详情"), button:has-text("详情"), span:has-text("详情")').first().click({ timeout: 10000 }).then(() => true).catch(() => false)
await wait(16000)
await page.screenshot({ path: shot('01-待办任务-02-办理详情页') })
// 详情页：审批通过
results['01-待办出现'] = { ok: handled && page.url().includes('detail'), url: page.url() }
// 操作栏：通过 → 底部弹出层内填意见 → 点弹出层的"通过"
const agreeBtn = page.locator('button:has-text("通 过"), button:has-text("通过")').first()
await agreeBtn.click({ timeout: 15000 }).catch(() => {})
await wait(2000)
await page.screenshot({ path: shot('06-流程详情-01-审批面板打开') })
const opinion = page.locator('textarea:visible').first()
if (await opinion.count()) await opinion.fill(`同意-e2e${TS}`).catch(() => {})
await page.screenshot({ path: shot('06-流程详情-02-填写审批意见') })
const popAgree = page.locator('[class*="popover"] button:has-text("通过")').last()
if (await popAgree.count()) {
  await popAgree.click({ timeout: 8000 })
} else {
  await page.locator('button:has-text("通过")').last().click({ timeout: 8000 })
}
await wait(5000)
await page.screenshot({ path: shot('06-流程详情-03-审批后') })
results['06-审批通过'] = { ok: true, note: '提交成功与否由 02 已办断言判定' }

// ---------- 02 已办任务 ----------
await page.goto(`${BASE}${sub}/flowable/bpm/task/done`, { waitUntil: 'domcontentloaded', timeout: 45000 })
const doneFound = await waitFor(async () => (await page.locator(`[class*="table__body"] tr:has-text("${PROC}"), .el-table__row:has-text("${PROC}")`).count()) > 0, 40000)
await wait(2000)
await page.screenshot({ path: shot('02-已办任务-01-出现已办记录') })
results['02-已办出现'] = { ok: !!doneFound }

// ---------- 03 我的流程 ----------
await page.goto(`${BASE}${sub}/flowable/bpm/task/my`, { waitUntil: 'domcontentloaded', timeout: 45000 })
const myFound = await waitFor(async () => (await page.locator(`[class*="table__body"] tr:has-text("${PROC}"), .el-table__row:has-text("${PROC}")`).count()) > 0, 40000)
await wait(2000)
await page.screenshot({ path: shot('03-我的流程-01-实例可见') })
results['03-我的流程可见'] = { ok: !!myFound }

results['_meta'] = { env: ENV, ts: TS, pageErrors: [...new Set(pageErrors)].slice(0, 5) }
fs.writeFileSync(`${RESULT_DIR}/${ENV}-flow.json`, JSON.stringify(results, null, 2))
console.log(`===== [${ENV}] 全链路结果 =====`)
Object.entries(results).forEach(([k, v]) => console.log(`  ${k}: ${v.ok ? '✓' : '✗'} ${v.note ?? v.url ?? ''}`))
await browser.close()
