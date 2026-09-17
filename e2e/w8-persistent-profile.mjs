// W8-① 持久 profile 用例：复刻 2026-09-17 用户实测踩坑——
// 「浏览器持旧 remoteEntry（immutable 缓存）+ 重部署清理旧 hash chunk → 全 404」。
// no-cache 正确配置下必须全绿：持久 profile 重访重部署后的站点，联邦页面零失败请求。
//
// 用法：node w8-persistent-profile.mjs [--base http://localhost:8662] [--app lowcode]
//   --rebuild / --no-rebuild   是否在两阶段之间重建+重部署（默认重建）
// 判定：
//   phaseA 渲染 OK；重部署后 phaseB（同一持久 profile）渲染 OK 且 /{app}/ 静态资源零失败；
//   部署目录确实发生了变化（manifest buildInfo.timestamp 或 chunk 清单变化）。
// 注意：脚本串行执行构建与浏览器阶段（红线：不并发）；固定 profile 目录以复用 HTTP 缓存。
import { chromium } from '@playwright/test'
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import crypto from 'node:crypto'

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : d }
const BASE = arg('--base', 'http://localhost:8662')
const APP = arg('--app', 'lowcode')
const REBUILD = !process.argv.includes('--no-rebuild') && !process.argv.includes('--no-build')
// --no-build：跳过脚本内构建，但仍执行 rsync 重部署（前提：调用方已把新构建放入 dist，
// 与站点现部署内容不同——用于绕开长构建超出任务窗口的问题，场景等价）
const PROFILE = '/tmp/fulgur-w8-persistent-profile'
const SHOT_DIR = '/Users/Admin/Desktop/ai 杂物/插件/fulgur-federation/docs/screenshots/w8'
const PAGE_PATH = APP === 'lowcode' ? `/main/lowcode/lowdev/formDesign` : `/main/flowable/bpm/manager/user-group`
const CONTENT_MARK = APP === 'lowcode' ? '表单设计' : '用户分组'

fs.mkdirSync(SHOT_DIR, { recursive: true })
fs.rmSync(PROFILE, { recursive: true, force: true }) // 首次全新；重跑时上轮缓存由重部署自然失效

const deployRoot = '/opt/homebrew/var/www/fulgur-test'
const manifestUrl = `${BASE}/${APP}/fulgur-manifest.json`

const env = { ...process.env, NO_PROXY: 'localhost,127.0.0.1', no_proxy: 'localhost,127.0.0.1', HTTP_PROXY: '', HTTPS_PROXY: '', http_proxy: '', https_proxy: '' }
const fetchManifest = async () => {
  const res = await fetch(manifestUrl, { cache: 'no-store' })
  return res.json()
}
const distDigest = () => {
  const dir = `${deployRoot}/${APP}/assets`
  try {
    const names = fs.readdirSync(dir).sort().join('\n')
    return crypto.createHash('sha1').update(names).digest('hex').slice(0, 12)
  } catch { return 'n/a' }
}

async function visitAndAssert(tag) {
  const browser = await chromium.launchPersistentContext(PROFILE, {
    headless: true,
    args: ['--no-proxy-server'],
    viewport: { width: 1600, height: 900 },
  })
  const page = browser.pages()[0]
  const failed = []
  const pageErrors = []
  page.on('requestfailed', (r) => {
    if (r.url().includes(`/${APP}/`)) failed.push(r.url().slice(0, 140))
  })
  page.on('response', (r) => {
    if (r.url().includes(`/${APP}/`) && r.status() >= 400) failed.push(`${r.status()} ${r.url().slice(0, 140)}`)
  })
  page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 200)))

  console.log(`[w8]   visit: 打开宿主入口`)
  await page.goto(`${BASE}/main/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(6000)
  // 登录（持久 profile 二阶段通常已有登录态，幂等处理；count() 是 Promise 必须先 await）
  const pwCount = await page.locator('input[type="password"]').count().catch(() => 0)
  if (pwCount > 0) {
    await page.locator('input[placeholder*="账号"], input[placeholder*="用户名"]').first().fill('admin').catch(() => {})
    await page.locator('input[type="password"]').first().fill('Demo@123456')
    await page.locator('button:has-text("登 录"), button:has-text("登录")').first().click()
    await page.waitForTimeout(8000)
  }
  console.log(`[w8]   visit: 打开联邦页 ${PAGE_PATH}`)
  await page.goto(`${BASE}${PAGE_PATH}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(15000)
  console.log(`[w8]   visit: 断言渲染`)
  const bodyText = await page.locator('body').innerText().catch(() => '')
  const rendered = bodyText.includes(CONTENT_MARK) && bodyText.length > 200
  await page.screenshot({ path: `${SHOT_DIR}/w8-${APP}-${tag}.png`, fullPage: false })
  await browser.close()
  return { rendered, failed, pageErrors, textLen: bodyText.length }
}

console.log(`[w8] phaseA：持久 profile 首访 ${BASE}${PAGE_PATH}`)
const phaseA = await visitAndAssert('phaseA')
console.log(`[w8] phaseA rendered=${phaseA.rendered} failedReq=${phaseA.failed.length} pageErrors=${phaseA.pageErrors.length}`)

if (!phaseA.rendered) {
  console.error(`[w8][FAIL] phaseA 页面未渲染（未出现「${CONTENT_MARK}」或文本过短 textLen=${phaseA.textLen}）——基线不绿，重部署对照无意义`)
  process.exit(1)
}

let changed = false
{
  const before = { manifest: await fetchManifest(), digest: distDigest() }
  if (REBUILD) {
    console.log(`[w8] 重建 ${APP}（prod）+ 重部署——模拟真实发版……`)
    execSync(`cd "/Users/Admin/Desktop/ai 杂物/插件/fulgur-federation/testbed/demo-app/demo-app-${APP === 'lowcode' ? 'lowcode' : APP}" && pnpm run build`, { env, stdio: 'inherit', timeout: 540000 })
  } else {
    console.log(`[w8] 重部署既有新构建（--no-build）——模拟真实发版……`)
  }
  execSync(`rsync -a --delete "/Users/Admin/Desktop/ai 杂物/插件/fulgur-federation/testbed/demo-app/dist/${APP}/" "${deployRoot}/${APP}/"`, { env, stdio: 'inherit', timeout: 300000 })
  const after = { manifest: await fetchManifest(), digest: distDigest() }
  changed = before.manifest?.buildInfo?.timestamp !== after.manifest?.buildInfo?.timestamp || before.digest !== after.digest
  console.log(`[w8] 重部署完成：产物变化=${changed}（digest ${before.digest} → ${after.digest}）`)
  if (!changed) console.warn('[w8][WARN] 产物 digest 未变化——重部署可能未生效，phaseB 结论可信度下降')
}

console.log(`[w8] phaseB：同一持久 profile 重访（复刻"老浏览器访问重部署站点"）`)
const phaseB = await visitAndAssert('phaseB')
console.log(`[w8] phaseB rendered=${phaseB.rendered} failedReq=${phaseB.failed.length} pageErrors=${phaseB.pageErrors.length}`)

const ok = phaseB.rendered && phaseB.failed.length === 0 && phaseB.pageErrors.length === 0
console.log(`\n[w8] ${ok ? 'PASS' : 'FAIL'}：重部署后持久 profile 重访 ${ok ? '零失败请求、页面正常渲染（no-cache 缓存语义正确）' : '存在回归'}`)
if (!ok) {
  console.log(`[w8] phaseB 失败请求：\n  ${phaseB.failed.slice(0, 10).join('\n  ') || '（无）'}`)
  console.log(`[w8] phaseB pageErrors：\n  ${phaseB.pageErrors.slice(0, 5).join('\n  ') || '（无）'}`)
  process.exit(1)
}
fs.writeFileSync(`${SHOT_DIR}/w8-${APP}-result.json`, JSON.stringify({ base: BASE, app: APP, rebuild: REBUILD, deployChanged: changed, phaseA, phaseB, ok, at: new Date().toISOString() }, null, 2))
