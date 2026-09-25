// tb-43x-perf.mjs —— 懒加载/预载策略网络级测量（4.2.1 复核 §三 验收）
//
// 冷缓存（CDP Network.setCacheDisabled）分阶段记录真实网络请求：
//   P0 登录后停留 dashboard 15s     → 目标：两个远程的 expose 文件请求 = 0
//   P1 首次打开 BPM 待办            → 目标：BPM expose 文件只下「待办页所需子集」，lowcode expose = 0
//   P2 再打开另一个 BPM 页（模型）   → 目标：不批量下载 BPM 其余页面文件
//   P3 首次打开 lowcode 页面        → 目标：只下载该页所需子集
//   P4 重复打开已访问页             → 目标：零重复下载
//   P5 显式整远程预载（preloadRemote('mes-bpm')）→ 允许完整 expose 清单下载（API 保留验证）
//
// 统计口径：按 manifest 的不同 expose 文件 URL 计数（共享 chunk 不误算）；另列
// remoteEntry/manifest/setup chunk/共享 chunk/CSS；记录传输字节、阶段耗时、错误。
//
// 用法：node tb-43x-perf.mjs --base http://localhost:8773/main --out xxx.json [--shots dir]
import { chromium } from '/Users/Admin/Desktop/ai_project/Plugin_Workshop/fulgurjs-federation/e2e/node_modules/@playwright/test/index.mjs'
import fs from 'node:fs'
import path from 'node:path'

const arg = (k, d) => {
  const i = process.argv.indexOf(k)
  return i > -1 ? process.argv[i + 1] : d
}
const BASE = arg('--base', 'http://localhost:8773/main')
const OUT = arg('--out', '/Users/Admin/Desktop/ai_project/Plugin_Workshop/fulgurjs-federation/docs/func-results/4.3.x-perf-dev.json')
const SHOT = arg('--shots', '/Users/Admin/Desktop/ai_project/Plugin_Workshop/fulgurjs-federation/docs/screenshots/4.3.x-perf-dev')
fs.mkdirSync(SHOT, { recursive: true })
fs.mkdirSync(path.dirname(OUT), { recursive: true })

// manifest 地址按环境推导：dev = 各远程 dev server；prod(8662) = 同源子路径
const IS_PROD = /8662/.test(BASE)
const MANIFESTS = IS_PROD
  ? {
      'mes-bpm': 'http://localhost:8662/flowable/fulgurjs-manifest.json',
      'mes-lowcode': 'http://localhost:8662/lowcode/fulgurjs-manifest.json',
    }
  : {
      // dev manifest 由插件中间件直出：/<base>/@fulgurjs-manifest.json（prod 才是 fulgurjs-manifest.json）
      'mes-bpm': 'http://localhost:4529/flowable/@fulgurjs-manifest.json',
      'mes-lowcode': 'http://localhost:4669/lowcode/@fulgurjs-manifest.json',
    }

async function fetchManifest(url) {
  const res = await fetch(url)
  const j = await res.json()
  return j
}

// manifest exposes → expose 文件路径集合（file 字段；dev 与 prod 的 manifest 文件名/目录形态不同，
// 一律以「去查询串后的路径以 /<file> 结尾」做包含匹配，避免 base 拼接歧义）
function exposeFilePaths(manifest) {
  const paths = new Set()
  for (const [key, entry] of Object.entries(manifest.exposes ?? {})) {
    if (key === './__fulgurjs_setup__') continue
    const file = typeof entry === 'string' ? entry : entry.file
    if (file) paths.add(String(file).replace(/^\.?\//, ''))
  }
  return paths
}

const isExposeFile = (url, remote) => {
  const p = url.replace(/^https?:\/\/[^/]+/, '').split('?')[0]
  for (const fp of exposePathMap[remote] ?? []) {
    if (p.endsWith('/' + fp)) return true
  }
  return false
}

const manifests = {}
const exposePathMap = {}
const exposeUrls = {}
for (const [name, url] of Object.entries(MANIFESTS)) {
  manifests[name] = await fetchManifest(url)
  const paths = exposeFilePaths2(manifests[name])
  exposePathMap[name] = paths
  exposeUrls[name] = paths
  console.log(`[manifest] ${name}: exposes 键 ${Object.keys(manifests[name].exposes ?? {}).length}，不同文件 ${paths.size}`)
}

function exposeFilePaths2(manifest) {
  const paths = new Set()
  for (const [key, entry] of Object.entries(manifest.exposes ?? {})) {
    if (key === './__fulgurjs_setup__') continue
    const file = typeof entry === 'string' ? entry : entry.file
    if (file) paths.add(String(file).replace(/^\.?\//, ''))
  }
  return paths
}

// ── 浏览器：新 context + 禁缓存 ──
const browser = await chromium.launch({ headless: true, args: ['--no-proxy-server'] })
const context = await browser.newContext({ viewport: { width: 1600, height: 950 } })
const page = await context.newPage()
const cdp = await context.newCDPSession(page)
await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
await cdp.send('Network.enable')

// 网络记录：URL → { size(bytes), ts }（响应完成才计字节）
const netLog = new Map()
page.on('requestfinished', async (req) => {
  try {
    const resp = await req.response()
    if (!resp) return
    const body = await resp.body()
    netLog.set(req.url(), { size: body.length, ts: Date.now() })
  } catch {
    /* body 不可得（如 redirect 中间帧）——URL 仍以 request 出现过计 */
    netLog.set(req.url(), { size: 0, ts: Date.now() })
  }
})
page.on('requestfailed', (req) => {
  netLog.set(req.url(), { size: 0, ts: Date.now(), failed: req.failure()?.errorText })
})

/** 阶段统计：与上一快照差集 = 本阶段新增下载 */
let snapshot = new Set()
function classifyPhase(label, t0) {
  const added = [...netLog.keys()].filter((u) => !snapshot.has(u))
  const stat = { phase: label, ms: Date.now() - t0, addedCount: added.length, bytes: 0, errors: [] }
  const per = { remoteEntry: [], manifest: [], expose: { 'mes-bpm': [], 'mes-lowcode': [] }, setup: [], css: [], other: [] }
  for (const u of added) {
    const info = netLog.get(u) ?? {}
    stat.bytes += info.size ?? 0
    if (info.failed) stat.errors.push(`${u.slice(-60)} → ${info.failed}`)
    const short = u.replace(/^https?:\/\/[^/]+/, '')
    if (/fulgurjs-remoteEntry\.js|@fulgurjs-entry/.test(u)) per.remoteEntry.push(short)
    else if (/fulgurjs-manifest\.json|@fulgurjs-manifest/.test(u)) per.manifest.push(short)
    else if (/__fulgurjs_setup__/.test(u)) per.setup.push(short)
    else if (/\.css/.test(u)) per.css.push(short)
    for (const remote of Object.keys(exposePathMap)) {
      if (isExposeFile(u, remote)) per.expose[remote].push(short)
    }
  }
  stat.detail = per
  snapshot = new Set(netLog.keys())
  return stat
}

const report = { ts: new Date().toISOString(), base: BASE, manifests: {}, phases: [], errors: [] }
for (const [name, m] of Object.entries(manifests)) {
  report.manifests[name] = {
    exposeKeys: Object.keys(m.exposes ?? {}).length,
    distinctFiles: exposeUrls[name].size,
    entry: m.entry,
  }
}

async function login(user, pwd) {
  const t0 = Date.now()
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.locator('input[placeholder*="账号"]').first().waitFor({ state: 'visible', timeout: 60000 })
  await page.locator('input[placeholder*="账号"]').first().fill(user)
  await page.locator('input[type="password"]').first().fill(pwd)
  await page.locator('button:has-text("登 录"), button:has-text("登录")').first().click()
  for (let i = 0; i < 90; i++) {
    await page.waitForTimeout(1000)
    if (!/\/login/.test(page.url())) break
  }
  await page.waitForTimeout(5000)
  return Date.now() - t0
}

// P0：登录 + 停留 dashboard 15s
{
  const t0 = Date.now()
  await login('admin', 'P@ssw0rd')
  await page.waitForTimeout(15000)
  report.phases.push(classifyPhase('P0-dashboard-idle(登录+停留15s)', t0))
  await page.screenshot({ path: path.join(SHOT, 'P0-dashboard.png') })
}
// P1：首次打开 BPM 待办
{
  const t0 = Date.now()
  await page.goto(`${BASE}/flowable/bpm/task/todo`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(18000)
  report.phases.push(classifyPhase('P1-bpm-todo-first', t0))
  await page.screenshot({ path: path.join(SHOT, 'P1-bpm-todo.png') })
}
// P2：另一个 BPM 页（模型列表）
{
  const t0 = Date.now()
  await page.goto(`${BASE}/flowable/bpm/manager/model`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(15000)
  report.phases.push(classifyPhase('P2-bpm-model', t0))
  await page.screenshot({ path: path.join(SHOT, 'P2-bpm-model.png') })
}
// P3：首次 lowcode（表单设计）
{
  const t0 = Date.now()
  await page.goto(`${BASE}/lowcode/lowdev/formDesign`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(18000)
  report.phases.push(classifyPhase('P3-lowcode-formDesign-first', t0))
  await page.screenshot({ path: path.join(SHOT, 'P3-lowcode.png') })
}
// P4：重复打开已访问页（BPM 待办）
{
  const t0 = Date.now()
  await page.goto(`${BASE}/flowable/bpm/task/todo`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(12000)
  report.phases.push(classifyPhase('P4-bpm-todo-revisit', t0))
}
// P5：显式整远程预载（API 保留验证）——从宿主运行时单例调 preloadRemote('mes-bpm')
{
  const t0 = Date.now()
  const before = new Set(netLog.keys())
  await page.evaluate(async () => {
    const rt = globalThis.__FULGURJS_RUNTIME__
    if (!rt?.preloadRemote) throw new Error('runtime preloadRemote 不可用')
    await rt.preloadRemote('mes-bpm', { mode: 'prefetch' })
  })
  // 整远程预载是低优先级后台下载——给足 30s 窗口让完整清单落网
  await page.waitForTimeout(30000)
  const added = [...netLog.keys()].filter((u) => !before.has(u))
  const bpmExposeHits = added.filter((u) => isExposeFile(u, 'mes-bpm'))
  report.phases.push({
    phase: 'P5-preloadRemote(mes-bpm)显式整远程',
    ms: Date.now() - t0,
    addedCount: added.length,
    bpmExposeFilesDownloaded: bpmExposeHits.length,
    bpmExposeDistinctTotal: exposeUrls['mes-bpm'].size,
    bytes: added.reduce((a, u) => a + (netLog.get(u)?.size ?? 0), 0),
  })
}

// 判定（4.2.1 复核 §3.3 验收目标）
const get = (label) => report.phases.find((p) => p.phase.startsWith(label))
const p0 = get('P0')
const p1 = get('P1')
const p2 = get('P2')
const p3 = get('P3')
const p4 = get('P4')
const p5 = get('P5')
report.verdict = {
  'dashboard 不下载两个远程页面文件': (p0?.detail?.expose?.['mes-bpm'].length ?? 0) === 0 && (p0?.detail?.expose?.['mes-lowcode'].length ?? 0) === 0,
  '首次 BPM 页不批量下载 BPM 全部页面文件': (p1?.detail?.expose?.['mes-bpm'].length ?? 99) < exposeUrls['mes-bpm'].size,
  '首次 BPM 页不下载 lowcode 页面文件': (p1?.detail?.expose?.['mes-lowcode'].length ?? 99) === 0,
  '第二 BPM 页不批量下载其余页面文件': (p2?.detail?.expose?.['mes-bpm'].length ?? 99) < exposeUrls['mes-bpm'].size - (p1?.detail?.expose?.['mes-bpm'].length ?? 0) || (p2?.detail?.expose?.['mes-bpm'].length ?? 99) === 0,
  '首次 lowcode 只下载所需子集': (p3?.detail?.expose?.['mes-lowcode'].length ?? 99) < exposeUrls['mes-lowcode'].size,
  '重复打开不重复下载': (p4?.detail?.expose?.['mes-bpm'].length ?? 99) === 0,
  '显式整远程预载可下载完整清单': (p5?.bpmExposeFilesDownloaded ?? 0) >= exposeUrls['mes-bpm'].size - 3,
}

fs.writeFileSync(OUT, JSON.stringify(report, null, 2))
console.log('\n══ 懒加载验收判定 ══')
for (const [k, v] of Object.entries(report.verdict)) console.log(`${v ? '✓' : '✗'} ${k}`)
for (const p of report.phases) {
  console.log(`${p.phase}: 新增请求 ${p.addedCount}，${(p.bytes / 1024).toFixed(0)}KB，${p.ms}ms`)
  if (p.detail?.expose) console.log(`   expose 文件: bpm=${p.detail.expose['mes-bpm'].length} lowcode=${p.detail.expose['mes-lowcode'].length}`)
}
console.log(`[report] ${OUT}`)
await browser.close()
const allPass = Object.values(report.verdict).every(Boolean)
process.exit(allPass ? 0 : 1)
