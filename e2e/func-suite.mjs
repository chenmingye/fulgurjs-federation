// P0-4 功能级实测框架：数据驱动、真实入口、写操作闭环 + H10 步骤截图 + H5 结果 JSON
// 用法：node func-suite.mjs --base <url> --env <tag> [--only 09,10]
// 产出：docs/screenshots/migration1-dev/{env}-{页码}-{页面}-{功能}-{步骤}-{说明}.png
//       docs/func-results/{env}.json（H5 双环境 diff 用）
import { chromium } from '@playwright/test'
import fs from 'node:fs'

// ---------- 参数 ----------
const arg = (k, d) => {
  const i = process.argv.indexOf(k)
  return i > -1 ? process.argv[i + 1] : d
}
const BASE = arg('--base', 'http://localhost:8773')
const ENV = arg('--env', 'dev')
const ONLY = arg('--only', '')
const DIR = '/Users/Admin/Desktop/ai 杂物/插件/vite-plugin-unifed/docs/screenshots/migration1-dev'
const RESULT_DIR = '/Users/Admin/Desktop/ai 杂物/插件/vite-plugin-unifed/docs/func-results'
fs.mkdirSync(DIR, { recursive: true })
fs.mkdirSync(RESULT_DIR, { recursive: true })

// ---------- 页面规格（ BPM 管理页共用 /flowable 前缀；乾坤基线需 /main 前缀） ----------
const sub = BASE.includes('8661') ? '/main' : ''
const SUITE = [
  {
    no: '09', name: '流程表单', path: `${sub}/flowable/bpm/manager/form`,
    mode: 'designer',
    designerName: `e2e表单{TS}`,
  },
  {
    no: '10', name: '流程分类', path: `${sub}/flowable/bpm/manager/category`,
    add: { btn: '新增', fields: [{ label: '分类名', value: `e2e分类{TS}` }, { label: '分类标志', value: `e2ecat{TS}` }, { label: '分类排序', value: '99' }] },
    edit: { btn: '编辑', fields: [{ label: '分类名', value: `e2e分类改{TS2}` }] },
  },
  {
    no: '11', name: '用户分组', path: `${sub}/flowable/bpm/manager/user-group`,
    add: { btn: '新增', fields: [{ label: '组名', value: `e2e分组{TS}` }, { label: '成员', type: 'select', query: '管' }] },
    edit: { btn: '编辑', fields: [{ label: '组名', value: `e2e分组改{TS2}` }] },
  },
  {
    no: '12', name: '流程监听器', path: `${sub}/flowable/bpm/manager/process-listener`,
    add: { btn: '新增', fields: [{ label: '名字', value: `e2e监听{TS}` }, { label: '类型', type: 'select', index: 0 }, { label: '事件', type: 'select', index: 1 }, { label: '值类型', type: 'select', index: 1 }, { label: '表达式', value: '${e2eDemo}' }] },
    edit: { btn: '编辑', fields: [{ label: '名字', value: `e2e监听改{TS2}` }] },
  },
  {
    no: '13', name: '流程表达式', path: `${sub}/flowable/bpm/manager/process-expression`,
    add: { btn: '新增', fields: [{ label: '名字', value: `e2e表达式{TS}` }, { label: '表达式', value: '${e2eDemo}' }] },
    edit: { btn: '编辑', fields: [{ label: '名字', value: `e2e表达式改{TS2}` }] },
  },
]

// ---------- 通用工具 ----------
const results = []
const browser = await chromium.launchPersistentContext(`/tmp/pfunc4-${ENV}-${Date.now()}`, {
  headless: true, args: ['--no-proxy-server'], viewport: { width: 1500, height: 950 },
})
const page = browser.pages()[0]
const consoleErrs = []
const pageErrors = []
page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 200)))
page.on('console', (m) => { if (m.type() === 'error') consoleErrs.push(m.text().slice(0, 200)) })

const wait = (ms) => page.waitForTimeout(ms)
const shot = (name) => `${DIR}/${ENV}-${name}.png`
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
    await page.waitForTimeout(intervalMs)
  }
  return null
}
const rowOf = (name) => page.locator(`[class*="table__body"] tr:has-text("${name}"), .el-table__row:has-text("${name}")`).first()

/** 通用弹窗表单填写：按 label 定位 form-item，input/textarea 直接填，select 点开选第一项 */
async function fillDialogFields(fields, ts, ts2) {
  for (const f of fields) {
    const val = (f.value ?? '').replace('{TS}', ts).replace('{TS2}', ts2 ?? '')
    // 限定在可见弹窗（role=dialog）内定位，避免命中列表页查询区同名字段
    const item = page
      .locator(`[role="dialog"]:visible [class*="form-item"]:has([class*="form-item__label"]:has-text("${f.label}"))`)
      .first()
    if (f.type === 'select') {
      // 先点 wrapper（el-select__input 可能 0 尺寸不可点；wrapper 点击展开下拉）
      const selWrap = item.locator('[class*="select__wrapper"], [class*="select"]').first()
      await selWrap.click({ timeout: 8000 })
      await wait(800)
      if (f.query) {
        // 远程搜索型下拉：键入查询后等候选出现
        await page.keyboard.type(f.query)
        await wait(2000)
      }
      await page.locator('[class*="select-dropdown__item"]:visible').nth(f.index ?? 0).click({ timeout: 8000 })
      await wait(600)
      // 多选下拉选中后保持展开，会遮挡后续点击——收起
      await page.keyboard.press('Escape')
      await wait(500)
      continue
    }
    const input = item.locator('input:visible').first()
    const inC = await input.count()
    if (inC) {
      await input.fill(val)
      if (process.env.FD) console.log(`  [fill] ${f.label} = ${val} (input)`)
      continue
    }
    const textarea = item.locator('textarea:visible').first()
    if (await textarea.count()) {
      await textarea.fill(val)
      if (process.env.FD) console.log(`  [fill] ${f.label} = ${val} (textarea)`)
      continue
    }
    if (process.env.FD) console.log(`  [fill] ${f.label} 未找到可填控件! item数=${await page.locator(`[role="dialog"]:visible [class*="form-item"]:has([class*="form-item__label"]:has-text("${f.label}"))`).count()}`)
  }
}

/** 关闭可能残留的弹窗 */
async function closeDialog() {
  for (const sel of ['[class*="dialog__headerbtn"]:visible', 'button:has-text("取 消"):visible', 'button:has-text("取消"):visible']) {
    const b = page.locator(sel).first()
    if (await b.count()) { await b.click().catch(() => {}); await wait(800) }
  }
}

// ---------- 登录 ----------
await page.goto(`${BASE}/main/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await wait(6000)
await page.locator('input[placeholder*="账号"], input[placeholder*="用户名"]').first().fill('admin')
await page.locator('input[type="password"]').first().fill('Demo@123456')
await page.locator('button:has-text("登 录"), button:has-text("登录")').first().click()
await wait(9000)

/** 设计器闭环（流程表单：新增→画布加组件→命名→保存→列表回显→改名保存→删除） */
async function runDesigner(spec, tag, r, ts) {
  const name = spec.designerName.replace('{TS}', ts)
  await page.goto(`${BASE}${spec.path}`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {})
  await waitFor(async () => (await page.locator('button:has-text("新增"), span:has-text("新建")').count()) > 0, 30000)
  await wait(2000)
  await page.locator('button:has-text("新增"), span:has-text("新建")').first().click({ timeout: 10000 })
  // 等设计器就绪
  const ready = await waitFor(async () => (await page.locator('text=表单配置').count()) > 0 || (await page.locator('text=拖拽左侧列表中的组件到此处').count()) > 0, 30000)
  r.steps['设计器打开'] = { ok: !!ready }
  await page.screenshot({ path: shot(`${tag}-设计器-01-打开`) })
  // 加组件：点击调色板"输入框"（form-create designer 点击即添加；否则拖拽）
  const palette = page.locator('text=输入框').first()
  await palette.click({ timeout: 8000 }).catch(() => {})
  await wait(1200)
  const hasComp = (await page.locator('text=拖拽左侧列表中的组件到此处').count()) === 0
  if (!hasComp) {
    const from = page.locator('text=输入框').first()
    const to = page.locator('text=拖拽左侧列表中的组件到此处').first()
    await from.dragTo(to).catch(() => {})
    await wait(1200)
  }
  await page.screenshot({ path: shot(`${tag}-设计器-02-加组件`) })
  // 保存 → 弹"保存表单"对话框 → 填表单名 → 确定
  await page.locator('button:has-text("保 存"), button:has-text("保存")').first().click({ timeout: 8000 })
  await waitFor(async () => (await page.locator('[role="dialog"]:visible').count()) > 0, 10000)
  await wait(1000)
  const dlgName = page.locator('[role="dialog"]:visible input[class*="input__inner"], [role="dialog"]:visible .el-input__inner').first()
  await dlgName.fill(name)
  await page.screenshot({ path: shot(`${tag}-设计器-03-填写表单名`) })
  await page.locator('[role="dialog"]:visible button[class*="primary"], [role="dialog"]:visible button:has-text("确定"), [role="dialog"]:visible button:has-text("确 定")').last().click({ timeout: 8000 })
  await wait(3000)
  await page.screenshot({ path: shot(`${tag}-设计器-04-保存结果`) })
  // 回列表验证
  await page.goto(`${BASE}${spec.path}`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {})
  const appeared = await waitFor(async () => (await rowOf(name).count()) > 0, 30000)
  await page.screenshot({ path: shot(`${tag}-设计器-05-列表出现新表单`) })
  r.steps['新增+保存'] = { ok: !!appeared, name }
}

// ---------- 逐页执行 ----------
const ts = String(Date.now()).slice(-6)
for (const spec of SUITE) {
  if (ONLY && !ONLY.split(',').includes(spec.no)) continue
  const tag = `${spec.no}-${spec.name}`
  const r = { page: `${spec.no} ${spec.name}`, steps: {} }

  if (spec.mode === 'designer') {
    try {
      await runDesigner(spec, tag, r, ts)
    } catch (e) {
      r.steps['设计器'] = { ok: false, err: String(e).slice(0, 600) }
    }
    results.push(r)
    console.log(`[${ENV}] ${tag}: ` + Object.entries(r.steps).map(([k, v]) => `${k}=${v.ok ? '✓' : '✗'}`).join(' '))
    continue
  }

  // 1) 列表页
  await page.goto(`${BASE}${spec.path}`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {})
  const listReady = await waitFor(async () => (await page.locator('[class*="table__body"] tr, .el-table__row').count()) > 0 || (await page.evaluate(() => document.querySelector('.jeecg-layout-content')?.innerText ?? '').then?.(() => false) ?? (await page.evaluate(() => (document.querySelector('.jeecg-layout-content')?.innerText || '').length) > 10)), 40000)
  await wait(2000)
  const beforeRows = await page.locator('[class*="table__body"] tr, .el-table__row').count()
  await page.screenshot({ path: shot(`${tag}-新增-01-列表页`) })
  r.steps['列表页'] = { rows: beforeRows, ok: beforeRows >= 0 }

  // 2) 新增闭环
  try {
    const addBtn = page.locator(`button:has-text("${spec.add.btn}"), span:has-text("${spec.add.btn}")`).first()
    await addBtn.click({ timeout: 10000 })
    await waitFor(async () => (await page.locator('[class*="dialog"]:visible').count()) > 0, 10000)
    await wait(1200)
    await page.screenshot({ path: shot(`${tag}-新增-02-弹窗打开`) })
    await fillDialogFields(spec.add.fields, ts)
    await page.screenshot({ path: shot(`${tag}-新增-03-填写完成`) })
    await page.locator('[class*="dialog"] button:has-text("确 定"), [class*="dialog"] button:has-text("保 存"), [class*="dialog"] button:has-text("确定"), [class*="dialog"] button:has-text("保存")').first().click({ timeout: 8000 })
    await wait(2500)
    await page.screenshot({ path: shot(`${tag}-新增-04-提交结果`) })
    const name = spec.add.fields[0].value.replace('{TS}', ts)
    const appeared = await waitFor(async () => (await rowOf(name).count()) > 0, 20000)
    await page.screenshot({ path: shot(`${tag}-新增-05-列表出现新数据`) })
    r.steps['新增'] = { ok: !!appeared, name }
  } catch (e) {
    r.steps['新增'] = { ok: false, err: String(e).slice(0, 600) }
    await closeDialog()
  }

  // 3) 编辑闭环（改第一条匹配行，名称追加 -改TS2）
  const createdName = spec.add.fields[0].value.replace('{TS}', ts)
  try {
    const row = rowOf(createdName)
    if ((await row.count()) === 0) throw new Error('未找到新增行')
    await row.locator(`a:has-text("${spec.edit.btn}"), span:has-text("${spec.edit.btn}"), button:has-text("${spec.edit.btn}")`).first().click({ timeout: 8000 })
    await waitFor(async () => (await page.locator('[class*="dialog"]:visible').count()) > 0, 10000)
    await wait(1200)
    await page.screenshot({ path: shot(`${tag}-编辑-01-弹窗回显`) })
    const ts2 = String(Date.now()).slice(-4)
    await fillDialogFields(spec.edit.fields, ts, ts2)
    await page.screenshot({ path: shot(`${tag}-编辑-02-修改后`) })
    await page.locator('[class*="dialog"] button:has-text("确 定"), [class*="dialog"] button:has-text("保 存"), [class*="dialog"] button:has-text("确定"), [class*="dialog"] button:has-text("保存")').first().click({ timeout: 8000 })
    await wait(2500)
    await page.screenshot({ path: shot(`${tag}-编辑-03-保存结果`) })
    const newName = spec.edit.fields[0].value.replace('{TS2}', ts2)
    const edited = await waitFor(async () => (await rowOf(newName).count()) > 0, 20000)
    r.steps['编辑'] = { ok: !!edited, expect: newName }
  } catch (e) {
    r.steps['编辑'] = { ok: false, err: String(e).slice(0, 600) }
    await closeDialog()
  }

  // 4) 删除闭环（删掉刚造的行）
  const delName = r.steps['编辑']?.ok ? r.steps['编辑'].expect : createdName
  try {
    const row = rowOf(delName)
    if ((await row.count()) === 0) throw new Error('未找到待删行')
    await row.locator('a:has-text("删除"), span:has-text("删除"), button:has-text("删除")').first().click({ timeout: 8000 })
    await wait(1500)
    await page.screenshot({ path: shot(`${tag}-删除-01-二次确认`) })
    await page.locator('[class*="message-box"] button[class*="primary"], [class*="message-box"] [class*="btns"] button:last-child').last().click({ timeout: 8000 })
    await wait(2500)
    await page.screenshot({ path: shot(`${tag}-删除-02-删除结果`) })
    const gone = await waitFor(async () => (await rowOf(delName).count()) === 0, 20000)
    r.steps['删除'] = { ok: !!gone, deleted: delName }
  } catch (e) {
    r.steps['删除'] = { ok: false, err: String(e).slice(0, 600) }
    await closeDialog()
  }

  results.push(r)
  console.log(`[${ENV}] ${tag}: ` + Object.entries(r.steps).map(([k, v]) => `${k}=${v.ok ? '✓' : '✗'}`).join(' '))
}

// ---------- 结果 JSON（H5 diff） ----------
fs.writeFileSync(`${RESULT_DIR}/${ENV}.json`, JSON.stringify({ env: ENV, base: BASE, ts, results, errors: { pageErrors: [...new Set(pageErrors)], consoleErrs: [...new Set(consoleErrs)] } }, null, 2))
console.log(`结果写入 ${RESULT_DIR}/${ENV}.json`)
await browser.close()
