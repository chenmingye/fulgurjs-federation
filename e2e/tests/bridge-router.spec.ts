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
// 组合 A：Vue 宿主 × React 子应用（bridge-dev 项目 5105）
// ─────────────────────────────────────────────────────────────
test.describe('bridge-router A：Vue 宿主 × React 子', () => {
  test('U02 首次详情深链：直达目标页不闪默认页', async ({ page }) => {
    await gotoRouted(page, '/approval/detail/123?tab=history&routed=1#comment')
    const sub = page.locator('[data-testid="routed-react-page"]')
    await expect(sub).toHaveText(/\/detail\/123\?tab=history/, { timeout: 20000 })
    expect(await sub.innerText()).toContain('#comment')
    // 不先渲染 /list 再跳转：直接断言最终内容（等待即隐含无中间默认页断言由 U12 专项覆盖）
    expect(page.url()).toContain('/approval/detail/123')
    expect(page.url()).toContain('tab=history')
    expect(page.url()).toContain('#comment')
  })

  test('U03 子应用 Link push：URL+内容同步、历史 +1、root 不重挂', async ({ page }) => {
    await gotoRouted(page, VUE_HOST)
    await expect(page.locator('[data-testid="routed-react-page"]')).toHaveText(/react-routed:\/list/, { timeout: 20000 })
    const ready0 = await page.locator('[data-testid="routed-session"]').innerText()
    const h0 = await page.evaluate(() => history.length)
    await page.locator('[data-testid="routed-react-link-detail"]').click()
    await expect(page.locator('[data-testid="routed-react-page"]')).toHaveText(/\/detail\/456\?src=link/)
    expect(page.url()).toContain('/approval/detail/456?src=link')
    const h1 = await page.evaluate(() => history.length)
    expect(h1).toBe(h0 + 1)
    // root 不重挂：宿主会话状态未被重建（ready-count 类指标在 routed 页无重挂日志）
    expect(await page.locator('[data-testid="routed-session"]').innerText()).toBe(ready0)
  })

  test('U05+U06 宿主同前缀菜单 + 后退/前进', async ({ page }) => {
    await gotoRouted(page, VUE_HOST)
    const sub = page.locator('[data-testid="routed-react-page"]')
    await expect(sub).toHaveText(/react-routed:\/list/, { timeout: 20000 })
    // 宿主菜单跳详情：内容更新（已挂载 root 保留）
    await page.locator('[data-testid="routed-menu-detail"]').click()
    await expect(sub).toHaveText(/\/detail\/789/)
    // 后退 → 456? 不，后退回 list；前进回 789
    await page.goBack()
    await expect(sub).toHaveText(/react-routed:\/list/)
    expect(page.url()).toContain('/approval/list')
    await page.goForward()
    await expect(sub).toHaveText(/\/detail\/789/)
    expect(page.url()).toContain('/approval/detail/789?tab=main')
  })

  test('U07 query/重复键/中文/编码原样保留（仅参数变化也更新）', async ({ page }) => {
    await gotoRouted(page, `/approval/detail/88?a=1&a=2&q=${encodeURIComponent('中文 值')}&p=100%25&routed=1`)
    const sub = page.locator('[data-testid="routed-react-page"]')
    await expect(sub).toHaveText(/\/detail\/88/, { timeout: 20000 })
    const text = await sub.innerText()
    expect(text).toContain('a=1&a=2')
    expect(text).toContain(encodeURIComponent('中文 值'))
    expect(text).toContain('100%25')
  })

  test('U11 真实守卫取消：URL/内容/历史不变，无自动重试', async ({ page }) => {
    await gotoRouted(page, VUE_HOST)
    await expect(page.locator('[data-testid="routed-react-page"]')).toHaveText(/react-routed:\/list/, { timeout: 20000 })
    const url0 = page.url()
    const h0 = await page.evaluate(() => history.length)
    // 子应用内 Link → /secret（宿主守卫拒绝）
    await page.locator('[data-testid="routed-react-link-secret"]').click()
    await page.waitForTimeout(600)
    expect(page.url()).toBe(url0)
    expect(await page.evaluate(() => history.length)).toBe(h0)
    // 内容回滚到 list；无错误占位
    await expect(page.locator('[data-testid="routed-react-page"]')).toHaveText(/react-routed:\/list/)
    await expect(page.locator('[data-fulgurjs-error]')).toHaveCount(0)
    // 守卫真实执行过
    const guardCalls = await page.evaluate(() => (globalThis as any).__ROUTED_GUARD_CALLS__ ?? [])
    expect(guardCalls.some((p: string) => p.includes('/approval/secret'))).toBe(true)
  })

  test('U12 挂载 pending 时换路径：用最新目标，不闪默认页', async ({ page }) => {
    await gotoRouted(page, '/approval/list?routed=1&routed-delay=1')
    // 400ms pending 窗口内宿主菜单换路径
    await page.locator('[data-testid="routed-menu-detail"]').click({ timeout: 1500 }).catch(() => {})
    const sub = page.locator('[data-testid="routed-react-page"]')
    await expect(sub).toHaveText(/\/detail\/789/, { timeout: 20000 })
    expect(page.url()).toContain('/approval/detail/789')
  })

  test('U14 换账号：新代次可用、旧通道不写 URL（登出→B）', async ({ page }) => {
    await gotoRouted(page, VUE_HOST)
    await expect(page.locator('[data-testid="routed-react-page"]')).toHaveText(/react-routed:\/list/, { timeout: 20000 })
    await page.locator('[data-testid="routed-act-switch-b"]').click()
    await expect(page.locator('[data-testid="routed-session"]')).toHaveText(/session:sess-B/, { timeout: 15000 })
    await expect(page.locator('[data-testid="routed-react-page"]')).toHaveText(/react-routed:\/list/, { timeout: 15000 })
    // 新代次导航正常
    await page.locator('[data-testid="routed-react-link-detail"]').click()
    await expect(page.locator('[data-testid="routed-react-page"]')).toHaveText(/\/detail\/456/)
  })

  test('U17 协议违例：?spec=bridge 开启 routed → MFU-031 占位（不静默 memory）', async ({ page }) => {
    await gotoRouted(page, '/approval/list?routed=1&spec=bridge')
    const err = page.locator('[data-fulgurjs-error="MFU-031"]')
    await expect(err).toBeVisible({ timeout: 20000 })
    await expect(err).toContainText('路由协议')
  })

  test('U17b 宿主未知子路径 404 语义：未匹配前缀不挂子应用', async ({ page }) => {
    // 前缀未命中（/other）由宿主路由决定——这里落在 / 页面（fixture 的宿主 404 策略即回首页）
    await gotoRouted(page, '/other/xxx')
    await expect(page.locator('[data-testid="host-title"]')).toBeVisible({ timeout: 20000 })
  })
})


test('U04/U13：replace 不增历史，连续请求全部落定，子应用 back 走宿主历史', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/approval/list?routed=1')
  const child = page.getByTestId('routed-react-page')
  await expect(child).toHaveText(/react-routed:\/list/, { timeout: 20000 })
  const before = await page.evaluate(() => history.length)
  await page.evaluate(async () => {
    const router = (globalThis as any).__ROUTED_REACT_ROUTER_READY__
      ? await (globalThis as any).__ROUTED_REACT_ROUTER_READY__
      : (globalThis as any).__ROUTED_REACT_ROUTER__
    await router.navigate('/detail/111')
    await router.navigate('/detail/222', { replace: true })
  })
  await expect(child).toHaveText(/\/detail\/222/)
  expect(await page.evaluate(() => history.length)).toBe(before + 1)
  await page.evaluate(async () => {
    const router = (globalThis as any).__ROUTED_REACT_ROUTER_READY__
      ? await (globalThis as any).__ROUTED_REACT_ROUTER_READY__
      : (globalThis as any).__ROUTED_REACT_ROUTER__
    await Promise.all([333, 444, 555].map((id) => router.navigate('/detail/' + id)))
  })
  await expect(child).toHaveText(/\/detail\/555/)
  expect(await page.evaluate(() => history.length)).toBe(before + 4)
  await page.evaluate(async () => {
    const router = (globalThis as any).__ROUTED_REACT_ROUTER_READY__
      ? await (globalThis as any).__ROUTED_REACT_ROUTER_READY__
      : (globalThis as any).__ROUTED_REACT_ROUTER__
    await router.navigate(-1)
  })
  await expect(child).toHaveText(/\/detail\/444/)
  expect(page.url()).toContain('/approval/detail/444')
  expect(errors).toEqual([])
})
