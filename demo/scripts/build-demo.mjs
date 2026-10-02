#!/usr/bin/env node
/** 一键构建：node demo/scripts/build-demo.mjs [--scenario id]... | --all */
import { spawn } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const scenarios = JSON.parse(fs.readFileSync(path.join(ROOT, 'scenarios.json'), 'utf8')).scenarios
const argv = process.argv.slice(2)
const ids = argv.includes('--all')
  ? scenarios.filter((s) => s.apps.length > 0).map((s) => s.id)
  : argv.flatMap((a, i) => (a === '--scenario' ? [argv[i + 1]] : []))
if (!ids.length) { console.log('用法：build-demo.mjs --scenario <id>... | --all'); process.exit(1) }

const run = (cwd, cmd) => new Promise((resolve) => {
  const p = spawn(cmd, { cwd, shell: true, stdio: 'inherit' })
  p.on('close', (code) => resolve(code))
})

let failed = 0
for (const id of ids) {
  const sc = scenarios.find((s) => s.id === id)
  if (!sc?.apps?.length) continue
  for (const app of sc.apps) {
    const cwd = path.resolve(ROOT, '..', app.dir)
    if (app.role === 'service') continue // 数据服务无构建
    if (!fs.existsSync(path.join(cwd, 'package.json'))) { console.log(`✗ ${app.name}: 缺 ${cwd}`); failed++; continue }
    console.log(`\n═══ build ${app.name} (${app.dir}) ═══`)
    const code = await run(cwd, 'npm run build')
    if (code !== 0) { console.log(`✗ ${app.name} 构建失败（退出码 ${code}）`); failed++ }
  }
}
process.exit(failed ? 1 : 0)
