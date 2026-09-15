// P2-1 Chrome 108 兼容快测：108 内核跑 fixtures 远程消费核心链路
import { chromium } from '@playwright/test'
const EXE = '/Applications/Chromium.app/Contents/MacOS/Chromium'
const browser = await chromium.launch({ headless: true, args: ['--no-proxy-server'], executablePath: EXE })
const page = await browser.newPage()
const errs = []
page.on('pageerror', (e) => errs.push(String(e).slice(0, 120)))
await page.goto('http://localhost:5100', { waitUntil: 'domcontentloaded', timeout: 30000 })
await page.waitForTimeout(8000)
const txt = await page.evaluate(() => document.body.innerText.slice(0, 100))
console.log('108 页面文本头:', txt.replace(/\n/g, '|').slice(0, 80))
console.log('108 pageerror:', errs.length)
await page.screenshot({ path: '/tmp/chrome108-fixtures.png' })
await browser.close()
