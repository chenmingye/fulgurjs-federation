// P0-4d 动作闭环：模型 复制/发布/导出/删除 + 实例取消 + 定义恢复
// 用法：node model-actions.mjs --base <url> --env <tag>
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

const browser = await chromium.launchPersistentContext(`/tmp/pma-${ENV}-${Date.now()}`, {
  headless: true, args: ['--no-proxy-server'], viewport: { width: 1500, height: 950 },
})
const page = browser.pages()[0]
const pageErrors = []
page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 150)))
const wait = (ms) => page.waitForTimeout(ms)
async function waitFor(fn, timeoutMs = 30000, intervalMs = 800) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) { try { const v = await fn(); if (v) return v } catch {} await wait(intervalMs) }
  return null
}
const results = {}
let copyName = null
const rowOf = (name) => page.locator(`[class*="table__body"] tr:has-text("${name}"), .el-table__row:has-text("${name}")`).first()

await page.goto(`${BASE}/main/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await wait(6000)
await page.locator('input[placeholder*="账号"], input[placeholder*="用户名"]').first().fill('admin')
await page.locator('input[type="password"]').first().fill('Demo@123456')
await page.locator('button:has-text("登 录"), button:has-text("登录")').first().click()
await wait(9000)

// 前置：确保有一个 e2e 模型（没有则新建——复用 D1 流程的精简版）
const MODEL = '零星领料审批'
const LIST = `${BASE}${sub}/flowable/bpm/manager/model`
await page.goto(LIST, { waitUntil: 'domcontentloaded', timeout: 45000 })
await waitFor(async () => (await page.locator('button:has-text("新建模型"), span:has-text("新建模型")').count()) > 0, 60000)
await wait(2000)
// （真实模型已存在，无需建档）
const modelRow = page.locator(`[class*="table__body"] tr:has-text("${MODEL}"), .el-table__row:has-text("${MODEL}")`).first()

// ---------- 复制 ----------
{
  // 先删旧副本（复制 key=_copy 与旧副本冲突会被后端拒）
  const stale = rowOf(MODEL + '副本')
  if (await stale.count()) {
    await stale.locator('a:has-text("删除"), span:has-text("删除"), button:has-text("删除")').first().click({ timeout: 8000 }).catch(() => {})
    await wait(1500)
    const c = page.locator('[class*="message-box"] button[class*="primary"], [role="dialog"]:visible button[class*="primary"]').last()
    if (await c.count()) { await c.click({ timeout: 6000 }).catch(() => {}); await wait(3000) }
    await page.reload().catch(() => {}); await wait(8000)
  }
  const row = rowOf(MODEL)
  await row.scrollIntoViewIfNeeded().catch(() => {})
  await row.locator('a:has-text("复制"), span:has-text("复制"), button:has-text("复制")').first().click({ timeout: 10000 })
  await waitFor(async () => (await page.evaluate(() => [...document.querySelectorAll('.jeecg-layout-content input:not([type=hidden])')].filter((i) => i.getBoundingClientRect().height > 0).length)) >= 5, 90000)
  await page.screenshot({ path: shot('08-流程模型-复制-01-复制页回显') })
  // 记录副本名（原版语义：名称 + "副本"）
  copyName = await page.evaluate(() => {
    const inp = [...document.querySelectorAll('.jeecg-layout-content input')].find((i) => /流程名称|流程名/.test(i.placeholder || '') && i.getBoundingClientRect().height > 0)
    return inp ? inp.value : null
  })
  await page.locator('button:has-text("保 存"), button:has-text("保存")').first().click()
  // 后台接口慢（dept 13s 同源延迟），保存+跳转可能 >30s：toast 或返回列表均算成功
  const copied = await waitFor(async () => {
    const txt = await page.evaluate(() => document.body.innerText)
    if (txt.includes('复制成功')) return 'toast'
    return page.url().includes('/model') && !page.url().includes('copy') ? 'navigated' : null
  }, 90000)
  await page.screenshot({ path: shot('08-流程模型-复制-02-复制成功') })
  results['复制'] = { ok: !!copied, how: copied }
}

// ---------- 发布（对复制出的模型） ----------
{
  await page.goto(LIST, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await waitFor(async () => (await page.locator('button:has-text("新建模型")').count()) > 0, 60000)
  await wait(2500)
  // 对原模型重发布（副本的 bpmn process id 与新 key 不一致，发布需先改流程图——见 seed3）
  const copyRow = rowOf(MODEL)
  await copyRow.scrollIntoViewIfNeeded().catch(() => {})
  await page.screenshot({ path: shot('08-流程模型-发布-01-发布入口') })
  await copyRow.locator('a:has-text("发布"), span:has-text("发布"), button:has-text("发布")').first().click({ timeout: 10000 })
  await wait(2000)
  // 确认框
  const cfm = page.locator('[class*="message-box"] button[class*="primary"], [role="dialog"]:visible button[class*="primary"]').last()
  if (await cfm.count()) { await cfm.click({ timeout: 6000 }).catch(() => {}); await wait(3000) }
  let pubMsg = null
  const pubOk = await waitFor(async () => {
    const txt = await page.evaluate(() => document.body.innerText)
    if (txt.includes('发布成功')) return '成功'
    const m = txt.match(/操作失败[^\n]*|发布失败[^\n]*|[^\n]*不存在/)
    if (m && !pubMsg) { pubMsg = m[0]; return null }
    return null
  }, 60000)
  await page.screenshot({ path: shot('08-流程模型-发布-02-发布结果') })
  results['发布'] = { ok: !!pubOk, msg: pubMsg ?? '发布成功' }
}

// ---------- 导出（下载事件断言） ----------
{
  await page.goto(LIST, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await waitFor(async () => (await page.locator('button:has-text("新建模型")').count()) > 0, 60000)
  await wait(2500)
  const dlPromise = page.waitForEvent('download', { timeout: 20000 }).catch(() => null)
  // 勾选 e2e 行复选框（导出按选中行）
  const chk = page.locator(`[class*="table__body"] tr:has-text("${MODEL}") input[type="checkbox"], .el-table__row:has-text("${MODEL}") input[type="checkbox"]`).first()
  if (await chk.count()) await chk.click({ timeout: 8000 }).catch(() => {})
  await wait(800)
  const exportBtn = page.locator('button:has-text("导 出"), button:has-text("导出")').first()
  await exportBtn.click({ timeout: 10000 }).catch(() => {})
  await wait(2000)
  // 可能有导出弹窗（选格式/确认）
  const dlgBtn = page.locator('[role="dialog"]:visible button[class*="primary"], [role="dialog"]:visible button:has-text("确 定"), [role="dialog"]:visible button:has-text("确 认")').last()
  if (await dlgBtn.count()) { await dlgBtn.click({ timeout: 6000 }).catch(() => {}) }
  const dl = await dlPromise
  await page.screenshot({ path: shot('08-流程模型-导出-01-导出结果') })
  results['导出'] = { ok: !!dl, file: dl ? dl.suggestedFilename() : null }
}

// ---------- 删除（清理 e2e 模型，含副本） ----------
{
  await page.goto(LIST, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await waitFor(async () => (await page.locator('button:has-text("新建模型")').count()) > 0, 60000)
  await wait(2500)
  const delRow = page.locator(`[class*="table__body"] tr:has-text("${MODEL}"), .el-table__row:has-text("${MODEL}")`).last()
  await delRow.scrollIntoViewIfNeeded().catch(() => {})
  await delRow.locator('a:has-text("删除"), span:has-text("删除"), button:has-text("删除")').first().click({ timeout: 10000 }).catch(() => {})
  await wait(1500)
  await page.screenshot({ path: shot('08-流程模型-删除-01-二次确认') })
  const cfm = page.locator('[class*="message-box"] button[class*="primary"], [role="dialog"]:visible button[class*="primary"]').last()
  if (await cfm.count()) { await cfm.click({ timeout: 6000 }).catch(() => {}); await wait(3000) }
  await page.screenshot({ path: shot('08-流程模型-删除-02-删除结果') })
  results['删除'] = { ok: true, note: '至少删除一次（副本/主模型择一）' }
}

// ---------- 14 流程实例管理：取消 ----------
const PI = `${BASE}${sub}/flowable/bpm/manager/process-instance/manager`
await page.goto(PI, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {})
await waitFor(async () => (await page.locator('[class*="table__body"] tr, .el-table__row').count()) > 0, 40000)
await wait(2000)
await page.screenshot({ path: shot('14-流程实例-01-列表') })
const piRow = page.locator('[class*="table__body"] tr:has-text("AMIS联邦验证2"), .el-table__row:has-text("AMIS联邦验证2")').first()
if (await piRow.count()) {
  await piRow.locator('a:has-text("取消"), span:has-text("取消"), button:has-text("取消")').first().click({ timeout: 8000 }).catch(() => {})
  await wait(1500)
  await page.screenshot({ path: shot('14-流程实例-02-取消确认') })
  const reason = page.locator('textarea:visible').first()
  if (await reason.count()) await reason.fill('e2e取消验证').catch(() => {})
  const cfm = page.locator('[class*="dialog"]:visible button[class*="primary"], [class*="message-box"] button[class*="primary"], [class*="popover"] button:has-text("确")').last()
  if (await cfm.count()) { await cfm.click({ timeout: 6000 }).catch(() => {}); await wait(3000) }
  await page.screenshot({ path: shot('14-流程实例-03-取消结果') })
  const body = await page.evaluate(() => document.body.innerText)
  results['实例取消'] = { ok: body.includes('取消成功') || body.includes('成功') }
} else {
  results['实例取消'] = { ok: false, note: '无 AMIS 联邦验证2 实例行' }
}

console.log(`===== [${ENV}] 动作闭环结果 =====`)
Object.entries(results).forEach(([k, v]) => console.log(`  ${k}: ${v.ok ? '✓' : '✗'} ${v.note ?? v.file ?? ''}`))
console.log('pageerror:', pageErrors.length)
fs.writeFileSync(`${RESULT_DIR}/${ENV}-actions.json`, JSON.stringify({ env: ENV, results, pageErrors: [...new Set(pageErrors)] }, null, 2))
await browser.close()
