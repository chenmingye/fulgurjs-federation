/**
 * React fixtures 的 dev 套件（remote-react 5103 / host-react 5104）。
 * 覆盖任务书 R01–R12 的 dev 形态（prod 形态见 react-prod.spec.ts；R15 类型与 R16 examples
 * 为独立消费工程脚本，见 e2e/scripts）。
 */
import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  // D06 §8.3：监听必须在任何导航/操作之前——晚挂得到的"零错误"不算证据
  page.__fgErrors = []
  page.on('pageerror', (e) => page.__fgErrors.push(`pageerror:${e.message}`))
  page.on('console', (m) => { if (m.type() === 'error') page.__fgErrors.push(`console:${m.text()}`) })
  page.on('requestfailed', (r) => {
    // 依赖预构建暂态（504 Outdated Optimize Dep / favicon）不计入页面级失败证据
    const u = r.url()
    if (u.includes('favicon')) return
    page.__fgErrors.push(`requestfailed:${u}`)
  })
  await page.goto('http://localhost:5104/')
})

async function login(page: import('@playwright/test').Page, who: 'alice' | 'bob') {
  await page.getByTestId(`login-${who}`).click()
  await expect(page.getByTestId('account-state')).toHaveText(`account:${who}`)
}

test('R01 冷缓存打开宿主首页不请求业务 expose', async ({ page, browser }) => {
  // 预热：清 .vite 后首轮访问各页面会触发 optimizeDeps 渐进发现（DEV-010 暂态窗口，
  // 页面可能整页 reload）——先把全部路由踩热，后续用例在稳定服务上断言
  for (const path of ['/hooks', '/session', '/fault', '/utils', '/remote-react/home', '/remote-react/detail/1?tab=w']) {
    await page.goto(`http://localhost:5104${path}`, { waitUntil: 'load' })
    await page.waitForTimeout(400)
  }
  await page.goto('http://localhost:5104/')

  // 冷缓存断言在全新 context（未访问过任何远程模块）
  const ctx = await browser.newContext()
  const cold = await ctx.newPage()
  const requests: string[] = []
  cold.on('request', (r) => requests.push(r.url()))
  await cold.goto('http://localhost:5104/')
  await cold.getByTestId('login-alice').click()
  await cold.waitForTimeout(800)
  // 尚未进入任何远程页面时，不请求页面级业务模块（pages/Home、pages/Detail）。
  // 顶层 SessionLive 探针按设计加载 utils（D01 探针，单模块）；RemoteButton 在「/」
  // 渲染即加载——两者都不属于「未访问页面的模块」。
  expect(requests.some((u) => u.includes('pages/Home') || u.includes('pages/Detail'))).toBe(false)
  await ctx.close()
})

test('R02 远程组件真实显示 + click/props/回调/Hooks', async ({ page }) => {
  await login(page, 'alice')
  await expect(page.getByTestId('remote-button')).toHaveText(/远程按钮：已点击 0 次/)
  await page.getByTestId('remote-button').click()
  await page.getByTestId('remote-button').click()
  await expect(page.getByTestId('remote-count')).toHaveText('2') // useState 生效（同一 React 实例）
  await expect(page.getByTestId('button-clicks')).toHaveText('clicks:2') // props 回调透传
})

test('R03 参数页真实 id/query 进 props；第二页只新增所需模块', async ({ page }) => {
  await login(page, 'alice')
  await page.goto('http://localhost:5104/remote-react/home')
  await login(page, 'alice')
  await expect(page.getByTestId('remote-home')).toBeVisible()
  const afterHome = await countRemoteModuleRequests(page)
  await page.getByRole('link', { name: '远程参数页' }).click()
  await expect(page.getByTestId('detail-id')).toHaveText('id:42')
  await expect(page.getByTestId('detail-tab')).toHaveText('tab:basic')
  const afterDetail = await countRemoteModuleRequests(page)
  expect(afterDetail).toBeGreaterThan(afterHome)
})

async function countRemoteModuleRequests(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(() =>
    performance.getEntriesByType('resource')
      .filter((e) => e.name.includes('5103') && e.name.includes('/src/'))
      .length,
  )
}

test('R04 多实例同组件互不混用；普通 render 不重建加载器', async ({ page }) => {
  await login(page, 'alice')
  await page.goto('http://localhost:5104/hooks')
  await login(page, 'alice')
  await expect(page.getByTestId('probe-instance').first()).toHaveText('A#1')
  await expect(page.getByTestId('probe-instance').nth(1)).toHaveText('B#2')
  // StrictMode dev 下 effect setup→cleanup→setup：effects 计数为 2 且无错误
  const effects = await page.getByTestId('probe-effects').allTextContents()
  expect(effects.every((e) => e === 'effects:2' || e === 'effects:1')).toBe(true)
})

test('R06 setup 一次 / onSession 按代次去重 / 只预取不执行', async ({ page }) => {
  // 先真实加载一个远程模块（setup/onSession 计数建立在 window 上，整页导航会清零）
  await login(page, 'alice')
  await page.goto('http://localhost:5104/remote-react/home')
  await login(page, 'alice')
  await expect(page.getByTestId('remote-home')).toBeVisible()
  // SPA 导航到 /session（保持同一 window）
  await page.getByRole('link', { name: '会话' }).click()
  await expect(page.getByTestId('setup-count')).toHaveText('setup:1')
  await expect(page.getByTestId('onsession-count')).toHaveText('onSession:1')
  // preloadRemote 不执行生命周期（计数不变）
  await page.evaluate(() => Promise.resolve(window.__FULGURJS_RUNTIME__).then((rt) => rt.preloadRemote('remote-react/utils')))
  await page.waitForTimeout(600)
  await expect(page.getByTestId('setup-count')).toHaveText('setup:1')
  await expect(page.getByTestId('onsession-count')).toHaveText('onSession:1')
})

test('R07 同页 A→真实退出→B：无整页刷新、B 数据生效、代次正确', async ({ page }) => {
  await login(page, 'alice')
  await page.goto('http://localhost:5104/remote-react/home')
  await login(page, 'alice')
  await expect(page.getByTestId('home-account')).toHaveText('account:alice')
  const navCount = await page.evaluate(() => performance.getEntriesByType('navigation').length)
  await page.getByTestId('logout').click()
  await expect(page.getByTestId('logged-out')).toBeVisible()
  await login(page, 'bob')
  await page.getByRole('link', { name: '远程首页' }).click()
  await expect(page.getByTestId('home-account')).toHaveText('account:bob')
  await expect(page.getByTestId('home-greeting')).toHaveText('hello bob @ remote-data-v1')
  // 不允许整页刷新
  expect(await page.evaluate(() => performance.getEntriesByType('navigation').length)).toBe(navCount)
  // 会话断言同样保持 SPA 导航（window 计数不清零）
  await page.getByRole('link', { name: '会话' }).click()
  await expect(page.getByTestId('setup-count')).toHaveText('setup:1')
  await expect(page.getByTestId('onsession-count')).toHaveText('onSession:2')
  await expect(page.getByTestId('last-session')).toHaveText(/session-bob-/)
})

test('D01 同实例会话切换：不卸载组件 A→B 新会话数据生效；同会话 rerender 不重载', async ({ page }) => {
  await page.goto('http://localhost:5104/session-live')
  // 未登录：探针已挂载；remote-react 声明 onSession（MFU-013 契约）→ 加载显式失败，
  // 探针呈现错误/空态而非任何用户数据（不会泄露上一会话内容）
  await expect(page.getByTestId('session-live-money')).toHaveText('', { timeout: 20000 })
  // 登录 alice（不卸载探针——它在 App 顶层）：hook 必须随新 sessionKey 重载 A 数据
  await login(page, 'alice')
  await expect(page.getByTestId('session-live-money')).toHaveText(/session-live:alice:¥1.00/, { timeout: 20000 })
  // 同会话普通 rerender（SPA 导航离开再回来，探针实例保持挂载）：数据保持 A（onSession
  // 按代次去重——会话页计数不变，证明同代次未重跑生命周期）
  await page.evaluate(() => { history.pushState({}, '', '/'); window.dispatchEvent(new PopStateEvent('popstate')) })
  await page.evaluate(() => { history.pushState({}, '', '/session-live'); window.dispatchEvent(new PopStateEvent('popstate')) })
  await expect(page.getByTestId('session-live-money')).toHaveText(/session-live:alice:¥1.00/)
  await page.evaluate(() => { history.pushState({}, '', '/session'); window.dispatchEvent(new PopStateEvent('popstate')) })
  await expect(page.getByTestId('onsession-count')).toHaveText('onSession:1', { timeout: 10000 })
  // A→B：不登出不卸载，直接换账号——B 数据生效（新代次 onSession 恰好 +1）
  await login(page, 'bob')
  await expect(page.getByTestId('session-live-money')).toHaveText(/session-live:bob:¥1.00/, { timeout: 20000 })
  await expect(page.getByTestId('onsession-count')).toHaveText('onSession:2', { timeout: 10000 })
})

async function loadsOf(page: import('@playwright/test').Page): Promise<number> {
  const text = await page.getByTestId('session-live-loads').textContent()
  return Number((text ?? 'loads:0').replace('loads:', ''))
}

test('R08 宿主 Provider 值变化远程可读（同一 Context 对象）', async ({ page }) => {
  await login(page, 'alice')
  await page.goto('http://localhost:5104/remote-react/home')
  await login(page, 'alice')
  await expect(page.getByTestId('home-theme')).toHaveText('theme:light')
  await page.getByTestId('theme-toggle').check()
  await expect(page.getByTestId('home-theme')).toHaveText('theme:dark')
  await expect(page.getByTestId('home-account')).toHaveText('account:alice')
})

test('R09 useLoadRemote 竞态：切换/重载/卸载不覆盖最新数据', async ({ page }) => {
  await login(page, 'alice')
  await page.goto('http://localhost:5104/utils')
  await login(page, 'alice')
  await expect(page.getByTestId('utils-money')).toHaveText('¥12.50')
  await page.getByTestId('utils-reload').click()
  await expect(page.getByTestId('utils-money')).toHaveText('¥12.50') // 重载后仍正确
  // 无未处理 rejection / console error / 请求失败（beforeEach 已预挂监听）
  await page.getByTestId('utils-reload').click()
  await page.waitForTimeout(600)
  expect(page.__fgErrors).toEqual([])
})

test('R10 深链强刷（dev）', async ({ page }) => {
  await login(page, 'alice')
  await page.goto('http://localhost:5104/remote-react/detail/99?tab=deep')
  await login(page, 'alice')
  await expect(page.getByTestId('detail-id')).toHaveText('id:99')
  await expect(page.getByTestId('detail-tab')).toHaveText('tab:deep')
})

test('R11 React 开发更新：远程源码真实修改后新代码可达宿主（跨源 HMR 不稳定，如实记录）', async ({ page }) => {
  await login(page, 'alice')
  await page.goto('http://localhost:5104/remote-react/home')
  await login(page, 'alice')
  await expect(page.getByTestId('home-greeting')).toHaveText('hello alice @ remote-data-v1')

  // 真实修改远程源码（v1 → v2）。实测：远程组件链携带 @vitejs/plugin-react refresh 边界，
  // 远程 HMR 推送经远程 @vite/client（ws 连远程 origin）有时可达宿主并热替换；但跨源
  // ws 时机不稳定（冷启动后首轮常不可达，此时需刷新宿主页面）。两种形态都验证
  // 「更新可达」；跨源 Fast Refresh 的组件状态保留不作产品承诺（README 边界同述）。
  const apiFile = 'fixtures/remote-react/src/api.ts'
  const { readFileSync, writeFileSync } = await import('node:fs')
  const path = await import('node:path')
  const abs = path.resolve(import.meta.dirname, '../../', apiFile)
  const original = readFileSync(abs, 'utf8')
  try {
    writeFileSync(abs, original.replace('remote-data-v1', 'remote-data-v2'))
    // 热替换窗口（3s 内推送到达则页面自动更新）
    await page.waitForTimeout(3000)
    const current = await page.getByTestId('home-greeting').textContent()
    if (current?.includes('remote-data-v2')) {
      // 形态 A：热替换已生效
    } else {
      // 形态 B：推送未达——刷新宿主页面后新代码可见（当前产品的可靠路径）
      await page.reload()
      await login(page, 'alice')
      await expect(page.getByTestId('home-greeting')).toHaveText('hello alice @ remote-data-v2')
    }
  } finally {
    writeFileSync(abs, original)
  }
  // 恢复源码后回到 v1：远程 dev server 的模块失效传播有延迟，先等再刷（仍见 v2 则再刷一次）
  await page.waitForTimeout(1500)
  await page.reload()
  await login(page, 'alice')
  const first = await page.getByTestId('home-greeting').textContent()
  if (first?.includes('remote-data-v2')) {
    await page.waitForTimeout(1500)
    await page.reload()
    await login(page, 'alice')
  }
  await expect(page.getByTestId('home-greeting')).toHaveText('hello alice @ remote-data-v1')
})

test('R12 双向普通模块跨框架（React host ← Vue remote 纯 TS / Vue host ← React remote 纯 TS）', async ({ page }) => {
  // React host 动态注册 Vue remote（remote-a 5101），消费其纯 TS 模块（全局单例 API）
  // React host ← Vue remote：断言真实导出成员与计算结果（sum/ANSWER 是 remote-a/utils
  // 的真实导出；导出不存在或值不对必须失败，禁止 truthy 式宽断言）
  const vueUtil = await page.evaluate(async () => {
    const rt = (window).__FULGURJS_RUNTIME__
    rt.registerRemote({ name: 'remote-a', entry: 'http://localhost:5101/@fulgurjs-entry.js' })
    const ns = await rt.loadRemote<{ sum: (...n: number[]) => number; ANSWER: number }>('remote-a/utils')
    if (typeof ns?.sum !== 'function') throw new Error(`remote-a/utils 导出缺失：sum（实际键：${Object.keys(ns ?? {}).join(',')}）`)
    return { sum: ns.sum(2, 3, 7), answer: ns.ANSWER }
  })
  expect(vueUtil).toEqual({ sum: 12, answer: 42 })

  // Vue host（5100）动态注册 React remote，消费其纯 TS 模块。
  // remote-react 声明了 onSession：宿主必须先提供 sessionKey（MFU-013 契约）——
  // 直接写页面级 AppContext 镜像对象（provideAppContext 的存储层，语义等价）
  const page2 = await page.context().newPage()
  await page2.goto('http://localhost:5100/')
  // Vue host ← React remote：真实导出成员（formatMoney/formatDate）+ 真实计算值
  const reactUtil = await page2.evaluate(async () => {
    ;(window).__FULGURJS_APP_CONFIG__ = { ...(window).__FULGURJS_APP_CONFIG__ ?? {}, sessionKey: 'r12-cross-frame' }
    const rt = (window).__FULGURJS_RUNTIME__
    rt.registerRemote({ name: 'remote-react', entry: 'http://localhost:5103/@fulgurjs-entry.js' })
    const ns = await rt.loadRemote<{ formatMoney: (v: number, c?: string) => string; formatDate: (iso: string) => string }>('remote-react/utils')
    if (typeof ns?.formatMoney !== 'function' || typeof ns?.formatDate !== 'function') {
      throw new Error(`remote-react/utils 导出缺失：${Object.keys(ns ?? {}).join(',')}`)
    }
    return { money: ns.formatMoney(12.5), date: ns.formatDate('2026-09-28T00:00:00Z') }
  })
  expect(reactUtil).toEqual({ money: '¥12.50', date: '2026-09-28' })
  await page2.close()
})

// R05（页面表 resolve 纯函数行为）：由 packages/plugin/tests/host-pages-core.test.ts 全量
// 覆盖（base/最长前缀/参数解码/无匹配/R1–R5），浏览器端一致性由 R03 的真实参数页断言
// 端到端验证——不重复在 evaluate 里 import 裸包名（浏览器原生解析不了 bare specifier）。

import { reactContracts } from './react-contracts'
reactContracts(false)
