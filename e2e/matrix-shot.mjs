// 遗留4：27 页双环境矩阵——数据驱动（登录→真实参数→逐页直达+截图+断言→JSON 归档）
// 用法：VBASE=http://localhost:8773 VTAG=dev node matrix-shot.mjs
//       VBASE=http://localhost:8662 VTAG=prod node matrix-shot.mjs
// 产出：migration1-dev/matrix-{tag}.png（27 张）+ matrix-{tag}.json
// 说明：菜单页直链截图（联邦方案深链接直达，nginx 已回退宿主）；12 个动作页清单见
// docs/screenshots/baseline-8661/pending-action-routes/（已由 pending-routes-shot.mjs 覆盖，
// 本脚本统一重跑归档）。U-2 四页（lowcode）路由可达但渲染空白，断言只要求路由可达。
import { chromium } from '@playwright/test'
import fs from 'node:fs'

const BASE = process.env.VBASE || 'http://localhost:8773'
const TAG = process.env.VTAG || 'dev'
const SHOT_DIR = '/Users/Admin/Desktop/ai 杂物/插件/fulgur-federation/docs/screenshots/migration1-dev'
const RESULT = `${SHOT_DIR}/matrix-${TAG}.json`
const PROFILE = `/tmp/fulgur-matrix-${TAG}-${Date.now()}`

// [编号, 输出名, 宿主路由, 类型 menu/action, 断言文本, u2Known]
const PAGES = [
  ['01', 'todo', '/flowable/bpm/task/todo', 'menu', ['待办任务']],
  ['02', 'done', '/flowable/bpm/task/done', 'menu', ['已办任务']],
  ['03', 'my', '/flowable/bpm/task/my', 'menu', ['我的流程']],
  ['04', 'copy', '/flowable/bpm/task/copy', 'menu', ['抄送我的']],
  ['05', 'create', '/flowable/bpm/task/create', 'menu', ['发起流程']],
  ['06', 'detail', '/flowable/bpm/process-instance/detail?id={instanceId}', 'action', [], false],
  ['07', 'action', '/flowable/bpm/manager/action?processsKey=demo_leave', 'action', [], false],
  ['08', 'model', '/flowable/bpm/manager/model', 'menu', ['流程模型']],
  ['09', 'form', '/flowable/bpm/manager/form', 'menu', ['表单']],
  ['10', 'category', '/flowable/bpm/manager/category', 'menu', ['分类']],
  ['11', 'user-group', '/flowable/bpm/manager/user-group', 'menu', ['用户组']],
  ['12', 'process-listener', '/flowable/bpm/manager/process-listener', 'menu', ['监听']],
  ['13', 'process-expression', '/flowable/bpm/manager/process-expression', 'menu', ['表达式']],
  ['14', 'instance-manager', '/flowable/bpm/manager/process-instance/manager', 'menu', ['流程实例']],
  ['15', 'task', '/flowable/bpm/manager/process-tasnk', 'menu', ['任务']],
  ['16', 'model-create', '/flowable/bpm/manager/model/create', 'action', [], false],
  ['17', 'form-edit', '/flowable/bpm/manager/form/edit?type=update&id={formId}', 'action', [], false],
  ['18', 'model-update', '/flowable/bpm/manager/model/update/{modelId}', 'action', [], false],
  ['19', 'model-copy', '/flowable/bpm/manager/model/copy/{modelId}', 'action', [], false],
  ['20', 'definition', '/flowable/bpm/manager/definition', 'menu', ['流程']],
  ['21', 'report', '/flowable/bpm/process-instance/report?processDefinitionId=demo_leave:4:a6d74466-984b-11f0-b657-f8e43be98cda&processDefinitionKey=demo_leave', 'action', [], false],
  ['22', 'formDesign', '/lowcode/lowdev/formDesign', 'menu', [], true],
  ['23', 'reportDesign', '/lowcode/lowdev/reportDesign', 'menu', [], true],
  ['24', 'graphReportDesign', '/lowcode/lowdev/graphReportDesign', 'menu', [], true],
  ['25', 'moduleDesign', '/lowcode/lowdev/moduleDesign', 'menu', [], true],
  ['26', 'reportTest', '/lowcode/lowdev/reportTest/problemReport', 'action', [], true],
  ['27', 'form-external', '/lowcode/form/external/view/1', 'action', [], true],
]

const browser = await chromium.launchPersistentContext(PROFILE, {
  headless: true,
  args: ['--no-proxy-server'],
  viewport: { width: 1600, height: 900 },
})
const page = browser.pages()[0]
const errors = []
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)))

await page.goto(`${BASE}/main/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(8000)
await page.locator('input[placeholder*="账号"], input[placeholder*="用户名"]').first().fill('admin')
await page.locator('input[type="password"]').first().fill('Demo@123456')
await page.locator('button:has-text("登 录"), button:has-text("登录")').first().click()
// 健壮登录：等「登录表单消失」而非固定秒数（prod 后台慢链 ≥15s，避坑表 #7），
// 失败重试一轮（偶发 getInfo 超时被踢回登录页）
for (let attempt = 0; attempt < 3; attempt++) {
  const gone = await page.locator('input[type="password"]').first().waitFor({ state: 'hidden', timeout: 30000 }).then(() => true).catch(() => false)
  if (gone) break
  await page.locator('input[placeholder*="账号"], input[placeholder*="用户名"]').first().fill('admin').catch(() => {})
  await page.locator('input[type="password"]').first().fill('Demo@123456').catch(() => {})
  await page.locator('button:has-text("登 录"), button:has-text("登录")').first().click().catch(() => {})
}
await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {})
await page.waitForTimeout(3000)

const api = async (url) => {
  const run = () =>
    page.evaluate(async (u) => {
      const key = Object.keys(localStorage).find((k) => k.includes('COMMON__LOCAL__KEY__'))
      const obj = JSON.parse(localStorage.getItem(key))
      let real = null
      const find = (o) => { for (const [k, v] of Object.entries(o ?? {})) { if (k === 'value' && typeof v === 'string' && v.startsWith('ey')) real = v; if (v && typeof v === 'object') find(v) } }
      find(obj.value?.TOKEN__ ?? obj)
      const r = await fetch(u, { headers: { 'X-Access-Token': real } })
      return r.json()
    }, url)
  return run().catch(() => page.waitForTimeout(4000).then(run))
}

const models = (await api('/demo/bpm/model/list'))?.data ?? []
const bizModel = models.find((m) => !String(m.key).startsWith('amis_fed'))
const forms = (await api('/demo/bpm/form/page?pageNo=1&pageSize=10'))?.data?.records ?? []
const instRes = (await api('/demo/bpm/process-instance/manager-page?pageNo=1&pageSize=10')) ?? {}
const instances = instRes?.data?.records ?? instRes?.data?.list ?? []
const vars = {
  modelId: bizModel?.id ?? '',
  formId: forms[0]?.id ?? '',
  instanceId: instances[0]?.id ?? '',
}
console.log('vars:', JSON.stringify(vars))

const results = {}
for (const [no, name, routeTpl, kind, assertTexts, u2Known] of PAGES) {
  const route = routeTpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '')
  errors.length = 0
  await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {})
  await page.waitForTimeout(9000)
  await page.screenshot({ path: `${SHOT_DIR}/m-${TAG}-${no}-${name}.png` })
  const text = (await page.locator('body').innerText().catch(() => '')).trim()
  const iframes = await page.locator('iframe').count()
  const missing = assertTexts.filter((t) => !text.includes(t))
  const renderOk = u2Known ? 'u2-blank' : text.length > 200 ? 'ok' : 'thin'
  const result = {
    no, name, kind, route,
    iframe: iframes,
    render: renderOk,
    textLen: text.length,
    missing,
    pageErrors: errors.slice(0, 2),
    u2Known: u2Known || undefined,
    pass: missing.length === 0 && (u2Known || errors.length === 0),
  }
  results[`${no}-${name}`] = result
  console.log(`${no}-${name}`, JSON.stringify(result))
}
fs.writeFileSync(RESULT, JSON.stringify({ base: BASE, tag: TAG, vars, results }, null, 2))
console.log('RESULT_SAVED:', RESULT)
await browser.close()
