/**
 * Jeecg 联邦演示数据服务（端口 5380）——明确标识的本地 Demo 数据层。
 *
 * 作用：JeecgBoot v3.9.5 官方前端的业务页面依赖后端（/jeecgboot → 代理目标）。
 * 本服务按前端契约提供演示数据（登录/用户/权限/菜单/字典/账户列表/订单演示集），
 * 仅服务本地演示，不冒充真实后端联调，不连接生产系统。
 * 路径前缀 /jeecg-boot（各实例 .env.development 的 VITE_PROXY 指向 http://localhost:5380/jeecg-boot）。
 * 按 Origin 端口区分实例菜单：5372=Jeecg-B（仅内嵌 React-C），其余=Jeecg-A（嵌 B + 嵌 C）。
 */
import http from 'node:http'
import crypto from 'node:crypto'

const PORT = 5380
const PAGE_HOME = '/dashboard/analysis'

const users = [
  { userId: '1', username: 'admin', realname: '管理员', password: '123456', token: 'fakeToken1', homePath: PAGE_HOME, desc: 'manager', avatar: 'https://q1.qlogo.cn/g?b=qq&nk=190848757&s=640', roles: [{ roleName: 'Super Admin', value: 'super' }] },
  { userId: '2', username: 'jeecg', realname: '测试用户', password: '123456', token: 'fakeToken2', homePath: PAGE_HOME, desc: 'tester', avatar: 'https://q1.qlogo.cn/g?b=qq&nk=339449197&s=640', roles: [{ roleName: 'Tester', value: 'test' }] },
]
const permCodes = { 1: ['1000', '3000', '5000'], 2: ['2000', '4000', '6000'] }

const ok = (result, message = 'ok') => ({ code: 0, result, message, type: 'success' })
const err = (message = 'Request failed', code = -1) => ({ code, result: null, message, type: 'error' })
const pageOf = (list, pageNo, pageSize) => {
  const p = Number(pageNo ?? 1); const s = Number(pageSize ?? 20)
  return { records: list.slice((p - 1) * s, p * s), total: list.length }
}
const tokenOf = (req) => req.headers.authorization ?? undefined
const userByToken = (req) => users.find((u) => u.token === tokenOf(req))

/* ─── 账户列表（官方 /demo/system/account 页面契约，mockjs 模板转为静态演示数据）─── */
const surnames = ['张', '王', '李', '赵', '陈', '刘', '杨']
const accounts = Array.from({ length: 26 }, (_, i) => ({
  id: String(i),
  account: `user${String(i).padStart(2, '0')}`,
  email: `user${i}@demo.jeecg.local`,
  nickname: surnames[i % surnames.length] + ['伟', '芳', '娜', '敏', '静', '磊', '军'][i % 7],
  role: ['admin', 'user', 'tester'][i % 3],
  createTime: `2026-09-${String((i % 28) + 1).padStart(2, '0')} 10:${String(i % 60).padStart(2, '0')}`,
  remark: '演示数据（本地数据服务生成，仅用于联邦演示）',
  status: String(i % 2),
}))

/* ─── 订单演示数据集（联邦业务演示：筛选/分页/编辑）─── */
const cities = ['上海', '北京', '广州', '深圳']
const fedOrders = Array.from({ length: 23 }, (_, i) => ({
  id: String(1001 + i),
  orderNo: `FG${2026}${String(i + 1).padStart(4, '0')}`,
  title: `工单 ${1001 + i}（${cities[i % 4]}）`,
  city: cities[i % 4],
  status: ['待处理', '进行中', '已完成'][i % 3],
  amount: (i + 1) * 137.5,
  createTime: `2026-10-0${(i % 2) + 1} 1${i % 10}:2${i % 10}:00`,
  remark: '演示工单',
}))

/* ─── 菜单（官方 mock/sys/menu.ts 结构移植；按 Origin 端口区分 A/B 实例）─── */
const dashboardRoute = () => ({
  path: '/dashboard', name: 'Dashboard', component: 'LAYOUT', redirect: PAGE_HOME,
  meta: { title: '仪表盘', hideChildrenInMenu: true, icon: 'bx:bx-home' },
  children: [
    { path: 'analysis', name: 'Analysis', component: '/dashboard/Analysis/index', meta: { hideMenu: true, hideBreadcrumb: true, title: '分析页', currentActiveMenu: '/dashboard', icon: 'bx:bx-home' } },
    { path: 'workbench', name: 'Workbench', component: '/dashboard/workbench/index', meta: { hideMenu: true, hideBreadcrumb: true, title: '工作台', currentActiveMenu: '/dashboard', icon: 'bx:bx-home' } },
  ],
})

const sysRoute = () => ({
  path: '/system', name: 'System', component: 'LAYOUT', redirect: '/system/account',
  meta: { icon: 'ion:settings-outline', title: '系统管理（演示数据）' },
  children: [
    { path: 'account', name: 'AccountManagement', meta: { title: '账户列表', ignoreKeepAlive: true }, component: '/demo/system/account/index' },
    { path: 'account-detail/:id', name: 'AccountDetail', meta: { title: '账户详情', hideMenu: true, ignoreKeepAlive: true }, component: '/demo/system/account/AccountDetail' },
  ],
})

const fedChildrenA = () => [
  {
    path: 'bridge', name: 'FedJeecgB', component: '/fed/JeecgBridgeDemo',
    meta: { title: '嵌入 Jeecg-B（自嵌套）', icon: 'ant-design:appstore-outlined' },
    children: [{ path: ':pathMatch(.*)*', name: 'FedJeecgBAny', component: '/fed/JeecgBridgeDemo', meta: { title: '', hideMenu: true, hideBreadcrumb: true } }],
  },
  {
    path: 'react', name: 'FedReactC', component: '/fed/ReactBridgeDemo',
    meta: { title: '嵌入 React-C（跨框架）', icon: 'ant-design:code-outlined' },
    children: [{ path: ':pathMatch(.*)*', name: 'FedReactCAny', component: '/fed/ReactBridgeDemo', meta: { title: '', hideMenu: true, hideBreadcrumb: true } }],
  },
]
const fedChildrenB = () => [
  {
    path: 'inner', name: 'FedInnerReact', component: '/fed/InnerReactDemo',
    meta: { title: '嵌入 React-C（三层嵌套）', icon: 'ant-design:code-outlined' },
    children: [{ path: ':pathMatch(.*)*', name: 'FedInnerReactAny', component: '/fed/InnerReactDemo', meta: { title: '', hideMenu: true, hideBreadcrumb: true } }],
  },
]
const fedRoute = (isB) => ({
  path: '/fed', name: 'FedDemo', component: 'LAYOUT', redirect: isB ? '/fed/inner' : '/fed/bridge',
  meta: { icon: 'ant-design:cluster-outlined', title: '联邦演示（fulgurjs）' },
  children: isB ? fedChildrenB() : fedChildrenA(),
})

const menuFor = (originPort, userId, isBInstance = false) => {
  const isB = isBInstance || String(originPort) === '5372'
  const menu = [dashboardRoute(), sysRoute(), fedRoute(isB)]
  // jeecg 用户（userId 2）菜单保持一致（演示不区分权限面）
  void userId
  return menu
}

/* ─── HTTP 服务 ─── */
const unmatched = []

/** 已实现端点清单（/_endpoints 可查；未实现端点返回 404 诊断，不用 200 空成功掩盖） */
const implementedEndpoints = [
  'POST /jeecg-boot/sys/login（AES-CBC 契约；admin/123456、jeecg/123456，验证码任意）',
  'GET  /jeecg-boot/sys/user/getUserInfo',
  'GET  /jeecg-boot/sys/permission/getPermCode',
  'GET  /jeecg-boot/sys/permission/getUserPermissionByToken（菜单/权限；按实例前缀区分 A/B）',
  'GET  /jeecg-boot/sys/logout',
  'GET  /jeecg-boot/sys/randomImage/*（1x1 透明 PNG）',
  'GET  /jeecg-boot/sys/dict/*（显式空实现：演示页面不消费字典数据）',
  'GET  /jeecg-boot/sys/annountCement/getUnreadMessageCount（显式空实现：公告未读数=0）',
  'GET  /jeecg-boot/sys/user/verifyIzDefaultPwd（显式空实现：非默认密码）',
  'GET  /jeecg-boot/sys/loginfo（显式空实现：登录日志空列表）',
  'GET  /jeecg-boot/sys/visitInfo（显式空实现：访问统计空列表）',
  'GET  /jeecg-boot/system/getAccountList（分页账户演示集）',
  'GET  /jeecg-boot/fed/orders/list（联邦订单演示集：筛选/分页）',
  'POST /jeecg-boot/fed/orders/save（编辑保存演示）',
  'GET  /health',
  'GET  /_endpoints（本清单）',
  'GET  /_unmatched（最近 50 条未实现端点请求记录）',
]

const server = http.createServer(async (req, res) => {
  let url = new URL(req.url, `http://localhost:${PORT}`)
  let path = url.pathname
  // 实例身份按 API 前缀区分（B 实例代码运行在宿主页面里，Referer/Origin 不可靠）：
  // /jeecg-boot-b/* = Jeecg-B 专属（菜单为 B 结构），归一化到 /jeecg-boot/* 后共用 handler
  const isBInstance = path.startsWith('/jeecg-boot-b/')
  if (isBInstance) path = path.replace('/jeecg-boot-b/', '/jeecg-boot/')
  const q = Object.fromEntries(url.searchParams)
  const origin = req.headers.origin ?? ''
  const referer = req.headers.referer ?? ''
  // 同源代理请求通常无 Origin，用 Referer 兜底识别实例端口（A=5371，B=5372）
  const portMatch = `${origin} ${referer}`.match(/localhost:(\d+)/)
  const originPort = portMatch?.[1] ?? ''
  const readBody = () => new Promise((r) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { try { r(JSON.parse(b || '{}')) } catch { r({}) } }) })
  const send = (data) => { res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': origin || '*', 'access-control-allow-headers': '*' }); res.end(JSON.stringify(data)) }
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-origin': origin || '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PUT,DELETE' }); return res.end() }
  const log = `${req.method} ${path}${Object.keys(q).length ? ` ${JSON.stringify(q)}` : ''} [origin=${origin || '-'}]`

  // 联邦演示订单数据集（/fed/orders/*）
  if (path === '/jeecg-boot/fed/orders/list') {
    const filtered = fedOrders.filter((o) => !q.q || o.title.includes(q.q) || o.orderNo.includes(q.q))
    console.log('[orders]', log)
    return send(ok(pageOf(filtered, q.page, q.pageSize ?? 5)))
  }
  if (path === '/jeecg-boot/fed/orders/save' && req.method === 'POST') {
    const body = await readBody()
    const idx = fedOrders.findIndex((o) => o.id === body.id)
    if (idx >= 0) fedOrders[idx] = { ...fedOrders[idx], ...body, remark: `已编辑 @ ${new Date().toLocaleTimeString()}` }
    else fedOrders.unshift({ ...body, id: String(Date.now()), createTime: new Date().toLocaleString() })
    console.log('[orders]', log)
    return send(ok(true))
  }

  if (path === '/jeecg-boot/sys/login' && req.method === 'POST') {
    const body = await readBody()
    const { username, password } = body
    // jeecg 官方前端用 AES-CBC（key/iv 见 src/utils/cipher.ts）加密密码后提交；
    // 演示服务按同一契约解密比对，同时兼容明文与 MD5 形态
    const md5 = crypto.createHash('md5').update('123456').digest('hex')
    let plain = ''
    try {
      const d = crypto.createDecipheriv('aes-128-cbc', '1234567890adbcde', '1234567890hjlkew')
      plain = Buffer.concat([d.update(Buffer.from(String(password ?? ''), 'base64')), d.final()]).toString('utf8')
    } catch { plain = '' }
    const u = users.find((x) => x.username === username && (plain === x.password || password === x.password || password === md5))
    if (!u) console.log('[auth-debug] password_head=', String(password ?? '').slice(0, 8), 'decrypted=', plain ? `${plain.slice(0, 2)}**` : '(解密失败)')
    console.log('[auth]', log, '=>', u ? u.username : 'failed')
    if (!u) return send(err('Incorrect account or password！'))
    const { userId, token, desc, roles, realname, avatar, homePath } = u
    // jeecg 契约：result = { token, userInfo }，userInfo.loginTenantId 被 store 消费
    return send(ok({
      token,
      userInfo: { userId, username, token, realname, desc, roles, avatar, homePath, loginTenantId: 0 },
    }))
  }
  if (path === '/jeecg-boot/sys/user/getUserInfo') {
    const u = userByToken(req)
    if (!u) return send(err('Invalid token'))
    return send(ok(u))
  }
  if (path === '/jeecg-boot/sys/permission/getPermCode') {
    const u = userByToken(req)
    if (!u) return send(err('Invalid token!'))
    return send(ok(permCodes[u.userId]))
  }
  if (path === '/jeecg-boot/sys/logout') return send(ok(undefined, 'Token has been destroyed'))
  if (path.startsWith('/jeecg-boot/sys/randomImage/')) {
    // 1x1 透明 PNG：演示验证码（登录时任意验证码均可通过）
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
    return send(ok(`data:image/png;base64,${png}`))
  }
  if (path === '/jeecg-boot/sys/permission/getUserPermissionByToken') {
    const u = userByToken(req)
    if (!u) return send(err('Invalid user token!'))
    console.log('[menu]', log, `port=${originPort || '?'} user=${u.username} instance=${isBInstance ? 'B' : 'A'}`)
    // jeecg v3.9.5 契约：result = { menu, codeList, auth, allAuth }（getBackMenuAndPerms 解析）
    return send(ok({
      menu: menuFor(originPort, u.userId, isBInstance),
      codeList: permCodes[u.userId],
      auth: [],
      allAuth: [],
      sysSafeMode: false,
    }))
  }
  if (path === '/jeecg-boot/system/getAccountList') {
    return send(ok(pageOf(accounts, q.page, q.pageSize)))
  }
  if (path.startsWith('/jeecg-boot/sys/dict/')) {
    return send(ok([]))
  }
  // 官方前端 UI 探测端点：显式空实现（非演示必需数据；列入 /_endpoints 如实声明）
  if (path === '/jeecg-boot/sys/annountCement/getUnreadMessageCount') return send(ok(0))
  if (path === '/jeecg-boot/sys/user/verifyIzDefaultPwd') return send(ok(false))
  if (path === '/jeecg-boot/sys/loginfo') return send(ok(pageOf([], q.page, q.pageSize)))
  if (path === '/jeecg-boot/sys/visitInfo') return send(ok(pageOf([], q.page, q.pageSize)))
  if (path === '/health') {
    return send(ok({ service: 'jeecg-fed-demo-data', port: PORT, orders: fedOrders.length, accounts: accounts.length }))
  }
  if (path === '/_endpoints') return send(ok(implementedEndpoints))
  if (path === '/_unmatched') return send(ok(unmatched.slice(-50)))

  // 未实现端点：明确 404 诊断 + 记录（不用 HTTP 200 空成功掩盖——关键数据缺失必须可见，
  // 验收脚本以 /_unmatched 核对"验收动作用到的请求全部命中已实现端点"）
  const record = `${req.method} ${path}`
  if (!unmatched.includes(record)) unmatched.push(record)
  if (unmatched.length > 200) unmatched.splice(0, unmatched.length - 200)
  console.log('[unmatched]', record)
  res.writeHead(404, { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': origin || '*', 'access-control-allow-headers': '*' })
  return res.end(JSON.stringify(err(`本地演示数据服务未实现该端点：${req.method} ${path}。已实现清单见 /_endpoints；如该端点是演示必需，请在 data-service/server.mjs 补充实现。`, 404)))
})

server.listen(PORT, () => console.log(`[demo-data] Jeecg 联邦演示数据服务: http://localhost:${PORT}/ (仅本地演示)`))
