#!/usr/bin/env node
/**
 * fulgurjs CLI（主包内置 bin）。
 *
 * 子命令：
 * - fulgurjs init [--template <path>] [--config <path>] [--force]  起步模板 / 配置校验 + 样板输出
 * - fulgurjs explain --config <path> --app <name> [--json]         配置解释器（角色/remotes/exposes/setup/shared/页面映射/加载链）
 * - fulgurjs check-pages --config <path> --app <name> [--site <URL>] [--json]  页面表 ↔ 远程 exposes 契约核对
 * - fulgurjs doctor --base <URL> --apps a,b,c [--dev] [--json]     部署/配置层体检
 *
 * 插件保持项目无关：init 不改写任何项目文件，只输出模板与可粘贴样板；
 * 项目各自的集成细节由各项目按通用核对清单自行落地。
 */
import { resolve } from 'node:path'
import { runDoctor, formatDoctorReport } from './doctor'

const HELP = `fulgurjs — Vite Module Federation CLI (@fulgurjs/federation)

用法：
  fulgurjs init [--template <path>] [--force]      生成带注释的 fulgurjs.config.ts 起步模板
  fulgurjs init --config <path>                    校验配置；输出各应用 federation() 粘贴块、
                                                 NGINX no-cache 站点模板与接入核对清单
  fulgurjs explain --config <path> --app <name> [--json]
                                                 解释某应用的有效联邦形态与加载链（纯本地，无网络）
  fulgurjs check-pages --config <path> --app <name> [--site <URL>] [--json]
                                                 核对宿主页面表与远程 exposes（本地 dist 优先；确定性错误非零退出）
  fulgurjs doctor --base <URL> --apps <a,b,c> [--dev] [--json] [--chunk-sample N]
  fulgurjs --help

示例：
  fulgurjs init                                    # 当前目录写 fulgurjs.config.ts（已存在则拒绝，--force 覆盖）
  fulgurjs init --config fulgurjs.config.ts          # 校验 + 输出样板
  fulgurjs explain --config fulgurjs.config.ts --app apps/remote-a
  fulgurjs check-pages --config fulgurjs.config.ts --app apps/host --site http://your-site
  fulgurjs doctor --base http://your-site --apps app-a,app-b
  fulgurjs doctor --base http://localhost:5173 --apps app-a --dev
`

async function main(): Promise<number> {
  const argv = process.argv.slice(2)
  const cmd = argv[0]

  if (!cmd || cmd === '--help' || cmd === '-h' || cmd === 'help') {
    console.log(HELP)
    return 0
  }

  const argOf = (k: string): string | undefined => {
    const i = argv.indexOf(k)
    return i > -1 ? argv[i + 1] : undefined
  }
  const has = (k: string): boolean => argv.includes(k)

  if (cmd === 'init') {
    const { writeConfigTemplate, inspectConfig } = await import('./init')
    const configPath = argOf('--config')
    if (configPath) {
      try {
        console.log(await inspectConfig(resolve(configPath)))
        return 0
      } catch (e) {
        console.error(String((e as Error).message ?? e))
        return 2
      }
    }
    const target = resolve(argOf('--template') ?? 'fulgurjs.config.ts')
    const result = await writeConfigTemplate(target, has('--force'))
    if (result === 'exists') {
      console.error(`[fulgurjs:init] ${target} 已存在，拒绝覆盖（--force 强制覆盖）`)
      return 2
    }
    console.log(`[fulgurjs:init] 已生成起步模板 ${target}
后续步骤：
  1. 编辑 fulgurjs.config.ts：填入你的应用目录/容器名/端口/base/页面路由表/exposes
  2. npx fulgurjs init --config fulgurjs.config.ts   # 校验并输出可粘贴样板与核对清单
  3. 按清单把 federation(federationOptionsForApp(...)) 接入各应用 vite.config.ts（单配置驱动，见 README），安装依赖
  4. npx fulgurjs explain --config fulgurjs.config.ts --app <应用>   # 核对有效形态与加载链
  5. 部署后：npx fulgurjs doctor --base <URL> --apps <应用...>`)
    return 0
  }

  if (cmd === 'explain' || cmd === 'check-pages') {
    const configPath = argOf('--config')
    const app = argOf('--app')
    if (!configPath || !app) {
      console.error(`[fulgurjs:${cmd}] 缺少参数：--config <fulgurjs.config.ts 路径> 与 --app <应用目录名或容器名>`)
      return 2
    }
    try {
      if (cmd === 'explain') {
        const { explainApp, formatExplain } = await import('./commands')
        const r = await explainApp(resolve(configPath), app)
        console.log(has('--json') ? JSON.stringify(r, null, 2) : formatExplain(r))
        return 0
      }
      const { checkPages, formatCheckPages } = await import('./commands')
      const site = argOf('--site')
      const r = await checkPages(resolve(configPath), app, site ? { site } : {})
      console.log(has('--json') ? JSON.stringify(r, null, 2) : formatCheckPages(r))
      return r.failed ? 1 : 0
    } catch (e) {
      console.error(String((e as Error).message ?? e))
      return 2
    }
  }

  if (cmd === 'doctor') {
    const base = argOf('--base')
    const appsRaw = argOf('--apps') ?? 'main'
    if (!base) {
      console.error('[fulgurjs:doctor] 缺少 --base <URL>（站点根地址，如 http://your-site）')
      return 2
    }
    const apps = appsRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    const { checks, failed } = await runDoctor({
      base,
      apps,
      dev: has('--dev'),
      chunkSample: argOf('--chunk-sample') ? Number(argOf('--chunk-sample')) : undefined,
    })
    if (has('--json')) {
      console.log(JSON.stringify({ base, apps, dev: has('--dev'), checks, failed }, null, 2))
    } else {
      console.log(formatDoctorReport(checks))
    }
    return failed ? 1 : 0
  }

  console.error(`未知命令：${cmd}\n${HELP}`)
  return 2
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error('[fulgurjs] 执行失败：', e)
    process.exit(2)
  },
)
