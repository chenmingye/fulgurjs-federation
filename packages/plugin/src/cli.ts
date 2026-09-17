#!/usr/bin/env node
/**
 * fulgur CLI（主包内置 bin，决策见排期文档 §4：doctor/init 都在主包，不建独立包）。
 *
 * 子命令：
 * - fulgur doctor --base <URL> --apps a,b,c [--dev] [--json]  部署/配置层体检（W2）
 * - fulgur init                                               迁移生成器（W1，规划中）
 */
import { runDoctor, formatDoctorReport } from './doctor'

const HELP = `fulgur — Vite Module Federation CLI (@fulgur/federation)

用法：
  fulgur doctor --base <URL> --apps <a,b,c> [--dev] [--json] [--chunk-sample N]
  fulgur --help

doctor 示例：
  fulgur doctor --base http://localhost:8662 --apps main,flowable,lowcode
  fulgur doctor --base http://localhost:8662 --apps main,flowable,lowcode --dev
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

  if (cmd === 'doctor') {
    const base = argOf('--base')
    const appsRaw = argOf('--apps') ?? 'main'
    if (!base) {
      console.error('[fulgur:doctor] 缺少 --base <URL>（站点根地址，如 http://localhost:8662）')
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

  if (cmd === 'init') {
    const configPath = argOf('--config') ?? 'fulgur.config.ts'
    const { runInit } = await import('./init')
    const { report, errors } = await runInit(configPath, { force: has('--force') })
    for (const r of report) console.log(`[fulgur:init] ${r.action.toUpperCase().padEnd(8)} ${r.file}${r.note ? ` — ${r.note}` : ''}`)
    if (errors.length) {
      console.error(`\n${errors.join('\n\n')}`)
      console.error(`\n[fulgur:init] ${errors.length} 个补丁未能落地（见上）——已落地的改动保留，修完后重跑本命令幂等续接`)
      return 1
    }
    console.log(`\n[fulgur:init] 完成：${report.filter((r) => r.action !== 'skip').length} 个文件动作。后续步骤：\n  1. cd 各应用 && pnpm install（挂 @fulgur/federation link）\n  2. pnpm start 起 dev 三服务（冷启动首轮 30~60s 预构建窗口属暂态，DEV-010）\n  3. 部署后 fulgur doctor --base <URL> --apps <a,b,c> 体检`)
    return 0
  }

  console.error(`未知命令：${cmd}\n${HELP}`)
  return 2
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error('[fulgur:doctor] 执行失败：', e)
    process.exit(2)
  },
)
