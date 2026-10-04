#!/usr/bin/env node
/** 核对公开场景目录、模板 workspace 成员及精确版本；不安装依赖或启动服务。 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { appLocation, loadScenarios } from './lib.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const names = new Set()
const ports = new Set()
const errors = []
let applications = 0
for (const scenario of loadScenarios()) {
  if (!fs.existsSync(path.join(root, scenario.source))) errors.push(`${scenario.id}: 来源目录不存在 ${scenario.source}`)
  for (const app of scenario.apps) {
    applications++
    if (names.has(app.name)) errors.push(`重复应用名称：${app.name}`)
    if (ports.has(app.port)) errors.push(`重复端口：${app.port}`)
    names.add(app.name); ports.add(app.port)
    const { cwd, installDir, packageManager } = appLocation(app)
    if (app.role === 'service') {
      if (!fs.existsSync(path.join(cwd, 'server.mjs'))) errors.push(`${app.name}: 缺少服务入口`)
      continue
    }
    const pkgFile = path.join(cwd, 'package.json')
    if (!fs.existsSync(pkgFile)) { errors.push(`${app.name}: 缺少 package.json`); continue }
    const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'))
    for (const script of ['dev', 'build']) if (!pkg.scripts?.[script]) errors.push(`${app.name}: 缺少 ${script} 命令`)
    const version = pkg.dependencies?.['@fulgurjs/federation'] ?? pkg.devDependencies?.['@fulgurjs/federation']
    if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) errors.push(`${app.name}: 插件必须锁定正式精确版本，实际 ${version}`)
    const lock = path.join(installDir, packageManager === 'pnpm' ? 'pnpm-lock.yaml' : 'package-lock.json')
    if (!fs.existsSync(lock)) errors.push(`${app.name}: 缺少 ${packageManager} 锁文件`)
    if (installDir !== cwd) {
      const workspace = fs.readFileSync(path.join(installDir, 'pnpm-workspace.yaml'), 'utf8')
      const member = path.relative(installDir, cwd).split(path.sep).join('/')
      if (!workspace.split('\n').some((line) => line.trim().replace(/^-[ ]*/, '').replace(/["']/g, '') === member)) {
        errors.push(`${app.name}: ${member} 未登记在模板 workspace`)
      }
    }
  }
}
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1 }
else console.log(`场景目录核对通过：${loadScenarios().length} 个栏目，${applications} 个应用，模板与门户共用一份源码。`)
