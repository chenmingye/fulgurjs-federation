// D1 验收闭环：创建流程（填表→保存→列表出现）+ 修改流程（回显→改→保存）
// 用法：node d1-closure.mjs <base> <env-tag>
// 截图按 H10 规范：docs/screenshots/migration1-dev/{env}-08-流程模型-{功能点}-{步骤}-{说明}.png
import { chromium } from '@playwright/test'
import fs from 'node:fs'

const BASE = process.argv[2] || 'http://localhost:8773'
const ENV = process.argv[3] || 'dev'
const DIR = '/Users/Admin/Desktop/ai 杂物/插件/fulgur-federation/docs/screenshots/migration1-dev'
fs.mkdirSync(DIR, { recursive: true })
const shot = (name) => `${DIR}/${ENV}-08-流程模型-${name}.png`

const browser = await chromium.launchPersistentContext(`/tmp/pd1c-${ENV}-${Date.now()}`, {
  headless: true, args: ['--no-proxy-server'], viewport: { width: 1500, height: 950 },
})
const page = browser.pages()[0]
const consoleErrs = []
const pageErrors = []
const failedReqs = []
page.on('console', (m) => { if (m.type() === 'error') consoleErrs.push(m.text().slice(0, 200)) })
page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 200)))
page.on('response', (r) => { if (r.status() >= 400) failedReqs.push(`${r.status()} ${r.url().slice(0, 120)}`) })
const iframes = () => page.locator('iframe').count()

// 轮询等待条件成立（避免固定等待）
const waitFor = async (fn, timeoutMs = 60000, intervalMs = 1000) => {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    const v = await fn()
    if (v) return v
    await page.waitForTimeout(intervalMs)
  }
  return null
}

const ts = String(Date.now()).slice(-6)
const MODEL_NAME = `e2e验收流程${ts}`
const MODEL_KEY = `e2eflow${ts}`
const results = []

// 兼容新旧 element-plus 与 bpm- 前缀命名空间的分类下拉点击
const openCategoryDropdown = async () => {
  const byInput = page.locator('input[placeholder*="流程分类"]').first()
  if (await byInput.count()) {
    await byInput.click({ timeout: 10000 })
    return
  }
  await page
    .locator('[class*="form-item"]:has([class*="form-item__label"]:has-text("流程分类"))')
    .locator('[class*="select"], [class*="select"] input')
    .first()
    .click({ timeout: 10000 })
}
const clickFirstDropdownItem = async (nth = 0) => {
  await page.locator('[class*="select-dropdown__item"]:visible').nth(nth).click({ timeout: 10000 })
}

// 登录
await page.goto(`${BASE}/main/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(6000)
await page.locator('input[placeholder*="账号"], input[placeholder*="用户名"]').first().fill('admin')
await page.locator('input[type="password"]').first().fill('Demo@123456')
await page.locator('button:has-text("登 录"), button:has-text("登录")').first().click()
await page.waitForTimeout(9000)

// ===== 闭环 A：新增模型 =====
// 乾坤基线(8661)子应用挂在 /main 下；联邦环境 /flowable 会被宿主重定向到 /main/flowable
const LIST = BASE.includes('8661')
  ? `${BASE}/main/flowable/bpm/manager/model`
  : `${BASE}/flowable/bpm/manager/model`
await page.goto(LIST, { waitUntil: 'domcontentloaded', timeout: 45000 })
await waitFor(async () => (await page.locator('button:has-text("新建模型")').count()) > 0, 60000)
await page.waitForTimeout(3000)
await page.screenshot({ path: shot('新增模型-01-列表页') })
results.push(`A01 列表页 iframe=${await iframes()}`)

await page.locator('button:has-text("新建模型"), span:has-text("新建模型")').first().click()
// 等表单出现（后台 dept 接口 ~13s，页面到齐数据才显示）
const appeared = await waitFor(async () =>
  (await page.evaluate(() =>
    [...document.querySelectorAll('.jeecg-layout-content input:not([type=hidden])')]
      .filter((i) => i.getBoundingClientRect().height > 0).length)) >= 5, 90000)
results.push(`A02 表单出现=${appeared ? '是' : '否(90s超时)'}`)
await page.screenshot({ path: shot('新增模型-02-表单出现') })

// 填写：流程标识 / 流程名称 / 流程分类
await page.locator('input[placeholder*="流程标识"]').first().fill(MODEL_KEY)
await page.locator('input[placeholder*="流程名称"]').first().fill(MODEL_NAME)
await openCategoryDropdown()
await page.waitForTimeout(2000)
await clickFirstDropdownItem(0)
await page.waitForTimeout(1000)
await page.screenshot({ path: shot('新增模型-03-填写完成') })
results.push(`A03 填写: key=${MODEL_KEY} name=${MODEL_NAME}`)

// 保存
await page.locator('button:has-text("保 存"), button:has-text("保存")').first().click()
const saved = await waitFor(async () => {
  const msg = await page.evaluate(() => document.body.innerText)
  return msg.includes('新建成功') || msg.includes('保存成功')
}, 30000)
await page.screenshot({ path: shot('新增模型-04-保存结果') })
results.push(`A04 保存成功提示=${saved ? '是' : '否'}`)

// 回列表验证新数据出现
await waitFor(async () => page.url().includes('/model'), 20000)
await page.goto(LIST, { waitUntil: 'domcontentloaded', timeout: 45000 })
const found = await waitFor(async () => {
  const txt = await page.evaluate(() => document.querySelector('.jeecg-layout-content')?.innerText || '')
  return txt.includes(MODEL_NAME)
}, 60000)
await page.screenshot({ path: shot('新增模型-05-列表出现新数据') })
results.push(`A05 列表出现新数据=${found ? '是' : '否'} (${MODEL_NAME})`)

// ===== 闭环 B：修改模型（用刚建的） =====
// 分组头快照（分类名+数量），用于断言"改分类后数据真的变了"
const groupSnapshot = () =>
  page.evaluate(() => {
    if (document.body.innerText.includes('正在加载')) return null
    const content = document.querySelector('.jeecg-layout-content')
    if (!content) return null
    return [...content.querySelectorAll('*')]
      .filter((e) => {
        if (e.children.length !== 0 || ['STYLE', 'SCRIPT', 'LINK'].includes(e.tagName)) return false
        const t = (e.innerText || '').trim()
        return t.length > 0 && t.length <= 60 && /（\d+）|\(\d+\)/.test(t)
      })
      .map((e) => e.innerText.trim().replace(/\s+/g, ''))
      .slice(0, 20)
  })

// 用搜索定位新模型所在行
const searchInput = page.locator('input[placeholder*="搜索流程"]').first()
if (await searchInput.count()) {
  await searchInput.fill(MODEL_NAME)
  await page.locator('button:has-text("搜索"), .el-icon:has(.el-icon-search)').first().click().catch(() => {})
  await page.waitForTimeout(8000)
}
// 找到目标行的"修改"
const row = page.locator(`[class*="table__body"] tr:has-text("${MODEL_NAME}")`).first()
const updBtn = row.locator('a:has-text("修改"), span:has-text("修改"), button:has-text("修改")').first()
await updBtn.click({ timeout: 15000 })
const updAppeared = await waitFor(async () =>
  (await page.evaluate(() =>
    [...document.querySelectorAll('.jeecg-layout-content input:not([type=hidden])')]
      .filter((i) => i.getBoundingClientRect().height > 0).length)) >= 5, 90000)
results.push(`B01 修改页表单回显出现=${updAppeared ? '是' : '否'}`)
const echoed = await page.evaluate((want) => {
  const inp = [...document.querySelectorAll('.jeecg-layout-content input')]
  return inp.some((i) => i.value === want)
}, MODEL_NAME)
await page.screenshot({ path: shot('修改模型-01-回显') })
results.push(`B01 回显值正确=${echoed ? '是' : '否'}（标识/名称修改态禁用为原版设计）`)

// 改分类（原版在修改态禁用标识/名称，可改的是分类等）并保存
const beforeGroups = await groupSnapshot()
await openCategoryDropdown()
await page.waitForTimeout(2000)
// 选一个与当前不同的项（第 2 项；第 1 项是当前值）
await clickFirstDropdownItem(1)
await page.waitForTimeout(1000)
await page.screenshot({ path: shot('修改模型-02-改分类后') })
await page.locator('button:has-text("保 存"), button:has-text("保存")').first().click()
const updSaved = await waitFor(async () => {
  const msg = await page.evaluate(() => document.body.innerText)
  return msg.includes('修改成功')
}, 30000)
await page.screenshot({ path: shot('修改模型-03-保存结果') })
results.push(`B02 修改保存成功提示=${updSaved ? '是' : '否'}`)

// 回列表验证分类分组计数变化
await page.goto(LIST, { waitUntil: 'domcontentloaded', timeout: 45000 })
const groupsChanged = await waitFor(async () => {
  const after = await groupSnapshot()
  return JSON.stringify(after) !== JSON.stringify(beforeGroups) ? after : null
}, 60000)
await page.screenshot({ path: shot('修改模型-04-列表分组计数变化') })
results.push(`B03 列表分组计数变化=${groupsChanged ? '是' : '否'}`)
results.push(`    改前分组: ${beforeGroups.join(' | ')}`)
if (groupsChanged) results.push(`    改后分组: ${groupsChanged.join(' | ')}`)

console.log(`===== [${ENV}] D1 闭环结果 =====`)
results.forEach((r) => console.log('  ' + r))
console.log(`console.error=${new Set(consoleErrs).size} pageerror=${new Set(pageErrors).size} 失败请求=${new Set(failedReqs).size} 最终iframe=${await iframes()}`)
;[...new Set(consoleErrs)].slice(0, 5).forEach((e) => console.log('  ERR: ' + e))
;[...new Set(pageErrors)].slice(0, 5).forEach((e) => console.log('  PE: ' + e))
;[...new Set(failedReqs)].slice(0, 5).forEach((e) => console.log('  REQ: ' + e))
await browser.close()
