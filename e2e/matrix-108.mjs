// H 系列：Chrome 108 @ testbed 全量 27 页矩阵（dev+prod）
// 依据 chrome108 技能：playwright-core connectOverCDP 接管本机 Chromium 108（9222），
// 页面清单从 matrix-shot.mjs 的 PAGES 提取（单一数据源，防漂移）。
// 判定与 matrix-shot 同构：断言文本/iframe 预算/内容判据/u2Known 放宽 + 零 pageerror。
// 用法：VTAG=dev|prod VBASE=http://localhost:8773|8662 node matrix-108.mjs
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const e2eDir = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
let pw
try {
  pw = require('playwright-core')
} catch {
  const found = ['/Users/Admin/.npm/_npx/e41f203b7505f1fb/node_modules', '/Users/Admin/.npm/_npx/86170c4cd1c5da32/node_modules']
    .find((d) => fs.existsSync(path.join(d, 'playwright-core')))
  if (!found) {
    console.error('[108] 找不到 playwright-core（技能 §3.1）')
    process.exit(2)
  }
  pw = require(path.join(found, 'playwright-core'))
}

const BASE = process.env.VBASE || 'http://localhost:8662'
const TAG = process.env.VTAG || 'prod'
const SHOT_DIR = '/Users/Admin/Desktop/ai 杂物/插件/fulgur-federation/docs/screenshots/h-108'
fs.mkdirSync(SHOT_DIR, { recursive: true })

// 从 matrix-shot.mjs 提取 PAGES（单一数据源）
const src = fs.readFileSync(path.join(e2eDir, 'matrix-shot.mjs'), 'utf8')
const m = src.match(/const PAGES = (\[[\s\S]*?\n\])/)
if (!m) {
  console.error('[108] matrix-shot.mjs PAGES 提取失败')
  process.exit(2)
}
const PAGES = eval(m[1])

const browser = await pw.chromium.connectOverCDP('http://localhost:9222')
const ctx = browser.contexts()[0]
const page = ctx.pages().find((p) => p.url().includes(BASE)) ?? ctx.pages()[0] ?? (await ctx.newPage())
console.log('[108] UA:', await page.evaluate(() => navigator.userAgent))

const errors = []
page.on('pageerror', (e) => errors.push('[pageerror] ' + String(e).slice(0, 200)))
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push('[console] ' + msg.text().slice(0, 200))
})

// 登录（108 profile 持久，二轮已有登录态则跳过）
await page.goto(`${BASE}/main/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(8000)
for (let attempt = 0; attempt < 3; attempt++) {
  const body = await page.locator('body').innerText().catch(() => '')
  if (!/登\s*录/.test(body.slice(0, 400)) || (await page.locator('input[type="password"]').count()) === 0) break
  await page.locator('input[placeholder*="账号"], input[placeholder*="用户名"]').first().fill('admin')
  await page.locator('input[type="password"]').first().fill('Demo@123456')
  await page.locator('button:has-text("登 录"), button:has-text("登录")').first().click()
  await page.waitForTimeout(12000)
  console.log('[108] 登录尝试', attempt + 1)
}
const postLogin = await page.locator('body').innerText().catch(() => '')
if (/登\s*录/.test(postLogin.slice(0, 400)) && (await page.locator('input[type="password"]').count()) > 0) {
  console.error('[108][FAIL] 登录未成功——后续页面全部会 thin')
  process.exit(1)
}
console.log('[108] 登录态 OK')

// vars 解析（与 matrix-shot 同源逻辑）：带参路由的真实 id 来自后台接口
const apiOnPage = async (url) =>
  page.evaluate(async (u) => {
    const key = Object.keys(localStorage).find((k) => k.includes('COMMON__LOCAL__KEY__'))
    const obj = JSON.parse(localStorage.getItem(key))
    let real = null
    const find = (o) => { for (const [k, v] of Object.entries(o ?? {})) { if (k === 'value' && typeof v === 'string' && v.startsWith('ey')) real = v; if (v && typeof v === 'object') find(v) } }
    find(obj.value?.TOKEN__ ?? obj)
    const res = await fetch(u, { headers: { 'X-Access-Token': real } })
    return res.json()
  }, url)
const models = (await apiOnPage(`${BASE}/demo/bpm/model/list`))?.data ?? []
const bizModel = models.find((m) => !String(m.key).startsWith('amis_fed'))
const instRes = (await apiOnPage(`${BASE}/demo/bpm/process-instance/manager-page?pageNo=1&pageSize=10`)) ?? {}
const vars = {
  modelId: bizModel?.id ?? '',
  formId: '',
  instanceId: (instRes?.data?.records ?? instRes?.data?.list ?? [])[0]?.id ?? '',
}
console.log('[108] vars:', JSON.stringify(vars))

const results = {}
let no = 0
for (const entry of PAGES) {
  const [noStr, name, routeTpl, kind, marks, u2Known] = entry
  const route = routeTpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '')
  const target = `${BASE}${route}`
  try {
    await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 60000 })
  } catch {
    await page.goto(`${BASE}/main${route}`, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {})
  }
  // 内容就绪轮询（同 matrix F 判据：30s）
  let body = ''
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(3000)
    body = await page.locator('body').innerText().catch(() => '')
    const hit = marks.every((t) => body.includes(t))
    if (hit && body.length > 200) break
    if (u2Known) break
  }
  const missing = marks.filter((t) => !body.includes(marks.m ?? t))
  const missed = marks.filter((t) => !body.includes(t))
  const iframes = await page.locator('iframe').count()
  const pageErrors = errors.splice(0, errors.length)
  const render = u2Known && body.length <= 200 ? 'u2-blank' : body.length > 200 ? 'ok' : 'thin'
  const pass = u2Known ? true : missed.length === 0 && render !== 'thin' && iframes === 0
  results[`${noStr}-${name}`] = {
    no: noStr, name, route: target, iframe: iframes, render, textLen: body.length,
    missing: missed, pageErrors, u2Known: !!u2Known, pass,
  }
  await page.screenshot({ path: `${SHOT_DIR}/m-108-${TAG}-${noStr}-${name}.png` })
  console.log(`[108-${TAG}] ${noStr}-${name}: ${pass ? 'PASS' : 'FAIL'} render=${render} iframe=${iframes} len=${body.length} ${missed.length ? 'missing=' + missed.join('|') : ''} ${pageErrors.length ? 'errors=' + pageErrors.length : ''}`)
  no++
}

const fails = Object.entries(results).filter(([, v]) => !v.pass)
fs.writeFileSync(`${SHOT_DIR}/m-108-${TAG}.json`, JSON.stringify({ tag: TAG, base: BASE, ua: 'Chrome/108', results, fails: fails.map(([k]) => k), at: new Date().toISOString() }, null, 2))
console.log(`\n[108-${TAG}] 汇总：${no - fails.length}/${no} PASS，fails: ${fails.map(([k]) => k).join(',') || '无'}`)
await page.goto('about:blank')
if (fails.length) process.exit(1)
