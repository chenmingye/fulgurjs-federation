// 造 AMIS 联邦验证数据（全链路）：AMIS 配置(已有) → 复制 demo_leave 模型改 formType=30 → 改 bpmn process key/name → 部署
// 前置：/amis/amisPageConfig/add 已有一条 title 含"AMIS联邦验证"的配置（见 docs/遗留任务交接清单.md）
import { chromium } from '@playwright/test'
const BASE = 'http://localhost:8662'
const SRC_MODEL = '5c0fd82d-4849-11f0-8041-f8e43be98cda' // demo_leave 请个假审批流程（已部署、最简单）
const browser = await chromium.launchPersistentContext(`/tmp/fulgur-seed3-${Date.now()}`, { headless: true, args: ['--no-proxy-server'] })
const page = browser.pages()[0]
await page.goto(`${BASE}/main/`, { waitUntil: 'domcontentloaded', timeout: 30000 })
await page.waitForTimeout(4000)
await page.locator('input[placeholder*="账号"], input[placeholder*="用户名"]').first().fill('admin')
await page.locator('input[type="password"]').first().fill('Demo@123456')
await page.locator('button:has-text("登 录"), button:has-text("登录")').first().click()
await page.waitForTimeout(8000)
const out = await page.evaluate(async (srcId) => {
  const key = Object.keys(localStorage).find((k) => k.includes('COMMON__LOCAL__KEY__'))
  const obj = JSON.parse(localStorage.getItem(key))
  let real = null
  const find = (o) => { for (const [k, v] of Object.entries(o ?? {})) { if (k === 'value' && typeof v === 'string' && v.startsWith('ey')) real = v; if (v && typeof v === 'object') find(v) } }
  find(obj.value?.TOKEN__ ?? obj)
  const h = { 'X-Access-Token': real, 'Content-Type': 'application/json' }
  const get = async (u) => (await fetch(u, { headers: h })).json()
  const req = async (u, method, body) => { const r = await fetch(u, { headers: h, method, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: await r.json() } }
  const out = {}
  // 已有 AMIS 配置：取 title 匹配的一条
  const list = await get('/demo/amis/amisPageConfig/list?pageNo=1&pageSize=50')
  const amisRec = (list?.result?.records ?? []).find((r) => (r.title ?? '').includes('AMIS联邦验证'))
  out.amisId = amisRec?.id
  if (!out.amisId) return out
  const m = (await get('/demo/bpm/model/get?id=' + srcId))?.data
  const keyU = 'amis_fed_' + Date.now()
  const create = await req('/demo/bpm/model/create', 'POST', {
    name: 'AMIS联邦验证2-勿删', key: keyU, category: m.category, description: '联邦验证',
    formType: 30, formId: out.amisId, type: m.type, managerUserIds: [101],
    startUserIds: [], startDeptIds: [], visible: true, allowCancelRunningProcess: true,
    formCustomCreatePath: '', formCustomViewPath: ''
  })
  out.create = { code: create.body?.code, msg: create.body?.message, data: create.body?.data }
  if (create.body?.code !== 0) return out
  const modelId = create.body?.data
  // bpmn 的 process key/name 必须与模型一致，否则 deploy 校验失败
  const bpmn = await req('/demo/bpm/model/update-bpmn', 'PUT', { id: modelId, bpmnXml: String(m.bpmnXml).replace(/<(?:bpmn2:)?process id="[^"]*" name="[^"]*"/, '<bpmn2:process id="' + keyU + '" name="AMIS联邦验证2-勿删"') })
  out.bpmn = { code: bpmn.body?.code, msg: bpmn.body?.message }
  const dep = await req('/demo/bpm/model/deploy?id=' + modelId, 'POST')
  out.deploy = { code: dep.body?.code, msg: dep.body?.message, data: dep.body?.data }
  out.modelKey = keyU
  return out
}, SRC_MODEL)
console.log(JSON.stringify(out, null, 1))
await browser.close()
