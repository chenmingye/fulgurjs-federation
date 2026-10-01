import { expect, test } from '@playwright/test'

/**
 * 桥接生产套件（隔离 NGINX，端口读 e2e/.prod-port）：BR11。
 * 双向桥接生产形态复验 BR02/BR03/BR06/BR07 + 深链刷新 + memory 路由不与 URL 同步。
 */
const VUE_HOST = '/host-bridge-vue/'
const REACT_HOST = '/host-bridge-react/'

test.describe('bridge-prod：隔离 NGINX 生产形态', () => {
  test('BR11：Vue 宿主 × React 子应用（含挂载/交互/会话切换）', async ({ page }) => {
    await page.goto(VUE_HOST, { waitUntil: 'networkidle' })
    await expect(page.locator('[data-fulgurjs-bridge-root]')).toHaveAttribute('data-fulgurjs-bridge-status', 'ready')
    await expect(page.locator('[data-testid="bridge-react-props"]')).toContainText('from-host-v1')
    await page.click('[data-testid="bridge-react-counter"]')
    await expect(page.locator('[data-testid="bridge-react-counter"]')).toContainText('count:1')
    await page.click('[data-testid="bridge-react-go-about"]')
    await expect(page.locator('[data-testid="bridge-react-page"]')).toHaveText('page:about')
    // BR06 生产复验：登出→空容器→换 B→重挂
    await page.click('[data-testid="act-logout"]')
    await expect(page.locator('[data-fulgurjs-bridge-root]')).toHaveAttribute('data-fulgurjs-bridge-status', 'idle')
    await page.click('[data-testid="act-switch-b"]')
    await expect(page.locator('[data-fulgurjs-bridge-root]')).toHaveAttribute('data-fulgurjs-bridge-status', 'ready')
    expect(await page.evaluate(() => (globalThis as any).__REMOTE_REACT_LAST_SESSION__)).toBe('sess-B')
  })

  test('BR11：React 宿主 × Vue 子应用（含 memory 路由）', async ({ page }) => {
    await page.goto(REACT_HOST, { waitUntil: 'networkidle' })
    await expect(page.locator('[data-fulgurjs-bridge-root]')).toHaveAttribute('data-fulgurjs-bridge-status', 'ready')
    await expect(page.locator('[data-testid="bridge-vue-props"]')).toContainText('from-host-v1')
    await page.click('[data-testid="bridge-vue-go-about"]')
    await expect(page.locator('[data-testid="bridge-vue-page"]')).toHaveText('page:about')
  })

  test('BR11：宿主桥接页深链与刷新正常；子应用 memory 路由不与浏览器 URL 同步', async ({ page }) => {
    await page.goto(VUE_HOST, { waitUntil: 'networkidle' })
    await expect(page.locator('[data-fulgurjs-bridge-root]')).toHaveAttribute('data-fulgurjs-bridge-status', 'ready')
    // 子应用内部路由切换：浏览器 URL 必须保持不变（memory 路由，v1 明确不与宿主 URL 同步）
    const urlBefore = page.url()
    await page.click('[data-testid="bridge-react-go-about"]')
    await expect(page.locator('[data-testid="bridge-react-page"]')).toHaveText('page:about')
    expect(page.url()).toBe(urlBefore)
    // 深链（带 query）直接打开 + 刷新：宿主页与桥接恢复加载正常
    await page.goto(`${VUE_HOST}?case=deep-link`, { waitUntil: 'networkidle' })
    await expect(page.locator('[data-fulgurjs-bridge-root]')).toHaveAttribute('data-fulgurjs-bridge-status', 'ready')
    await page.reload({ waitUntil: 'networkidle' })
    await expect(page.locator('[data-fulgurjs-bridge-root]')).toHaveAttribute('data-fulgurjs-bridge-status', 'ready')
  })

  test('BR11：生产加载失败→恢复语义与 dev 一致（故障 expose 占位）', async ({ page }) => {
    await page.goto(`${VUE_HOST}?spec=mount-fail`, { waitUntil: 'networkidle' })
    await expect(page.locator('[data-fulgurjs-error="MFU-016"]')).toBeVisible()
    await page.goto(`${VUE_HOST}?spec=broken`, { waitUntil: 'networkidle' })
    await expect(page.locator('[data-fulgurjs-error="MFU-015"]')).toBeVisible()
  })
})
