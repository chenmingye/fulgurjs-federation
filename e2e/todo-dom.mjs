// prod 待办页 DOM/网络深度诊断
import { chromium } from '@playwright/test'
const browser = await chromium.launchPersistentContext(`/tmp/fulgur-todomix-${Date.now()}`, {
  headless: true, args: ['--no-proxy-server'], viewport: { width: 1500, height: 900 },
})
const page = browser.pages()[0]
const events = []
const flowReqs = []
page.on('pageerror', (e) => events.push(`[pageerror] ${String(e).slice(0, 250)}`))
page.on('console', (m) => { if (m.type() === 'error') events.push(`[error] ${m.text().slice(0, 220)}`) })
page.on('response', (r) => {
  if (r.url().includes('/flowable/')) flowReqs.push(`${r.status()} ${r.url().slice(r.url().indexOf('/flowable/')).slice(0, 90)}`)
})

await page.goto('http://localhost:8662/main/', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(8000)
await page.locator('input[placeholder*="账号"], input[placeholder*="用户名"]').first().fill('admin')
await page.locator('input[type="password"]').first().fill('Demo@123456')
await page.locator('button:has-text("登 录"), button:has-text("登录")').first().click()
await page.locator('input[type="password"]').first().waitFor({ state: 'hidden', timeout: 30000 }).catch(() => {})
await page.waitForTimeout(5000)
flowReqs.length = 0
events.length = 0
await page.goto('http://localhost:8662/flowable/bpm/task/todo', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {})
await page.waitForTimeout(15000)

const info = await page.evaluate(() => {
  const app = document.querySelector('#app')
  const main = app || document.body
  // 找内容区（非侧栏）
  const content = document.querySelector('.jeecg-layout-content') || main
  return {
    url: location.href,
    contentHTMLLen: content.innerHTML.length,
    contentHead: content.innerHTML.replace(/\s+/g, ' ').slice(0, 300),
    hasAvue: !!document.querySelector('[class*="avue"]'),
    hasElTable: !!document.querySelector('.el-table'),
    hasAntTable: !!document.querySelector('.ant-table'),
    hasRedError: (document.body.innerText || '').includes('联邦页面加载失败'),
    bodyTextLen: (document.body.innerText || '').length,
  }
})
console.log(JSON.stringify(info, null, 1))
console.log('== flowable 请求 ==')
console.log(flowReqs.slice(0, 15).join('\n') || '(无)')
console.log('== 错误 ==')
console.log(events.slice(0, 6).join('\n') || '(无)')
await browser.close()
