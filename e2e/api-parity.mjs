// API parity 清扫：插件运行时 API 全量使用，对照 webpack MF 语义
// 在 fresh 栈（8781）上执行；跨栈注册用旧栈（4529）作运行时 remote
import { chromium } from '@playwright/test'
import fs from 'node:fs'

const BASE = process.argv[2] || 'http://localhost:8781'
const browser = await chromium.launchPersistentContext(`/tmp/parity-${Date.now()}`, {
  headless: true, args: ['--no-proxy-server'], viewport: { width: 1400, height: 900 },
})
const page = browser.pages()[0]
await page.goto(`${BASE}/main/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(8000)
await page.locator('input[placeholder*="账号"], input[placeholder*="用户名"]').first().fill('admin')
await page.locator('input[type="password"]').first().fill('Demo@123456')
await robustLogin()
await page.waitForTimeout(3000)
await page.goto(`${BASE}/main/dashboard/analysis`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {})
await page.waitForTimeout(5000)

const results = await page.evaluate(async () => {
  const out = {}
  // @ts-ignore
  const rt = await import(/* @vite-ignore */ window.location.origin + '/main/@id/__x00__virtual:fulgur-runtime')

  // 1) loadRemote —— webpack: container.get(expose)
  try {
    const m = await rt.loadRemote('mes-bpm/pages/bpm/task/todo')
    out.loadRemote = { ok: !!m, keys: Object.keys(m).slice(0, 3) }
  } catch (e) { out.loadRemote = { ok: false, err: String(e).slice(0, 100) } }

  // 2) loadShare —— webpack: __webpack_share_scopes__.default.vue
  try {
    const vue = await rt.loadShare('vue', { shareScope: 'default', shareKey: 'vue', singleton: true, fallback: () => import('vue') })
    const d = rt.unwrapDefault(vue)
    out.loadShare = { ok: typeof d.ref === 'function' && typeof d.createApp === 'function', vueShape: typeof d.ref + '/' + typeof d.createApp }
  } catch (e) { out.loadShare = { ok: false, err: String(e).slice(0, 100) } }

  // 3) 容器协议 —— webpack: container.init(shareScope) + container.get(module)
  try {
    const container = await rt.getContainer?.('mes-bpm')
    if (container) {
      await container.init((window.__FULGUR_SCOPE__ ?? {})['default'] ?? {})
      const mod = await container.get('./pages/bpm/task/todo')
      out['container.init/get'] = { ok: !!mod }
    } else out['container.init/get'] = { ok: false, err: 'getContainer 不可用' }
  } catch (e) { out['container.init/get'] = { ok: false, err: String(e).slice(0, 100) } }

  // 4) 注册面/解析面：webpack 不导出 parseSpec（内部），本插件同样以内部形态存在；
  //    对外可验证的是 __FULGUR_INFO__（remote 注册表）
  try {
    const info = window.__FULGUR_INFO__
    const remotes = info ? Object.keys(info.remotes ?? {}) : []
    out.registeredRemotes = { ok: remotes.length > 0, remotes }
  } catch (e) { out.registeredRemotes = { ok: false, err: String(e).slice(0, 100) } }

  // 5) preloadRemote —— webpack 无对应（超出项）
  try {
    await rt.preloadRemote('mes-lowcode')
    out.preloadRemote = { ok: true }
  } catch (e) { out.preloadRemote = { ok: false, err: String(e).slice(0, 100) } }

  // 6) registerRemote + loadRemote（运行时动态注册：webpack promise remote 语义）
  try {
    rt.registerRemote?.({ name: 'remote-old', entry: 'http://localhost:4529/flowable', shareScope: 'default', manifestUrl: 'http://localhost:4529/flowable/@fulgur-manifest.json' })
    const m = await rt.loadRemote('remote-old/pages/bpm/task/done')
    out.registerRemote = { ok: !!m }
  } catch (e) { out.registerRemote = { ok: false, err: String(e).slice(0, 120) } }

  // 7) 错误码语义（webpack 裸错误的对照改进）
  try {
    await rt.loadRemote('mes-bpm/not-exist-module-xyz')
    out.errorCode = { ok: false, err: '未抛错' }
  } catch (e) {
    out.errorCode = { ok: String(e).includes('MFU-'), msg: String(e).slice(0, 110) }
  }
  return out
})

console.log(JSON.stringify(results, null, 1))
fs.writeFileSync('/tmp/api-parity.json', JSON.stringify(results, null, 2))
await browser.close()
