import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

/**
 * 桥接故障套件（dev，Vue 宿主 5105 / React 宿主 5106）：
 * BN01/BN02（故障注入 expose）、BN06/BN07（pending 换会话 + 迟到结果，Playwright 路由延迟注入）。
 * BN03/BN08/BN09/BN10 由单元测试覆盖（tests/bridge*.test.ts）；BN04/BN05 见验收报告（配置违例实测）。
 */
const EVIDENCE = path.resolve(import.meta.dirname, '../../testbed/runs/20261001-bridge-530/evidence')

test.describe('bridge-fault：Vue 宿主故障注入', () => {
  test('BN01：契约非法（缺 unmount/mount 非函数）→ MFU-015 三段式占位与恢复操作', async ({ page }) => {
    await page.goto('/?spec=broken', { waitUntil: 'networkidle' })
    const errBox = page.locator('[data-fulgurjs-error="MFU-015"]')
    await expect(errBox).toBeVisible()
    const text = await errBox.textContent()
    expect(text).toContain('现象')
    expect(text).toContain('根因')
    expect(text).toContain('修法')
    expect(text).toContain('unmount')
    expect(errBox.locator('[data-fulgurjs-retry]')).toBeVisible()
    expect(errBox.locator('[data-fulgurjs-reload]')).toBeVisible()
    await page.screenshot({ path: path.join(EVIDENCE, 'bn01-mf015-placeholder.png'), fullPage: true })
    // 换回正常 expose（同一 spec 常量失败，恢复 = 换合法契约）：新页面加载成功
    await page.goto('/', { waitUntil: 'networkidle' })
    await expect(page.locator('[data-fulgurjs-bridge-root]')).toHaveAttribute('data-fulgurjs-bridge-status', 'ready')
  })

  test('BN02：mount 内部抛错 → MFU-016（含根因），无半挂残留', async ({ page }) => {
    await page.goto('/?spec=mount-fail', { waitUntil: 'networkidle' })
    const errBox = page.locator('[data-fulgurjs-error="MFU-016"]')
    await expect(errBox).toBeVisible()
    const text = await errBox.textContent()
    expect(text).toContain('mount 阶段失败')
    expect(text).toContain('BN02')
    // 容器内无半挂内容
    expect(await page.locator('[data-bridge-root="remote-react"] > *').count()).toBe(0)
    await page.screenshot({ path: path.join(EVIDENCE, 'bn02-mf016-placeholder.png'), fullPage: true })
  })
})

test.describe('bridge-fault：pending 换会话（路由延迟注入）', () => {
  test('BN06/BN07：loadRemote 未返回时登出→迟到结果不复活、不产生未处理拒绝', async ({ page }) => {
    const consoleErrors: string[] = []
    page.on('pageerror', (e) => consoleErrors.push(e.message))
    let delayed = 0
    await page.route(/5103\/src\/bridge\.tsx/, async (route) => {
      const resp = await route.fetch()
      if (delayed++ === 0) await new Promise((r) => setTimeout(r, 1500))
      await route.fulfill({ response: resp })
    })
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    // pending 期间登出（作废旧代次）
    await page.click('[data-testid="act-logout"]')
    await expect(page.locator('[data-fulgurjs-bridge-root]')).toHaveAttribute('data-fulgurjs-bridge-status', 'idle', { timeout: 15000 })
    // 迟到的 A 代次结果到达：不得复活 DOM
    await page.waitForTimeout(2000)
    expect(await page.locator('[data-bridge-root="remote-react"]').count()).toBe(0)
    await expect(page.locator('[data-fulgurjs-bridge-root]')).toHaveAttribute('data-fulgurjs-bridge-status', 'idle')
    // 无未处理拒绝 / 页面异常
    expect(consoleErrors).toEqual([])
  })

  test('BN07：pending 时直接 A→B，旧代次迟到结果不得调用 mount，B 正常挂载', async ({ page }) => {
    let delayed = 0
    await page.route(/5103\/src\/bridge\.tsx/, async (route) => {
      const resp = await route.fetch()
      if (delayed++ === 0) await new Promise((r) => setTimeout(r, 1500))
      await route.fulfill({ response: resp })
    })
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.click('[data-testid="act-switch-b"]')
    // B 新代次完成挂载（第二次请求不被延迟）
    await expect(page.locator('[data-fulgurjs-bridge-root]')).toHaveAttribute('data-fulgurjs-bridge-status', 'ready', { timeout: 20000 })
    expect(await page.locator('[data-bridge-root="remote-react"]').count()).toBe(1)
    // A 的迟到结果落地后：仍然只有 B 的一个实例，无重复挂载
    await page.waitForTimeout(2500)
    expect(await page.locator('[data-bridge-root="remote-react"]').count()).toBe(1)
    await expect(page.locator('[data-fulgurjs-bridge-root]')).toHaveAttribute('data-fulgurjs-bridge-status', 'ready')
  })
})

test.describe('bridge-fault：React 宿主故障注入', () => {
  test('BN01/BN02：React 宿主侧同样的 MFU-015/016 占位', async ({ page }) => {
    await page.goto('http://localhost:5106/?spec=broken', { waitUntil: 'networkidle' })
    await expect(page.locator('[data-fulgurjs-error="MFU-015"]')).toBeVisible()
    await page.goto('http://localhost:5106/?spec=mount-fail', { waitUntil: 'networkidle' })
    await expect(page.locator('[data-fulgurjs-error="MFU-016"]')).toBeVisible()
    expect(await page.locator('[data-bridge-root="remote-a"] > *').count()).toBe(0)
    await page.screenshot({ path: path.join(EVIDENCE, 'bn02-react-host-mf016.png'), fullPage: true })
  })
})
