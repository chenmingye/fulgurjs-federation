// testbed 待办全闭环（dev/prod 通用）：发起测试流程实例（自己的，用后闭环）
// → 待办列表出现行 → 真点「办理」→ 审批表单弹窗断言+填写 → 审批通过 → 待办行消失/已办出现。
// 用法：TB_HOST=http://localhost:8773 TB_TAG=dev node tb-todo-closure.mjs
import { chromium } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const HOST = process.env.TB_HOST || 'http://localhost:8773'
const TAG = process.env.TB_TAG || 'dev'
const SHOT_DIR = process.env.TB_SHOT_DIR || path.resolve('..', 'docs/screenshots', `tb-${TAG}-4.0.0`)
fs.mkdirSync(SHOT_DIR, { recursive: true })
const results = []
const step = (name, data) => {
  results.push({ step: name, ...data })
  console.log(`${data.pass === false ? '✗' : '✓'} ${name}: ${JSON.stringify({ ...data, pass: undefined })}`)
}
const shot = (page, n) => page.screenshot({ path: path.join(SHOT_DIR, n + '.png') })
const instanceId = process.env.TB_INSTANCE_ID
const getProcessState = async (page, id) => {
  await page.waitForLoadState('domcontentloaded').catch(() => {})
  await page.waitForTimeout(4000)
  return page.evaluate(async (processInstanceId) => {
  const key = Object.keys(localStorage).find((k) => k.includes('COMMON__LOCAL__KEY__'))
  const obj = JSON.parse(localStorage.getItem(key))
  let token = null
  const find = (o) => { for (const [k, v] of Object.entries(o ?? {})) { if (k === 'value' && typeof v === 'string' && v.startsWith('ey')) token = v; if (v && typeof v === 'object') find(v) } }
  find(obj.value?.TOKEN__ ?? obj)
  const headers = { 'X-Access-Token': token }
  const get = async (url) => (await (await fetch(`/meszc${url}`, { headers })).json())?.data
  const [instance, todo, done] = await Promise.all([
    get(`/bpm/process-instance/get?id=${encodeURIComponent(processInstanceId)}`),
    get('/bpm/task/todo-page?pageNo=1&pageSize=100'),
    get('/bpm/task/done-page?pageNo=1&pageSize=100'),
  ])
  const rows = (page) => page?.list ?? page?.records ?? []
  return {
    instanceStatus: instance?.status,
    instanceResult: instance?.result,
    todoTaskIds: rows(todo).filter((row) => row.processInstanceId === processInstanceId).map((row) => row.id),
    doneTaskIds: rows(done).filter((row) => row.processInstanceId === processInstanceId).map((row) => row.id),
  }
}, id)
}

const browser = await chromium.launchPersistentContext(`/tmp/fulgurjs-tbc-${TAG}-${Date.now()}`, {
  headless: true,
  args: ['--no-proxy-server'],
  viewport: { width: 1600, height: 900 },
})
const page = browser.pages()[0]
const errs = []
page.on('pageerror', (e) => errs.push(String(e).slice(0, 150)))

await page.goto(`${HOST}/main/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(8000)
for (let i = 0; i < 3; i++) {
  await page.locator('input[placeholder*="账号"], input[placeholder*="用户名"]').first().fill('admin').catch(() => {})
  await page.locator('input[type="password"]').first().fill('P@ssw0rd').catch(() => {})
  await page.locator('button:has-text("登 录"), button:has-text("登录")').first().click().catch(() => {})
  if (await page.locator('input[type="password"]').first().waitFor({ state: 'hidden', timeout: 25000 }).then(() => true).catch(() => false)) break
}
await page.waitForTimeout(2000)
// 4.3.x：登录成功后 authLogin 有自动 homePath 跳转——等导航稳定再 evaluate（上下文不被销毁）
await page.waitForLoadState('domcontentloaded').catch(() => {})
await page.waitForTimeout(6000)

// 1) 找可用的已部署定义并发起实例；TB_INSTANCE_ID 可复核上次自建的未完成实例
const start = instanceId ? { instanceId, reused: true } : await page.evaluate(async () => {
  const key = Object.keys(localStorage).find((k) => k.includes('COMMON__LOCAL__KEY__'))
  const obj = JSON.parse(localStorage.getItem(key))
  let token = null
  const find = (o) => { for (const [k, v] of Object.entries(o ?? {})) { if (k === 'value' && typeof v === 'string' && v.startsWith('ey')) token = v; if (v && typeof v === 'object') find(v) } }
  find(obj.value?.TOKEN__ ?? obj)
  const h = { 'X-Access-Token': token, 'Content-Type': 'application/json' }
  const defs = await (await fetch('/meszc/bpm/process-definition/list?suspensionState=1&key=amis_fed', { headers: h })).json()
  const all = defs?.data ?? defs?.result ?? []
  const def = (Array.isArray(all) ? all : [])[0]
  if (!def?.id) return { err: 'no deployed amis_fed definition', defsKeys: (Array.isArray(all) ? all : []).map((d) => d.key).slice(0, 5) }
  const r = await fetch('/meszc/bpm/process-instance/create', {
    method: 'POST', headers: h,
    body: JSON.stringify({ processDefinitionId: def.id, variables: {}, startUserSelectAssignees: { Activity_02rte1s: [101] } }),
  })
  const j = await r.json()
  return { defId: def.id, defKey: def.key, defName: def.name, code: j?.code, msg: j?.message, instanceId: String(j?.data ?? j?.result ?? '') }
})
step('instance-start', { ...start, pass: !!start.instanceId })
if (!start.instanceId) {
  console.log('FATAL: 无法发起实例'); await browser.close(); process.exit(1)
}

// 2) 待办列表出现新行
// 新 profile 首次深链会撞动态路由未注册（404）——检测到 404 再导航一次（路由注册完成后必中）
for (let attempt = 0; attempt < 3; attempt++) {
  await page.goto(`${HOST}/main/flowable/bpm/task/todo`, { waitUntil: 'domcontentloaded' })
  let is404 = false
  for (let i = 0; i < 45; i++) {
    await page.waitForTimeout(1000)
    const body = await page.locator('body').innerText().catch(() => '')
    if (/抱歉，您访问的页面不存在|404/.test(body) && !/待办任务/.test(body)) { is404 = true; break }
    if ((await page.locator('table tbody tr:visible, .el-table__row:visible, .ant-table-row:visible').count()) > 0) break
  }
  if (!is404) break
}
await page.waitForTimeout(3000)
const todoRows = await page.locator('table tbody tr:visible, .el-table__row:visible').count()
const before = await getProcessState(page, start.instanceId)
step('todo-list-with-instance', { rows: todoRows, ...before, pass: todoRows > 0 && before.todoTaskIds.length > 0 })
await shot(page, 'todo-closure-list')

// 3) 真点第一行操作（办理/详情/审批）
const row = page.locator('table tbody tr:visible, .el-table__row:visible').filter({ hasText: start.instanceId }).first()
const actionBtn = row.locator('button:has-text("办理"), a:has-text("办理")').first()
let dialogOpened = false
if (await actionBtn.count()) {
  await actionBtn.click({ timeout: 8000 }).catch(() => {})
  // 等详情页审批工具栏出现（后端慢链：approval-detail 接口 15s+）
  for (let i = 0; i < 30; i++) {
    const hasToolbar = await page.locator('button:has-text("通 过"), button:has-text("通过")').count()
    if (hasToolbar) break
    await page.waitForTimeout(1000)
  }
  await page.waitForTimeout(2000)
  // 「办理」= 整页跳转流程详情（含 审批详情/流程图/流转记录 + 通过/拒绝/… 工具栏）
  const bodyText = await page.locator('body').innerText().catch(() => '')
  const toolbarBtns = await page.evaluate(() => [...document.querySelectorAll('button')].map((b) => (b.textContent || '').trim()).filter((t) => ['通过', '拒绝', '抄送', '转办', '委派', '加签', '退回'].some((k) => t.includes(k))).slice(0, 8))
  dialogOpened = bodyText.includes('流程详情') || toolbarBtns.length > 0
  step('todo-action-detail-page', { url: page.url().slice(-70), toolbar: toolbarBtns, pass: dialogOpened })
  await shot(page, 'todo-closure-detail')
}

// 4) 审批通过（真提交；实例是本轮自建的）——可能弹「审批意见」确认框
let approved = false
const approveBtn = page.locator('button:has-text("通 过"), button:has-text("通过")').first()
if (await approveBtn.count()) {
  await approveBtn.click({ timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(2500)
  // 审批意见 popover/确认框：填意见 + 确定（popover 形态：意见输入 + 「通过」确认）
  const popInputs = page.locator('.el-popper:visible input:visible, .el-popper:visible textarea:visible, .el-dialog:visible textarea:visible, .el-message-box:visible textarea:visible')
  const pin = await popInputs.count()
  for (let i = 0; i < pin; i++) {
    await popInputs.nth(i).fill('联邦4.0.0验证-同意', { timeout: 2000 }).catch(() => {})
  }
  const confirmBtn = page.locator('.el-popper:visible button:has-text("通 过"), .el-popper:visible button:has-text("通过"), .el-popper:visible button:has-text("确定"), .el-dialog:visible button:has-text("确 定"), .el-dialog:visible button:has-text("确定"), .el-message-box:visible button:has-text("确 定"), .el-message-box:visible button:has-text("确定")').last()
  if (await confirmBtn.count()) {
    await confirmBtn.click({ timeout: 6000 }).catch(() => {})
  }
  await page.waitForTimeout(2500)
  // 审批意见确认框：填意见 + 确定
  const confirmBox = page.locator('.el-dialog:visible, .ant-modal:visible, .el-message-box:visible').first()
  if (await confirmBox.count()) {
    const ta = confirmBox.locator('textarea').first()
    if (await ta.count()) await ta.fill('联邦 4.0.0 全链验证-同意').catch(() => {})
    const okBtn = confirmBox.locator('button:has-text("确 定"), button:has-text("确定"), button:has-text("通 过")').last()
    await okBtn.click({ timeout: 6000 }).catch(() => {})
  }
  await page.waitForTimeout(6000)
  let after = await getProcessState(page, start.instanceId)
  for (let i = 0; i < 20 && after.todoTaskIds.length > 0; i++) {
    await page.waitForTimeout(1500)
    after = await getProcessState(page, start.instanceId)
  }
  approved = before.todoTaskIds.every((id) => after.doneTaskIds.includes(id)) && after.todoTaskIds.length === 0
  step('todo-approve-submit', { approved, ...after, pass: approved })
  await shot(page, 'todo-closure-approved')
} else {
  step('todo-approve-submit', { pass: false, reason: '详情页无「通过」按钮' })
  await shot(page, 'todo-closure-detail-state')
}

// 5) 流转断言：已办列表出现该实例 / 待办消失
await page.goto(`${HOST}/main/flowable/bpm/task/done`, { waitUntil: 'domcontentloaded' })
for (let i = 0; i < 25; i++) {
  const rows = await page.locator('table tbody tr:visible, .el-table__row:visible').count()
  if (rows > 0) break
  await page.waitForTimeout(1000)
}
await page.waitForTimeout(1000)
const finalState = await getProcessState(page, start.instanceId)
const doneHas = finalState.instanceStatus === 2 && finalState.todoTaskIds.length === 0 && before.todoTaskIds.every((id) => finalState.doneTaskIds.includes(id))
step('flow-closure-done-visible', { doneRows: await page.locator('table tbody tr:visible, .el-table__row:visible').count(), ...finalState, pass: doneHas })
await shot(page, 'todo-closure-done')

fs.writeFileSync(path.join(SHOT_DIR, 'todo-closure.json'), JSON.stringify({ results, errs: [...new Set(errs)] }, null, 2))
console.log(`SUMMARY: ${results.filter((r) => r.pass === false).length} failed / ${results.length}; ERRORS: ${JSON.stringify([...new Set(errs)].slice(0, 4))}`)
await browser.close()
if (results.some((result) => result.pass === false)) process.exitCode = 1
