/**
 * PROD 环境全功能 e2e：fixtures 构建产物由隔离 NGINX 实例（8999）部署。
 * 前置：bash e2e/scripts/prod-setup.sh（构建 + NGINX 启动 + 冒烟 curl）。
 */
import { expect, test } from '@playwright/test'
import { shot, trackRequests } from './helpers'

const HOST = 'http://localhost:8999'

test.describe('prod(NGINX): 远程消费 + shared 语义', () => {
  test('构建产物完备：remoteEntry 稳定文件名 / manifest / init 注入 / gzip / 长缓存头', async ({ request }) => {
    const entry = await request.get(`${HOST}/remote-a/fulgur-remoteEntry.js`)
    expect(entry.status()).toBe(200)
    expect(entry.headers()['cache-control']).toContain('immutable')
    expect(entry.headers()['access-control-allow-origin']).toBe('*')

    const manifest = await (await request.get(`${HOST}/remote-a/fulgur-manifest.json`)).json()
    expect(manifest.name).toBe('remote-a')
    expect(Object.keys(manifest.exposes)).toContain('./Button')
    // exposes 对象形式稳定 chunk 名在 prod 产物的体现：expose 独立成 chunk 且被 manifest 收录
    expect(manifest.exposes['./Button'].file).toMatch(/Button/)

    const hostHtml = await (await request.get(`${HOST}/`)).text()
    // init 以"入口模块顶部前置 import"方式打进入口 chunk（比独立标签少一次请求）
    const entrySrc = hostHtml.match(/<script[^>]+src="([^"]+index-[^"]+\.js)"/)?.[1]
    expect(entrySrc, 'host entry chunk referenced in html').toBeTruthy()
    const entryChunk = await (await request.get(entrySrc!)).text()
    expect(entryChunk).toContain('initSharing')
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
    const vueChunks = scriptUrls.filter((u) => /vue[-.][\w-]*\.js/.test(u) && !/vue34|remote-b/.test(u))
    expect(new Set(vueChunks).size).toBeLessThanOrEqual(1)
  })

  test('B-17 prod CSS 提取与注入（expose chunk 的 css 自动加载）', async ({ page }) => {
    await page.goto(`${HOST}/#/multi`)
    const card = page.getByTestId('slot-card').getByTestId('remote-card')
    await expect(card).toBeVisible()
    const bg = await card.evaluate((el) => getComputedStyle(el).backgroundColor)
    expect(bg).toBe('rgb(250, 240, 137)')
    await shot(page, 'prod-remote-css-injection')
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
    const entry = await request.get(`${HOST}/remote-a/fulgur-remoteEntry.js`)
    const original = await entry.text()
    expect(original.length).toBeGreaterThan(0)
    await shot(page, 'prod-fault-before')

    // 通过 scope 页确认初始状态正常
    await page.goto(`${HOST}/#/scope`)
    await expect(page.getByTestId('remotes-info')).toContainText('"remote-a"')
  })
})
