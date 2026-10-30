#!/usr/bin/env node
/**
 * fulgurjs CLI（主包内置 bin）。
 *
 * 子命令（单项目 fulgurjs.config.ts 唯一形态；命令默认读 ./fulgurjs.config.ts）：
 * - fulgurjs create [模板] [--dir <路径>] ...                        从已安装的 npm 包复制完整模板工程（新项目入口）
 * - fulgurjs init [--out <路径>] [--config <path>] [--force]  单项目起步模板 / 配置校验 + 接入块输出（已有项目用）
 * - fulgurjs explain [--config <path>] [--json]                    配置解释器（角色/remotes/exposes/setup/shared/页面映射/加载链）
 * - fulgurjs check-pages [--config <path>] [--site <URL>] [--manifest <r>=<p|URL>]... [--require-verified] [--json]
 * - fulgurjs doctor --config <path> [--json]                      本地接入预检
 * - fulgurjs doctor --base <URL> --apps a,b,c [--dev] [--json]     部署/配置层体检
 *
 * init 默认起步配置；--plan 预览已有工程接线，--write 才应用安全子集。
 * 复杂业务装配保留明确待办，不执行业务模块或猜测权限、登录态。
 */
import { resolve } from 'node:path'
import { runDoctor, formatDoctorReport } from './doctor'
import { diagnosticUrl } from './runtime/errors'

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
  fulgurjs init --plan [--kind component|app] [--role consumer|provider|dual]
                [--remote 名称=http://开发地址] [--expose ./键=./源文件]
                [--name 容器名] [--entry src/main.ts] [--application src/fulgurjs/exposes/application.ts]
                [--framework vue|react] [--json]
                                                 只扫描并预览完整差异与人工待办；可重复 remote/expose。
                                                 --kind 默认 component；app 支持简单入口提取与宿主视图。
                                                 已有复杂装配用 --application 复用真实默认导出；
                                                 无法自动提取时输出当前入口导入与逐步整理清单，不猜业务。
                                                 --write 显式应用；阻断项存在时整批不写，不覆盖已有配置。
  fulgurjs init --rollback                         恢复被中断的计划写入；有后续人工编辑时拒绝覆盖。
  fulgurjs init [--out <路径>] [--framework vue|react] [--role consumer|provider|dual] [--force]
                                                   生成单项目 fulgurjs.config.ts 起步模板（最小有效配置）：
                                                   框架默认从 package.json 依赖判断（判断不了要求显式 --framework）；
                                                   角色缺省 dual；--out 是输出路径（默认 ./fulgurjs.config.ts）；--force 覆盖已存在的模板
  fulgurjs init --config <path>                    校验配置；输出 federation(fulgurjsConfig) 接入块
                                                 与按角色的接入核对清单
  fulgurjs explain [--config <path>] [--json]      解释本应用有效联邦形态与加载链（纯本地，无网络）
  fulgurjs types [--config <path>] [--mode dev|prod] [--base <URL>] [--check]
                                                 远程类型：提供方验证声明 bundle 生成；宿主同步远程
                                                 声明到本地类型目录（CI 在 typecheck 前运行；失败非零
                                                 退出）。双角色工程先生成（纯本地，不等远程）再同步。
                                                 --mode prod 读 remotes 的 prod 地址；相对地址（如
                                                 /remote-a）需 --base <站点 origin> 拼出完整 URL。
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
本地接入预检（不启动应用、不请求站点；WARN 是人工核查项）：
  fulgurjs doctor --config <path> [--json]         查入口/地址/glob/状态归属，输出必改与可选文件清单
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
    if (has('--rollback')) {
      try {
        if (argv.length !== 2) throw new Error('--rollback 必须独立使用，不与写入或预览参数混用。')
        const { rollbackIntegration } = await import('./init-plan')
        rollbackIntegration(process.cwd())
        console.log('[fulgurjs:init] 已恢复被中断的写入；请重新生成接入预览。')
        return 0
      } catch (error) { console.error(String((error as Error).message ?? error)); return 1 }
    }
    if (has('--plan') || has('--write')) {
      try {
        if (has('--config') || has('--out') || has('--force')) throw new Error('接入计划不能同时使用 --config/--out/--force；已有配置请单独运行 doctor --config 检查。')
        const values = ['--kind', '--role', '--framework', '--name', '--entry', '--application', '--remote', '--expose']
        for (let i = 1; i < argv.length; i++) {
          if (['--plan', '--write', '--json'].includes(argv[i])) continue
          if (!values.includes(argv[i])) throw new Error(`未知接入计划参数：${argv[i]}`)
          if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error(`${argv[i]} 缺少值`)
          i++
        }
        const kind = argOf('--kind') ?? 'component'
        const role = argOf('--role') ?? 'dual'
        const framework = argOf('--framework')
        if (!['component', 'app'].includes(kind) || !['consumer', 'provider', 'dual'].includes(role) || (framework && !['vue', 'react'].includes(framework))) throw new Error('请使用 --kind component|app、--role consumer|provider|dual、--framework vue|react。')
        const pairs = (flag: string) => {
          const result: Record<string, string> = {}
          argv.forEach((value, i) => {
            if (value !== flag) return
            const pair = argv[i + 1], eq = pair?.indexOf('=') ?? -1
            if (eq < 1 || !pair.slice(eq + 1) || pair.startsWith('--')) throw new Error(`${flag} 需要 键=值；不会猜远程地址或业务文件。`)
            const key = pair.slice(0, eq)
            if (Object.hasOwn(result, key)) throw new Error(`${flag} 重复键：${key}`)
            Object.defineProperty(result, key, { value: pair.slice(eq + 1), enumerable: true, configurable: true })
          })
          return result
        }
        const { planIntegration, formatIntegrationPlan, applyIntegration } = await import('./init-plan')
        const plan = await planIntegration({ cwd: process.cwd(), kind: kind as 'component' | 'app', role: role as 'consumer' | 'provider' | 'dual', framework: framework as 'vue' | 'react' | undefined, name: argOf('--name'), entry: argOf('--entry'), application: argOf('--application'), remotes: pairs('--remote'), exposes: pairs('--expose') })
        const blocked = plan.tasks.some(task => task.blocking)
        if (has('--write') && !blocked) applyIntegration(plan)
        const written = has('--write') && !blocked
        if (has('--json')) console.log(JSON.stringify({ ...plan, written }, null, 2))
        else console.log(formatIntegrationPlan(plan) + (blocked ? '\n存在阻断项，整批未写入；先处理所列事项再预览。' : written ? '\n已应用计划；人工接线与真实浏览器验证仍需完成。' : '\n确认以上差异后，使用相同参数追加 --write 应用；工具不自动安装依赖。'))
        return blocked ? 1 : 0
      } catch (error) {
        const message = String((error as Error).message ?? error)
        if (has('--json')) console.log(JSON.stringify({ written: false, error: message }))
        else console.error(`[fulgurjs:init] ${message}`)
        return 1
      }
    }
    if (['--kind', '--remote', '--expose', '--entry', '--application', '--name'].some(has)) {
      console.error('[fulgurjs:init] 接入计划参数需要 --plan（预览）或 --write（显式写入）。')
      return 2
    }
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
        ...(argOf('--base') ? { base: argOf('--base') } : {}),
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
      const requested = Number(portArg)
      if (!Number.isInteger(requested) || requested < 1 || requested > 65535) {
        console.error(`[fulgurjs:port] 新端口必须是 1–65535 的整数，当前为 ${portArg}。`)
        return 2
      }
      // 端口被本机进程监听时拒绝计划：模板 dev 启动会因占用失败，提前暴露而不是写入后才报错。
      const net = await import('node:net')
      const occupied = await new Promise<boolean>((resolve) => {
        const socket = new net.Socket()
        const done = (value: boolean) => { socket.destroy(); resolve(value) }
        socket.setTimeout(500)
        socket.once('connect', () => done(true))
        socket.once('timeout', () => done(false))
        socket.once('error', () => done(false))
        socket.connect(requested, '127.0.0.1')
      })
      if (occupied) {
        console.error(`[fulgurjs:port] 端口 ${requested} 已被本机进程监听；请换端口或先停止占用进程。`)
        return 2
      }
      const plan = planPortChange(process.cwd(), app, requested)
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
    const config = argOf('--config')
    if (has('--config') && !config) {
      console.error('[fulgurjs:doctor] --config 缺少路径。用法：doctor --config ./fulgurjs.config.ts')
      return 2
    }
    if (config) {
      if (has('--base') || has('--apps')) {
        console.error('[fulgurjs:doctor] 本地 --config 与部署 --base/--apps 分开执行，避免把源码预检当成部署验收。')
        return 2
      }
      const { runSourceDoctor } = await import('./doctor-source')
      const report = await runSourceDoctor(resolve(config))
      if (has('--json')) console.log(JSON.stringify({ mode: 'source', ...report }, null, 2))
      else {
        console.log(formatDoctorReport(report.checks))
        console.log('\n必需入口文件：\n' + report.integrationFiles.required.map(file => `  ${file}`).join('\n'))
        console.log('\n已有文件需要接线：\n' + report.integrationFiles.existing.map(file => `  ${file}`).join('\n'))
        console.log('\n按需求选用：\n' + report.integrationFiles.optional.map(file => `  ${file}`).join('\n'))
        console.log('\n必须人工验收：\n' + report.manualChecks.map(line => `  ${line}`).join('\n'))
      }
      return report.failed ? 1 : 0
    }
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
        // D16：JSON 顶层 base 与现象行同口径脱敏 userinfo/query/hash，不回显原始输入
        base: diagnosticUrl(base),
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
