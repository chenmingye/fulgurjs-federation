#!/usr/bin/env node
/**
 * fulgurjs CLI（主包内置 bin）。
 *
 * 子命令（单项目 fulgurjs.config.ts 唯一形态；命令默认读 ./fulgurjs.config.ts）：
 * - fulgurjs create [模板] [--dir <路径>] ...                        从已安装的 npm 包复制完整模板工程（新项目入口）
 * - fulgurjs init [--out <路径>] [--config <path>] [--force]  单项目起步模板 / 配置校验 + 接入块输出（已有项目用）
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

入口选择（应用代码导入）：Vue 应用 @fulgurjs/federation/vue ｜ React 应用 /react ｜
框架无关模块 /runtime ｜ Vite 配置用包根（federation(options)）。

新项目：从完整模板创建可独立运行的联邦工程（复制后 pnpm install + pnpm dev）：
  fulgurjs create [--list]                         交互选择模板（TTY）
  fulgurjs create <模板> [--dir <路径>] [--no-install] [--force] [--json]
                                                   非交互创建；模板：vue-vue / react-react /
                                                   vue-host-react-remote / react-host-vue-remote / showcase
                                                   --force 复用非空目录：只补缺失文件，同名冲突逐项列出并
                                                   保留你的版本（绝不改写）；--json 时 stdout 仅输出结果
                                                   JSON，进度与安装日志走 stderr
已有项目（单项目 fulgurjs.config.ts 在应用根目录；命令默认读 ./fulgurjs.config.ts）：
  fulgurjs init [--out <路径>] [--framework vue|react] [--role consumer|provider|dual] [--force]
                                                   生成单项目 fulgurjs.config.ts 起步模板（最小有效配置）：
                                                   框架默认从 package.json 依赖判断（判断不了要求显式 --framework）；
                                                   角色缺省 dual；--out 是输出路径（默认 ./fulgurjs.config.ts）；--force 覆盖已存在的模板
  fulgurjs init --config <path>                    校验配置；输出 federation(fulgurjsConfig) 接入块
                                                 与按角色的接入核对清单
  fulgurjs explain [--config <path>] [--json]      解释本应用有效联邦形态与加载链（纯本地，无网络）
  fulgurjs types [--config <path>] [--mode dev|prod] [--check]
                                                 远程类型：提供方验证声明 bundle 生成；宿主同步远程
                                                 声明到本地类型目录（CI 在 typecheck 前运行；失败非零
                                                 退出）。双角色工程先生成（纯本地，不等远程）再同步。
                                                 --check 只核对本地缓存与已记录 revision（不联网，
                                                 不代表远程线上最新已核实）
  fulgurjs check-pages [--config <path>] [--site <URL>]
                        [--manifest <remote>=<路径|URL>]... [--require-verified] [--json]
                                                 核对宿主页面表与远程 exposes（逐页接入的宿主运行；
                                                 未配置 hostPages 时明确提示不适用；
                                                 manifest 来源优先级 --manifest > --site/prod 推导，
                                                 显式指定来源失败不回退；确定性错误非零退出；
                                                 --require-verified 时无法验证也非零）
端口变更（模板工程；默认预览，--write 才写入）：
  fulgurjs port <应用> <新端口> [--write]           一次更新四处：应用 package.json dev/preview、
                                                   宿主 fulgurjs.config.ts 该远程 dev 地址、
                                                   scripts/dev.config.json、README 端口表
部署体检（--apps 必填：站点根下的部署子目录，远程部署在 /remote-a/ 就写 remote-a；
          '.' 表示部署在站点根；条目可写完整 URL 检查多 origin；不做任何默认猜测）：
  fulgurjs doctor --base <URL> --apps <a,b,c> [--entry <文件名>] [--no-entry]
                  [--no-manifest] [--no-html] [--dev] [--json] [--chunk-sample N]
                                                 默认检查 remoteEntry/manifest/index.html；
                                                 纯宿主用 --no-entry，自定义入口文件名用 --entry，
                                                 合法关闭 manifest 用 --no-manifest，无页面用 --no-html
  fulgurjs --help

示例：
  fulgurjs create vue-vue --dir my-federation      # 创建完整工程并安装依赖（推荐的新项目起点）
  fulgurjs init --framework react --role consumer  # 已有 React 项目按消费方生成起步配置
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
    const { writeConfigTemplate, inspectConfig, detectFrameworkFromPackageJson } = await import('./init')
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
    if (has('--template')) {
      console.error(
        '[fulgurjs:init] 不支持的选项 --template\n' +
          '根因：--template 在 create 里指模板名，在 init 里却是输出路径——同名不同义\n' +
          '修法：fulgurjs init --out <路径>',
      )
      return 2
    }
    // UX-02：框架从 package.json 依赖判断；判断不了不猜——TTY 询问，非 TTY 报错要求显式 --framework
    const roleArg = argOf('--role') ?? 'dual'
    if (!['consumer', 'provider', 'dual'].includes(roleArg)) {
      console.error(`[fulgurjs:init] 未知角色：${roleArg}（可选 consumer=纯消费方 / provider=纯提供方 / dual=双角色）`)
      return 2
    }
    let framework = argOf('--framework')
    if (framework && !['vue', 'react'].includes(framework)) {
      console.error(`[fulgurjs:init] 未知框架：${framework}（可选 vue / react）`)
      return 2
    }
    if (!framework) {
      try {
        const pkg = JSON.parse(await import('node:fs').then((m) => m.promises.readFile(resolve('package.json'), 'utf8'))) as Parameters<typeof detectFrameworkFromPackageJson>[0]
        framework = detectFrameworkFromPackageJson(pkg) ?? undefined
      } catch {
        /* 无 package.json：走显式选择 */
      }
    }
    if (!framework) {
      if (process.stdin.isTTY) {
        const readline = await import('node:readline/promises')
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
        const answer = (await rl.question('无法从 package.json 判断框架，请选择（vue / react）：')).trim()
        rl.close()
        if (answer !== 'vue' && answer !== 'react') {
          console.error('[fulgurjs:init] 只支持 vue / react；请显式重跑 fulgurjs init --framework vue|react')
          return 2
        }
        framework = answer
      } else {
        console.error(
          '[fulgurjs:init] 无法从 package.json 判断框架（vue/react 依赖缺失或并存）。\n' +
            '  修法：显式指定 fulgurjs init --framework vue|react（--role consumer|provider|dual 可选，默认 dual）',
        )
        return 2
      }
    }
    const target = resolve(argOf('--out') ?? 'fulgurjs.config.ts')
    const result = await writeConfigTemplate(target, has('--force'), { framework: framework as 'vue' | 'react', role: roleArg as 'consumer' | 'provider' | 'dual' })
    if (result === 'exists') {
      console.error(`[fulgurjs:init] ${target} 已存在，拒绝覆盖（--force 强制覆盖）`)
      return 2
    }
    const entry = framework === 'react' ? '@fulgurjs/federation/react' : '@fulgurjs/federation/vue'
    console.log(`[fulgurjs:init] 已生成${framework === 'react' ? ' React' : ' Vue'} ${roleArg === 'dual' ? '双角色' : roleArg === 'consumer' ? '纯消费方' : '纯提供方'}起步模板 ${target}
后续步骤：
  1. 编辑 fulgurjs.config.ts：填入容器名/${roleArg === 'provider' ? 'exposes' : roleArg === 'consumer' ? 'remotes' : 'exposes/remotes'}/shared（默认导出直接是 federation() 选项）
  2. vite.config.ts 接入（仅两行联邦相关代码）：
       import federation from '@fulgurjs/federation'
       import fulgurjsConfig from './fulgurjs.config'
       // plugins: [ ...原有插件, federation(fulgurjsConfig) ]
  3. npx @fulgurjs/federation explain   # 核对有效形态与加载链
  4. 部署后：npx @fulgurjs/federation doctor --base <URL> --apps <部署子目录>
     （--apps 是站点根下的部署子目录，如远程部署在 /my-remote/ 就写 my-remote，不是容器名）
应用代码 API 入口：${entry}（框架无关模块用 /runtime；说明见模板头注释与 docs 文档中心）。
说明：加载普通组件/模块不需要页面表。只有当宿主用「页面路由表 → 远程页面」方式逐页接入时，
才在 fulgurjs.config.ts 追加具名导出 hostPages，并运行 npx @fulgurjs/federation check-pages --site <站点> 核对；
完整子应用桥接不逐页登记内部页面，业务菜单与 Router 归应用自己管理。`)
    return 0
  }

  if (cmd === 'create') {
    if (has('--list')) {
      const { TEMPLATE_CATALOG } = await import('./create')
      for (const t of TEMPLATE_CATALOG) console.log(`${t.name.padEnd(24)} ${t.summary}`)
      return 0
    }
    const { createProject, resolveTemplatesRoot, defaultInstall } = await import('./create')
    let promptImpl: (question: string) => Promise<string>
    if (process.stdin.isTTY) {
      const readline = await import('node:readline/promises')
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
      promptImpl = (q) => rl.question(q)
    } else {
      promptImpl = async () => {
        throw new Error(
          '[fulgurjs:create] 当前不是交互终端，缺少模板参数。\n' +
            '  修法：显式传模板与目录，例如 fulgurjs create vue-vue --dir my-federation（--no-install 可跳过安装）',
        )
      }
    }
    try {
      const json = has('--json')
      await createProject(
        {
          template: argv[1] && !argv[1].startsWith('-') ? argv[1] : undefined,
          dir: argOf('--dir'),
          install: !has('--no-install'),
          force: has('--force'),
          json,
          templatesRoot: resolveTemplatesRoot(import.meta.url),
          cwd: process.cwd(),
        },
        {
          // --json 时进度走 stderr：stdout 只输出最终 JSON，可被消费方直接解析
          log: json ? (m) => console.error(m) : (m) => console.log(m),
          out: (m) => console.log(m),
          error: (m) => console.error(m),
          prompt: promptImpl,
          install: (cwd) => defaultInstall(cwd, json ? 'stderr' : 'inherit'),
        },
      )
      return 0
    } catch (e) {
      console.error(String((e as Error).message ?? e))
      return 2
    }
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

  if (cmd === 'types') {
    const mode = argOf('--mode')
    if (mode !== undefined && mode !== 'dev' && mode !== 'prod') {
      console.error('[fulgurjs:types] --mode 只支持 dev（默认，读 remotes 的 dev 地址）或 prod（读 prod 地址）')
      return 2
    }
    try {
      const { runTypesCommand } = await import('./dts-cli')
      const r = await runTypesCommand({
        configPath: resolve(argOf('--config') ?? 'fulgurjs.config.ts'),
        ...(mode ? { mode: mode as 'dev' | 'prod' } : {}),
        check: has('--check'),
        cwd: process.cwd(),
      })
      for (const line of r.lines) console.log(line)
      return r.exitCode
    } catch (e) {
      console.error(String((e as Error).message ?? e))
      return 2
    }
  }

  if (cmd === 'port') {
    const app = argv[1] && !argv[1].startsWith('-') ? argv[1] : undefined
    const portArg = argv[2] && !argv[2].startsWith('-') ? argv[2] : undefined
    if (!app || !portArg || !/^\d+$/.test(portArg)) {
      console.error('[fulgurjs:port] 用法：fulgurjs port <应用名> <新端口> [--write]（默认只预览）')
      return 2
    }
    const { planPortChange, applyPortChange, formatPortPlan } = await import('./port')
    try {
      const plan = planPortChange(process.cwd(), app, Number(portArg))
      if (has('--write')) {
        const written = applyPortChange(process.cwd(), plan)
        console.log(`[fulgurjs:port] 已写入 ${written} 个文件（${app} ${plan.from} → ${plan.to}）。回退：git checkout <file>`)
        for (const n of plan.notes) console.log(`  注：${n}`)
      } else {
        console.log(formatPortPlan(process.cwd(), plan))
      }
      return 0
    } catch (e) {
      console.error(String((e as Error).message ?? e))
      return 2
    }
  }

  if (cmd === 'doctor') {
    const base = argOf('--base')
    const appsRaw = argOf('--apps')
    if (!base) {
      console.error('[fulgurjs:doctor] 缺少 --base <URL>（站点根地址，如 http://your-site）')
      return 2
    }
    if (!appsRaw) {
      console.error(
        '[fulgurjs:doctor] 缺少 --apps <子目录,...>——doctor 不猜默认应用名。\n' +
          '  修法：--apps 传站点根下的部署子目录（远程部署在 /remote-a/ 就写 remote-a；部署在站点根写 "."；\n' +
          '  多 origin 直接写完整 URL）。纯宿主加 --no-entry，自定义入口文件名用 --entry <文件名>',
      )
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
      ...(argOf('--entry') ? { entry: argOf('--entry') } : {}),
      noEntry: has('--no-entry'),
      noManifest: has('--no-manifest'),
      noHtml: has('--no-html'),
    })
    if (has('--json')) {
      console.log(JSON.stringify({
        base,
        apps,
        dev: has('--dev'),
        mode: {
          entry: has('--no-entry') ? '(no-entry)' : (argOf('--entry') ?? 'fulgurjs-remoteEntry.js'),
          manifest: has('--no-manifest') ? '(disabled)' : 'fulgurjs-manifest.json',
          html: has('--no-html') ? '(skipped)' : 'index.html',
        },
        checks,
        failed,
      }, null, 2))
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
