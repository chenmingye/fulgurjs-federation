// 遗留3/遗留4 基础脚本：隐藏/带参路由页 带真实数据 导航+截图+断言（数据驱动，dev/prod 参数化）
// 用法：VBASE=http://localhost:8773 VTAG=dev node pending-routes-shot.mjs
//       VBASE=http://localhost:8662 VTAG=prod node pending-routes-shot.mjs
// 环境要求：dev 冷启动先预热一轮再跑（见交接清单环境坑 4）
import { chromium } from '@playwright/test'
import fs from 'node:fs'

const BASE = process.env.VBASE || 'http://localhost:8773'
const TAG = process.env.VTAG || 'dev'
const SHOT_DIR = '/Users/Admin/Desktop/ai 杂物/插件/fulgur-federation/docs/screenshots/migration1-dev'
const RESULT = `${SHOT_DIR}/t6-${TAG}-routes-result.json`
const PROFILE = `/tmp/fulgur-routes-${TAG}-${Date.now()}`

const browser = await chromium.launchPersistentContext(PROFILE, {
  headless: true,
  args: ['--no-proxy-server'],
  viewport: { width: 1600, height: 900 },
})
const page = browser.pages()[0]
const errors = []
page.on('pageerror', (e) => errors.push('[pageerror] ' + String(e).slice(0, 200)))

// ---- 登录 + 拿 token（persistent localStorage）----
await page.goto(`${BASE}/main/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(8000)
await page.locator('input[placeholder*="账号"], input[placeholder*="用户名"]').first().fill('admin')
await page.locator('input[type="password"]').first().fill('Demo@123456')
await page.locator('button:has-text("登 录"), button:has-text("登录")').first().click()
await page.waitForTimeout(8000)
// 等应用完全稳定（登录后仍有异步导航会毁掉 evaluate 上下文）
await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {})
await page.waitForTimeout(3000)

/** 页面上下文内带 token 的 GET（evaluate 被导航打断时重试一次） */
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

// ---- 真实数据 ----
const models = (await api('/demo/bpm/model/list'))?.data ?? []
const bizModel = models.find((m) => !String(m.key).startsWith('amis_fed'))
const forms = ((await api('/demo/bpm/form/page?pageNo=1&pageSize=10'))?.data?.records ?? (await api('/demo/bpm/form/page?pageNo=1&pageSize=10'))?.data?.list ?? []).slice(0)
const instRes = (await api('/demo/bpm/process-instance/manager-page?pageNo=1&pageSize=10')) ?? {}
const instances = instRes?.data?.records ?? instRes?.data?.list ?? instRes?.result?.records ?? []
const bizInstance = instances.find((i) => i.id) ?? instances[0]
console.log('real data:', JSON.stringify({ modelId: bizModel?.id, formId: forms[0]?.id, instanceId: bizInstance?.id }))

/** 逐页导航+截图；assertFn 返回 {pass, note} */
const shoot = async (name, route, assertTexts = [], expectedBlank = false) => {
  errors.length = 0
  await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {})
  await page.waitForTimeout(9000)
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png` })
  const text = await page.locator('body').innerText().catch(() => '')
  const iframes = await page.locator('iframe').count()
  const missing = assertTexts.filter((t) => !text.includes(t))
  const result = {
    route,
    iframe: iframes,
    pass: expectedBlank ? true : missing.length === 0,
    expectedBlank,
    missing,
    pageErrors: errors.slice(0, 3),
    textLen: text.trim().length,
  }
  console.log(name, JSON.stringify(result))
  return [name, result]
}

const results = {}
const jobs = [
  // [输出名, 宿主路由, 断言文本]
  ['t6-06-detail', `/flowable/bpm/process-instance/detail?id=${bizInstance?.id ?? ''}`, ['流程详情']],
  ['t6-07-action', `/flowable/bpm/manager/action?processsKey=demo_leave`, ['流程']],["t6-21b-report-key", `/flowable/bpm/process-instance/report?processDefinitionId=demo_leave:4:a6d74466-984b-11f0-b657-f8e43be98cda&processDefinitionKey=demo_leave`, []],
  ['t6-09-form-list', '/flowable/bpm/manager/form', ['表单']],
  ['t6-16-model-create', '/flowable/bpm/manager/model/create', []],
  ['t6-17-form-edit', `/flowable/bpm/manager/form/edit?type=update&id=${forms[0]?.id ?? ''}`, []],
  ['t6-18-model-update', `/flowable/bpm/manager/model/update/${bizModel?.id ?? ''}`, []],
  ['t6-19-model-copy', `/flowable/bpm/manager/model/copy/${bizModel?.id ?? ''}`, []],
  ['t6-20-definition', '/flowable/bpm/manager/definition', ['流程']],
  
  ['t6-25-moduleDesign', '/lowcode/lowdev/moduleDesign', [], true],
]
for (const [name, route, texts] of jobs) {
  try {
    const [n, r] = await shoot(name, route, texts)
    results[n] = r
  } catch (e) {
    results[name] = { route, error: String(e).slice(0, 150) }
  }
}
fs.writeFileSync(RESULT, JSON.stringify({ base: BASE, tag: TAG, data: { modelId: bizModel?.id, formId: forms[0]?.id, instanceId: bizInstance?.id }, results }, null, 2))
console.log('RESULT_SAVED:', RESULT)
await browser.close()
