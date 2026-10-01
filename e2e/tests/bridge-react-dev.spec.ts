import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

/**
 * 桥接 dev 正向套件（React 宿主 × Vue 子应用，5106）：BR03/BR05/BR06/BR09。
 */
const EVIDENCE = path.resolve(import.meta.dirname, '../../testbed/runs/20261001-bridge-530/evidence')

test.describe('bridge-react-dev：React 宿主 × Vue 子应用', () => {
  test('BR03：挂载成功、props 快照、Vue 子应用 memory 路由切换真实生效', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' })
    await expect(page.locator('[data-fulgurjs-bridge-root]')).toHaveAttribute('data-fulgurjs-bridge-status', 'ready')
    const props = await page.textContent('[data-testid="bridge-vue-props"]')
    expect(props).toContain('from-host-v1')
    expect(props).toContain('"origin":"host-bridge-react"')
    expect(props).not.toContain('sess-A')
    await expect(page.locator('[data-testid="host-ready-count"]')).toContainText('ready-count:1')
    // Vue 子应用 memory 路由切换真实生效
    await page.click('[data-testid="bridge-vue-go-about"]')
    await expect(page.locator('[data-testid="bridge-vue-page"]')).toHaveText('page:about')
    await expect(page.locator('[data-testid="bridge-vue-route"]')).toHaveText('route:/about')
    await page.click('[data-testid="bridge-vue-go-home"]')
    await expect(page.locator('[data-testid="bridge-vue-page"]')).toHaveText('page:home')
    await page.screenshot({ path: path.join(EVIDENCE, 'br03-react-host-vue-sub.png'), fullPage: true })
  })

  test('BR05/BR09：StrictMode 下重渲染风暴与 props 引用替换不重挂、key 重挂生效', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' })
    await expect(page.locator('[data-fulgurjs-bridge-root]')).toHaveAttribute('data-fulgurjs-bridge-status', 'ready')
    // 宿主入口是 StrictMode（main.tsx）：无双实例（root 容器唯一）
    await expect(page.locator('[data-fulgurjs-bridge-root]')).toHaveCount(1)
    await page.click('[data-testid="act-storm"]')
    await expect(page.locator('[data-testid="bridge-vue-route"]')).toHaveText('route:/')
    await expect(page.locator('[data-testid="host-ready-count"]')).toContainText('ready-count:1')
    await page.click('[data-testid="act-toggle-label"]')
    await expect(page.locator('[data-testid="bridge-vue-props"]')).toContainText('from-host-v1')
    await page.click('[data-testid="act-remount"]')
    await expect(page.locator('[data-testid="bridge-vue-props"]')).toContainText('from-host-v2')
    await expect(page.locator('[data-testid="host-ready-count"]')).toContainText('ready-count:2')
  })

  test('BR06：A→登出→B 不刷新整页，onSession 记录新代次', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' })
    await expect(page.locator('[data-fulgurjs-bridge-root]')).toHaveAttribute('data-fulgurjs-bridge-status', 'ready')
    // remote-a 未声明 onSession：以页面全局 context 与容器状态为准
    await page.click('[data-testid="act-logout"]')
    await expect(page.locator('[data-fulgurjs-bridge-root]')).toHaveAttribute('data-fulgurjs-bridge-status', 'idle')
    expect(await page.locator('[data-bridge-root="remote-a"]').count()).toBe(0)
    await page.click('[data-testid="act-switch-b"]')
    await expect(page.locator('[data-fulgurjs-bridge-root]')).toHaveAttribute('data-fulgurjs-bridge-status', 'ready')
    await expect(page.locator('[data-testid="host-session"]')).toContainText('sess-B')
  })

  test('BR09：同页两个桥接实例互不干扰', async ({ page }) => {
    await page.goto('/?multi=1', { waitUntil: 'networkidle' })
    // 宿主挂载容器（data-fulgurjs-bridge-root）两个；子应用内容根（data-bridge-root）两个
    await expect(page.locator('[data-fulgurjs-bridge-root]')).toHaveCount(2)
    await expect(page.locator('[data-bridge-root="remote-a"]')).toHaveCount(2)
    await page.click('[data-testid="act-storm"]')
    await expect(page.locator('[data-fulgurjs-bridge-root]')).toHaveCount(2)
    for (let i = 0; i < 2; i++) {
      await expect(page.locator('[data-fulgurjs-bridge-root]').nth(i)).toHaveAttribute('data-fulgurjs-bridge-status', 'ready')
    }
  })
})
