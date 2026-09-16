// A1: 全量收集 27 页 dev/prod 控制台报错（error + pageerror + 失败请求），按页输出
// 用法：node collect-errors.mjs --base <url> --env <tag> [--out <file>]
import { chromium } from '@playwright/test'
import fs from 'node:fs'

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : d }
const BASE = arg('--base', 'http://localhost:8773')
const ENV = arg('--env', 'dev')
const OUT = arg('--out', `/Users/Admin/Desktop/ai 杂物/插件/fulgur-federation/docs/func-results/${ENV}-console-errors.json`)
const sub = BASE.includes('8661') ? '/main' : ''

const PAGES = [
  ['01', '待办任务', '/flowable/bpm/task/todo'],
  ['02', '已办任务', '/flowable/bpm/task/done'],
  ['03', '我的流程', '/flowable/bpm/task/my'],
  ['04', '抄送我的', '/flowable/bpm/task/cc'],
  ['05', '发起流程', '/flowable/bpm/task/create'],
  ['07', '审批操作', '/flowable/bpm/task/audit?processsKey=amis_fed_1789384580714'],
  ['08', '流程模型', '/flowable/bpm/manager/model'],
  ['09', '流程表单', '/flowable/bpm/manager/form'],
  ['10', '流程分类', '/flowable/bpm/manager/category'],
  ['11', '用户分组', '/flowable/bpm/manager/user-group'],
  ['12', '流程监听器', '/flowable/bpm/manager/process-listener'],
  ['13', '流程表达式', '/flowable/bpm/manager/process-expression'],
  ['14', '流程实例管理', '/flowable/bpm/manager/process-instance/manager'],
  ['15', '任务管理', '/flowable/bpm/manager/task'],
  ['20', '流程定义', '/flowable/bpm/manager/definition'],
  ['22', '表单设计', '/lowcode/lowdev/formDesign'],
  ['23', '报表设计', '/lowcode/lowdev/reportDesign'],
  ['24', '图形报表设计', '/lowcode/lowdev/graphReportDesign'],
  ['25', '模块设计', '/lowcode/lowdev/moduleDesign'],
  ['26', '报表测试', '/lowcode/lowdev/reportTest/problemReport'],
  ['27', '外部表单', '/lowcode/form/form_external'],
]

const browser = await chromium.launchPersistentContext(`/tmp/perr-${ENV}-${Date.now()}`, {
  headless: true, args: ['--no-proxy-server'], viewport: { width: 1500, height: 950 },
})
const page = browser.pages()[0]

await page.goto(`${BASE}/main/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(6000)
await page.locator('input[placeholder*="账号"], input[placeholder*="用户名"]').first().fill('admin')
await page.locator('input[type="password"]').first().fill('Demo@123456')
// 健壮登录：等「登录表单消失」+ 重试 3 轮（与 matrix-shot.mjs 同款，prod 慢链 ≥15s）
await page.locator('button:has-text("登 录"), button:has-text("登录")').first().click()
for (let attempt = 0; attempt < 3; attempt++) {
  const gone = await page.locator('input[type="password"]').first().waitFor({ state: 'hidden', timeout: 30000 }).then(() => true).catch(() => false)
  if (gone) break
  await page.locator('input[placeholder*="账号"], input[placeholder*="用户名"]').first().fill('admin').catch(() => {})
  await page.locator('input[type="password"]').first().fill('Demo@123456').catch(() => {})
  await page.locator('button:has-text("登 录"), button:has-text("登录")').first().click().catch(() => {})
}
await page.waitForTimeout(3000)

const report = {}
for (const [no, name, path] of PAGES) {
  const errs = []
  const onConsole = (m) => { if (m.type() === 'error') errs.push({ kind: 'console', text: m.text().slice(0, 250) }) }
  const onPage = (e) => errs.push({ kind: 'pageerror', text: String(e).slice(0, 250) })
  const onResp = (r) => { if (r.status() >= 400) errs.push({ kind: 'http', text: `${r.status()} ${r.url().slice(0, 140)}` }) }
  page.on('console', onConsole); page.on('pageerror', onPage); page.on('response', onResp)
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {})
  await page.waitForTimeout(14000)
  page.off('console', onConsole); page.off('pageerror', onPage); page.off('response', onResp)
  report[`${no} ${name}`] = { count: errs.length, errors: errs }
  console.log(`${no} ${name}: ${errs.length} 条`)
}
fs.writeFileSync(OUT, JSON.stringify(report, null, 2))
console.log(`\n汇总 → ${OUT}`)
const total = Object.values(report).reduce((a, b) => a + b.count, 0)
console.log(`总报错数: ${total}`)
await browser.close()
