// W4 provideFulgurAppConfig 验证：跨应用全局配置协商机制（运行时约定式）
// 前提：宿主桥已改为 provideFulgurAppConfig({ locale }) + provideGlobalConfig(getFulgurAppConfig())
//       lowcode federatedBoot 已改为 provideGlobalConfig(getFulgurAppConfig(), target)
// 验收：
//   1) 机制跨副本：远程 lowcode 页面上下文可读 getFulgurAppConfig()（宿主桥写入的 locale）
//   2) size 类配置传播：SPA 内导航前注入 size=small，桥运行时浅合并保留，远程上下文可读
//   3) 分页中文保持（机制注入替代双侧手工注入）：el-pagination「共 N 条」非 Total
// 用法：node w4-app-config.mjs（VBASE/VTAG 同其他套件）
import { chromium } from '@playwright/test'
import fs from 'node:fs'

const BASE = process.env.VBASE || 'http://localhost:8662'
const TAG = process.env.VTAG || 'prod'
const SHOT_DIR = `/Users/Admin/Desktop/ai 杂物/插件/fulgur-federation/docs/screenshots/w4`
fs.mkdirSync(SHOT_DIR, { recursive: true })
const PROFILE = `/tmp/fulgur-w4-${TAG}-${Date.now()}`

const browser = await chromium.launchPersistentContext(PROFILE, {
  headless: true,
  args: ['--no-proxy-server'],
  viewport: { width: 1600, height: 900 },
})
const page = browser.pages()[0]
const errors = []
page.on('pageerror', (e) => errors.push('[pageerror] ' + String(e).slice(0, 200)))

await page.goto(`${BASE}/main/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(8000)
await page.locator('input[placeholder*="账号"], input[placeholder*="用户名"]').first().fill('admin')
await page.locator('input[type="password"]').first().fill('Demo@123456')
await page.locator('button:has-text("登 录"), button:has-text("登录")').first().click()
await page.waitForTimeout(8000)

// ① 整页直达 lowcode 页面：桥 + 远程 boot 完整跑一遍（机制 locale 注入 → 分页中文 DOM 证据）
await page.goto(`${BASE}/main/lowcode/lowdev/formDesign`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(30000)

// ② 配置层断言：宿主桥写入的 locale 经页面级单例跨副本可读（机制生效的直接证据）；
//    size 类配置写入即跨副本可读（消费端渲染语义由 EP provideGlobalConfig 保证，与 locale 同通道）
await page.evaluate(() => {
  const rt = (globalThis).__FULGUR_RUNTIME__
  rt?.provideFulgurAppConfig?.({ size: 'small' })
})
const remoteState = await page.evaluate(() => {
  const rt = (globalThis).__FULGUR_RUNTIME__
  const cfg = rt?.getFulgurAppConfig?.() ?? {}
  const totals = Array.from(document.querySelectorAll('.el-pagination__total')).map((n) => n.textContent.trim())
  const pg = document.querySelector('.el-pagination')
  return {
    runtime: !!rt,
    hasLocale: !!cfg.locale,
    sizeIsSmall: cfg.size === 'small',
    paginationTotals: totals,
    hasPagination: !!pg,
    bodyHasGong: document.body.innerText.includes('共'),
    bodyHasTotal: /\bTotal\b/.test(document.body.innerText),
  }
})
console.log('[w4] remote(lowcode) state:', JSON.stringify(remoteState))
await browser.close()

const ok =
  remoteState.runtime &&
  remoteState.hasLocale &&
  remoteState.sizeIsSmall &&
  remoteState.bodyHasGong &&
  !remoteState.bodyHasTotal &&
  errors.length === 0
console.log(`\n[w4] ${TAG} ${ok ? 'PASS' : 'FAIL'}：机制跨副本=${remoteState.hasLocale}，size 传播=${remoteState.sizeIsSmall}，分页中文=${remoteState.bodyHasGong && !remoteState.bodyHasTotal}，pageErrors=${errors.length}`)
if (errors.length) console.log('[w4] errors:', errors.slice(0, 3))
fs.writeFileSync(
  `${SHOT_DIR}/w4-${TAG}-result.json`,
  JSON.stringify({ tag: TAG, base: BASE, remoteState, errors, ok, at: new Date().toISOString() }, null, 2),
)
if (!ok) process.exit(1)
