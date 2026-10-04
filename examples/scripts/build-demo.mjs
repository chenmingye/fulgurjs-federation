#!/usr/bin/env node
/** 一键构建：node examples/scripts/build-demo.mjs [--scenario id]... | --all */
import { appLocation, loadScenarios, ensureInstalled, runCommand } from './lib.mjs'

const scenarios = loadScenarios()
const argv = process.argv.slice(2)
const ids = argv.includes('--all')
  ? scenarios.filter((s) => s.apps.length > 0).map((s) => s.id)
  : argv.flatMap((a, i) => (a === '--scenario' ? [argv[i + 1]] : []))
if (!ids.length) { console.log('用法：build-demo.mjs --scenario <id>... | --all'); process.exit(1) }

let failed = 0
for (const id of ids) {
  const sc = scenarios.find((s) => s.id === id)
  if (!sc) { console.error(`✗ 未知场景：${id}`); failed++; continue }
  if (!sc.apps.length) continue
  for (const app of sc.apps) {
    if (app.role === 'service') continue // 数据服务无构建
    const { cwd, packageManager } = appLocation(app)
    console.log(`\n═══ build ${app.name} (${app.dir}) ═══`)
    try {
      await ensureInstalled(app)
      await runCommand(packageManager, ['run', 'build'], cwd)
    } catch (error) { console.log(`✗ ${app.name}: ${error.message}`); failed++ }
  }
}
process.exit(failed ? 1 : 0)
