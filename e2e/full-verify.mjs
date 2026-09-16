// 全量回归链：双环境全部套件顺序执行（重建后终验）
import { execSync } from 'node:child_process'

const steps = [
  ['matrix-dev', 'VTAG=dev VBASE=http://localhost:8773 node matrix-shot.mjs'],
  ['matrix-prod', 'VTAG=prod VBASE=http://localhost:8662 node matrix-shot.mjs'],
  ['collect-dev', 'node collect-errors.mjs --base http://localhost:8773 --env dev'],
  ['collect-prod', 'node collect-errors.mjs --base http://localhost:8662 --env prod'],
  ['flow-dev', 'node flow-closure.mjs --base http://localhost:8773 --env dev'],
  ['flow-prod', 'node flow-closure.mjs --base http://localhost:8662 --env prod'],
  ['amis-dev', 'node amis-dev-verify.mjs'],
  ['amis-prod', 'VTAG=prod VBASE=http://localhost:8662 node amis-dev-verify.mjs'],
  ['demo-prod', 'VBASE=http://localhost:8662 VOUT="/Users/Admin/Desktop/ai 杂物/插件/fulgur-federation/docs/screenshots/tb-prod-demo-page.png" node tb-demo-shot.mjs'],
  ['todo-rows-dev', 'TAG=dev node todo-rows.mjs'],
  ['todo-rows-prod', 'TAG=prod BASE=http://localhost:8662 node todo-rows.mjs'],
]

const env = { ...process.env, NO_PROXY: 'localhost,127.0.0.1', no_proxy: 'localhost,127.0.0.1', HTTP_PROXY: '', HTTPS_PROXY: '', http_proxy: '', https_proxy: '' }
const results = {}
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
