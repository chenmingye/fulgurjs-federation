// D1 网络级探针：盯住 /system/dept/simple-list 请求是否发出、何时完成、响应体是什么
// 用法：node probe-d1-net.mjs <base> <tag>
import { chromium } from '@playwright/test'
import fs from 'node:fs'

const BASE = process.argv[2] || 'http://localhost:8773'
const TAG = process.argv[3] || 'dev'
const DIR = `/tmp/probe-d1/${TAG}`
fs.mkdirSync(DIR, { recursive: true })

const browser = await chromium.launchPersistentContext(`/tmp/pd1n-${TAG}-${Date.now()}`, {
  headless: true,
  args: ['--no-proxy-server'],
  viewport: { width: 1500, height: 950 },
})
const page = browser.pages()[0]

const apiLog = []
page.on('request', (r) => {
  if (r.url().includes('/system/') || r.url().includes('/bpm/')) apiLog.push(`REQ  ${new Date().toISOString().slice(11, 23)} ${r.method()} ${r.url().slice(0, 150)}`)
})
page.on('response', async (r) => {
  const u = r.url()
  if (u.includes('/system/') || u.includes('/bpm/')) {
    let size = -1
    try { size = (await r.body()).length } catch {}
    apiLog.push(`RESP ${new Date().toISOString().slice(11, 23)} ${r.status()} ${u.slice(0, 150)} bytes=${size}`)
    if (u.includes('dept/simple-list')) {
      try {
        const body = (await r.body()).toString().slice(0, 400)
        apiLog.push(`DEPT-BODY: ${body}`)
      } catch (e) { apiLog.push(`DEPT-BODY-ERR: ${e.message}`) }
    }
  }
})
page.on('requestfailed', (r) => {
  apiLog.push(`FAIL ${r.method()} ${r.url().slice(0, 150)} :: ${r.failure()?.errorText}`)
})

await page.goto(`${BASE}/main/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(6000)
await page.locator('input[placeholder*="账号"], input[placeholder*="用户名"]').first().fill('admin')
await page.locator('input[type="password"]').first().fill('Demo@123456')
await page.locator('button:has-text("登 录"), button:has-text("登录")').first().click()
await page.waitForTimeout(9000)

apiLog.push('===== 打开新建模型 =====')
await page.goto(`${BASE}/flowable/bpm/manager/model`, { waitUntil: 'domcontentloaded', timeout: 45000 })
await page.waitForTimeout(10000)
await page.locator('button:has-text("新建模型"), span:has-text("新建模型")').first().click({ timeout: 8000 }).catch(() => {})
await page.waitForTimeout(15000)

console.log(`===== [${TAG}] API 时间线 =====`)
apiLog.forEach((l) => console.log(l))

const m = await page.evaluate(() => {
  const inputs = [...document.querySelectorAll('.jeecg-layout-content input:not([type=hidden])')]
  return { visibleInputs: inputs.filter((i) => i.getBoundingClientRect().height > 0).length, totalInputs: inputs.length }
})
console.log(`[${TAG}] 表单指标: ${JSON.stringify(m)}`)
await page.screenshot({ path: `${DIR}/04-net-创建流程.png` })
await browser.close()
