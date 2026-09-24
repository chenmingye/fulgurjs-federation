/**
 * DEV 环境全功能 e2e（fixture 三件套：host-vue 5100 / remote-a 5101 / remote-b 5102）
 * 每个功能验证自动截图到 docs/screenshots/，供 HTML 使用手册引用。
 */
import { expect, test } from '@playwright/test'
import { shot, shotFull, trackRequests } from './helpers'

const HOST = 'http://localhost:5100'

test.describe('dev: 远程模块消费与 shared 语义', () => {
  test('B-16 动态加载远程组件并渲染（webpack 同款 import 用法）', async ({ page }) => {
    const consoleErrors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })
    await page.goto(`${HOST}/#/`)
    await page.getByTestId('load-btn').click()
    await expect(page.getByTestId('remote-btn')).toHaveText(/FROM HOST/)
    await shot(page, 'dev-load-remote-button')
    expect(consoleErrors).toEqual([])
  })

  test('B-16 命名/默认/常量导出语义（工具模块）', async ({ page }) => {
    await page.goto(`${HOST}/#/utils`)
    await expect(page.getByTestId('utils-sum')).toHaveText('sum: 6')
    await expect(page.getByTestId('utils-greet')).toHaveText('Hello from remote-a, host!')
    await expect(page.getByTestId('utils-answer')).toHaveText('42')
    await shot(page, 'dev-remote-utils-semantics')
  })

  test('B-2/B-8 双 vue 版本共存 + shared 单例（一次网络加载）', async ({ page }) => {
    const vueReqs = trackRequests(page, (u) => /node_modules\/\.vite\/deps\/vue\.js/.test(u))
    await page.goto(`${HOST}/#/multi`)
    // remote-a (vue 3.5) 与 remote-b (vue 3.4.38) 同时渲染
    await expect(page.getByTestId('slot-a').getByTestId('vue-check')).toHaveText(/isReactive:true;vue:3\.5/)
    await expect(page.getByTestId('slot-b').getByTestId('vue-check-b')).toHaveText(/vue:3\.4\.38/)
    await expect(page.getByTestId('slot-card').getByTestId('remote-card')).toBeVisible()
    // 跨实例 reactivity 判定成立 → vue 为单实例
    await expect(page.getByTestId('slot-a').getByTestId('vue-check')).toHaveText(/isReactive:true/)
    await shot(page, 'dev-multi-dual-version-shared-singleton')
    // vue 预构建产物全页只请求一次（单例证明）
    expect(vueReqs.length).toBeLessThanOrEqual(1)
  })

  test('B-8 singleton 协商结果可视化（scope 调试页截图证据）', async ({ page }) => {
    await page.goto(`${HOST}/#/multi`)
    await expect(page.getByTestId('slot-a').getByTestId('vue-check')).toBeVisible()
    await page.goto(`${HOST}/#/scope`)
    await expect(page.getByTestId('scope-table')).toBeVisible()
    // scope 中 vue 只应有一个被实际选用的版本条目存在（host 3.5.42）
    await expect(page.getByTestId('scope-vue-3.5.42')).toBeVisible()
    await shotFull(page, 'dev-scope-debug-panel')
  })

  test('remotes 键重命名（checkout: shop@ 语法）', async ({ page }) => {
    await page.goto(`${HOST}/#/rename`)
    await expect(page.getByTestId('rename-result')).toHaveText('Hello from remote-a, shop-rename!')
    await shot(page, 'dev-remote-key-rename')
  })

  test('B-14 promise-based remote', async ({ page }) => {
    await page.goto(`${HOST}/#/promise-remote`)
    await page.getByTestId('load-promise').click()
    await expect(page.getByTestId('remote-btn')).toHaveText(/VIA PROMISE/)
    await shot(page, 'dev-promise-based-remote')
  })

  test('B-15 未暴露模块 → MFU-006 错误码', async ({ page }) => {
    await page.goto(`${HOST}/#/error`)
    await page.getByTestId('load-missing').click()
    await expect(page.getByTestId('error-box')).toHaveText(/CAUGHT MFU-006/)
    await shot(page, 'dev-mfu006-module-not-exposed')
  })

  test('pinia shared singleton（远程 store 定义 + 宿主实例）', async ({ page }) => {
    await page.goto(`${HOST}/#/shared-state`)
    await expect(page.getByTestId('host-count')).toHaveText('host sees: 8', { timeout: 15000 })
    await shot(page, 'dev-pinia-shared-singleton')
  })

  test('B-17 远程组件样式注入（dev style 注入）', async ({ page }) => {
    await page.goto(`${HOST}/#/multi`)
    const card = page.getByTestId('slot-card').getByTestId('remote-card')
    await expect(card).toBeVisible()
    const bg = await card.evaluate((el) => getComputedStyle(el).backgroundColor)
    expect(bg).toBe('rgb(250, 240, 137)')
    const btn = page.getByTestId('load-btn')
    void btn
    await shot(page, 'dev-remote-css-injection')
  })
})

test.describe('dev: HMR 全链路（remote 改 → host 页面热更）', () => {
  test('L1 组件热替换 + L2 状态保留 + 无整页刷新', async ({ page }) => {
    await page.goto(`${HOST}/#/`)
    await page.getByTestId('load-btn').click()
    await expect(page.getByTestId('remote-btn')).toBeVisible()
    // 制造状态：点击两次
    await page.getByTestId('remote-btn').click()
    await page.getByTestId('remote-btn').click()
    await expect(page.getByTestId('remote-btn')).toHaveText(/clicked 2/)
    await shot(page, 'dev-hmr-before-edit')

    // 记录导航次数，证明没有整页刷新
    let navigations = 0
    page.on('framenavigated', () => navigations++)

    // 修改 remote-a 的源码（fs 写入触发 remote dev server HMR）
    // 模板级编辑：vue HMR 对 template 变更走 rerender（保留 setup 状态），等价 webpack L2 语义
    const fs = await import('node:fs')
    const buttonSrc = '../fixtures/remote-a/src/exposes/Button.vue'
    const original = fs.readFileSync(buttonSrc, 'utf8')
    const edited = original.replace(
      '{{ label }} (clicked {{ count }})',
      '{{ label }} ·HMR· (clicked {{ count }})',
    )
    try {
      fs.writeFileSync(buttonSrc, edited)
      // L1：组件文案热替换成功
      await expect(page.getByTestId('remote-btn')).toHaveText(/·HMR·/, { timeout: 15000 })
      await shot(page, 'dev-hmr-after-edit-l1')
      // L2：点击计数状态保留
      await expect(page.getByTestId('remote-btn')).toHaveText(/clicked 2/)
      await shot(page, 'dev-hmr-state-kept-l2')
      expect(navigations).toBe(0)
    } finally {
      fs.writeFileSync(buttonSrc, original)
    }
    // 恢复源码后整页刷新重新加载，确认模板还原
    await page.reload()
    await page.getByTestId('load-btn').click()
    await expect(page.getByTestId('remote-btn')).toHaveText('FROM HOST (clicked 0)')
    await expect(page.getByTestId('remote-btn')).not.toHaveText(/·HMR·/)
    await shot(page, 'dev-hmr-restored')
  })
})

/**
 * WP1：auto-import 插件链回归（host-auto 5110 / remote-auto 5111）。
 * 宿主与纯远程都启用 unplugin-auto-import（vite 适配器硬编码 enforce:'post'，注册在
 * federation() 之前——顺序颠倒场景由单测 build-plugin-chain.test.ts 双顺序覆盖）。
 * 断言核心：注入的 ref/computed 必须经协商实例产生响应性（点击可更新），
 * 且与远程组件内部使用的 ref 是同一个 Vue 实例（页内 identity 探针比对）。
 */
test.describe('dev: auto-import 插件链（WP1）', () => {
  test('注入的 ref 经协商实例：双计数器响应 + 同一 Vue 实例', async ({ page }) => {
    const consoleErrors: string[] = []
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text())
    })
    await page.goto('http://localhost:5110/')
    // remote-auto 声明了 onSession（§3.3.1 fixture）：加载前宿主必须提供 sessionKey（T4 语义）
    await page.getByTestId('session-a').click()
    // 宿主侧：auto-import 注入的 ref 是响应性的（isRef 判定 + 点击更新）
    await expect(page.getByTestId('host-count')).toContainText('ref-ok')
    await page.getByTestId('host-inc').click()
    await page.getByTestId('host-inc').click()
    await expect(page.getByTestId('host-count')).toContainText('host count: 2')

    // 远程侧：动态 import 语法加载（同文件混用 runtime 显式导入 + 远程动态导入）
    await page.getByTestId('load-remote-dynamic').click()
    await expect(page.getByTestId('remote-count')).toContainText('remote count: 0')
    await expect(page.getByTestId('remote-count')).toContainText('ref-ok')
    // 注入的 ref 与远程组件内的 ref 是同一 Vue 实例（协商成功的判据）；
    // 新旧入口（virtual:fulgurjs-api / virtual:fulgurjs-runtime）收敛同一运行时单例（WP7）
    await expect(page.getByTestId('vue-identity')).toHaveText('vue identity: same / same-runtime / spec:remote-auto')
    await page.getByTestId('remote-inc').click()
    await expect(page.getByTestId('remote-count')).toContainText('remote count: 1 (x2 = 2')
    await shot(page, 'dev-auto-import-shared-instance')
    expect(consoleErrors).toEqual([])
  })

  test('loadRemote API 通道同样成立（注入 ref 与协商实例一致）', async ({ page }) => {
    await page.goto('http://localhost:5110/')
    await page.getByTestId('session-a').click() // onSession 远程加载前提供会话（T4 语义）
    await page.getByTestId('load-remote-api').click()
    await expect(page.getByTestId('remote-count')).toContainText('ref-ok')
    await expect(page.getByTestId('vue-identity')).toHaveText('vue identity: same / same-runtime / spec:remote-auto')
    await shot(page, 'dev-auto-import-api-channel')
  })
})

test.describe('dev: setup/onSession 生命周期（§3.3.1）', () => {
  test('T3 时序：登录代次 A → 首次加载执行 setup+onSession 各一次 → 同代次重载不重复', async ({ page }) => {
    const consoleErrors: string[] = []
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text())
    })
    await page.goto('http://localhost:5110/')
    await page.getByTestId('session-a').click()
    await expect(page.getByTestId('session-state')).toContainText('s-A')
    // 加载前无任何生命周期调用
    await expect(page.getByTestId('setup-calls')).toHaveText('setup calls: []')
    await page.getByTestId('load-probe').click()
    await expect(page.getByTestId('setup-calls')).toHaveText('setup calls: ["setup:s-A","onSession:s-A"]')
    // 同代次再次加载（模块缓存命中）：setup/onSession 都不重复
    await page.getByTestId('load-probe').click()
    await expect(page.getByTestId('setup-calls')).toHaveText('setup calls: ["setup:s-A","onSession:s-A"]')
    expect(consoleErrors).toEqual([])
    await shot(page, 'dev-setup-lifecycle-first-load')
  })

  test('T5 会话切换：换代 onSession 重跑、setup 不重复；退出清理后同代次必须重跑', async ({ page }) => {
    await page.goto('http://localhost:5110/')
    await page.getByTestId('session-a').click()
    await page.getByTestId('load-probe').click()
    await expect(page.getByTestId('setup-calls')).toContainText('"setup:s-A"')
    // 换登录代次 B → 再加载：setup 不重复、onSession 以新代次重跑
    await page.getByTestId('session-b').click()
    await page.getByTestId('load-probe').click()
    await expect(page.getByTestId('setup-calls')).toHaveText(
      'setup calls: ["setup:s-A","onSession:s-A","onSession:s-B"]',
    )
    // 退出（clearAppContext）→ 重新以 B 登录 → 加载：onSession 必须重跑（去重状态已失效）
    await page.getByTestId('logout').click()
    await page.getByTestId('session-b').click()
    await page.getByTestId('load-probe').click()
    await expect(page.getByTestId('setup-calls')).toHaveText(
      'setup calls: ["setup:s-A","onSession:s-A","onSession:s-B","onSession:s-B"]',
    )
    await shot(page, 'dev-setup-session-switch')
  })

  test('T7 预载无副作用：preloadRemote 不执行 setup/onSession', async ({ page }) => {
    await page.goto('http://localhost:5110/')
    await page.getByTestId('session-a').click()
    await page.getByTestId('preload-probe').click()
    await page.waitForTimeout(300)
    await expect(page.getByTestId('setup-calls')).toHaveText('setup calls: []')
    // 首次实际加载才执行（且只执行一次）
    await page.getByTestId('load-probe').click()
    await expect(page.getByTestId('setup-calls')).toHaveText('setup calls: ["setup:s-A","onSession:s-A"]')
    await shot(page, 'dev-setup-preload-no-side-effect')
  })

  test('T2 普通 TS expose：加载返回模块命名空间，显式调用才执行', async ({ page }) => {
    await page.goto('http://localhost:5110/')
    await page.getByTestId('session-a').click()
    await page.getByTestId('load-api').click()
    // load 完成后调用前计数为 0（加载 ≠ 执行）；显式调用后为 1 且返回值正确
    await expect(page.getByTestId('api-calls')).toHaveText('api calls: load后=0/load前=0/调用后=1 / value: api-ok')
    await shot(page, 'dev-plain-ts-expose-not-auto-run')
  })
})
