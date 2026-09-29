/** 开发与真实 nginx 生产共用的契约，避免把浏览器行为标为生产 N/A。 */
import { expect, test } from '@playwright/test'

export function reactContracts(prod: boolean) {
  const base = prod ? '/host-react' : ''
  test('R01 冷登录不请求未访问的远程页面', async ({ page }) => {
    const urls: string[] = []
    page.on('request', (r) => urls.push(r.url()))
    await page.goto(`${base}/`)
    await page.getByTestId('login-alice').click()
    await expect(page.getByTestId('remote-button')).toBeVisible()
    const manifest = await page.request.get(prod ? '/remote-react/fulgurjs-manifest.json' : 'http://localhost:5103/@fulgurjs-manifest.json')
    const m = await manifest.json()
    const entries = Array.isArray(m.exposes) ? m.exposes : Object.entries(m.exposes).map(([name, v]: [string, any]) => ({ name, ...v }))
    for (const key of ['./pages/home', './pages/detail']) {
      const entry = entries.find((e: any) => e.name === key)
      expect(entry).toBeTruthy()
      expect(urls.some((u) => u.includes(entry.file))).toBe(false)
    }
  })
  test('R04 多实例的本地状态独立，普通宿主重渲染不重建', async ({ page }) => {
    await page.goto(`${base}/hooks`)
    await page.getByTestId('login-alice').click()
    await expect(page.getByTestId('probe-instance').first()).toHaveText('A#1')
    await expect(page.getByTestId('probe-instance').nth(1)).toHaveText('B#2')
    await page.getByTestId('probe-click').first().click()
    await expect(page.getByTestId('probe-clicks').first()).toHaveText('clicks:1')
    await expect(page.getByTestId('probe-clicks').nth(1)).toHaveText('clicks:0')
    await page.getByTestId('theme-toggle').check()
    await expect(page.getByTestId('probe-clicks').first()).toHaveText('clicks:1')
  })
  test('R09 慢 A 快 B、失败清数据、连续 reload、卸载的真实浏览器链路', async ({ page }) => {
    const unhandled: string[] = []
    page.on('pageerror', (e) => unhandled.push(e.message))
    await page.goto(`${base}/`)
    await page.getByTestId('login-alice').click()
    await expect(page.getByTestId('theme-toggle')).toBeVisible()
    await page.getByRole('link', { name: '竞态探针' }).click()
    await expect(page.getByTestId('race-loading')).toHaveText('true')
    await page.getByTestId('race-fast').click()
    await expect(page.getByTestId('race-value')).toHaveText('fast-B')
    await page.waitForTimeout(900)
    await expect(page.getByTestId('race-value')).toHaveText('fast-B')
    await page.getByTestId('race-reload').click()
    await page.getByTestId('race-reload').click()
    await expect(page.getByTestId('race-value')).toHaveText('fast-B')
    await page.getByTestId('race-missing').click()
    await expect(page.getByTestId('race-error')).toContainText('MFU-006')
    await expect(page.getByTestId('race-value')).toHaveText('(empty)')
    await page.getByRole('link', { name: '远程首页' }).click()
    await expect(page.getByTestId('remote-home')).toBeVisible()
    expect(unhandled).toEqual([])
  })
  test('R09 慢请求在卸载后完成，不影响新页面且无未处理拒绝', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto(`${base}/`)
    await page.getByTestId('login-alice').click()
    await expect(page.getByTestId('theme-toggle')).toBeVisible()
    await page.getByRole('link', { name: '竞态探针' }).click()
    await expect(page.getByTestId('race-loading')).toHaveText('true')
    await page.getByRole('link', { name: '远程首页' }).click()
    await expect(page.getByTestId('remote-home')).toBeVisible()
    await page.waitForTimeout(900)
    await expect(page.getByTestId('race-panel')).toHaveCount(0)
    await expect(page.getByTestId('home-account')).toHaveText('account:alice')
    expect(errors).toEqual([])
  })
  test('R12 两个方向跨框架普通模块真实导出值', async ({ page }) => {
    await page.goto(`${base}/`)
    await page.getByTestId('login-alice').click()
    await expect(page.getByTestId('remote-button')).toBeVisible()
    const values = await page.evaluate(async (isProd) => {
      const rt = await Promise.resolve((window as any).__FULGURJS_RUNTIME__)
      rt.registerRemote({ name: 'remote-a', entry: isProd ? `${location.origin}/remote-a/fulgurjs-remoteEntry.js` : 'http://localhost:5101/@fulgurjs-entry.js' })
      const mod = await rt.loadRemote('remote-a/utils')
      return { sum: mod.sum(2, 3, 7), answer: mod.ANSWER }
    }, prod)
    expect(values).toEqual({ sum: 12, answer: 42 })
    const vue = await page.context().newPage()
    await vue.goto(prod ? '/' : 'http://localhost:5100/')
    const values2 = await vue.evaluate(async (isProd) => {
      ;(window as any).__FULGURJS_APP_CONFIG__ = { sessionKey: 'cross-framework', user: { name: 'alice' } }
      const rt = await Promise.resolve((window as any).__FULGURJS_RUNTIME__)
      rt.registerRemote({ name: 'remote-react', entry: isProd ? `${location.origin}/remote-react/fulgurjs-remoteEntry.js` : 'http://localhost:5103/@fulgurjs-entry.js' })
      const mod = await rt.loadRemote('remote-react/utils')
      return { money: mod.formatMoney(12.5), date: mod.formatDate('2026-09-28T00:00:00Z') }
    }, prod)
    expect(values2).toEqual({ money: '¥12.50', date: '2026-09-28' })
    await vue.close()
  })
  for (const phase of ['setup', 'onSession'] as const) {
    test(`N06 ${phase} 原始异常保留且失败后同页恢复`, async ({ page }) => {
      await page.addInitScript((p) => { (window as any).__FG_FAIL_PHASE__ = p }, phase)
      await page.goto(`${base}/`)
      await page.getByTestId('login-alice').click()
      const rejected = await page.evaluate(async () => {
        const rt = await Promise.resolve((window as any).__FULGURJS_RUNTIME__)
        try { await rt.loadRemote('remote-react/utils'); return { unexpectedSuccess: true } }
        catch (e: any) { return { code: e.code, phase: e.details?.phase, cause: e.cause?.message, setup: (window as any).__REMOTE_REACT_SETUP__ } }
      })
      expect(rejected).toMatchObject({ code: 'MFU-012', phase, cause: `验收注入：${phase} 原始异常` })
      const recovered = await page.evaluate(async () => {
        ;(window as any).__FG_FAIL_PHASE__ = null
        const rt = await Promise.resolve((window as any).__FULGURJS_RUNTIME__)
        const mod = await rt.loadRemote('remote-react/utils')
        const sessionCount = (window as any).__REMOTE_REACT_ON_SESSION__
        await rt.loadRemote('remote-react/utils')
        return { money: mod.formatMoney(12.5), setup: (window as any).__REMOTE_REACT_SETUP__, sessionCount, after: (window as any).__REMOTE_REACT_ON_SESSION__ }
      })
      expect(recovered.money).toBe('¥12.50')
      expect(recovered.after).toBe(recovered.sessionCount)
      if (phase === 'onSession') expect(recovered.setup).toBe(rejected.setup)
    })
  }
}
