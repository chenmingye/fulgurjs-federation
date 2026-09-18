// H 系列：非 admin 视角验证——受限账号 fulgurjs-test（YSZJ100 项目负责人角色）登录联邦站点
// 验收：登录成功、关键联邦页面渲染不崩（内容可为空/受限，但不允许白屏报错组件/pageerror）、
//       免登录 fulgur-demo 可用；截图留证
import { chromium } from '@playwright/test'
import fs from 'node:fs'

const BASE = process.env.VBASE || 'http://localhost:8662'
const TAG = process.env.VTAG || 'prod'
const SHOT_DIR = '/Users/Admin/Desktop/ai 杂物/插件/fulgur-federation/docs/screenshots/h-nonadmin'
fs.mkdirSync(SHOT_DIR, { recursive: true })
const PROFILE = `/tmp/fulgur-nonadmin-${TAG}-${Date.now()}`

const browser = await chromium.launchPersistentContext(PROFILE, {
  headless: true,
  args: ['--no-proxy-server'],
  viewport: { width: 1600, height: 900 },
})
const page = browser.pages()[0]
const errors = []
page.on('pageerror', (e) => errors.push('[pageerror] ' + String(e).slice(0, 200)))

// fulgurjs-test 登录
await page.goto(`${BASE}/main/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(8000)
await page.locator('input[placeholder*="账号"], input[placeholder*="用户名"]').first().fill('fulgurjs-test')
await page.locator('input[type="password"]').first().fill('Fulgur@Test2026')
await page.screenshot({ path: `${SHOT_DIR}/h-nonadmin-${TAG}-01-登录页.png` })
await page.locator('button:has-text("登 录"), button:has-text("登录")').first().click()
await page.waitForTimeout(10000)
const loggedIn = await page.evaluate(() => document.body.innerText.includes('fulgurjs-test') || document.body.innerText.includes('联邦测试受限账号') || !document.body.innerText.includes('登录'))
await page.screenshot({ path: `${SHOT_DIR}/h-nonadmin-${TAG}-02-登录后首页.png` })
console.log('[non-admin] 登录态:', loggedIn)

const pages = [
  ['待办任务', '/main/flowable/bpm/task/todo', []],
  ['我的流程', '/main/flowable/bpm/task/my', []],
  ['表单设计(lowcode)', '/main/lowcode/lowdev/formDesign', []],
  ['模块设计(lowcode)', '/main/lowcode/lowdev/moduleDesign', []],
  ['审批操作', '/main/flowable/bpm/manager/action?processsKey=demo_leave', []],
]
const results = []
let idx = 3
for (const [name, path] of pages) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(18000)
  const st = await page.evaluate(() => {
    const errBox = [...document.querySelectorAll('div')].some((d) => /联邦页面加载失败/.test(d.textContent || ''))
    return {
      textLen: document.body.innerText.length,
      errBox,
      // 页面有真实内容（表格行/按钮/卡片任一）或诚实空态都算渲染成功
      hasUi: document.querySelectorAll('button, .el-table, .avue-crud, .el-empty, .vxe-table').length > 0,
    }
  })
  await page.screenshot({ path: `${SHOT_DIR}/h-nonadmin-${TAG}-${String(idx).padStart(2, '0')}-${name}.png` })
  results.push({ name, ...st })
  console.log(`[non-admin] ${name}: textLen=${st.textLen} errBox=${st.errBox} hasUi=${st.hasUi} pageErrors+=${errors.length}`)
  idx++
}

// 免登录演示页（ignoreAuth，无需登录态的新 context）
const ctx2 = await browser.newPage()
await ctx2.goto(`${BASE}/main/fulgur-demo`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await ctx2.waitForTimeout(12000)
const demoOk = await ctx2.evaluate(() => document.body.innerText.length > 100 && !/联邦页面加载失败/.test(document.body.innerText))
await ctx2.screenshot({ path: `${SHOT_DIR}/h-nonadmin-${TAG}-99-fulgur-demo.png` })
await ctx2.close()
console.log('[non-admin] fulgur-demo(免登录):', demoOk)

await browser.close()
// 受限账号数据为空属预期（菜单/数据受角色裁剪）——判据 = 页面壳渲染成功（>60 字符）
// + 无联邦错误框 + 有 UI 元素（表格/空态/按钮）+ 免登录 demo 可用 + 零 pageerror
const ok = loggedIn && results.every((r) => r.textLen > 60 && !r.errBox && r.hasUi) && demoOk && errors.length === 0
console.log(`\n[non-admin] ${TAG} ${ok ? 'PASS' : 'FAIL'}：受限账号全页面渲染正常（无错误框/无 pageerror），demo 免登录可用`)
if (errors.length) console.log('[non-admin] errors:', errors.slice(0, 3))
fs.writeFileSync(
  `${SHOT_DIR}/h-nonadmin-${TAG}-result.json`,
  JSON.stringify({ tag: TAG, loggedIn, results, demoOk, errors, ok, at: new Date().toISOString() }, null, 2),
)
if (!ok) process.exit(1)
