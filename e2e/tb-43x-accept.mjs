// tb-43x-accept.mjs —— 4.3.x 双环境逐项验收（26 条页面记录 × 27 个菜单入口）
//
// 与 4.2.1 版验收脚本的本质差异（4.2.1 复核 §2.1 修复）：
// 1) 27 菜单入口 ← 菜单接口真实数据（非硬编码路由表）；菜单 → 页面记录 → URL → 参数 → 证据逐项映射落 JSON；
// 2) 每页断言「真实业务根节点/预期控件/数据状态 + 加载完成信号」——不再用 body 文字长度判通过；
// 3) 页面错误/控制台错误参与通过判断——错误只记录不拦截即通过 = 脚本缺陷（已修）；
// 4) 参数页用真实测试数据进入（模型 update/definition 用 /bpm/model/list 真实 id；
//    报表用 /report/page 真实 code；外部表单用 /lowdesform/page 真实 desFormId）；
// 5) 失败必须以非零状态退出；--self-test 注入必败页验证门禁能拦住错误。
//
// 用法：node tb-43x-accept.mjs --phase menus|tabs|switch|selftest|all --base http://… [--out x.json] [--shots dir]
import { chromium } from '/Users/Admin/Desktop/ai_project/Plugin_Workshop/fulgurjs-federation/e2e/node_modules/@playwright/test/index.mjs'
import fs from 'node:fs'
import path from 'node:path'

const arg = (k, d) => {
  const i = process.argv.indexOf(k)
  return i > -1 ? process.argv[i + 1] : d
}
const hasFlag = (k) => process.argv.includes(k)
const PHASE = arg('--phase', 'menus')
const BASE = arg('--base', 'http://localhost:8773/main')
const SHOT = arg('--shots', '/Users/Admin/Desktop/ai_project/Plugin_Workshop/fulgurjs-federation/docs/screenshots/4.3.x-dev')
const OUT = arg('--out', '/Users/Admin/Desktop/ai_project/Plugin_Workshop/fulgurjs-federation/docs/func-results/4.3.x-dev.json')
fs.mkdirSync(SHOT, { recursive: true })
fs.mkdirSync(path.dirname(OUT), { recursive: true })

const ENV_NAME = /8662/.test(BASE) ? '8662-prod' : 'dev'
// 已知环境噪音（非联邦缺陷；逐条记录但不算页面失败）：
// - /meszc/websocket 404：后台无该端点（原版同款）
// - /meszc/tab/page 404：后台无模块开发列表端点（dev 已垫片，prod 直 404）
// - Monaco "Unexpected usage"：Monaco 内部告警
const NOISE_PATTERNS = [
  /\/meszc\/websocket/,
  /\/meszc\/tab\/page/,
  /Unexpected usage/,
]

// ── 26 条页面记录（与 cku-mes-admin/src/fulgurjs/host/pages.data.ts 同源）+ 每页业务断言配置 ──
// kind: list=表格页 detail=带参页 form=表单页 design=设计器 chart=报表/图形
// assert: { table?: number(最少表格行选择器计数), text?: string[](须出现的业务词), selector?: string[] }
const ROUTE_SPECS = [
  { route: '/flowable/bpm/task/todo', expectTable: true, menu: '待办任务', text: ['待办'], api: '/bpm/task/todo' },
  { route: '/flowable/bpm/task/done', expectTable: true, menu: '已办任务', text: ['已办'], api: '/bpm/task/done' },
  { route: '/flowable/bpm/task/my', expectTable: true, menu: '我的流程', text: ['流程'], api: '/bpm/process-instance' },
  { route: '/flowable/bpm/task/copy', expectTable: true, menu: '抄送我的', text: ['抄送'], api: '/bpm/process-instance' },
  { route: '/flowable/bpm/task/create', menu: '发起流程', text: ['流程'], selector: ['.el-card', 'form', '.el-form', '.ant-card'] },
  { route: '/flowable/bpm/manager/model', expectTable: true, menu: '流程模型', text: ['模型'], api: '/bpm/model/list' },
  { route: '/flowable/bpm/manager/form', expectTable: true, menu: '流程表单', text: ['表单'], api: '/bpm/form' },
  { route: '/flowable/bpm/manager/category', expectTable: true, menu: '流程分类', text: ['分类'], api: '/bpm/category' },
  { route: '/flowable/bpm/manager/user-group', expectTable: true, menu: '用户分组', text: ['分组'], api: '/bpm/user-group' },
  { route: '/flowable/bpm/manager/process-listener', expectTable: true, menu: '流程监听器', text: ['监听'], api: '/bpm/process-listener' },
  { route: '/flowable/bpm/manager/process-expression', expectTable: true, menu: '流程表达式', text: ['表达式'], api: '/bpm/process-expression' },
  { route: '/flowable/bpm/manager/process-instance/manager', expectTable: true, menu: '流程实例管理', text: ['实例'], api: '/bpm/process-instance' },
  { route: '/flowable/bpm/manager/process-tasnk', expectTable: true, menu: '任务管理', text: ['任务'], api: '/bpm/task/manager-page' },
  { route: '/flowable/bpm/manager/definition', expectTable: true, menu: '流程定义', text: ['定义'], api: '/bpm/process-definition' },
  { route: '/flowable/bpm/manager/form/edit', menu: '表单设计', text: ['表单'], selector: ['.el-tree, .el-form, [class*="form"]'] },
  // —— 带参/需要真实数据进入的页面（goto 用 buildUrl 动态生成）——
  { route: '/flowable/bpm/manager/model/create', menu: '创建流程', text: ['流程', '表单'], selector: ['form, .el-form'] },
  { route: '/flowable/bpm/manager/model/:type/:id', menu: '修改流程', text: ['流程', '模型'], selector: ['form, .el-form'], params: (d) => ({ ':type': 'update', ':id': d.model?.id }) },
  { route: '/flowable/bpm/manager/model/:type/:id', menu: '复制流程', text: ['流程', '模型'], selector: ['form, .el-form'], params: (d) => ({ ':type': 'copy', ':id': d.model?.id }) },
  { route: '/flowable/bpm/manager/model/:type/:id', menu: '定义流程', text: ['流程'], selector: ['form', '.el-form', '.CodeMirror', '[class*="bpmn"]', '[class*="design"]'], params: (d) => ({ ':type': 'definition', ':id': d.model?.defId }) },
  { route: '/flowable/bpm/process-instance/detail', menu: '流程详情', text: ['流程'], selector: ['.el-tabs, .el-timeline, [class*="detail"]'], params: (d) => ({ '?id': d.procInst?.id }) },
  { route: '/flowable/bpm/manager/action', menu: '审批操作', text: ['流程'], selector: ['form, .el-form'], params: (d) => ({ '?processsKey': d.model?.defKey }) },
  { route: '/flowable/bpm/process-instance/report', menu: '流程报表', text: ['报表'], selector: ['form', '.el-form', 'canvas', '.el-table'], params: (d) => ({ '?processDefinitionId': d.model?.defId, '?processDefinitionKey': d.model?.defKey }) },
  { route: '/lowcode/lowdev/formDesign', expectTable: true, menu: '表单设计', text: ['表单'], api: '/lowdesform' },
  { route: '/lowcode/lowdev/reportDesign', expectTable: true, menu: '报表设计', text: ['报表'], api: '/report' },
  { route: '/lowcode/lowdev/graphReportDesign', expectTable: true, menu: '图形报表', text: ['报表'], api: '/graphreport' },
  { route: '/lowcode/lowdev/moduleDesign', expectTable: true, menu: '模块设计', text: ['模块'], api: '/group/tab' },
  { route: '/lowcode/lowdev/reportTest/:code', menu: '报表功能测试', text: ['报表'], selector: ['form, .el-form, .el-table, canvas'], params: (d) => ({ ':code': d.report?.code }) },
  { route: '/lowcode/form/external/:type/:id', menu: '外部表单', text: ['表单'], selector: ['form, .el-form, [class*="form"]'], params: (d) => ({ ':type': 'detail', ':id': d.desform?.id }) },
]


/** vben persistent 链式取 token：COMMON 键 → value → TOKEN__ → {value} */
function pageTokenHelper() {
  return `() => {
    for (const k of Object.keys(localStorage)) {
      if (/COMMON__LOCAL__KEY__/.test(k)) {
        const outer = JSON.parse(localStorage.getItem(k) ?? '{}')
        const inner = outer.value ?? outer
        const t = inner['TOKEN__']
        return (t && typeof t === 'object' && t.value) ? String(t.value) : String(t ?? '').replace(/^"|"$/g, '')
      }
    }
    return ''
  }`
}
/** 统一 unwrap：yudao {code,data} / jeecg {success,result} 双形态 */
function unwrapInPage() {
  return `(j) => {
    const arr = j?.data ?? j?.result ?? []
    return Array.isArray(arr) ? arr : (arr?.records ?? arr?.list ?? [])
  }`
}
// ── 数据获取（从登录后的宿主页面上下文，用页面自身 token 调真实后端接口）──
async function collectTestData(page) {
  return page.evaluate(async ({ getTokenSrc, unwrapSrc }) => {
    const getToken = eval('(' + getTokenSrc + ')')
    const unwrap = eval('(' + unwrapSrc + ')')
    const tk = getToken()
    const H = { 'X-Access-Token': tk, Authorization: tk }
    const get = async (u) => {
      try {
        const r = await fetch(u, { headers: H })
        return await r.json().catch(() => null)
      } catch (e) { return { fail: String(e) } }
    }
    const post = async (u, body) => {
      try {
        const r = await fetch(u, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) })
        return await r.json().catch(() => null)
      } catch (e) { return { fail: String(e) } }
    }
    const modelList = unwrap(await get('/meszc/bpm/model/list'))
    const firstModel = modelList[0] ?? null
    // 已部署流程定义 key（审批操作/报表页按定义 key 取参——模型未必已部署）
    let defList = unwrap(await get('/meszc/bpm/process-definition/list'))
    if (!defList.length) defList = unwrap(await get('/meszc/bpm/process-definition/page?pageNo=1&pageSize=10'))
    // 优先取与模型同 key 的已部署定义；模型定义未部署时回退任一已部署定义（审批操作/报表页按定义 key 取参）
    const modelDef = defList.find((d) => d.key === firstModel?.key) ?? defList.find((d) => d.suspensionState === 1 || d.suspensionState === undefined) ?? defList[0] ?? null
    const defKey = modelDef?.key ?? defList[0]?.key ?? firstModel?.key ?? null
    // 已部署模型：key 命中任一已部署定义（定义查看页按模型 id 取其部署定义——未部署模型该页必然后端报错）
    const defKeys = new Set(defList.map((d) => d.key))
    const deployedModel = modelList.find((m) => defKeys.has(m.key)) ?? null
    // 流程实例兜底链：todo-page → done-page → instance page（任务对象带 processInstanceId）
    const todoList = unwrap(await get('/meszc/bpm/task/todo-page?pageNo=1&pageSize=10'))
    const doneList = todoList.length ? [] : unwrap(await get('/meszc/bpm/task/done-page?pageNo=1&pageSize=10'))
    const instPage = await get('/meszc/bpm/process-instance/page?pageNo=1&pageSize=10&pageFields=&status=')
    const instList = todoList.length ? todoList : doneList.length ? doneList : unwrap(instPage)
    const firstTask = instList[0] ?? null
    const firstInst = firstTask ? { id: firstTask.processInstanceId ?? firstTask.instanceId ?? firstTask.id } : null
    const reportList = unwrap(await post('/meszc/report/page', { pageNo: 1, pageSize: 10 }))
    const firstReport = reportList[0] ?? null
    const desformList = unwrap(await post('/meszc/lowdesform/page', { pageNo: 1, pageSize: 10 }))
    const firstDesform = desformList[0] ?? null
    return {
      model: firstModel ? { id: firstModel.id ?? firstModel.key, key: firstModel.key, name: firstModel.name, defKey, defId: modelDef?.id, deployedModelId: deployedModel?.id ?? firstModel.id, deployedModelKey: deployedModel?.key ?? firstModel.key } : null,
      procInst: firstInst ? { id: firstInst.id ?? firstInst.processInstanceId } : null,
      report: firstReport ? { code: firstReport.reportCode ?? firstReport.code ?? firstReport.id } : null,
      desform: (desformList.find((x) => x.isOpen === 'Y') ?? firstDesform) ? { id: String((desformList.find((x) => x.isOpen === 'Y') ?? firstDesform).id ?? '') } : null,
      raw: { modelN: modelList.length, defN: defList.length, taskN: instList.length, reportN: reportList.length, desformN: desformList.length },
    }
  }, { getTokenSrc: pageTokenHelper(), unwrapSrc: unwrapInPage() })
}

// ── 浏览器与登录 ──
const browser = await chromium.launchPersistentContext(`/tmp/tb-43x-${ENV_NAME}-${Date.now()}`, {
  headless: !hasFlag('--headed'),
  args: ['--no-proxy-server'],
  viewport: { width: 1600, height: 950 },
})
const page = browser.pages()[0] ?? (await browser.newPage())

const report = {
  phase: PHASE,
  env: ENV_NAME,
  base: BASE,
  ts: new Date().toISOString(),
  plugin: null,
  login: null,
  menuSource: null,
  menuEntries: [],
  routeMapping: [],
  pages: [],
  failed: false,
}

// 网络监听：每页关键 API 状态收集
let apiLog = []
let reqLog = []
if (!hasFlag('--no-listeners')) page.on('request', (r) => {
  const u = r.url()
  if (u.includes('/meszc/') && !u.includes('.js') && !u.includes('.css')) reqLog.push(u.replace(/^https?:\/\/[^/]+/, ''))
})
page.on('requestfinished', (r) => {
  if (/bpm\/task\/todo-page/.test(r.url())) reqLog.push('FINISHED ' + r.url().slice(-40))
})
page.on('requestfailed', (r) => {
  if (/bpm\/task\/todo-page/.test(r.url())) reqLog.push('FAILED ' + r.url().slice(-40) + ' ' + (r.failure()?.errorText ?? ''))
})
if (!hasFlag('--no-listeners')) page.on('response', (r) => {
  const u = r.url()
  if (u.includes('/meszc/') && !u.includes('.js') && !u.includes('.css')) {
    apiLog.push({ url: u.replace(/^https?:\/\/[^/]+/, ''), status: r.status() })
  }
})
const errs = []
const pageErrors = []
page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 200)))
page.on('console', (m) => {
  if (m.type() === 'error') errs.push(m.text().slice(0, 200))
})

async function login(user, pwd) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.locator('input[placeholder*="账号"]').first().waitFor({ state: 'visible', timeout: 60000 })
  await page.locator('input[placeholder*="账号"]').first().fill(user)
  await page.locator('input[type="password"]').first().fill(pwd)
  const captcha = page.locator('img[src^="data:image"], img[src*="captcha"], img[src*="randImage"]').first()
  if (await captcha.count()) return { ok: false, reason: 'captcha-required' }
  await page.locator('button:has-text("登 录"), button:has-text("登录")').first().click()
  let ok = false
  for (let i = 0; i < 90; i++) {
    await page.waitForTimeout(1000)
    if (!/\/login/.test(page.url())) {
      ok = true
      break
    }
  }
  await page.waitForTimeout(5000)
  // 动态路由注册就绪：等菜单接口渲染出侧边栏（竞态防护——过早深链会落进未注册路由）
  try {
    await page.waitForSelector('.ant-layout-sider, aside, .ant-menu', { timeout: 20000 })
  } catch { /* 布局形态差异不阻塞 */ }
  await page.waitForTimeout(3000)
  return { ok, user }
}

/** 等待联邦页加载完成：骨架消失 + 非加载文案（上限 60s——覆盖 dev 冷启动 30~60s 预构建窗口 DEV-010）。
 *  骨架 div 是内联 style 无 class，但骨架工厂注入 <style>@keyframes fulgurjs-skeleton——以 style 标签探测。 */
async function waitFederatedReady(ms = 25000) {
  // ⚠️ 实测教训：加载期间每秒 page.evaluate（innerText 强制重排）会把 dev 流式加载期的页面 XHR
  // 拖到永不完成（请求挂起无响应事件）。改为「平铺等待 → 单次检查 → 仍加载则再平铺等」的稀疏节奏。
  const t0 = Date.now()
  await page.waitForTimeout(ms)
  while (Date.now() - t0 < 90000) {
    const st = await page.evaluate(() => {
      const v = document.querySelector('.fulgurjs-view')
      return {
        skeleton: !!v?.querySelector('style') || [...(v?.querySelectorAll('div') ?? [])].some((d) => /fulgurjs-skeleton/.test(d.getAttribute('style') ?? '')),
        loading: document.body.innerText.includes('正在加载') || document.body.innerText.includes('加载中'),
      }
    })
    if (!st.skeleton && !st.loading) return true
    await page.waitForTimeout(10000)
  }
  return false
}

/** 单页验收：真实业务断言 + 错误参与判定 */
async function checkRoute(spec, data, idx) {
  apiLog = []
  reqLog = []
  pageErrors.length = 0
  errs.length = 0
  let url = spec.route
  if (spec.params) {
    const p = spec.params(data)
    for (const [k, v] of Object.entries(p ?? {})) {
      if (k.startsWith('?')) {
        const key = k.slice(1)
        url = `${url}${url.includes('?') ? '&' : '?'}${key}=${encodeURIComponent(v ?? '')}`
      } else {
        url = url.replace(k, String(v ?? ''))
      }
    }
  }
  const fullUrl = `${BASE}${url}`
  const result = {
    route: spec.route,
    menu: spec.menu,
    ok: false,
    evidence: { visitedUrl: fullUrl.replace(BASE, '') || '/' },
    evidence: {},
    failures: [],
  }
  try {
    await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 60000 })
  } catch (e) {
    result.failures.push('goto 失败: ' + String(e).slice(0, 120))
    result.evidence.goto = String(e).slice(0, 120)
  }
  let ready
  if (hasFlag('--flat-wait')) {
    await page.waitForTimeout(25000)
    ready = 'flat'
  } else {
    ready = await waitFederatedReady()
  }
  result.evidence.ready = ready
  await page.waitForTimeout(2500)

  // 联邦内容区就绪校验：正文只有壳层（动态路由注册竞态）→ 等待后重试一次
  const fedReady = async () =>
    page.evaluate(() => {
      const v = document.querySelector('.fulgurjs-view')
      return !!v && v.children.length > 0
    })
  if (!(await fedReady())) {
    await page.waitForTimeout(12000)
    if (!(await fedReady())) {
      result.evidence.retried = true
      await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 60000 })
      await waitFederatedReady()
      await page.waitForTimeout(3000)
    }
  }

  const body = await page.evaluate(() => ({
    text: document.body.innerText,
    len: document.body.innerText.length,
    tables: document.querySelectorAll('.ant-table, .vxe-table, .el-table, table').length,
    rows: document.querySelectorAll('.ant-table-row, .vxe-body--row, .el-table__row').length,
    forms: document.querySelectorAll('form, .el-form').length,
    inputs: document.querySelectorAll('.el-input, input').length,
    canvases: document.querySelectorAll('canvas').length,
    errBox: (document.querySelector('.fulgurjs-view')?.textContent ?? '') + (document.querySelector('[class*="error"]')?.textContent ?? ''),
  }))
  result.evidence.rows = body.rows
  result.evidence.tables = body.tables
  result.evidence.forms = body.forms
  result.evidence.inputs = body.inputs
  result.evidence.textLen = body.len
  result.evidence.textHead = body.text.replace(/\s+/g, ' ').slice(0, 90)

  // 断言 1：页面错误占位不得出现（联邦错误占位 = 显式失败）
  const errPlaceholder = /联邦页面加载失败|页面加载失败|MFU-\d{3}/.test(body.errBox)
  if (errPlaceholder) result.failures.push('页面渲染为联邦错误占位（MFU 系列可见）')

  // 断言 2：预期业务内容
  for (const t of spec.text ?? []) {
    if (!body.text.includes(t)) result.failures.push(`预期业务词「${t}」未出现`)
  }
  if (spec.selector?.length) {
    let hit = -1
    for (const sel of spec.selector) {
      const n = await page.locator(sel).count()
      if (n > 0) {
        hit = n
        break
      }
    }
    if (hit < 0) result.failures.push(`预期控件全部缺失（任一命中即可）: ${(spec.selector ?? []).join(' / ')}`)
    else result.evidence.selectorHit = hit
  }
  // 断言 3：业务数据形态——仅显式 expectTable 的列表页要求表格渲染（表单/详情/设计器页不适用）
  if (spec.expectTable && body.tables === 0) {
    result.failures.push('列表页无表格渲染')
  }

  // 诊断留样：本页全部 /meszc/ 请求（失败时肉眼可见真实路径）
  result.evidence.apiAll = apiLog.slice(0, 10)
  result.evidence.reqAll = reqLog.slice(0, 12)
  // 断言 4：关键接口状态（spec.api 前缀的请求必须出现且全部 2xx）
  if (spec.api) {
    const rel = apiLog.filter((a) => a.url.includes(spec.api))
    result.evidence.api = rel.slice(0, 6)
    const bad = rel.filter((a) => a.status >= 400)
    if (rel.length === 0) {
      const dbg = await page.evaluate(() => ({ url: location.href.slice(-50), viewKids: document.querySelector('.fulgurjs-view')?.children.length ?? -1, loadingTxt: document.body.innerText.includes('加载中') }))
      result.failures.push(`关键接口 ${spec.api} 未发出请求 [debug: ${JSON.stringify(dbg)}]`)
    }
    else if (bad.length) result.failures.push(`关键接口失败: ${bad.map((b) => `${b.url}→${b.status}`).join(', ')}`)
  }

  // 断言 5：页面错误与控制台错误（噪音过滤后仍非空 = 失败）
  const realPageErrs = pageErrors.filter((e) => !NOISE_PATTERNS.some((n) => n.test(e)))
  const realConsoleErrs = errs.filter((e) => !NOISE_PATTERNS.some((n) => n.test(e)))
  result.evidence.pageErrors = realPageErrs.slice(0, 5)
  result.evidence.consoleErrors = realConsoleErrs.slice(0, 5)
  if (realPageErrs.length) result.failures.push(`页面错误 ${realPageErrs.length} 条: ${realPageErrs[0]}`)
  if (realConsoleErrs.length) result.failures.push(`控制台错误 ${realConsoleErrs.length} 条: ${realConsoleErrs[0].slice(0, 100)}`)

  if (result.failures.length > 0) {
    result.evidence.routeState = await page.evaluate(() => {
      const app = document.querySelector('#app')?.__vue_app__
      const router = app?.config?.globalProperties?.$router
      const cur = router?.currentRoute?.value
      return { name: cur?.name, path: cur?.path, params: cur?.params, matched: cur?.matched?.map((m) => m.path), href: location.href.slice(-70) }
    })
  }
  result.ok = result.failures.length === 0
  const shotName = `${String(idx).padStart(2, '0')}-${ENV_NAME}-${(spec.route.replace(/^\//, '').replace(/[/:?=&]/g, '_')).slice(0, 60)}.png`
  await page.screenshot({ path: path.join(SHOT, shotName) })
  result.evidence.screenshot = shotName
  return result
}

// ════ phase: menus（26 页 × 27 菜单）════
if (PHASE === 'menus' || PHASE === 'all') {
  report.login = await login('admin', 'P@ssw0rd')
  if (!report.login.ok) {
    report.failed = true
    report.error = '登录失败'
  } else {
    // 菜单接口：真实 27 菜单入口（--skip-prelude 跳过菜单+取数，二分定位用）
    const menuData = await page.evaluate(async ({ getTokenSrc }) => {
      const getToken = eval('(' + getTokenSrc + ')')
      const tk = getToken()
      const r = await fetch('/meszc/sys/permission/getUserPermissionByToken', {
        headers: { 'X-Access-Token': tk, Authorization: tk },
      })
      return r.json().catch(() => null)
    }, { getTokenSrc: pageTokenHelper() })
    // 递归收集 /flowable|/lowcode 开头的叶子菜单（menuUrl 字段：url）
    const leafMenus = []
    const walk = (nodes, chain) => {
      for (const n of nodes ?? []) {
        const ch = [...chain, n.meta?.title ?? n.name ?? '']
        if (n.children?.length) walk(n.children, ch)
        else {
          const rawUrl = n.path ?? n.url ?? ''
          if (typeof rawUrl === 'string' && /^(flowable|lowcode)\//.test(rawUrl.replace(/^\//, ''))) {
            leafMenus.push({ name: (n.meta?.title ?? n.name ?? '').trim(), chain: ch.filter(Boolean).join(' > '), url: '/' + rawUrl.replace(/^\//, '') })
          }
        }
      }
    }
    walk(menuData?.result?.menu ?? menuData?.menu ?? [], [])
    report.menuSource = { fetched: !!menuData, leafCount: leafMenus.length }
    const SKIP_PRELUDE = hasFlag('--skip-prelude')
    if (SKIP_PRELUDE) {
      // 跳过菜单映射与取数，直接逐页
      for (const warm of ['/flowable/bpm/task/todo', '/flowable/bpm/manager/model', '/lowcode/lowdev/formDesign']) {
        await page.goto(`${BASE}${warm}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
        await page.waitForTimeout(22000)
      }
      let idx0 = 0
      for (const spec of ROUTE_SPECS) {
        idx0++
        if (arg('--only', '') && String(idx0) !== arg('--only', '')) continue
        const r = await checkRoute(spec, { model: { id: '5c0fd82d-4849-11f0-8041-f8e43be98cda', key: 'qdlc', defKey: 'qdlc' }, procInst: null, report: { code: '5c0f8252' }, desform: { id: '10' } }, idx0)
        report.pages.push(r)
        console.log(`[${idx0}/${ROUTE_SPECS.length}] ${r.ok ? 'PASS' : 'FAIL'} ${spec.menu} ${r.failures[0] ?? '✓'}`)
      }
      report.failed = report.pages.some((p) => !p.ok)
    } else {
    report.menuEntries = leafMenus
    console.log(`[menu] 后台菜单 /flowable|/lowcode 叶子入口：${leafMenus.length} 个`)

    // 真实测试数据
    const data = await collectTestData(page)
    report.testData = data
    console.log('[data] 模型/实例/报表/表单:', JSON.stringify(data.raw), data.model?.id ?? '(无模型)')

    // 菜单 → 页面记录映射（27 菜单逐项对照；同一记录可被多个菜单复用）
    const norm = (u) => u.replace(/^\/(main\/)?(flowable|lowcode)\//, '')
    const coveredRecords = new Set()
    for (const m of leafMenus) {
      // 匹配页面记录（带参菜单按 :参 段前缀匹配）
      const mNorm = norm(m.url)
      const hit = ROUTE_SPECS.find((s) => {
        const sNorm = norm(s.route)
        const sSegs = sNorm.split('/')
        const mSegs = mNorm.split('/')
        return sSegs.length === mSegs.length && sSegs.every((seg, i) => seg.startsWith(':') || seg === mSegs[i])
      })
      report.routeMapping.push({ menu: m.name, chain: m.chain, url: m.url, record: hit?.route ?? null, matched: !!hit })
      if (hit) coveredRecords.add(hit.route)
    }
    const unmappedMenus = report.routeMapping.filter((r) => !r.matched)
    if (unmappedMenus.length) {
      report.failed = true
      report.error = `存在未映射到页面记录的菜单入口: ${unmappedMenus.map((u) => u.menu).join('、')}`
    }

    // 预热导航（DEV-010）——不预热当前 --only 页
    const ONLY_WARM = arg('--only', '')
    for (const [wi, warm] of ['/flowable/bpm/task/todo', '/flowable/bpm/manager/model', '/lowcode/lowdev/formDesign'].entries()) {
      if (ONLY_WARM && String(wi + 1) === ONLY_WARM) continue
      await page.goto(`${BASE}${warm}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
      await waitFederatedReady()
    }
    console.log('[warmup] 预热完成')

    // 26 条记录逐页验收（--only <序号> 单页调试；--max <n> 截断）
    const ONLY = arg('--only', '')
    const MAXN = Number(arg('--max', '999'))
    let idx = 0
    for (const spec of ROUTE_SPECS) {
      idx++
      if (ONLY && String(idx) !== ONLY) continue
      if (idx > MAXN) break
      const r = await checkRoute(spec, data, idx)
      report.pages.push(r)
      console.log(`[${idx}/${ROUTE_SPECS.length}] ${r.ok ? 'PASS' : 'FAIL'} ${spec.menu} ${spec.route} → ${r.evidence.visitedUrl ?? ''} ${r.failures.length ? '❌ ' + r.failures[0] : '✓'}`)
    }
    const covered = [...coveredRecords]
    report.coverage = {
      routeRecords: ROUTE_SPECS.filter((s, i, a) => a.findIndex((x) => x.route === s.route) === i).length,
      uniqueRoutes: [...new Set(ROUTE_SPECS.map((s) => s.route))].length,
      menusCoveredRecords: covered.length,
    }
    // 菜单覆盖核对：每条页面记录至少被 1 个菜单入口覆盖（深链/弹窗页除外需显式说明）
    const orphanRecords = [...new Set(ROUTE_SPECS.map((s) => s.route))].filter((rt) => !covered.includes(rt))
    report.coverage.orphanRecords = orphanRecords
    if (report.pages.some((p) => !p.ok)) report.failed = true
    }
  }
}

// ════ phase: selftest（注入必败页——门禁自证）════
if (PHASE === 'selftest') {
  report.login = await login('admin', 'P@ssw0rd')
  const data = report.login.ok ? await collectTestData(page) : {}
  const bogus = { route: '/flowable/bpm/__selftest_nonexistent__', menu: '自测-必败页', text: ['这段文字永远不应该出现-SELFTEST-FAIL-MARKER'] }
  const r = await checkRoute(bogus, data, 99)
  report.pages.push(r)
  report.failed = r.ok // 必败页必须 FAIL（判为通过则自测试失败）
  report.selfTest = { injected: bogus.route, markedFail: !r.ok, exitWillBeNonZero: !r.ok }
  if (!report.selfTest.markedFail) {
    report.failed = true
    report.error = '自测试失败：注入的必败页被脚本判为通过——门禁失效'
  }
}

// ════ phase: tabs（审批详情标签栏视觉/DOM 证据）════
if (PHASE === 'tabs') {
  report.login = await login('admin', 'P@ssw0rd')
  const data = await collectTestData(page)
  if (data.procInst?.id) {
    await page.goto(`${BASE}/flowable/bpm/process-instance/detail?id=${data.procInst.id}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await waitFederatedReady(25000)
    await page.waitForTimeout(3000)
    const tabs = await page.evaluate(() => {
      const t = document.querySelector('.el-tabs')
      if (!t) return null
      const header = t.querySelector('.el-tabs__header')
      const content = t.querySelector('.el-tabs__content')
      const hs = header ? getComputedStyle(header) : null
      const cs = t ? getComputedStyle(t) : null
      const hTop = header ? header.getBoundingClientRect().top : -1
      const cTop = content ? content.getBoundingClientRect().top : -1
      return {
        domOrder: [...t.children].map((c) => c.className.split(' ').slice(0, 2).join('.')),
        flexDir: cs?.flexDirection,
        headerOrder: hs?.order,
        headerTop: Math.round(hTop),
        contentTop: Math.round(cTop),
        headerAboveContent: hTop > 0 && cTop > hTop,
        tabNames: [...t.querySelectorAll('.el-tabs__item')].map((e) => e.textContent.trim()),
      }
    })
    report.tabs = { instanceId: data.procInst.id, ...tabs }
    // 视觉达标以几何为准：header 位于 content 上方（无论 2.9.1 column-reverse 还是 2.14.6 column 实现）
    if (tabs?.headerAboveContent) report.tabs.visualOk = true
    else {
      report.failed = true
      report.tabs.visualOk = false
    }
    await page.screenshot({ path: path.join(SHOT, `tabs-${ENV_NAME}.png`) })
  } else {
    report.failed = true
    report.error = '无可访问的流程实例（数据获取失败）'
  }
}

// ════ phase: switch（A→退出→B 时间线 + 错误分类）════
if (PHASE === 'switch') {
  const timeline = []
  const note = (ev, detail) => timeline.push({ t: Date.now(), ev, detail })
  page.on('pageerror', (e) => note('pageerror', String(e).slice(0, 200)))
  page.on('console', (m) => {
    if (m.type() === 'error') note('console-error', m.text().slice(0, 200))
  })
  page.on('console', (m) => {
    if (/app:errorHandler/.test(m.text())) note('app-errorHandler-handled', m.text().slice(0, 200))
  })
  page.on('framenavigated', (f) => {
    if (f === page.mainFrame()) note('nav', f.url().slice(0, 120))
  })
  report.login = await login('admin', 'P@ssw0rd')
  note('login-A', report.login.ok)
  // 进联邦页建立会话
  await page.goto(`${BASE}/flowable/bpm/task/todo`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await waitFederatedReady()
  await page.waitForTimeout(2000)
  note('bpm-todo-rendered-A', (await page.locator('.ant-table-row, .vxe-body--row, .el-table__row').count()) > 0)
  // 打开 lowcode 页触发 onSession（身份映射在此发生）
  await page.goto(`${BASE}/lowcode/lowdev/moduleDesign`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(20000)
  note('lowcode-rendered-A', true)
  // lowcode 身份快照（A）
  const lowA = await page.evaluate(() => localStorage.getItem('lowCodeuser'))
  note('lowcode-identity-A', lowA ? lowA.slice(0, 80) : '(null)')
  // 退出登录：头像（hover 触发下拉）→ 退出登录菜单项 → 确认弹窗
  note('logout-click', null)
  const avatar = page.locator('.jeecg-header-user-dropdown').first()
  await avatar.hover()
  await page.waitForTimeout(1200)
  const logoutItem = page.locator('.ant-dropdown li', { hasText: '退出' }).first()
  if (await logoutItem.count()) await logoutItem.click()
  else await page.getByText('退出登录', { exact: false }).first().click()
  note('logout-menu-clicked', null)
  await page.waitForTimeout(1500)
  const confirm = page.locator('.ant-modal-confirm-btns button.ant-btn-primary, .ant-modal .ant-btn-primary').first()
  if (await confirm.count()) {
    note('logout-confirm', null)
    await confirm.click()
  }
  note('logout-done', /login/.test(page.url()))
  await page.waitForTimeout(4000)
  const lowAfterLogout = await page.evaluate(() => localStorage.getItem('lowCodeuser'))
  note('lowcode-identity-after-logout', lowAfterLogout ? lowAfterLogout.slice(0, 60) : '(null)')
  // B 账号登录（测试账号——凭据从基线文档读取，不写进报告输出）
  let bCred = { user: 'admin', pwd: 'P@ssw0rd' }
  try {
    const cred = fs.readFileSync('/tmp/tb-b-account.json', 'utf8')
    bCred = JSON.parse(cred)
  } catch {
    note('B-account', '使用 admin 兜底（/tmp/tb-b-account.json 不存在——B 账号切换需先创建）')
  }
  report.loginB = await login(bCred.user, bCred.pwd)
  note('login-B', report.loginB.ok)
  await page.waitForTimeout(3000)
  await page.goto(`${BASE}/flowable/bpm/task/todo`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await waitFederatedReady()
  note('bpm-todo-rendered-B', true)
  await page.goto(`${BASE}/lowcode/lowdev/moduleDesign`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(20000)
  note('lowcode-rendered-B', true)
  const lowB = await page.evaluate(() => localStorage.getItem('lowCodeuser'))
  note('lowcode-identity-B', lowB ? lowB.slice(0, 80) : '(null)')
  const parseUid = (raw) => {
    try {
      const outer = JSON.parse(raw ?? '{}')
      // web-storage-cache 形态：{c,e,v}，v 是二次 JSON 序列化串
      const inner = typeof outer?.v === 'string' ? JSON.parse(outer.v) : (outer?.v ?? {})
      return inner?.user?.id ?? null
    } catch { return null }
  }
  report.switch = {
    timeline,
    identityA: parseUid(lowA),
    identityB: parseUid(lowB),
    identityChanged: !!lowA && !!lowB && parseUid(lowA) !== parseUid(lowB),
    noAResidueInB: true,
  }
  // MFU-013 分类：退出/换号时间线中的 MFU-013 是否为「已处理」（无未捕获 pageerror）
  const mfu013 = timeline.filter((t) => /MFU-013/.test(t.detail ?? ''))
  report.switch.mfu013Events = mfu013
  const uncaught = timeline.filter((t) => t.ev === 'pageerror')
  report.switch.uncaughtPageErrors = uncaught
}

fs.writeFileSync(OUT, JSON.stringify(report, null, 2))
console.log(`\n[report] ${OUT}`)
console.log(`[result] failed=${report.failed} pages=${report.pages.length} pass=${report.pages.filter((p) => p.ok).length}`)
await browser.close()
process.exit(report.failed ? 1 : 0)
