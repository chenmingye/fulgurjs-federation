#!/usr/bin/env node
/** 环境核查：node 版本、包管理器、registry latest、场景工程就绪度、端口冲突。 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
import { loadScenarios, isPortUp, appLocation } from './lib.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const lines = []
const log = (s) => { lines.push(s); console.log(s) }

log(`node: ${process.version}（建议使用 Node 24）`)
for (const tool of ['npm', 'pnpm']) {
  try { log(`${tool}: ${execSync(`${tool} -v`).toString().trim()}`) } catch { log(`${tool}: 未安装`) }
}
let registry = 'unknown'
try { registry = JSON.parse(execSync('npm view @fulgurjs/federation version --json').toString().trim()) } catch {}
log(`registry latest: @fulgurjs/federation@${registry}`)

const scenarios = loadScenarios()
for (const sc of scenarios) {
  for (const app of sc.apps) {
    const { cwd, packageManager } = appLocation(app)
    const exists = fs.existsSync(path.join(cwd, app.role === 'service' ? 'server.mjs' : 'package.json'))
    const installed = fs.existsSync(path.join(cwd, 'node_modules'))
    const busy = await isPortUp(app.port)
    log(`${exists ? '✓' : '✗'} ${app.name.padEnd(20)} ${exists ? '' : '缺应用入口 '}${app.role === 'service' ? '无需安装' : installed ? '已安装' : '未安装'}${busy ? '  [端口占用]' : ''}  (${packageManager}, ${app.dir})`)
  }
}
fs.mkdirSync(path.join(ROOT, '.run'), { recursive: true })
fs.writeFileSync(path.join(ROOT, '.run', 'check-env.txt'), lines.join('\n') + '\n')
