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
  if (scenario.production) {
    const prod = scenario.production
    const prefixes = new Set()
    if (!Number.isInteger(prod.port) || prod.port < 1 || prod.port > 65535) errors.push(`${scenario.id}: 无效生产端口`)
    if (!Array.isArray(prod.mounts) || !prod.mounts.length) errors.push(`${scenario.id}: 缺少生产挂载表`)
    for (const mount of Array.isArray(prod.mounts) ? prod.mounts : []) {
      if (!mount || typeof mount !== 'object') { errors.push(`${scenario.id}: 无效生产挂载项`); continue }
      if (!scenario.apps.some(app => app.name === mount.app && app.role !== 'service')) errors.push(`${scenario.id}: 生产挂载引用未知应用 ${mount.app}`)
      if (typeof mount.prefix !== 'string' || !mount.prefix.startsWith('/') || !mount.prefix.endsWith('/') || /[?#]|\.\./.test(mount.prefix)) errors.push(`${scenario.id}: 无效生产前缀 ${mount.prefix}`)
      if (prefixes.has(mount.prefix)) errors.push(`${scenario.id}: 重复生产前缀 ${mount.prefix}`)
      prefixes.add(mount.prefix)
    }
    if (!prefixes.has(prod.entry)) errors.push(`${scenario.id}: 生产入口未登记在挂载表`)
  }
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

// ── 模板统一启动器门禁：副本与规范源逐字节一致；dev.config.json 与 scenarios.json、
//    子应用 package.json 的端口三方一致（漂移会在本轮失败，不等到首次接入才发现） ──
const templateErrors = []
const devRunnerSource = path.join(root, 'examples/scripts/dev-runner.mjs')
const scenarioPortByDir = new Map()
for (const scenario of loadScenarios()) {
  for (const app of scenario.apps) scenarioPortByDir.set(path.join(root, app.dir), app.port)
}
if (!fs.existsSync(devRunnerSource)) templateErrors.push('缺少规范源 examples/scripts/dev-runner.mjs')
for (const template of ['vue-vue', 'react-react', 'vue-host-react-remote', 'react-host-vue-remote', 'showcase']) {
  const templateDir = path.join(root, 'examples/templates', template)
  const runnerCopy = path.join(templateDir, 'scripts/dev.mjs')
  const productionSource = path.join(root, 'examples/scripts/prod-runner.mjs')
  const productionCopy = path.join(templateDir, 'scripts/prod.mjs')
  if (!fs.existsSync(productionCopy) || !fs.existsSync(productionSource) || fs.readFileSync(productionCopy, 'utf8') !== fs.readFileSync(productionSource, 'utf8')) {
    templateErrors.push(`${template}: scripts/prod.mjs 未从规范源同步`)
  }
  if (fs.existsSync(devRunnerSource)) {
    if (!fs.existsSync(runnerCopy)) {
      templateErrors.push(`${template}: 缺少 scripts/dev.mjs（执行 node examples/scripts/sync-template-scripts.mjs 同步）`)
    } else if (fs.readFileSync(runnerCopy, 'utf8') !== fs.readFileSync(devRunnerSource, 'utf8')) {
      templateErrors.push(`${template}: scripts/dev.mjs 与规范源不一致——重新执行 node examples/scripts/sync-template-scripts.mjs`)
    }
  }
  const cfgFile = path.join(templateDir, 'scripts/dev.config.json')
  if (!fs.existsSync(cfgFile)) {
    templateErrors.push(`${template}: 缺少 scripts/dev.config.json`)
    continue
  }
  let config
  try {
    config = JSON.parse(fs.readFileSync(cfgFile, 'utf8'))
  } catch (e) {
    templateErrors.push(`${template}: scripts/dev.config.json 不是合法 JSON（${e.message}）`)
    continue
  }
  const ports = new Set()
  for (const app of config.apps ?? []) {
    if (ports.has(app.port)) templateErrors.push(`${template}: dev.config.json 端口重复 ${app.port}`)
    ports.add(app.port)
    const appDir = path.join(templateDir, app.dir)
    // 接入代码的实际落点也受门禁约束，避免 README 推荐集中管理，模板却继续散放。
    const src = path.join(appDir, 'src')
    for (const scattered of ['application.ts', 'application.tsx', 'host-session.ts', 'bridge-mode.ts', 'bridge-session.ts', 'exposes']) {
      if (fs.existsSync(path.join(src, scattered))) templateErrors.push(`${template}/${app.dir}: 接入文件 ${scattered} 应归入 src/fulgurjs/host 或 exposes`)
    }
    const integration = path.join(src, 'fulgurjs')
    if (fs.existsSync(integration)) {
      for (const entry of fs.readdirSync(integration, { withFileTypes: true })) {
        if (!(entry.isDirectory() ? ['host', 'exposes', 'types'].includes(entry.name) : entry.name === 'setup.ts')) {
          templateErrors.push(`${template}/${app.dir}: src/fulgurjs/${entry.name} 未按 host/exposes/types 与 setup.ts 归类`)
        }
      }
    }
    if (!fs.existsSync(path.join(appDir, 'package.json'))) templateErrors.push(`${template}: dev.config.json 指向的 ${app.dir} 缺少 package.json`)
    const scenarioPort = scenarioPortByDir.get(appDir)
    if (scenarioPort !== undefined && scenarioPort !== app.port) {
      templateErrors.push(`${template}: ${app.dir} 端口 ${app.port} 与 scenarios.json 的 ${scenarioPort} 不一致`)
    }
    const appPkg = JSON.parse(fs.readFileSync(path.join(appDir, 'package.json'), 'utf8'))
    if (appPkg.scripts?.dev && !appPkg.scripts.dev.includes(`--port ${app.port} `)) {
      templateErrors.push(`${template}: ${app.dir} 的 dev 脚本端口与 dev.config.json 的 ${app.port} 不一致（脚本：${appPkg.scripts.dev}）`)
    }
  }
  const rootPkg = JSON.parse(fs.readFileSync(path.join(templateDir, 'package.json'), 'utf8'))
  if (rootPkg.scripts?.dev !== 'node scripts/dev.mjs') {
    templateErrors.push(`${template}: 根 dev 脚本应为 node scripts/dev.mjs，实际「${rootPkg.scripts?.dev}」`)
  }
}
if (templateErrors.length) { console.error(templateErrors.join('\n')); process.exitCode = 1 }
