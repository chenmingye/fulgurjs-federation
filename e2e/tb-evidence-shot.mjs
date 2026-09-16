// B 项截图证据重拍：manual §5/§5.1/§6 引用的 testbed 级截图（旧品牌时代的图必须被新图覆盖）
// 产出（docs/screenshots/）：
//   tb-dev-demo-page.png        §5 演示页（双远程组件 + 运行时信息区）
//   tb-dev-remotes-loaded.png   §5 remotes 状态表（两个 remote 均 loaded）
//   tb-dev-scope-negotiation.png §5 shared 协商表（多版本条目并存）
//   tb-dev-hmr-before.png       §6 HMR 前（TaskCard 进度 70%）
//   tb-dev-hmr-crossapp.png     §6 改 bpm 源码 → admin 页面热替换（状态 70% 保留）
//   tb-prod-minimal-host.png    §5.1 prod 8662 最小宿主（纯运行时容器 API）
// 用法：node tb-evidence-shot.mjs            （dev 部分默认 8773）
//       node tb-evidence-shot.mjs --only=dev / --only=prod
import { chromium } from '@playwright/test'
import fs from 'node:fs'

const DEV_BASE = process.env.VDEV || 'http://localhost:8773'
const PROD_BASE = process.env.VPROD || 'http://localhost:8662'
const OUT_DIR = '/Users/Admin/Desktop/ai 杂物/插件/fulgur-federation/docs/screenshots'
const TASKCARD_SRC =
  '/Users/Admin/Desktop/ai 杂物/插件/fulgur-federation/testbed/demo-app/demo-bpm/src/fulgur-exposes/TaskCard.vue'
const ONLY = process.argv.find((a) => a.startsWith('--only='))?.slice(7) || 'all'

const summary = { dev: {}, hmr: {}, prod: {} }
const waitText = async (page, text, timeout = 60000) => {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const body = await page.locator('body').innerText().catch(() => '')
    if (body.includes(text)) return true
    await page.waitForTimeout(800)
  }
  return false
}

if (ONLY === 'all' || ONLY === 'dev') {
  const browser = await chromium.launchPersistentContext(`/tmp/fulgur-evidence-dev-${Date.now()}`, {
    headless: true,
    args: ['--no-proxy-server'],
    viewport: { width: 1600, height: 1000 }
  })
  const page = browser.pages()[0]
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)))

  // —— §5：演示页 + remotes 状态 + shared 协商（冷启动首轮转换慢，留足等待）——
  await page.goto(`${DEV_BASE}/main/fulgur-demo`, { waitUntil: 'domcontentloaded', timeout: 90000 })
  const hasCards = await waitText(page, '联邦直渲染', 90000)
  const hasLoaded = await waitText(page, 'loaded', 90000)
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${OUT_DIR}/tb-dev-demo-page.png`, fullPage: true })
  const remotesTable = page.locator('.runtime-info table').first()
  const sharedTable = page.locator('.runtime-info table').nth(1)
  if (await remotesTable.count()) await remotesTable.screenshot({ path: `${OUT_DIR}/tb-dev-remotes-loaded.png` })
  if (await sharedTable.count()) await sharedTable.screenshot({ path: `${OUT_DIR}/tb-dev-scope-negotiation.png` })
  const infoText = await page.locator('.runtime-info').innerText().catch(() => '')
  summary.dev = {
    cardsRendered: hasCards,
    remotesLoadedVisible: hasLoaded,
    infoText: infoText.replace(/\n/g, ' | ').slice(0, 400),
    pageErrors: errors.slice(0, 3)
  }

  // —— §6：HMR 前（70%）→ 改 bpm 源码 → admin 页面热替换（状态保留）——
  const advance = page.locator('button:has-text("推进 10%")')
  for (let i = 0; i < 7; i++) {
    await advance.first().click()
    await page.waitForTimeout(350)
  }
  const cardText70 = await page.locator('.fulgur-task-card').innerText()
  summary.hmr.progressBefore = cardText70.includes('70%') ? '70% ✓' : cardText70.slice(0, 80)
  await page.screenshot({ path: `${OUT_DIR}/tb-dev-hmr-before.png` })

  const orig = fs.readFileSync(TASKCARD_SRC, 'utf8')
  const MARK = '【HMR 热更标记】'
  try {
    fs.writeFileSync(
      TASKCARD_SRC,
      orig.replace('验证跨应用组件加载与响应式交互。', `验证跨应用组件加载与响应式交互。${MARK}`)
    )
    const markerShown = await waitText(page, MARK, 45000)
    await page.waitForTimeout(1200)
    const cardTextAfter = await page.locator('.fulgur-task-card').innerText()
    await page.screenshot({ path: `${OUT_DIR}/tb-dev-hmr-crossapp.png` })
    summary.hmr.markerShown = markerShown
    summary.hmr.stateKept = cardTextAfter.includes('70%') ? '70% ✓（状态保留）' : cardTextAfter.slice(0, 120)
  } finally {
    fs.writeFileSync(TASKCARD_SRC, orig)
  }
  await waitText(page, 'TaskCard', 30000).catch(() => {})
  summary.hmr.pageErrors = errors.slice(0, 5)
  await browser.close()
}

if (ONLY === 'all' || ONLY === 'prod') {
  const browser = await chromium.launchPersistentContext(`/tmp/fulgur-evidence-prod-${Date.now()}`, {
    headless: true,
    args: ['--no-proxy-server'],
    viewport: { width: 1600, height: 1000 }
  })
  const page = browser.pages()[0]
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)))
  await page.goto(`${PROD_BASE}/minimal-host.html`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  const ok = await waitText(page, 'loaded', 60000)
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${OUT_DIR}/tb-prod-minimal-host.png`, fullPage: true })
  const text = await page.locator('body').innerText().catch(() => '')
  summary.prod = {
    taskCard: text.includes('TaskCard'),
    infoCard: text.includes('InfoCard'),
    remotesLoaded: ok,
    bodyText: text.replace(/\n/g, ' | ').slice(0, 400),
    pageErrors: errors.slice(0, 3)
  }
  await browser.close()
}

console.log(JSON.stringify(summary, null, 2))
