// 登录后检查 /flowable/bpm/task/todo 实际匹配的路由记录（容错版）
import { chromium } from '@playwright/test'
const browser = await chromium.launchPersistentContext(`/tmp/fulgur-rc4-${Date.now()}`, {
  headless: true, args: ['--no-proxy-server'], viewport: { width: 1400, height: 900 },
})
const page = browser.pages()[0]
await page.goto('http://localhost:8773/main/', { waitUntil: 'domcontentloaded', timeout: 90000 })
await page.waitForTimeout(15000)

// 可能已登录（session 残留）也可能在登录页——两种都处理
const hasLogin = await page.locator('input[type="password"]').count()
if (hasLogin) {
  await page.locator('input[placeholder*="账号"], input[placeholder*="用户名"]').first().fill('admin', { timeout: 10000 })
  await page.locator('input[type="password"]').first().fill('Demo@123456', { timeout: 10000 })
  await page.locator('button:has-text("登 录"), button:has-text("登录")').first().click({ timeout: 10000 })
  await page.waitForTimeout(10000)
}

// 访问 demo 触发桥
await page.goto('http://localhost:8773/main/fulgur-demo', { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {})
await page.waitForTimeout(12000)

const info = await page.evaluate(() => {
  const router = window.mainRouter
  if (!router) return { error: 'mainRouter 未定义' }
  const resolve = router.resolve({ path: '/flowable/bpm/task/todo' })
  const matched = resolve.matched
  const last = matched[matched.length - 1]
  const candidates = router.getRoutes().filter((r) => r.path === '/flowable/bpm/task/todo')
  return {
    matchedCount: matched.length,
    lastPath: last?.path,
    lastHasComponent: !!last?.components?.default,
    candidatesForPath: candidates.map((r) => ({ name: r.name, hasComp: !!r.components?.default })),
  }
})
console.log(JSON.stringify(info, null, 1))
await page.screenshot({ path: '/tmp/rc4-state.png' })
await browser.close()
