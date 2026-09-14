import { chromium } from '@playwright/test'
const ctx = await chromium.launch({ headless: true, args: ['--no-proxy-server'] })
const page = await ctx.newPage()
const reqs = []
page.on('request', (r) => { if (/node_modules\/\.vite\/deps\/vue\.js/.test(r.url())) reqs.push(r.url()) })
await page.goto('http://localhost:5100/#/multi', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(()=>{})
await page.waitForTimeout(15000)
console.log('vueReqs:', reqs.length)
for (const u of reqs) console.log(' ', u.slice(0, 110))
await ctx.close()
