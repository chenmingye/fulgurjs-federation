import { chromium } from '@playwright/test'
import fs from 'node:fs'

const clicks = fs.readFileSync('/tmp/menu-clicks.txt', 'utf8').trim().split('\n').map((l) => l.split('|')[0])
const safes = fs.readFileSync('/tmp/routes27.txt', 'utf8').trim().split('\n').map((l) => l.split('|')[1])
const OUT = '../docs/screenshots/baseline-8661'
const ctx = await chromium.launchPersistentContext('/tmp/8661-profile', {
  headless: true,
  viewport: { width: 1440, height: 900 },
  args: ['--no-proxy-server'],
})
const page = ctx.pages()[0] ?? (await ctx.newPage())
await page.goto('http://localhost:8661/main/dashboard/analysis', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(6000)
if (page.url().includes('login')) { console.log('SESSION_EXPIRED'); process.exit(2) }

const results = []
const loadedSubApps = new Set()
for (let i = 0; i < clicks.length; i++) {
  const chain = clicks[i].split(' > ')
  const leafName = chain[chain.length - 1]
  try {
    // 逐级展开父菜单
    for (let d = 0; d < chain.length - 1; d++) {
      const parent = page.locator(`.ant-layout-sider >> text="${chain[d]}"`).first()
      if (await parent.count()) {
        await parent.click()
        await page.waitForTimeout(600)
      }
    }
    // 点击叶子
    const leaf = page.locator(`.ant-layout-sider >> text="${leafName}"`).first()
    await leaf.click({ timeout: 8000 })
    // 首次进入子应用多等（qiankun 加载）
    const subApp = clicks[i].includes('审批中心') ? 'flowable-task' : clicks[i].includes('流程管理') ? 'flowable-mgr' : 'lowcode'
    const waitMs = loadedSubApps.has(subApp) ? 8000 : 16000
    loadedSubApps.add(subApp)
    await page.waitForTimeout(waitMs)
    await page.screenshot({ path: `${OUT}/${String(i + 1).padStart(2, '0')}-${safes[i]}.png`, fullPage: false })
    const body = (await page.evaluate(() => document.body.innerText)).slice(0, 80).replace(/\n/g, '|')
    const is404 = body.includes('404') || body.includes('不存在')
    results.push(`${i + 1} ${leafName} [${is404 ? '404!' : 'OK'}] ${body.slice(0, 60)}`)
    console.log(results[results.length - 1])
  } catch (e) {
    results.push(`${i + 1} ${leafName} [ERROR] ${String(e).slice(0, 80)}`)
    console.log(results[results.length - 1])
  }
  fs.writeFileSync('/tmp/baseline2-progress.txt', results.join('\n'))
}
await ctx.close()
console.log('BASELINE2_DONE')
