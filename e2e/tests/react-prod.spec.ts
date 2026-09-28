/**
 * React fixtures 的 prod 套件：隔离 Nginx（prod-setup.sh 组装，端口见 .prod-port）。
 * 覆盖 R01–R10/R13 的生产形态 + prod 深链 + manifest 产物断言。
 */
import { expect, test } from '@playwright/test'

// host-react 部署在隔离 Nginx 的 /host-react/ 子路径（不覆盖 Vue 主站与 8662 MES）
const PROD_BASE = '/host-react'

test.beforeEach(async ({ page }) => {
  await page.goto(`${PROD_BASE}/`)
})

async function login(page: import('@playwright/test').Page, who: 'alice' | 'bob') {
  await page.getByTestId(`login-${who}`).click()
  await expect(page.getByTestId('account-state')).toHaveText(`account:${who}`)
}

test('prod R02 远程组件渲染 + click + Hooks（生产 JSX/子路径/manualChunks 链路）', async ({ page }) => {
  await login(page, 'alice')
  await expect(page.getByTestId('remote-button')).toHaveText(/远程按钮：已点击 0 次/)
  await page.getByTestId('remote-button').click()
  await expect(page.getByTestId('remote-count')).toHaveText('1')
})

test('prod R03+R10 参数页与深链强刷（Nginx SPA fallback）', async ({ page }) => {
  await login(page, 'alice')
  await page.goto(`${PROD_BASE}/remote-react/detail/77?tab=prod`)
  await login(page, 'alice')
  await expect(page.getByTestId('detail-id')).toHaveText('id:77')
  await expect(page.getByTestId('detail-tab')).toHaveText('tab:prod')
})

test('prod R06/R07 生命周期与会话切换', async ({ page }) => {
  await login(page, 'alice')
  await page.goto(`${PROD_BASE}/session`)
  await login(page, 'alice')
  await expect(page.getByTestId('setup-count')).toHaveText('setup:1')
  await expect(page.getByTestId('onsession-count')).toHaveText('onSession:1')
  await page.getByRole('link', { name: '远程首页' }).click()
  await expect(page.getByTestId('home-account')).toHaveText('account:alice')
  await page.getByTestId('logout').click()
  await expect(page.getByTestId('logged-out')).toBeVisible()
  await login(page, 'bob')
  await page.getByRole('link', { name: '远程首页' }).click()
  await expect(page.getByTestId('home-account')).toHaveText('account:bob')
  await expect(page.getByTestId('home-greeting')).toHaveText('hello bob @ remote-data-v1')
})

test('prod R08 共享 Context 值变化', async ({ page }) => {
  await login(page, 'alice')
  await page.goto(`${PROD_BASE}/remote-react/home`)
  await login(page, 'alice')
  await expect(page.getByTestId('home-theme')).toHaveText('theme:light')
  await page.getByTestId('theme-toggle').check()
  await expect(page.getByTestId('home-theme')).toHaveText('theme:dark')
})

test('prod R09 utils 模块与 reload', async ({ page }) => {
  await login(page, 'alice')
  await page.goto(`${PROD_BASE}/utils`)
  await login(page, 'alice')
  await expect(page.getByTestId('utils-money')).toHaveText('¥12.50')
  await page.getByTestId('utils-reload').click()
  await expect(page.getByTestId('utils-money')).toHaveText('¥12.50')
})

test('prod 产物：remoteEntry/manifest 可达且 expose 哈希产物存在', async ({ request }) => {
  // remote-react 部署在站点根的 /remote-react/（与 host-react 的 /host-react/ 平级）
  const entry = await request.get(`/remote-react/fulgurjs-remoteEntry.js`)
  expect(entry.status()).toBe(200)
  const manifest = await request.get(`/remote-react/fulgurjs-manifest.json`)
  expect(manifest.status()).toBe(200)
  const m = await manifest.json()
  expect(m.name).toBe('remote-react')
  expect(Object.keys(m.exposes ?? {})).toContain('./Button')
  expect(m.exposes['./Button'].file).toBeTruthy()
  const chunk = await request.get(`/remote-react/${m.exposes['./Button'].file}`)
  expect(chunk.status()).toBe(200)
})
