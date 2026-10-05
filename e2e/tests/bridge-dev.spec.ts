import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

/**
 * 桥接 dev 正向套件（Vue 宿主 × React 子应用，5105）：BR01/BR02/BR04/BR05/BR06/BR09/BR12。
 * 证据目录：testbed/runs/20261001-bridge-530/evidence/（截图与请求图 JSON）。
 */
const EVIDENCE = path.resolve(import.meta.dirname, '../../testbed/runs/20261001-bridge-530/evidence')

function record(name: string, data: unknown): void {
  fs.mkdirSync(EVIDENCE, { recursive: true })
  fs.writeFileSync(path.join(EVIDENCE, name), JSON.stringify(data, null, 1))
}

test.describe('bridge-dev：Vue 宿主 × React 子应用', () => {
  test('BR02/BR05：挂载成功、props 快照与函数引用、子应用内部交互', async ({ page }) => {
    await page.goto('/?multi=0', { waitUntil: 'networkidle' })
    // 状态 ready + 真实渲染
    await expect(page.locator('[data-fulgurjs-bridge-root]')).toHaveAttribute('data-fulgurjs-bridge-status', 'ready')
    const props = await page.textContent('[data-testid="bridge-react-props"]')
    expect(props).toContain('from-host-v1')
    expect(props).toContain('"origin":"host-bridge-vue"')
    // sessionKey 控制参数不进入业务 props
    expect(props).not.toContain('sess-A')
    // onReady 函数引用跨 root 回调（BR05）
    await expect(page.locator('[data-testid="host-ready-count"]')).toContainText('ready-count:1')
    // 子应用内部交互：React 计数器 + memory 路由
    await page.click('[data-testid="bridge-react-counter"]')
    await page.click('[data-testid="bridge-react-counter"]')
    await expect(page.locator('[data-testid="bridge-react-counter"]')).toContainText('count:2')
    await page.click('[data-testid="bridge-react-go-about"]')
    await expect(page.locator('[data-testid="bridge-react-page"]')).toHaveText('page:about')
    await page.click('[data-testid="bridge-react-go-home"]')
    await expect(page.locator('[data-testid="bridge-react-page"]')).toHaveText('page:home')
    await page.screenshot({ path: path.join(EVIDENCE, 'br02-vue-host-react-sub.png'), fullPage: true })
  })

  test('BR05：同会话重渲染/换 props 引用不重挂（快照不更新），重挂后拿新值', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' })
    await expect(page.locator('[data-fulgurjs-bridge-root]')).toHaveAttribute('data-fulgurjs-bridge-status', 'ready')
    // 宿主重渲染风暴（BR09）：子应用内容与状态不被宿主 patch 破坏
    await page.click('[data-testid="bridge-react-counter"]')
    await page.click('[data-testid="act-storm"]')
    await expect(page.locator('[data-fulgurjs-bridge-root]')).toHaveAttribute('data-fulgurjs-bridge-status', 'ready')
    await expect(page.locator('[data-testid="bridge-react-counter"]')).toContainText('count:1')
    // 只换 appProps 顶层引用：不重挂、不更新快照（React 内部状态保留 = 未重挂）
    await page.click('[data-testid="act-toggle-label"]')
    await expect(page.locator('[data-testid="bridge-react-props"]')).toContainText('from-host-v1')
    await expect(page.locator('[data-testid="bridge-react-counter"]')).toContainText('count:1')
    // key 重挂：拿到新快照、内部状态重置
    await page.click('[data-testid="act-remount"]')
    await expect(page.locator('[data-testid="bridge-react-props"]')).toContainText('from-host-v2')
    await expect(page.locator('[data-testid="bridge-react-counter"]')).toContainText('count:0')
    await expect(page.locator('[data-testid="host-ready-count"]')).toContainText('ready-count:2')
  })

  test('BR06：同页 A→登出→B（不刷新整页），零旧会话残留', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' })
    await expect(page.locator('[data-fulgurjs-bridge-root]')).toHaveAttribute('data-fulgurjs-bridge-status', 'ready')
    const requests: string[] = []
    page.on('request', (r) => requests.push(r.url()))

    // 登出：立即卸载且保持空容器
    await page.click('[data-testid="act-logout"]')
    await expect(page.locator('[data-fulgurjs-bridge-root]')).toHaveAttribute('data-fulgurjs-bridge-status', 'idle')
    expect(await page.locator('[data-bridge-root="remote-react"]').count()).toBe(0)
    const requestsAtLogout = requests.length

    // 等待期间不再发起远程请求（不再 loadRemote）
    await page.waitForTimeout(800)
    expect(requests.slice(requestsAtLogout).filter((u) => u.includes('5103')).length).toBe(0)

    // 换账号 B：新代次完整重挂（换账号动作内含 clearAppContext + 新快照）
    await page.click('[data-testid="act-switch-b"]')
    await expect(page.locator('[data-fulgurjs-bridge-root]')).toHaveAttribute('data-fulgurjs-bridge-status', 'ready')
    await expect(page.locator('[data-testid="host-session"]')).toContainText('sess-B')
    // B 会话的 context 已写全局（远程 setup 的 onSession 记录最新代次）
    const lastSession = await page.evaluate(() => (globalThis as any).__REMOTE_REACT_LAST_SESSION__)
    expect(lastSession).toBe('sess-B')
    await page.screenshot({ path: path.join(EVIDENCE, 'br06-session-switch.png'), fullPage: true })
  })

  test('BR07（onSession 真实延迟）：旧代次按 signal.aborted 放弃回写（BN07 运行时侧）', async ({ page }) => {
    // onsession-delay=1 让远程 onSession 先等待 400ms 再检查 aborted。
    // 换会话必须在 A 的 onSession 延迟等待期间发生（首挂 ready 之前）——
    // loadRemote 链会等待 onSession 完成，ready 后 A 的 onSession 已结束。
    await page.goto('/?onsession-delay=1', { waitUntil: 'domcontentloaded' })
    await page.click('[data-testid="act-switch-b"]')
    // B 代次完成挂载（其 onSession 也有 400ms 延迟，ready 即已完成）
    await expect(page.locator('[data-fulgurjs-bridge-root]')).toHaveAttribute('data-fulgurjs-bridge-status', 'ready', { timeout: 20000 })
    await page.waitForTimeout(900)
    // A 的迟到回写必须看到 aborted 并放弃（计数 ≥1），私有状态只记录 B
    expect(await page.evaluate(() => (globalThis as any).__REMOTE_REACT_SESSION_ABORTED__)).toBeGreaterThanOrEqual(1)
    expect(await page.evaluate(() => (globalThis as any).__REMOTE_REACT_LAST_SESSION__)).toBe('sess-B')
  })

  test('BR09：同页两个桥接实例互不干扰', async ({ page }) => {
    await page.goto('/?multi=1', { waitUntil: 'networkidle' })
    await expect(page.locator('[data-fulgurjs-bridge-root]')).toHaveCount(2)
    await expect(page.locator('[data-bridge-root="remote-react"]')).toHaveCount(2)
    const props = await page.locator('[data-testid="bridge-react-props"]').allTextContents()
    expect(props.length).toBe(2)
    // 重渲染风暴后两实例均保持 ready（互不干扰、不被宿主 patch 破坏）
    await page.click('[data-testid="act-storm"]')
    await expect(page.locator('[data-fulgurjs-bridge-root]')).toHaveCount(2)
    for (let i = 0; i < 2; i++) {
      await expect(page.locator('[data-fulgurjs-bridge-root]').nth(i)).toHaveAttribute('data-fulgurjs-bridge-status', 'ready')
    }
  })

  test('BR01/BR12：宿主页不预载对向适配器；桥接模块按需加载', async ({ page }) => {
    const jsRequests: string[] = []
    page.on('request', (r) => {
      if (r.url().endsWith('.js') || r.url().includes('.js?')) jsRequests.push(r.url())
    })
    await page.goto('/', { waitUntil: 'networkidle' })
    await expect(page.locator('[data-fulgurjs-bridge-root]')).toHaveAttribute('data-fulgurjs-bridge-status', 'ready')
    record('br01-dev-request-graph-vue-host.json', jsRequests)
    // 隔离断言限定宿主 origin（5105）：Vue 宿主不得执行 React 宿主适配器/React 子应用
    // 契约/React 组件适配器/聚合或对向桥接入口。远程 origin（5103）上的 react-adapter、
    // bridge-app-react 属子应用自身框架入口（/react 门面），不算宿主预载。
    const hostOrigin = jsRequests.filter((u) => u.includes(':5105'))
    const hostGraph = hostOrigin.join('\n')
    expect(hostGraph).not.toContain('bridge-host-react')
    expect(hostGraph).not.toContain('bridge-app-react')
    expect(hostGraph).not.toContain('react-adapter')
    expect(hostGraph).not.toContain('bridge-react.js')
    expect(hostGraph).not.toMatch(/\/bridge\.js/)
    // 桥接链路（6.0.0 统一入口）：宿主代码经 /vue——运行时与宿主桥接适配器必须出现；
    // 旧 bridge-vue.js 壳已随入口统一移除，统一入口壳为 dist/vue.js
    expect(hostGraph).toContain('runtime.js')
    expect(hostGraph).toMatch(/dist\/vue\.js|@fulgurjs_federation_vue/)
    expect(hostGraph).toContain('bridge-host-vue')
  })
})
