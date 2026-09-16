// 任务3 U-2 验证：prod 8662 下 lowcode 4 设计器页是否渲染（原 dev 双 vue 空白）
import { chromium } from '@playwright/test'

const SHOT_DIR = '/Users/Admin/Desktop/ai 杂物/插件/fulgur-federation/docs/screenshots/migration1-dev'
const PROFILE = `/tmp/fulgur-prod-prof-u2-${Date.now()}`
const BASE = 'http://localhost:8662'
const PAGES = [
  ['/lowcode/lowdev/formDesign', 'u2-prod-formDesign.png'],
  ['/lowcode/lowdev/reportDesign', 'u2-prod-reportDesign.png'],
  ['/lowcode/lowdev/graphReportDesign', 'u2-prod-graphReportDesign.png'],
  ['/lowcode/lowdev/moduleDesign', 'u2-prod-moduleDesign.png'],
]

const logs = []
const errors = []
const browser = await chromium.launchPersistentContext(PROFILE, {
  headless: true,
  args: ['--no-proxy-server'],
  viewport: { width: 1600, height: 900 },
})
const page = browser.pages()[0]
page.on('console', (m) => {
  const t = m.text()
  if (m.type() === 'error' || /destructure|resolveComponent|reading 'ce'/i.test(t)) {
    errors.push(`[${m.type()}] ${t.slice(0, 250)}`)
  }
})
page.on('pageerror', (e) => errors.push(`[pageerror] ${String(e).slice(0, 250)}`))

try {
  await page.goto(`${BASE}/main/`, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(4000)
  await page.locator('input[placeholder*="账号"], input[placeholder*="用户名"]').first().fill('admin')
  await page.locator('input[type="password"]').first().fill('Demo@123456')
  await page.locator('button:has-text("登 录"), button:has-text("登录")').first().click()
  await page.waitForTimeout(6000)
  console.log('logged in:', page.url())

  for (const [route, shot] of PAGES) {
    errors.length = 0
    await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch((e) => errors.push('[goto] ' + e.message))
    await page.waitForTimeout(10000)
    await page.screenshot({ path: `${SHOT_DIR}/${shot}` })
    const textLen = (await page.locator('body').innerText()).trim().length
    const domCount = await page.locator('body *').count()
    const canvasCount = await page.locator('canvas').count()
    // 设计器区域 DOM 探测（avue 设计器 / amis 编辑器容器）
    const designerDom = await page
      .locator('.design-form, .avue-crud, [class*="design"], [class*="avue"], canvas, .vxe-table')
      .count()
    console.log(
      JSON.stringify({ route, textLen, domCount, canvasCount, designerDom, errors: errors.slice(0, 4) }),
    )
  }
} catch (e) {
  console.log('script-error:', e)
} finally {
  await browser.close()
}
