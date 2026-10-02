import { expect, test, type Page } from '@playwright/test'

/**
 * bridge-router：URL 同步端到端（URL 同步任务书 §7 U 系列核心链路，dev 口径）。
 * 组合 A：Vue 宿主(5105) × React 子（remote-react/bridge-routed）
 * 组合 B：React 宿主(5106) × Vue 子（remote-a/bridge-routed）
 * 每项断言：URL + 子应用内容 + 挂载代次（宿主事件/log）+ 历史行为。
 */

const VUE_HOST = '/approval/list?routed=1'
const REACT_HOST = '/approval/list?routed=1'

async function gotoRouted(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: 'domcontentloaded' })
}

// ─────────────────────────────────────────────────────────────
// 组合 B：React 宿主 × Vue 子应用（bridge-react-dev 项目 5106）
// ─────────────────────────────────────────────────────────────
test.describe('bridge-router B：React 宿主 × Vue 子', () => {
  test('U02 首次详情深链', async ({ page }) => {
    await gotoRouted(page, '/approval/detail/123?tab=history&routed=1#comment')
    await expect(page.locator('[data-testid="routed-vue-page"]')).toHaveText(/vue-routed:\/detail\/123\?tab=history/, { timeout: 20000 })
    expect(page.url()).toContain('#comment')
  })

  test('U03 子应用 push（useRouter）+U06 后退', async ({ page }) => {
    await gotoRouted(page, REACT_HOST)
    await expect(page.locator('[data-testid="routed-vue-page"]')).toHaveText(/vue-routed:\/list/, { timeout: 20000 })
    const h0 = await page.evaluate(() => history.length)
    await page.locator('[data-testid="routed-vue-link-detail"]').click()
    await expect(page.locator('[data-testid="routed-vue-page"]')).toHaveText(/\/detail\/456\?src=link/)
    expect(page.url()).toContain('/approval/detail/456?src=link')
    expect(await page.evaluate(() => history.length)).toBe(h0 + 1)
    await page.goBack()
    await expect(page.locator('[data-testid="routed-vue-page"]')).toHaveText(/vue-routed:\/list/)
  })

  test('U11 真实取消（树内 blocker 真正取消）', async ({ page }) => {
    await gotoRouted(page, REACT_HOST)
    await expect(page.locator('[data-testid="routed-vue-page"]')).toHaveText(/vue-routed:\/list/, { timeout: 20000 })
    const url0 = page.url()
    const h0 = await page.evaluate(() => history.length)
    // 子应用发起 → 树内 blocker reset 取消
    await page.locator('[data-testid="routed-vue-link-secret"]').click()
    await page.waitForTimeout(600)
    expect(page.url()).toBe(url0)
    expect(await page.evaluate(() => history.length)).toBe(h0)
    await expect(page.locator('[data-testid="routed-vue-page"]')).toHaveText(/vue-routed:\/list/)
    // 菜单来源 → 树内 useBlocker 真实拦截
    await page.locator('[data-testid="routed-menu-secret"]').click()
    await page.waitForTimeout(600)
    expect(page.url()).toBe(url0)
    const blockerEvents = await page.evaluate(() => (globalThis as any).__ROUTED_BLOCKER_EVENTS__ ?? [])
    expect(blockerEvents.some((p: string) => p?.includes('/approval/secret'))).toBe(true)
  })

  test('U17 协议违例：?spec=bridge → MFU-031', async ({ page }) => {
    await gotoRouted(page, '/approval/list?routed=1&spec=bridge')
    await expect(page.locator('[data-fulgurjs-error="MFU-031"]')).toBeVisible({ timeout: 20000 })
  })
})


test('U04/U13：replace 不增历史，连续请求全部落定，子应用 back 走宿主历史', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/approval/list?routed=1')
  const child = page.getByTestId('routed-vue-page')
  await expect(child).toHaveText(/vue-routed:\/list/, { timeout: 20000 })
  const before = await page.evaluate(() => history.length)
  await page.evaluate(async () => {
    const router = (globalThis as any).__ROUTED_VUE_ROUTER__
    await router.push('/detail/111')
    await router.replace('/detail/222')
  })
  await expect(child).toHaveText(/\/detail\/222/)
  expect(await page.evaluate(() => history.length)).toBe(before + 1)
  await page.evaluate(async () => {
    const router = (globalThis as any).__ROUTED_VUE_ROUTER__
    await Promise.all([333, 444, 555].map((id) => router.push('/detail/' + id)))
  })
  await expect(child).toHaveText(/\/detail\/555/)
  expect(await page.evaluate(() => history.length)).toBe(before + 4)
  await page.evaluate(() => (globalThis as any).__ROUTED_VUE_ROUTER__.back())
  await expect(child).toHaveText(/\/detail\/444/)
  expect(page.url()).toContain('/approval/detail/444')
  expect(errors).toEqual([])
})
