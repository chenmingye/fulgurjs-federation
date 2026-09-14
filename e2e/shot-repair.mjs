import { chromium } from '@playwright/test'
import fs from 'node:fs'

// 失败项修复补拍：全局文本定位 + 强制点击 + 多次重试
const failed = fs.readFileSync('/tmp/baseline-failed.txt', 'utf8').trim().split('\n').map((l) => {
  const m = l.trim().match(/^(\d+) (.+)$/)
  return { idx: Number(m[1]), name: m[2] }
})
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

for (const f of failed) {
  const chain = clicks[f.idx - 1].split(' > ')
  const leafName = chain[chain.length - 1]
  let ok = false
  for (let attempt = 1; attempt <= 4 && !ok; attempt++) {
    try {
      // 展开父菜单（配置中心 > 流程管理）
      for (let d = 0; d < chain.length - 1; d++) {
        const p = page.locator(`text="${chain[d]}"`).locator('visible=true').first()
        if (await p.count()) {
          await p.click({ force: true, timeout: 4000 }).catch(() => {})
          await page.waitForTimeout(800)
        }
      }
      // 叶子：全局可见文本，强制点击
      const leaf = page.locator(`text="${leafName}"`).locator('visible=true').first()
      await leaf.click({ force: true, timeout: 6000 })
      await page.waitForTimeout(12000)
      const body = await page.evaluate(() => document.body.innerText)
      if (!body.includes('404') || body.includes('待办')) {
        await page.screenshot({ path: `${OUT}/${String(f.idx).padStart(2, '0')}-${safes[f.idx - 1]}.png` })
        ok = true
        console.log(`${f.idx} ${leafName} OK (attempt ${attempt})`)
      } else {
        console.log(`${f.idx} ${leafName} still 404 (attempt ${attempt})`)
        await page.waitForTimeout(3000)
      }
    } catch (e) {
      console.log(`${f.idx} ${leafName} attempt ${attempt}: ${String(e).slice(0, 60)}`)
      await page.waitForTimeout(2500)
    }
  }
  if (!ok) console.log(`${f.idx} ${leafName} FAILED-ALL-ATTEMPTS`)
  fs.appendFileSync('/tmp/repair-progress.txt', `${f.idx} ${leafName} ${ok ? 'OK' : 'FAILED'}\n`)
}
await ctx.close()
console.log('REPAIR_DONE')
