import { chromium } from '@playwright/test'
import fs from 'node:fs'

const routes = fs.readFileSync('/tmp/routes27.txt', 'utf8').trim().split('\n').map((l) => {
  const [route, safe] = l.split('|')
  return { route, safe }
})
const OUT = '../docs/screenshots/baseline-8661'
const ctx = await chromium.launchPersistentContext('/tmp/8661-profile', {
  headless: true,
  viewport: { width: 1440, height: 900 },
  args: ['--no-proxy-server'],
})
const page = ctx.pages()[0] ?? (await ctx.newPage())
// 会话保活检查
await page.goto('http://localhost:8661/main/dashboard/analysis', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(5000)
if (page.url().includes('login')) {
  console.log('SESSION_EXPIRED')
  process.exit(2)
}
console.log('session ok, starting batch:', routes.length)
const results = []
for (let i = 0; i < routes.length; i++) {
  const { route, safe } = routes[i]
  const url = `http://localhost:8661/main${route}`
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 })
  } catch {}
  await page.waitForTimeout(10000)
  await page.screenshot({ path: `${OUT}/${String(i + 1).padStart(2, '0')}-${safe}.png`, fullPage: false })
  const bodyText = (await page.evaluate(() => document.body.innerText)).slice(0, 60).replace(/\n/g, ' | ')
  results.push(`${i + 1}/${routes.length} ${route} -> ${page.url().slice(21, 80)} | ${bodyText}`)
  console.log(results[results.length - 1])
  fs.writeFileSync('/tmp/baseline-progress.txt', results.join('\n'))
}
await ctx.close()
console.log('ALL_BASELINE_DONE')
