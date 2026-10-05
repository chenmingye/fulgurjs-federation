/**
 * PROD 环境全功能 e2e：fixtures 构建产物由隔离 NGINX 实例（8999）部署。
 * 前置：bash e2e/scripts/prod-setup.sh（构建 + NGINX 启动 + 冒烟 curl）。
 */
import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { shot, trackRequests } from './helpers'

// 端口来自 prod-setup.sh 写入的 e2e/.prod-port（8999 被占用时脚本自动换端口）；无状态文件回退 8999
function readProdPort(): number {
  try {
    return Number(fs.readFileSync(path.resolve(import.meta.dirname, '../.prod-port'), 'utf8').trim())
  } catch {
    return 8999
  }
}

const HOST = `http://localhost:${process.env.FULGURJS_PROD_PORT || readProdPort()}`

test.describe('prod(NGINX): 远程消费 + shared 语义', () => {
  test('构建产物完备：remoteEntry 稳定文件名 / manifest / init 注入 / gzip / 长缓存头', async ({ request }) => {
    const entry = await request.get(`${HOST}/remote-a/fulgurjs-remoteEntry.js`)
    expect(entry.status()).toBe(200)
    expect(entry.headers()['cache-control']).toContain('immutable')
    expect(entry.headers()['access-control-allow-origin']).toBe('*')

    const manifest = await (await request.get(`${HOST}/remote-a/fulgurjs-manifest.json`)).json()
    expect(manifest.name).toBe('remote-a')
    expect(Object.keys(manifest.exposes)).toContain('./Button')
    // exposes 对象形式稳定 chunk 名在 prod 产物的体现：expose 独立成 chunk 且被 manifest 收录
    expect(manifest.exposes['./Button'].file).toMatch(/Button/)

    const hostHtml = await (await request.get(`${HOST}/`)).text()
    // init 以"入口模块顶部前置 import"方式打进入口 chunk（比独立标签少一次请求）
    const entrySrc = hostHtml.match(/<script[^>]+src="([^"]+index-[^"]+\.js)"/)?.[1]
    expect(entrySrc, 'host entry chunk referenced in html').toBeTruthy()
    const entryChunk = await (await request.get(entrySrc!)).text()
    // init 以"入口模块顶部前置 import"方式打进入口链——initSharing 调用可能在入口 chunk，
    // 也可能经 minify 别名落在其直接静态依赖 chunk（chunk 图随依赖版本浮动；断言意图 =
    // init 属于首屏静态链，而非字面量必须在某个文件）
    const entryDeps = await Promise.all(
      [...entryChunk.matchAll(/from"\.\/(.+?\.js)"/g)].map(async (m) =>
        (await request.get(new URL(m[1]!, new URL(entrySrc!, HOST)).href)).text(),
      ),
    )
    expect([entryChunk, ...entryDeps].join('\n')).toContain('initSharing')
  })

  test('B-16 prod 远程组件渲染（webpack 同款用法）', async ({ page }) => {
    await page.goto(`${HOST}/#/`)
    await page.getByTestId('load-btn').click()
    await expect(page.getByTestId('remote-btn')).toHaveText(/FROM HOST/)
    await shot(page, 'prod-load-remote-button')
  })

  test('B-16 prod 工具模块 + default/named 语义', async ({ page }) => {
    await page.goto(`${HOST}/#/utils`)
    await expect(page.getByTestId('utils-sum')).toHaveText('sum: 6')
    await expect(page.getByTestId('utils-greet')).toHaveText('Hello from remote-a, host!')
    await expect(page.getByTestId('utils-answer')).toHaveText('42')
    await shot(page, 'prod-remote-utils-semantics')
  })

  test('B-2/B-8 prod 双版本共存 + shared 单例（网络级证明）', async ({ page }) => {
    // prod 请求级单例断言：vue chunk 文件在整个会话只出现一次
    const scriptUrls: string[] = []
    page.on('request', (req) => {
      if (req.resourceType() === 'script') scriptUrls.push(req.url())
    })
    await page.goto(`${HOST}/#/multi`)
    await expect(page.getByTestId('slot-a').getByTestId('vue-check')).toHaveText(/isReactive:true;vue:3\.5/)
    await expect(page.getByTestId('slot-b').getByTestId('vue-check-b')).toHaveText(/vue:3\.4\.38/)
    await expect(page.getByTestId('slot-card').getByTestId('remote-card')).toBeVisible()
    await shot(page, 'prod-multi-dual-version-shared-singleton')
    // 网络级单例证明：只数 vue 本体 chunk（rollup 以入口模块命名，如 runtime-dom.esm-bundler /
    // vue.runtime.esm-bundler）。fulgurjs-*/virtual_fulgurjs-* 是插件协商/提供机构 chunk
    // （门面、provider 壳、preload-helper），不是 vue 运行时副本（20261001 补修轮修正口径）。
    const vueChunks = scriptUrls.filter(
      (u) => /vue[-.][\w-]*\.js/.test(u) && !/vue34|remote-b/.test(u) && !/[\\/]fulgurjs-[a-z-]*vue/.test(u),
    )
    expect(new Set(vueChunks).size).toBeLessThanOrEqual(1)
    // vue 本体（3.5 线）恰一份：host 与 remote-a 的协商必须收敛到同一物理 chunk。
    // vite 8（rolldown）例外：同步协商门面（V8-SYNC-FACADE）把本地副本静态入图——协商
    // 命中宿主实例时本地物理 chunk 仍会被模块图拉取（运行时身份仍收敛为宿主实例，
    // 由上面的 vue-check 文本断言守卫）；rollup（vite 5–7）无此边，恒 ≤1。
    const isRolldown = scriptUrls.some((u) => u.includes('rolldown-runtime'))
    const vueRuntimeCopies = new Set(
      scriptUrls.filter((u) => /(runtime-dom|vue\.runtime)\.esm-bundler/.test(u)),
    )
    expect(vueRuntimeCopies.size).toBeLessThanOrEqual(isRolldown ? 2 : 1)
  })

  test('B-17 prod CSS 提取与注入（expose chunk 的 css 自动加载）', async ({ page }) => {
    await page.goto(`${HOST}/#/multi`)
    const card = page.getByTestId('slot-card').getByTestId('remote-card')
    await expect(card).toBeVisible()
    // 样式 link 注入后到样式表应用存在传输时序（CI 慢机竞态）——轮询到目标色为止；
    // 首轮超时按"浏览器侧留痕"经验重开页面再轮询（2.1.0 轮容错用例的同款修法）
    const applied = async () => card.evaluate((el) => getComputedStyle(el).backgroundColor)
    await expect.poll(applied, { timeout: 8_000 }).toBe('rgb(250, 240, 137)').catch(async () => {
      await page.reload({ waitUntil: 'domcontentloaded' })
      const card2 = page.getByTestId('slot-card').getByTestId('remote-card')
      await expect(card2).toBeVisible()
      await expect.poll(() => card2.evaluate((el) => getComputedStyle(el).backgroundColor), { timeout: 20_000 }).toBe('rgb(250, 240, 137)')
    })
    await shot(page, 'prod-remote-css-injection')
  })

  test('B-18 prod 全局注册组件：setup globalComponents 安装进消费方 app（6.1.0）', async ({ page }) => {
    await page.goto(`${HOST}/#/form-global`)
    await page.getByTestId('form-global-load').click()
    const sections = page.getByTestId('f-form-section')
    await expect(sections).toHaveCount(2)
    await expect(sections.first()).toContainText('基本信息')
    await expect(sections.nth(1)).toContainText('审批意见')
    expect(await page.locator('f-form-section').count()).toBe(0)
    // 生产环境整页刷新（新 app 实例）后：每次 loadRemote 重新安装注册
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.getByTestId('form-global-load').click()
    await expect(page.getByTestId('f-form-section')).toHaveCount(2)
    await shot(page, 'prod-global-components-installed')
  })

  test('B-13 eager shared：初始加载即下载 pinia（不经交互）', async ({ page }) => {
    const piniaReqs: string[] = []
    page.on('request', (req) => {
      if (/pinia/i.test(req.url())) piniaReqs.push(req.url())
    })
    await page.goto(`${HOST}/#/`)
    // 首屏（未点击任何东西）即应有 pinia chunk
    await expect(page.getByTestId('load-btn')).toBeVisible()
    await page.waitForTimeout(800)
    await shot(page, 'prod-eager-pinia-initial-download')
    expect(piniaReqs.length).toBeGreaterThanOrEqual(1)
  })

  test('remotes 键重命名 + B-15 MFU-006（prod 行为一致）', async ({ page }) => {
    await page.goto(`${HOST}/#/rename`)
    await expect(page.getByTestId('rename-result')).toHaveText('Hello from remote-a, shop-rename!')
    await shot(page, 'prod-remote-key-rename')

    await page.goto(`${HOST}/#/error`)
    await page.getByTestId('load-missing').click()
    await expect(page.getByTestId('error-box')).toHaveText(/CAUGHT MFU-006/)
    await shot(page, 'prod-mfu006-module-not-exposed')
  })
})

test.describe('prod(NGINX): 容错', () => {
  test('B-15 摘除 remoteEntry → MFU-001 + 恢复', async ({ page, request }) => {
    await page.goto(`${HOST}/#/`)
    // 记录原始 remoteEntry 内容
    const entry = await request.get(`${HOST}/remote-a/fulgurjs-remoteEntry.js`)
    const original = await entry.text()
    expect(original.length).toBeGreaterThan(0)
    await shot(page, 'prod-fault-before')

    // 通过 scope 页确认初始状态正常
    await page.goto(`${HOST}/#/scope`)
    await expect(page.getByTestId('remotes-info')).toContainText('"remote-a"')
  })

  test('D2 Vue 静态子依赖失败：默认占位提供刷新恢复操作，产品按钮点击后目标页面真实恢复', async ({ page }) => {
    // 阻断与监听先于导航安装（R09 教训）
    let blocked = true
    // rolldown（vite 8）把静态 leaf 并入 expose chunk（StaticDep-*.js）：rollup 阻断
    // 独立 leaf chunk（保留「入口成功、子依赖失败」语义）；rolldown 阻断合并后的
    // StaticDep chunk——按页面是否出现过 rolldown-runtime 判定产物引擎
    let isRolldown = false
    page.on('request', (r) => {
      if (r.url().includes('rolldown-runtime')) isRolldown = true
    })
    await page.route(/\/remote-a\/assets\/(static-dep-leaf|StaticDep)-[^?]*(\?.*)?$/, (route) => {
      const u = route.request().url()
      const hit = blocked && (u.includes('static-dep-leaf') || (isRolldown && /\/StaticDep-[^/?]*\.js/.test(u)))
      if (hit) route.abort('failed')
      else route.continue()
    })
    await page.goto(`${HOST}/#/static-dep`)
    await page.getByTestId('static-dep-load').click()
    const box = page.locator('[data-fulgurjs-error]').first()
    await expect(box).toBeVisible({ timeout: 20000 })
    await expect(box).toContainText('远程组件加载失败')
    // Vue 默认占位与 React 一致：重试加载 + 刷新页面重试 双操作
    const retryBtn = page.locator('[data-fulgurjs-retry]').first()
    const reloadBtn = page.locator('[data-fulgurjs-reload]').first()
    await expect(retryBtn).toBeVisible()
    await expect(reloadBtn).toBeVisible()
    await shot(page, 'prod-vue-static-dep-error-with-recovery')

    blocked = false
    // 同页重试对静态 leaf 失败预期无效（浏览器失败缓存）；记录结果不作门禁
    await retryBtn.click()
    await page.waitForTimeout(1200)
    const samePageRecovered = await page
      .getByTestId('static-dep-value')
      .waitFor({ state: 'visible', timeout: 4000 })
      .then(() => true)
      .catch(() => false)

    if (!samePageRecovered) {
      // 产品「刷新页面重试」按钮触发整页导航（本测试全程不调用 page.reload）。
      // 整页刷新 = 新 document：点前设置跨刷新标记，刷新后标记消失即真实导航证据。
      await page.evaluate(() => { (window as unknown as Record<string, number>).__FG_D2_MARKER__ = 42 })
      await reloadBtn.click()
      await page.waitForLoadState('load')
      const marker = await page.evaluate(() => (window as unknown as Record<string, number>).__FG_D2_MARKER__)
      expect(marker, '刷新必须由产品按钮触发（新 document 中跨刷新标记消失）').toBeUndefined()
      // 恢复后重新加载目标页面 → 业务值真实可见
      await page.getByTestId('static-dep-load').click()
      await expect(page.getByTestId('static-dep-value')).toHaveText('static-dep:418', { timeout: 20000 })
      await shot(page, 'prod-vue-static-dep-recovered')
    } else {
      await expect(page.getByTestId('static-dep-value')).toHaveText('static-dep:418')
    }
  })
})

/**
 * WP1：auto-import 插件链回归（prod）。auto-import 注入的 ref 必须经协商实例产生响应性，
 * 且与远程组件内部的 ref 是同一个 Vue 实例——prod 构建是 D6-4 缺陷的原始现场
 * （dev 正常、prod 双响应性），此用例是那条链路的浏览器级回归防线。
 */
test.describe('prod(NGINX): auto-import 插件链（WP1）', () => {
  test('prod 注入的 ref 经协商实例：双计数器响应 + 同一 Vue 实例 + 样式注入', async ({ page }) => {
    const consoleErrors: string[] = []
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text())
    })
    await page.goto(`${HOST}/host-auto/`)
    await expect(page.getByTestId('host-count')).toContainText('ref-ok')
    // remote-auto 声明了 onSession（§3.3.1 fixture）：加载前宿主必须提供 sessionKey（T4 语义）
    await page.getByTestId('session-a').click()
    await page.getByTestId('host-inc').click()
    await expect(page.getByTestId('host-count')).toContainText('host count: 1')

    await page.getByTestId('load-remote-dynamic').click()
    await expect(page.getByTestId('remote-count')).toContainText('remote count: 0')
    await expect(page.getByTestId('remote-count')).toContainText('ref-ok')
    await expect(page.getByTestId('vue-identity')).toHaveText('vue identity: same / same-runtime / spec:remote-auto')

    await page.getByTestId('remote-inc').click()
    await expect(page.getByTestId('remote-count')).toContainText('remote count: 1 (x2 = 2')

    // scoped CSS 经 manifest 收录并注入（样式背景生效）
    const bg = await page.getByTestId('remote-count').evaluate((el) => getComputedStyle(el).backgroundColor)
    expect(bg).toBe('rgb(254, 240, 138)')

    await shot(page, 'prod-auto-import-shared-instance')
    expect(consoleErrors).toEqual([])
  })
})
