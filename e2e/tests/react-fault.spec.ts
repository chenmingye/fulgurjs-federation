/**
 * React fixtures 的 fault 套件：真实浏览器故障注入（route 阻断远程请求）。
 * N01 入口不可达 / N02 chunk 请求失败 / N03 缺失 expose / N04 超时 / N05 渲染抛错。
 * 断言 = 中文错误占位（错误码+根因+修法+重试）+ 恢复成功（解除阻断后重试真实恢复）。
 */
import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('http://localhost:5104/')
})

async function login(page: import('@playwright/test').Page) {
  await page.getByTestId('login-alice').click()
}

test('N01 冷会话入口不可达：中文错误码+重试；恢复后同页重试成功', async ({ page }) => {
  // regex 持续阻断：runtime 的失败重试会在 URL 追加 fulgurjs_retry=<n>（穿透浏览器
  // module map 失败缓存），精确 URL 阻断会被该机制绕过——必须匹配全部变体
  let blocked = true
  await page.route(/localhost:5103\/@fulgurjs-entry\.js/, (route) => {
    if (blocked) route.abort('connectionrefused')
    else route.continue()
  })
  await login(page)
  await page.getByRole('link', { name: '远程首页' }).click()
  const box = page.locator('[data-fulgurjs-error]').first()
  await expect(box).toBeVisible({ timeout: 20000 })
  await expect(box).toHaveText(/远程组件加载失败（错误码 MFU-001）/, { timeout: 20000 })
  await expect(box).toContainText('修法')

  // 解除阻断 → 同页点击重试 → 真实恢复（新加载尝试带 retry query 穿透 module map）
  blocked = false
  await page.getByRole('button', { name: '重试' }).first().click()
  await expect(page.getByTestId('remote-home')).toBeVisible({ timeout: 20000 })
})

test('N02 入口可达但业务 chunk 失败：全新会话阻断 chunk；解除后恢复', async ({ page }) => {
  await page.route(/localhost:5103\/src\/pages\/Home\.tsx.*/, (route) => route.abort('failed'))
  await login(page)
  await page.getByRole('link', { name: '远程首页' }).click()
  const box = page.locator('[data-fulgurjs-error]').first()
  await expect(box).toBeVisible({ timeout: 20000 })
  await expect(box).toContainText('远程组件加载失败')
  await page.unroute(/localhost:5103\/src\/pages\/Home\.tsx.*/)
  await page.getByRole('button', { name: '重试' }).first().click()
  await expect(page.getByTestId('remote-home')).toBeVisible({ timeout: 20000 })
})

test('N03 缺失 expose：真实 MFU-006；切正确 spec 成功', async ({ page }) => {
  await login(page)
  await page.getByRole('link', { name: '故障注入' }).click()
  const first = page.locator('section').first().locator('[data-fulgurjs-error]')
  await expect(first).toBeVisible({ timeout: 20000 })
  await expect(first).toHaveAttribute('data-fulgurjs-error', 'MFU-006')
  await expect(first).toContainText('./does-not-exist')
  // 同页切正确 spec（导航到远程首页）成功
  await page.getByRole('link', { name: '远程首页' }).click()
  await expect(page.getByTestId('remote-home')).toBeVisible({ timeout: 20000 })
})

test('N04 组件加载超过 timeout：超时占位生效；迟到结果不覆盖', async ({ page }) => {
  await login(page)
  await page.getByRole('link', { name: '故障注入' }).click()
  const timeoutBox = page.locator('section').nth(1).locator('[data-fulgurjs-error]')
  await expect(timeoutBox).toBeVisible({ timeout: 10000 })
  await expect(timeoutBox).toContainText('加载等待超过 150 毫秒')
  // slow-payload 模块 300ms 后真实到达：不得覆盖超时终态（占位仍在）
  await page.waitForTimeout(900)
  await expect(timeoutBox).toContainText('加载等待超过 150 毫秒')
})

test('N05 远程组件 render 抛错：ErrorBoundary 捕获 + 渲染错误与网络错误分开归因', async ({ page }) => {
  await login(page)
  await page.getByRole('link', { name: '故障注入' }).click()
  const renderBox = page.locator('section').nth(2).locator('[data-fulgurjs-error]')
  await expect(renderBox).toBeVisible({ timeout: 10000 })
  await expect(renderBox).toContainText('远程组件渲染出错')
  await expect(renderBox).toContainText('broken-render')
  // 网络错误归因（第一 section）与渲染错误（第三 section）文案明确区分
  const netBox = page.locator('section').first().locator('[data-fulgurjs-error]')
  await expect(netBox).toContainText('远程组件加载失败')
})
