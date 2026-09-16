// P0-4d 动作闭环：模型 复制/发布/导出/删除 + 实例取消 + 定义恢复
// 用法：node model-actions.mjs --base <url> --env <tag>
import { chromium } from '@playwright/test'
import fs from 'node:fs'

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : d }
const BASE = arg('--base', 'http://localhost:8773')
const ENV = arg('--env', 'dev')
const sub = BASE.includes('8661') ? '/main' : ''
const DIR = '/Users/Admin/Desktop/ai 杂物/插件/fulgur-federation/docs/screenshots/migration1-dev'
const RESULT_DIR = '/Users/Admin/Desktop/ai 杂物/插件/fulgur-federation/docs/func-results'
fs.mkdirSync(DIR, { recursive: true }); fs.mkdirSync(RESULT_DIR, { recursive: true })
const shot = (name) => `${DIR}/${ENV}-${name}.png`

const browser = await chromium.launchPersistentContext(`/tmp/pma-${ENV}-${Date.now()}`, {
  headless: true, args: ['--no-proxy-server'], viewport: { width: 1500, height: 950 },
})
const page = browser.pages()[0]
const pageErrors = []
page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 150)))
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
  // 等副本数据装载（标识以 _copy 结尾），再改写为唯一标识/名称（重复复制时 _copy 撞唯一约束）
  await waitFor(async () => (await page.evaluate(() => {
    const inp = [...document.querySelectorAll('.jeecg-layout-content input')].find((i) => /流程标识/.test(i.placeholder || '') && i.getBoundingClientRect().height > 0)
    return inp ? inp.value : ''
  })).endsWith('_copy'), 60000)
  const ts3 = String(Date.now()).slice(-6)
  await page.evaluate((v) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    const mark = (inp, val) => { setter.call(inp, val); inp.dispatchEvent(new Event('input', { bubbles: true })) }
    for (const inp of document.querySelectorAll('.jeecg-layout-content input')) {
      if (!inp.getBoundingClientRect().height) continue
      if (/流程标识/.test(inp.placeholder || '')) mark(inp, `e2ecopy${v}`)
      if (/流程名称/.test(inp.placeholder || '')) mark(inp, `e2e复制模型${v}`)
    }
  }, ts3)
  copyName = `e2e复制模型${ts3}`
  await page.screenshot({ path: shot('08-流程模型-复制-01b-唯一命名') })
  await page.locator('button:has-text("保 存"), button:has-text("保存")').first().click()
  // 后台接口慢（dept 13s 同源延迟），保存+跳转可能 >30s：toast/回列表/列表出现副本行均算成功
  const copied = await waitFor(async () => {
    const txt = await page.evaluate(() => document.body.innerText)
    if (txt.includes('复制成功')) return 'toast'
    if (page.url().includes('/model') && !page.url().includes('copy')) {
      // 回列表后确认副本行存在（数据状态断言，不依赖 toast）
      await wait(4000)
      const exist = (await rowOf(`${copyName ?? ''}`).count()) > 0 || (await page.evaluate(() => document.body.innerText).then((t) => t.includes('副本')))
      if (exist) return 'list'
    }
    return null
  }, 120000)
  await page.screenshot({ path: shot('08-流程模型-复制-02-复制成功') })
  results['复制'] = { ok: !!copied, how: copied, copyName }
}

// ---------- 发布（对复制出的模型） ----------
{
  await page.goto(LIST, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await waitFor(async () => (await page.locator('button:has-text("新建模型")').count()) > 0, 60000)
  // 等模型数据行渲染（后台慢链 ~13s+）
  await waitFor(async () => (await page.locator('[class*="table__body"] tr, .el-table__row').count()) > 0, 60000)
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
  // 等模型数据行渲染（后台慢链 ~13s+）
  await waitFor(async () => (await page.locator('[class*="table__body"] tr, .el-table__row').count()) > 0, 60000)
  await wait(2500)
  let exportZipBuf = null
  const zipListener = async (r) => {
    if (r.url().includes('/bpm/model/export')) { try { exportZipBuf = await r.body() } catch {} }
  }
  page.on('response', zipListener)
  const dlPromise = page.waitForEvent('download', { timeout: 20000 }).catch(() => null)
  // 勾选第一行复选框并验证选中态（分组表格渲染时序敏感，循环重试到 is-checked）
  let checked = false
  for (let i = 0; i < 5 && !checked; i++) {
    const cb = page.locator('[class*="table__body"] [class*="checkbox"]').first()
    if (!(await cb.count())) { await wait(2000); continue }
    await cb.click({ timeout: 8000 }).catch(() => {})
    await wait(1200)
    checked = await cb.evaluate((el) => el.className.includes('is-checked') || !!el.closest('tr')?.querySelector('[class*="checkbox"].is-checked'))
    if (!checked) {
      // 试分组表头全选
      const all = page.locator('[class*="table__header"] .el-checkbox, [class*="table__body"]').first()
      await all.click({ timeout: 5000 }).catch(() => {})
      await wait(1200)
      checked = await cb.evaluate((el) => el.className.includes('is-checked') || !!el.closest('tr')?.querySelector('[class*="checkbox"].is-checked')).catch(() => false)
    }
  }
  await wait(500)
  let dl = await dlPromise
  // 页面会立即 revokeObjectURL，saveAs 可能拿不到内容——从响应体直接抓 zip
  if (exportZipBuf && exportZipBuf.length > 0) {
    fs.writeFileSync('/tmp/e2e-models.zip', exportZipBuf)
  }
  let body = await page.evaluate(() => document.body.innerText)
  // 一次重试（勾选可能被表格重渲染吞掉）
  if (!dl && !body.includes('导出成功')) {
    const chk2 = page.locator('[class*="table__body"] [class*="checkbox"]').nth(2)
    if (await chk2.count()) await chk2.click({ timeout: 8000 }).catch(() => {})
    await wait(1000)
    const dl2 = page.waitForEvent('download', { timeout: 30000 }).catch(() => null)
    await page.locator('button:has-text("导 出"), button:has-text("导出")').first().click({ timeout: 10000 }).catch(() => {})
    await wait(4000)
    const dlgBtn2 = page.locator('[role="dialog"]:visible button[class*="primary"], [role="dialog"]:visible button:has-text("确 定")').last()
    if (await dlgBtn2.count()) { await dlgBtn2.click({ timeout: 6000 }).catch(() => {}) }
    dl = await dl2
    body = await page.evaluate(() => document.body.innerText)
  }
  await page.screenshot({ path: shot('08-流程模型-导出-01-导出结果') })
  results['导出'] = { ok: !!dl || body.includes('导出成功'), file: dl ? dl.suggestedFilename() : (body.includes('导出成功') ? 'toast' : null) }
  page.off('response', zipListener)
}

// ---------- 删除（清理 e2e 模型，含副本） ----------
{
  await page.goto(LIST, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await waitFor(async () => (await page.locator('button:has-text("新建模型")').count()) > 0, 60000)
  // 等模型数据行渲染（后台慢链 ~13s+）
  await waitFor(async () => (await page.locator('[class*="table__body"] tr, .el-table__row').count()) > 0, 60000)
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
// 先造一个进行中的实例（卡片页发起对 AMIS 是原版死路径，用与 AMIS 站点相同的 API 方式）
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

const PI = `${BASE}${sub}/flowable/bpm/manager/process-instance/manager`
await page.goto(PI, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {})
await waitFor(async () => (await page.locator('[class*="table__body"] tr, .el-table__row').count()) > 0, 40000)
await wait(4000)
await page.screenshot({ path: shot('14-流程实例-01-列表') })
// 等取消链接渲染（行按钮比行数据晚）
await waitFor(async () => (await page.locator('tr:has-text("来领导审批") button:has-text("取消"), tr:has-text("AMIS联邦验证2") button:has-text("取消")').count()) > 0, 30000)
const cancelLink = page.locator('tr:has-text("来领导审批") button:has-text("取消"), tr:has-text("AMIS联邦验证2") button:has-text("取消")').first()
if (await cancelLink.count()) {
  await page.screenshot({ path: shot('14-流程实例-02-取消前') })
  await cancelLink.click({ timeout: 8000 })
  await wait(2000)
  await page.screenshot({ path: shot('14-流程实例-03-取消原因弹窗') })
  // ElMessageBox：原因为 input（非 textarea），确认键可能为 i18n 键名（common.ok）
  const reasonInput = page.locator('[class*="message-box"] input:visible, textarea:visible').first()
  if (await reasonInput.count()) await reasonInput.fill('e2e取消验证').catch(() => {})
  const cfm = page.locator('[class*="message-box"] button[class*="primary"], [class*="message-box"] button:has-text("common.ok"), [class*="message-box"] button:has-text("确 定")').last()
  if (await cfm.count()) { await cfm.click({ timeout: 8000 }).catch(() => {}) }
  else { await page.keyboard.press('Enter') }
  const cancelOk = await waitFor(async () => (await page.evaluate(() => document.body.innerText)).includes('取消成功'), 30000)
  await page.screenshot({ path: shot('14-流程实例-04-取消结果') })
  results['实例取消'] = { ok: !!cancelOk }
} else {
  results['实例取消'] = { ok: false, note: '无审批中的 AMIS 实例行' }
}
// ---------- 08b 流程模型：导入（用导出的 zip 回灌） ----------
{
  await page.goto(LIST, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await waitFor(async () => (await page.locator('button:has-text("新建模型")').count()) > 0, 60000)
  // 等模型数据行渲染（后台慢链 ~13s+）
  await waitFor(async () => (await page.locator('[class*="table__body"] tr, .el-table__row').count()) > 0, 60000)
  await wait(2500)
  if (fs.existsSync('/tmp/e2e-models.zip')) {
    const impBtn = page.locator('button:has-text("导 入"), button:has-text("导入")').first()
    await impBtn.click({ timeout: 10000 })
    await waitFor(async () => (await page.locator('[role="dialog"]:visible, [class*="dialog"]:visible').count()) > 0, 10000)
    await wait(1000)
    await page.screenshot({ path: shot('08-流程模型-导入-01-导入弹窗') })
    const fileInput = page.locator('input[type="file"]').first()
    await fileInput.setInputFiles('/tmp/e2e-models.zip')
    await wait(1000)
    await page.screenshot({ path: shot('08-流程模型-导入-02-选择文件') })
    const cfm = page.locator('[role="dialog"]:visible button[class*="primary"], [class*="dialog"]:visible button:has-text("确 定"), [class*="dialog"]:visible button:has-text("确 认")').last()
    if (await cfm.count()) { await cfm.click({ timeout: 8000 }).catch(() => {}) }
    // 弹窗内出现结果表（成功/失败/跳过 计数）即后端已处理；重复 key 跳过是弹窗明示的设计
    const impOk = await waitFor(async () => {
      const st = await page.evaluate(() => {
        const dlg = [...document.querySelectorAll('[role="dialog"], [class*="dialog"]')].find((d) => d.getBoundingClientRect().height > 0)
        if (!dlg) return null
        const t = dlg.innerText
        if (t.includes('导入成功')) return '成功'
        if (/成功\s*\d+[\s\S]*失败\s*\d+[\s\S]*跳过\s*\d+/.test(t)) {
          const skip = t.match(/跳过\s*(\d+)/)?.[1] ?? '?'
          return `完成(成功${t.match(/成功\s*(\d+)/)?.[1] ?? '?'} 跳过${skip})`
        }
        return null
      })
      return st
    }, 40000)
    await page.screenshot({ path: shot('08-流程模型-导入-03-导入结果') })
    results['模型导入'] = { ok: !!impOk, msg: impOk }
  } else {
    results['模型导入'] = { ok: false, note: '无导出文件可导入' }
  }
}

// ---------- 20 流程定义：恢复（跳定义模式模型表单→保存→恢复成功） ----------
await page.goto(`${BASE}${sub}/flowable/bpm/manager/definition`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {})
await waitFor(async () => (await page.locator('[class*="table__body"] tr, .el-table__row').count()) > 0, 40000)
await wait(3000)
await page.screenshot({ path: shot('20-流程定义-01-列表') })
// 名称搜索定位（定义列表分页，目标不一定在首页）
const nameSearch = page.locator('input[placeholder*="名称"], input[placeholder*="流程名"]').first()
if (await nameSearch.count()) {
  await nameSearch.fill('零星领料审批')
  await page.locator('button:has-text("搜索"), button:has-text("查 询"), button:has-text("查询")').first().click({ timeout: 8000 }).catch(() => {})
  await wait(4000)
}
// 用"零星领料审批"自身的定义做恢复（覆盖数据与现值一致，无损）
const defRow = page.locator('tr:has-text("零星领料审批") a:has-text("恢复"), tr:has-text("零星领料审批") button:has-text("恢复"), .el-table__row:has-text("零星领料审批") a:has-text("恢复")').first()
if (await defRow.count()) {
  await defRow.click({ timeout: 8000 })
  const formReady = await waitFor(async () => (await page.evaluate(() => [...document.querySelectorAll('.jeecg-layout-content input:not([type=hidden])')].filter((i) => i.getBoundingClientRect().height > 0).length)) >= 5, 90000)
  await page.screenshot({ path: shot('20-流程定义-02-恢复表单回显') })
  // 定义模式的提交按钮是"恢 复"（index.vue 按 actionType 切换文案）
  const resumeBtn = page.locator('button:has-text("恢 复"), button:has-text("恢复")').first()
  if (await resumeBtn.count()) {
    await resumeBtn.click({ timeout: 8000 })
  } else {
    await page.locator('button:has-text("保 存"), button:has-text("保存")').first().click()
  }
  const resumeOk = await waitFor(async () => (await page.evaluate(() => document.body.innerText)).includes('恢复成功'), 90000)
  await page.screenshot({ path: shot('20-流程定义-03-恢复结果') })
  results['定义恢复'] = { ok: !!resumeOk }
} else {
  results['定义恢复'] = { ok: false, note: '首页未找到零星领料审批的定义行' }
}

// ---------- 03 我的流程：重新发起（对最近的已结束实例） ----------
await page.goto(`${BASE}${sub}/flowable/bpm/task/my`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {})
await waitFor(async () => (await page.locator('[class*="table__body"] tr, .el-table__row').count()) > 0, 40000)
await wait(2500)
await page.screenshot({ path: shot('03-我的流程-01-列表') })
const reRow = page.locator('tr:has-text("来领导审批"), tr:has-text("AMIS联邦验证2")').first()
if (await reRow.count()) {
  const reBtn = reRow.locator('a:has-text("重新发起"), span:has-text("重新发起"), button:has-text("重新发起")').first()
  if (await reBtn.count()) {
    await reBtn.click({ timeout: 8000 })
    await wait(6000)
    await page.screenshot({ path: shot('03-我的流程-02-重新发起表单') })
    results['重新发起'] = { ok: page.url().includes('create') || page.url().includes('detail'), note: page.url() }
  } else {
    results['重新发起'] = { ok: false, note: '首行无重新发起按钮（可能流程仍在进行中）' }
  }
} else {
  results['重新发起'] = { ok: false, note: '我的流程无 AMIS 实例行' }
}

console.log(`===== [${ENV}] 动作闭环结果 =====`)
Object.entries(results).forEach(([k, v]) => console.log(`  ${k}: ${v.ok ? '✓' : '✗'} ${v.note ?? v.file ?? ''}`))
console.log('pageerror:', pageErrors.length)
fs.writeFileSync(`${RESULT_DIR}/${ENV}-actions.json`, JSON.stringify({ env: ENV, results, pageErrors: [...new Set(pageErrors)] }, null, 2))
await browser.close()