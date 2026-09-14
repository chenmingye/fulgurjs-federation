// 发起 AMIS 流程实例：按 key 查最新流程定义 → create（"来领导审批"节点候选人=admin[101]）
// 用法：node amis-start.mjs <流程key，来自 amis-seed3.mjs 输出的 modelKey>
import { chromium } from '@playwright/test'
const BASE = 'http://localhost:8662'
const KEY = process.argv[2]
const browser = await chromium.launchPersistentContext(`/tmp/unifed-start-${Date.now()}`, { headless: true, args: ['--no-proxy-server'] })
const page = browser.pages()[0]
await page.goto(`${BASE}/main/`, { waitUntil: 'domcontentloaded', timeout: 30000 })
await page.waitForTimeout(4000)
await page.locator('input[placeholder*="账号"], input[placeholder*="用户名"]').first().fill('admin')
await page.locator('input[type="password"]').first().fill('Demo@123456')
await page.locator('button:has-text("登 录"), button:has-text("登录")').first().click()
await page.waitForTimeout(8000)
const out = await page.evaluate(async (keyU) => {
  const key = Object.keys(localStorage).find((k) => k.includes('COMMON__LOCAL__KEY__'))
  const obj = JSON.parse(localStorage.getItem(key))
  let real = null
  const find = (o) => { for (const [k, v] of Object.entries(o ?? {})) { if (k === 'value' && typeof v === 'string' && v.startsWith('ey')) real = v; if (v && typeof v === 'object') find(v) } }
  find(obj.value?.TOKEN__ ?? obj)
  const h = { 'X-Access-Token': real, 'Content-Type': 'application/json' }
  const get = async (u) => (await fetch(u, { headers: h })).json()
  const defs = await get('/demo/bpm/process-definition/list?suspensionState=1&key=' + keyU)
  const allDefs = defs?.data ?? defs?.result ?? []
  const def = (Array.isArray(allDefs) ? allDefs : []).find((d) => d.key === keyU)
  if (!def?.id) return { defsErr: JSON.stringify(defs).slice(0, 200) }
  const start = await fetch('/demo/bpm/process-instance/create', { method: 'POST', headers: h, body: JSON.stringify({ processDefinitionId: def.id, variables: {}, startUserSelectAssignees: { Activity_02rte1s: [101] } }) })
  const sj = await start.json()
  return { defId: def.id, startCode: sj?.code, msg: sj?.message, instanceId: String(sj?.data ?? sj?.result).slice(0, 60) }
}, KEY)
console.log(JSON.stringify(out, null, 1))
await browser.close()
