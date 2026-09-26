#!/usr/bin/env node
/**
 * fulgurjs CLI（主包内置 bin）。
 *
 * 子命令（单项目 fulgurjs.config.ts 唯一形态；命令默认读 ./fulgurjs.config.ts）：
 * - fulgurjs init [--template <path>] [--config <path>] [--force]  单项目起步模板 / 配置校验 + 接入块输出
 * - fulgurjs explain [--config <path>] [--json]                    配置解释器（角色/remotes/exposes/setup/shared/页面映射/加载链）
 * - fulgurjs check-pages [--config <path>] [--site <URL>] [--manifest <r>=<p|URL>]... [--require-verified] [--json]
 * - fulgurjs doctor --base <URL> --apps a,b,c [--dev] [--json]     部署/配置层体检
 *
 * 插件保持项目无关：init 不改写任何项目文件，只输出模板与可粘贴接入块；
 * 项目各自的集成细节由各项目按通用核对清单自行落地。
 */
import { resolve } from 'node:path'
import { runDoctor, formatDoctorReport } from './doctor'

const HELP = `fulgurjs — Vite Module Federation CLI (@fulgurjs/federation)

用法（单项目 fulgurjs.config.ts 在应用根目录；命令默认读 ./fulgurjs.config.ts）：
  fulgurjs init [--template <path>] [--force]      生成单项目 fulgurjs.config.ts 起步模板
                                                   （默认导出直接是 federation() 选项）
  fulgurjs init --config <path>                    校验配置；输出 federation(fulgurjsConfig) 接入块
                                                 与接入核对清单
  fulgurjs explain [--config <path>] [--json]      解释本应用有效联邦形态与加载链（纯本地，无网络）
  fulgurjs check-pages [--config <path>] [--site <URL>]
                        [--manifest <remote>=<路径|URL>]... [--require-verified] [--json]
                                                 核对宿主页面表与远程 exposes（宿主项目运行；
                                                 manifest 来源优先级 --manifest > --site/prod 推导，
                                                 显式指定来源失败不回退；确定性错误非零退出；
                                                 --require-verified 时无法验证也非零）
  fulgurjs doctor --base <URL> --apps <a,b,c> [--dev] [--json] [--chunk-sample N]
  fulgurjs --help

示例（应用根目录内运行）：
  fulgurjs init                                    # 当前目录写 fulgurjs.config.ts（已存在则拒绝，--force 覆盖）
  fulgurjs explain                                 # 解释本应用（--config 指向其他路径时显式传）
  fulgurjs check-pages --site http://your-site     # 按 remotes prod 地址推导远程 manifest 核对
  fulgurjs check-pages --manifest remote-a=https://cdn.example.com/remote-a/fulgurjs-manifest.json
  fulgurjs doctor --base http://your-site --apps my-app,remote-a
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
  /** 可重复键值对：--manifest remote-a=/path 或 URL */
  const kvAllOf = (k: string): Record<string, string> => {
    const out: Record<string, string> = {}
    argv.forEach((a, i) => {
      if (a !== k) return
      const v = argv[i + 1]
      const eq = v?.indexOf('=')
      if (!v || eq === undefined || eq < 1) return
      out[v.slice(0, eq)] = v.slice(eq + 1)
    })
    return out
  }

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
    console.log(`[fulgurjs:init] 已生成单项目起步模板 ${target}
后续步骤：
  1. 编辑 fulgurjs.config.ts：填入容器名/exposes/remotes/shared（默认导出直接是 federation() 选项）
  2. vite.config.ts 接入（仅两行联邦相关代码）：
       import federation from '@fulgurjs/federation'
       import fulgurjsConfig from './fulgurjs.config'
       // plugins: [ ...原有插件, federation(fulgurjsConfig) ]
  3. npx fulgurjs explain   # 核对有效形态与加载链
  4. 宿主应用另在 fulgurjs.config.ts 具名导出 hostPages（与运行时页面数据模块同源），
     运行 npx fulgurjs check-pages --site <站点> 核对页面契约
  5. 部署后：npx fulgurjs doctor --base <URL> --apps <容器名>`)
    return 0
  }

  if (cmd === 'explain' || cmd === 'check-pages') {
    // --app 是 4.1.0 聚合配置的应用选择器，随聚合链在 5.0.0 删除——显式拒绝而非忽略
    if (has('--app')) {
      console.error(
        `[fulgurjs] 不再支持 --app 参数\n` +
          `根因：--app 是 4.1.0 聚合配置（root + apps[]）的应用选择器，聚合链（@fulgurjs/federation/config、defineRepoConfig、loadRepoConfig、federationOptionsForApp）已在 5.0.0 删除\n` +
          `修法：每个应用根目录一份 fulgurjs.config.ts，在应用目录内直接运行 fulgurjs ${cmd}（去掉 --app）`,
      )
      return 2
    }
    try {
      if (cmd === 'explain') {
        const { explainApp, formatExplain } = await import('./commands')
        const r = await explainApp(resolve(argOf('--config') ?? 'fulgurjs.config.ts'))
        console.log(has('--json') ? JSON.stringify(r, null, 2) : formatExplain(r))
        return 0
      }
      const { checkPages, formatCheckPages } = await import('./commands')
      const opts = {
        ...(argOf('--site') ? { site: argOf('--site') } : {}),
        ...(Object.keys(kvAllOf('--manifest')).length ? { manifests: kvAllOf('--manifest') } : {}),
        ...(has('--require-verified') ? { requireVerified: true } : {}),
      }
      const r = await checkPages(resolve(argOf('--config') ?? 'fulgurjs.config.ts'), opts)
      console.log(has('--json') ? JSON.stringify(r, null, 2) : formatCheckPages(r))
      return r.failed || r.unverifiedFailed ? 1 : 0
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
