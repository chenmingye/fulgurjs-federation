// 功能深度探针 v2：正确选择器（el-table / jeecg-layout-content）+ 加载态卡死检测 + 失败接口
// 用法：VBASE=http://localhost:8662 VTAG=prod node probe-depth2.mjs
import { chromium } from '@playwright/test'
import fs from 'node:fs'

const BASE = process.env.VBASE || 'http://localhost:8662'
const TAG = process.env.VTAG || 'prod'
const OUT = `/tmp/probe-depth2-${TAG}.json`
const PROFILE = `/tmp/fulgur-depth2-${TAG}-${Date.now()}`

// [名, 路由, 期望至少有数据行的列表页?]
const PAGES = [
  ['todo 待办任务', '/flowable/bpm/task/todo', true],
  ['done 已办任务', '/flowable/bpm/task/done', true],
  ['my 我的流程', '/flowable/bpm/task/my', true],
  ['copy 抄送我的', '/flowable/bpm/task/copy', false],
  ['create 发起流程', '/flowable/bpm/task/create', false],
  ['model 流程模型', '/flowable/bpm/manager/model', true],
  ['form 流程表单', '/flowable/bpm/manager/form', true],
  ['category 流程分类', '/flowable/bpm/manager/category', true],
  ['user-group 用户分组', '/flowable/bpm/manager/user-group', true],
  ['process-listener 流程监听器', '/flowable/bpm/manager/process-listener', true],
  ['process-expression 流程表达式', '/flowable/bpm/manager/process-expression', true],
  ['instance-manager 流程实例管理', '/flowable/bpm/manager/process-instance/manager', true],
  ['task-manager 任务管理', '/flowable/bpm/manager/process-tasnk', true],
  ['definition 流程定义', '/flowable/bpm/manager/definition', true],
  ['model-create 创建流程', '/flowable/bpm/manager/model/create', false],
  ['model-update 修改流程', '/flowable/bpm/manager/model/update/5c0fd82d-4849-11f0-8041-f8e43be98cda', false],
  ['form-edit 表单设计', '/flowable/bpm/manager/form/edit?type=update&id=13', false],
]

const browser = await chromium.launchPersistentContext(PROFILE, {
  headless: true,
  args: ['--no-proxy-server'],
  viewport: { width: 1600, height: 1000 },
})
const page = browser.pages()[0]
let apiCalls = []
page.on('response', (r) => {
  const u = r.url()
  if (!/\.(js|css|png|jpe?g|svg|woff2?|ico|map)(\?|$)/.test(u)) {
    apiCalls.push({ url: u.replace(BASE, '').split('?')[0], status: r.status() })
  }
})
const pageErrors = []
page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 160)))

await page.goto(`${BASE}/main/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(6000)
await page.locator('input[placeholder*="账号"], input[placeholder*="用户名"]').first().fill('admin')
await page.locator('input[type="password"]').first().fill('Demo@123456')
await page.locator('button:has-text("登 录"), button:has-text("登录")').first().click()
await page.waitForTimeout(8000)

const results = {}
for (const [name, route, expectRows] of PAGES) {
  apiCalls = []
  pageErrors.length = 0
  await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {})
  // 首轮等 12s；再给加载态最多 15s 收敛（检测"永久转圈"）
  await page.waitForTimeout(12000)
  let stuckMs = 0
  while (stuckMs < 15000) {
    const spinning = await page.locator('.el-loading-mask:visible, .ant-spin-spinning:visible, .vxe-loading:visible').count()
    if (spinning === 0) break
    await page.waitForTimeout(3000)
    stuckMs += 3000
  }
  const m = await page.evaluate(() => {
    const c = document.querySelector('.jeecg-layout-content')
    const rows = document.querySelectorAll('.el-table__body tr.el-table__row, .ant-table-tbody tr.ant-table-row, .vxe-body--row').length
    const btns = [...document.querySelectorAll('.jeecg-layout-content button, .jeecg-layout-content .ant-btn')]
      .map((b) => (b.innerText || '').trim()).filter(Boolean)
    const disabledBtns = [...document.querySelectorAll('.jeecg-layout-content button[disabled], .jeecg-layout-content .ant-btn[disabled]')].length
    const inputs = document.querySelectorAll('.jeecg-layout-content input:not([type=hidden]), .jeecg-layout-content textarea, .jeecg-layout-content .ant-select:not(.ant-select-disabled)').length
    const spinning = document.querySelectorAll('.el-loading-mask, .ant-spin-spinning, .vxe-loading').length
    return {
      contentLen: c ? c.innerText.trim().length : -1,
      rows, buttons: [...new Set(btns)].slice(0, 12), disabledBtns, inputs, spinningMasks: spinning,
    }
  })
  const failed = apiCalls.filter((c) => c.status >= 400)
  results[name] = {
    route, ...m,
    stuck: m.spinningMasks > 0,
    apiCount: apiCalls.length,
    apiFailed: [...new Set(failed.map((c) => `${c.status} ${c.url}`))].slice(0, 4),
    pageErrors: [...new Set(pageErrors)].slice(0, 2),
    expectRows,
  }
  console.log(name, JSON.stringify(results[name]))
}
fs.writeFileSync(OUT, JSON.stringify({ base: BASE, tag: TAG, results }, null, 2))
console.log('SAVED', OUT)
await browser.close()
