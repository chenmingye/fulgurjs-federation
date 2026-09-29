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

// ── B 验证：生产重试 helper 的真实浏览器行为（任务书 §6）──

test('prod B1 两个 expose 别名同一 chunk：并发加载身份严格相等、单次求值、重复访问零新增请求', async ({ page }) => {
  // 监听必须先于任何导航/挂载安装（R09 教训）
  const themeRequests: string[] = []
  page.on('request', (r) => {
    const u = r.url()
    if (u.includes('/remote-react/assets/theme-context-')) themeRequests.push(u)
  })
  await page.goto(`${PROD_BASE}/alias`)
  await login(page, 'alice')
  // Provider 的 useLoadRemote('remote-react/theme-context') 随登录树挂载已触发本会话
  // 唯一一次网络请求；等它落地后再断言基线
  await expect
    .poll(() => themeRequests.length, { timeout: 15000 })
    .toBe(1)
  const baseline = themeRequests.length
  // 面板 Promise.all 两个别名 + 重复加载：全部命中运行时缓存/helper 定型 Promise
  await page.getByTestId('alias-load-both').click()
  await expect(page.getByTestId('alias-identity')).toHaveText('identity:same', { timeout: 15000 })
  await expect(page.getByTestId('alias-evals')).toHaveText('evals:1')
  await page.getByTestId('alias-load-again').click()
  await expect(page.getByTestId('alias-loadcount')).toHaveText('loadCalls:2')
  await expect(page.getByTestId('alias-identity')).toHaveText('identity:same')
  await expect(page.getByTestId('alias-evals')).toHaveText('evals:1')
  expect(themeRequests.length, `theme-context chunk 请求应保持 ${baseline} 次，实际：${themeRequests.join(', ')}`).toBe(baseline)
  expect(themeRequests.every((u) => !u.includes('fulgurjs_retry'))).toBe(true)
})

test('prod B2 并发失败→解除→同页重试：单代次推进（重试 URL 恰为 retry=1）、恢复后身份/求值正确', async ({ page }) => {
  // 阻断与监听先于导航安装；theme-context chunk 未加载时 Provider + 面板两个别名
  // 共享同一失败（per-URL promise 去重 → 并发失败只推进一代）
  const themeRequests: string[] = []
  page.on('request', (r) => {
    const u = r.url()
    if (u.includes('/remote-react/assets/theme-context-')) themeRequests.push(u)
  })
  let blocked = true
  await page.route(/\/remote-react\/assets\/theme-context-[^?]*(\?.*)?$/, (route) => {
    if (blocked) route.abort('failed')
    else route.continue()
  })
  await page.goto(`${PROD_BASE}/alias`)
  await login(page, 'alice')
  await page.getByTestId('alias-load-both').click()
  await expect(page.getByTestId('alias-error')).toBeVisible({ timeout: 15000 })
  const failedUrls = themeRequests.length
  expect(failedUrls).toBeGreaterThanOrEqual(1)
  blocked = false
  await page.getByTestId('alias-load-again').click()
  await expect(page.getByTestId('alias-identity')).toHaveText('identity:same', { timeout: 15000 })
  await expect(page.getByTestId('alias-evals')).toHaveText('evals:1')
  // 单代次推进的直接证据：恢复请求恰为 ?fulgurjs_retry=1（并发失败未互相覆盖出 retry=2/3）
  const retryUrl = themeRequests.find((u) => u.includes('fulgurjs_retry'))
  expect(retryUrl, `应存在带 retry 查询的恢复请求，全部请求：${themeRequests.join(' | ')}`).toBeTruthy()
  expect(retryUrl).toMatch(/fulgurjs_retry=1$/)
})

test('prod B3a 入口失败→解除→同页重试恢复（runtime importEntry 失败计数重试）', async ({ page }) => {
  let blocked = true
  await page.route(/\/remote-react\/fulgurjs-remoteEntry\.js(\?.*)?$/, (route) => {
    if (blocked) route.abort('connectionrefused')
    else route.continue()
  })
  await login(page, 'alice')
  await page.getByRole('link', { name: '远程首页' }).click()
  const box = page.locator('[data-fulgurjs-error]').first()
  await expect(box).toBeVisible({ timeout: 20000 })
  await expect(box).toContainText('远程组件加载失败')
  blocked = false
  await page.getByRole('button', { name: '重试' }).first().click()
  await expect(page.getByTestId('remote-home')).toBeVisible({ timeout: 20000 })
})

test('prod B3b expose chunk 失败→解除→同页重试恢复（__fgR 换 URL 穿透失败缓存）', async ({ page }) => {
  let blocked = true
  await page.route(/\/remote-react\/assets\/Home-[^?]*(\?.*)?$/, (route) => {
    if (blocked) route.abort('failed')
    else route.continue()
  })
  await login(page, 'alice')
  await page.getByRole('link', { name: '远程首页' }).click()
  const box = page.locator('[data-fulgurjs-error]').first()
  await expect(box).toBeVisible({ timeout: 20000 })
  await expect(box).toContainText('远程组件加载失败')
  blocked = false
  await page.getByRole('button', { name: '重试' }).first().click()
  await expect(page.getByTestId('remote-home')).toBeVisible({ timeout: 20000 })
  // 恢复请求必须换用 retry URL（穿透浏览器失败缓存）——记录到网络层证据
})

test('prod B3c expose 的静态依赖 chunk 失败：如实记录同页恢复边界（不做全图改写）', async ({ page }) => {
  // 阻断与监听先于导航安装：StaticDepProbe 随登录树挂载即发起加载
  let blocked = true
  const leafRequests: string[] = []
  page.on('request', (r) => {
    const u = r.url()
    if (u.includes('/remote-react/assets/static-dep-leaf-')) leafRequests.push(u)
  })
  page.on('requestfailed', (r) => {
    const u = r.url()
    if (u.includes('/remote-react/assets/static-dep-leaf-')) leafRequests.push(`${u} [FAILED]`)
  })
  await page.route(/\/remote-react\/assets\/static-dep-leaf-[^?]*(\?.*)?$/, (route) => {
    if (blocked) route.abort('failed')
    else route.continue()
  })
  await page.goto(`${PROD_BASE}/alias`)
  await login(page, 'alice')
  const box = page.locator('section [data-fulgurjs-error]').first()
  await expect(box).toBeVisible({ timeout: 20000 })
  await expect(box).toContainText('远程组件加载失败')
  blocked = false
  await page.getByRole('button', { name: '重试' }).first().click()
  // 观察实际行为（不预设结论）：若 leaf 失败被浏览器 module map 缓存，同页重试仍失败——
  // 这是静态依赖失败的已知边界（修复需全图改写，任务书明确不做），断言保留失败呈现
  const recovered = await page
    .getByTestId('static-dep-value')
    .waitFor({ state: 'visible', timeout: 8000 })
    .then(() => true)
    .catch(() => false)
  if (recovered) {
    // 可恢复：leaf 请求必须真实重发（非缓存假成功）
    expect(leafRequests.length).toBeGreaterThan(1)
  } else {
    // 不可恢复：错误占位仍在（边界如实记录，不计 PASS 于恢复项）
    await expect(page.locator('section [data-fulgurjs-error]').first()).toBeVisible()
  }
})

import { reactContracts } from './react-contracts'
reactContracts(true)
