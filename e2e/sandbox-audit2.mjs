// 补充审计：window 新增键完整清单 + vue 实例单例证明 + 多版本 element-plus JS 共存证据
import { chromium } from '@playwright/test'

const BASE = 'http://localhost:8773'
const browser = await chromium.launchPersistentContext(`/tmp/psbx2-${Date.now()}`, {
  headless: true, args: ['--no-proxy-server'], viewport: { width: 1500, height: 950 },
})
const page = browser.pages()[0]

await page.goto(`${BASE}/main/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(6000)
await page.locator('input[placeholder*="账号"], input[placeholder*="用户名"]').first().fill('admin')
await page.locator('input[type="password"]').first().fill('Demo@123456')
await page.locator('button:has-text("登 录"), button:has-text("登录")').first().click()
await page.waitForTimeout(9000)
await page.goto(`${BASE}/main/dashboard/analysis`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {})
await page.waitForTimeout(8000)

const baseKeys = await page.evaluate(() => ({
  keys: Object.keys(window),
  vueVers: (() => { try { return require('vue').version } catch { return 'n/a' } })(),
}))
await page.goto(`${BASE}/flowable/bpm/task/todo`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {})
await page.waitForTimeout(15000)
await page.goto(`${BASE}/lowcode/lowdev/formDesign`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {})
await page.waitForTimeout(18000)

const audit = await page.evaluate((base) => {
  const newKeys = Object.keys(window).filter((k) => !base.keys.includes(k))
  // vue 单例证明：页面上任意组件实例的 appContext 里拿版本
  const el = document.querySelector('#app, [data-v-app], body *')
  let hostVue = 'n/a'
  try {
    const inst = el && (el.__vue_app__ || el.firstElementChild?.__vue_app__)
    hostVue = inst ? inst.config.globalProperties.$vue || inst.version || 'found' : 'none'
  } catch {}
  // 各 chunk 版本的 vue 共存证据：从 script 标签统计
  const vueScripts = [...document.querySelectorAll('script[src]')]
    .map((s) => s.src).filter((u) => u.includes('vue.runtime') || u.includes('runtime-core'))
  const epScripts = [...new Set([...document.querySelectorAll('link[rel=stylesheet][href], script[src]')]
    .map((n) => n.href || n.src).filter((u) => u.includes('element-plus')))]
  return {
    newKeysCount: newKeys.length,
    newKeys: newKeys.filter((k) => !k.startsWith('webkit')).slice(0, 60),
    vueChunks: [...new Set(vueScripts)].map((u) => u.split('/').slice(-1)[0]),
    epAssets: epAssetsClean(epScripts),
  }
  function epAssetsClean(list) {
    return [...new Set(list.map((u) => u.split('/').slice(-1)[0]))].slice(0, 12)
  }
}, baseKeys)
console.log('window 新增键数:', audit.newKeysCount)
console.log('新增键清单:', JSON.stringify(audit.newKeys))
console.log('vue chunk(多实例共存证据):', JSON.stringify(audit.vueChunks))
console.log('element-plus 资产(多版本共存证据):', JSON.stringify(audit.epAssets))
await browser.close()
