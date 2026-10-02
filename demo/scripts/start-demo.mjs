#!/usr/bin/env node
/** 一键启动 Demo：node demo/scripts/start-demo.mjs [--scenario id]... [--all] */
import { startScenario, loadScenarios } from './lib.mjs'

const argv = process.argv.slice(2)
const ids = argv.includes('--all')
  ? loadScenarios().filter((s) => s.apps.length > 0).map((s) => s.id)
  : argv.flatMap((a, i) => (a === '--scenario' ? [argv[i + 1]] : []))

if (!ids.length) {
  console.log('用法：start-demo.mjs --scenario <id> [--scenario <id>...] | --all')
  console.log('可用：', loadScenarios().map((s) => s.id).join(', '))
  process.exit(1)
}

for (const id of ids) {
  console.log(`\n═══ 启动场景 ${id} ═══`)
  const r = await startScenario(id)
  const failed = r.results.filter((x) => x.error)
  console.log(`场景「${r.scenario}」：${r.results.length - failed.length}/${r.results.length} 就绪`)
  for (const f of failed) console.log(`  ✗ ${f.name}: ${f.error}`)
}
