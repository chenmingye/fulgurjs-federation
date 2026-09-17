// 全量回归链：双环境全部套件顺序执行（重建后终验）
// W8-②：失败自动归因——失败套件直接给出「覆盖面/看哪个 JSON/看哪张截图/先跑什么命令」
// W8-③：运行汇总联动归档到 docs/func-results/（latest + 按时间戳留档）
import { execSync } from 'node:child_process'
import fs from 'node:fs'

const REPO = '/Users/Admin/Desktop/ai 杂物/插件/fulgur-federation'
const SHOT = `${REPO}/docs/screenshots/migration1-dev`

const steps = [
  ['matrix-dev', 'VTAG=dev VBASE=http://localhost:8773 node matrix-shot.mjs'],
  ['matrix-prod', 'VTAG=prod VBASE=http://localhost:8662 node matrix-shot.mjs'],
  ['collect-dev', 'node collect-errors.mjs --base http://localhost:8773 --env dev'],
  ['collect-prod', 'node collect-errors.mjs --base http://localhost:8662 --env prod'],
  ['flow-dev', 'node flow-closure.mjs --base http://localhost:8773 --env dev'],
  ['flow-prod', 'node flow-closure.mjs --base http://localhost:8662 --env prod'],
  ['amis-dev', 'node amis-dev-verify.mjs'],
  ['amis-prod', 'VTAG=prod VBASE=http://localhost:8662 node amis-dev-verify.mjs'],
  ['demo-prod', `VBASE=http://localhost:8662 VOUT="${REPO}/docs/screenshots/tb-prod-demo-page.png" node tb-demo-shot.mjs`],
  ['todo-rows-dev', 'TAG=dev node todo-rows.mjs'],
  ['todo-rows-prod', 'TAG=prod BASE=http://localhost:8662 node todo-rows.mjs'],
]

// W8-②：失败归因表——套件 → 覆盖面 + 证据位置 + 第一步排查动作
const TRIAGE = {
  'matrix-dev': { area: '27 页路由级渲染矩阵（dev 8773）', evidence: `${SHOT}/matrix-dev.json 的 fails 数组 + m-dev-*.png`, first: 'fails 页先手动打开核对；dev 首轮 504/ce 属冷启动预构建窗口（DEV-010），预热后重跑' },
  'matrix-prod': { area: '27 页路由级渲染矩阵（prod 8662）', evidence: `${SHOT}/matrix-prod.json 的 fails 数组 + m-prod-*.png`, first: '先跑 fulgur doctor --base http://localhost:8662 --apps main,flowable,lowcode 排部署面（chunk 404/缓存头）' },
  'collect-dev': { area: '27 页控制台报错收集（dev）', evidence: `docs/func-results/dev-console-errors.json + 截图`, first: '按页定位报错；dev 504/ce 先预热重跑（DEV-010）' },
  'collect-prod': { area: '27 页控制台报错收集（prod）', evidence: `docs/func-results/prod-console-errors.json + 截图`, first: '已知噪音白名单核对；25 页 EP tooltip（U-6）1 条为已知' },
  'flow-dev': { area: '流程闭环（发起→审批→完成，dev）', evidence: 'flow-closure stdout 各步断言', first: '查 AMIS/demo_leave 流程定义是否还在；需要时重跑 amis-seed3.mjs + amis-start.mjs' },
  'flow-prod': { area: '流程闭环（发起→审批→完成，prod）', evidence: 'flow-closure stdout 各步断言', first: '同 flow-dev；prod 侧先 doctor 排部署面' },
  'amis-dev': { area: 'AMIS 详情页联邦直渲染（iframe=0 + 表单字段）', evidence: `${SHOT}/t5-dev-01/02-amis-*.png`, first: 'AMIS 待办实例被消费光时先重跑 amis-seed3.mjs + amis-start.mjs <modelKey>' },
  'amis-prod': { area: 'AMIS 详情页联邦直渲染（prod）', evidence: `${SHOT}/t5-prod-01/02-amis-*.png`, first: '同 amis-dev；检查 06 详情 iframe 是否回归（>0 即直渲染失效）' },
  'demo-prod': { area: 'fulgur-demo 双远程组件+交互（免登录）', evidence: 'docs/screenshots/tb-prod-demo-page.png', first: '核对 FULGUR_DEMO_ROUTE 与双 remote 页面加载' },
  'todo-rows-dev': { area: '待办 10 行数据渲染（dev）', evidence: 'todo-rows stdout', first: '待办数据可能被其他套件消费，重跑 amis-start.mjs 造数' },
  'todo-rows-prod': { area: '待办 10 行数据渲染（prod）', evidence: 'todo-rows stdout', first: '同 todo-rows-dev' },
}

const env = { ...process.env, NO_PROXY: 'localhost,127.0.0.1', no_proxy: 'localhost,127.0.0.1', HTTP_PROXY: '', HTTPS_PROXY: '', http_proxy: '', https_proxy: '' }
const results = {}
const startedAt = new Date().toISOString()
for (const [name, cmd] of steps) {
  try {
    const out = execSync(cmd, { env, cwd: process.cwd(), encoding: 'utf8', timeout: 600000, stdio: ['ignore', 'pipe', 'pipe'] })
    results[name] = { ok: true, tail: out.split('\n').filter(Boolean).slice(-3).join(' | ').slice(0, 300) }
    console.log(`[OK] ${name}`)
  } catch (e) {
    results[name] = { ok: false, tail: String(e.output || '').split('\n').filter(Boolean).slice(-5).join(' | ').slice(0, 500) }
    console.log(`[FAIL] ${name}: ${results[name].tail}`)
  }
}
console.log('\n=== 汇总 ===')
for (const [k, v] of Object.entries(results)) console.log(k, v.ok ? 'OK' : 'FAIL', v.tail ? `| ${v.tail.slice(0, 120)}` : '')

// W8-②：失败自动归因输出
const failedSteps = Object.entries(results).filter(([, v]) => !v.ok)
if (failedSteps.length) {
  console.log('\n=== 失败归因（W8） ===')
  for (const [name] of failedSteps) {
    const t = TRIAGE[name] ?? { area: name, evidence: '（无映射）', first: '查看该套件 stdout' }
    console.log(`\n[${name}] 覆盖面：${t.area}\n  证据：${t.evidence}\n  第一步：${t.first}`)
  }
}

// W8-③：汇总归档（latest 覆盖 + 时间戳留档）
const finishedAt = new Date().toISOString()
const archive = {
  startedAt,
  finishedAt,
  durationMin: Math.round((Date.now() - new Date(startedAt).getTime()) / 60000),
  results,
  allOk: failedSteps.length === 0,
}
try {
  fs.mkdirSync(`${REPO}/docs/func-results`, { recursive: true })
  const stamp = startedAt.replace(/[-:T]/g, '').slice(0, 12)
  fs.writeFileSync(`${REPO}/docs/func-results/full-verify-${stamp}.json`, JSON.stringify(archive, null, 2))
  fs.writeFileSync(`${REPO}/docs/func-results/full-verify-latest.json`, JSON.stringify(archive, null, 2))
  console.log(`\n[full-verify] 已归档 docs/func-results/full-verify-${stamp}.json（+ latest）`)
} catch (e) {
  console.warn('[full-verify] 归档失败：', e?.message)
}
if (failedSteps.length) process.exit(1)
