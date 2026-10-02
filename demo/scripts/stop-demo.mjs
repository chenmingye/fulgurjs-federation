#!/usr/bin/env node
/** 仅停止本任务启动的进程：node demo/scripts/stop-demo.mjs [--scenario id]... | --all（默认 --all） */
import { stopApps, loadScenarios } from './lib.mjs'

const argv = process.argv.slice(2)
let names = null // null = 全部
if (!argv.includes('--all')) {
  const ids = argv.flatMap((a, i) => (a === '--scenario' ? [argv[i + 1]] : []))
  if (ids.length) {
    const scs = loadScenarios().filter((s) => ids.includes(s.id))
    names = scs.flatMap((s) => s.apps.map((a) => a.name))
  }
}
const n = await stopApps(names)
console.log(n ? `已停止 ${n} 个本任务进程（按 demo/.run/demo-pids.json 登记）` : '没有本任务登记的运行中进程')
