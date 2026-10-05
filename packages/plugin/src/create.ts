/**
 * `fulgurjs create` —— 完整工程创建向导（任务 B）。
 *
 * 与 `init` 的职责区分：init 只在【已有项目】里生成 fulgurjs.config.ts 起步配置；
 * create 从【已安装的 npm 包】内复制一个完整、可独立运行的联邦模板工程
 * （workspace + 子应用 + 锁文件 + 启动脚本），并给出后续命令。
 *
 * 模板唯一来源 = 包内 examples/templates/（构建期由 scripts/sync-package-examples.mjs
 * 从仓库 examples/templates/ 同步）；运行时不 clone 插件仓库、不依赖作者本机路径。
 * 不做应用名称/端口改写——保持与锁文件、文档、演示一致的整目录复制；
 * 改端口的固定清单写在各模板 README（远程与宿主 package.json + 宿主 fulgurjs.config.ts）。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

export interface TemplateInfo {
  name: string
  summary: string
}

/** 模板目录（与 examples/scenarios.json / templates/README.md 同源的五模板） */
export const TEMPLATE_CATALOG: TemplateInfo[] = [
  { name: 'vue-vue', summary: 'Vue 宿主 × Vue 远程：远程组件/TS 模块/页面接入、错误恢复、生产部署' },
  { name: 'react-react', summary: 'React 宿主 × React 远程：remoteComponent/useLoadRemote/ErrorBoundary' },
  { name: 'vue-host-react-remote', summary: 'Vue 宿主 × React 子应用：跨框架桥接（挂载/卸载/appProps 快照）' },
  { name: 'react-host-vue-remote', summary: 'React 宿主 × Vue 子应用：反方向桥接' },
  { name: 'showcase', summary: '双向桥接 + URL 同步 showcase：Vue/React 双宿主 × 双远程，深链刷新/前进后退' },
]

/** npm 包根（dist/cli.js 的上一级）；仓库内构建后同样成立 */
export function packageRootOf(moduleUrl: string): string {
  return fileURLToPath(new URL('..', moduleUrl))
}

/** 包内模板根；缺失时给出可执行的修法（从正式包运行 / 先构建） */
export function resolveTemplatesRoot(moduleUrl: string): string {
  const root = path.join(packageRootOf(moduleUrl), 'examples', 'templates')
  if (!fs.existsSync(root)) {
    throw new Error(
      '[fulgurjs:create] 当前安装缺少模板资产（examples/templates）。\n' +
        '  根因：模板由 npm 正式包附带；从仓库源码直接运行 CLI 时该目录只在 build 后生成。\n' +
        '  修法：用 npm 正式包运行（npx @fulgurjs/federation create），或在插件仓库执行 npm --prefix packages/plugin run build 后重试',
    )
  }
  return root
}

export interface CreateIo {
  /** 进度/说明输出（CLI 在 --json 时接到 stderr，保证 stdout 数据流纯净） */
  log: (message: string) => void
  /** 最终结果输出（始终接 stdout；--json 时是可解析的 JSON 文本） */
  out: (message: string) => void
  error: (message: string) => void
  /** 交互提问；非交互实现应抛错（CLI 层已在缺参时直接报错，不走到这里） */
  prompt: (question: string) => Promise<string>
  /** 执行安装命令；返回退出码 */
  install: (cwd: string) => Promise<number>
}

export interface CreateOptions {
  template?: string
  dir?: string
  install?: boolean
  force?: boolean
  json?: boolean
  templatesRoot: string
  cwd: string
}

export interface CreateResult {
  template: string
  target: string
  pluginVersion: string
  apps: Array<{ name: string; dir: string; port: number; host?: boolean }>
  installRan: boolean
  installCode?: number
  /** 本次实际写入的模板文件数（复用目录时可能小于模板总数） */
  copiedCount: number
  /** 因同名冲突被跳过、保持用户版本的文件（--force 复用目录时非空） */
  skippedConflicts: CopyConflict[]
}

/** 复制时排除的名称（安装痕迹、产物与缓存；源码、锁文件、脚本全部保留） */
export const COPY_EXCLUDED = new Set(['node_modules', 'dist', '.vite', '.run', '.DS_Store'])

export function isExcluded(name: string): boolean {
  if (COPY_EXCLUDED.has(name)) return true
  return name.endsWith('.log')
}

/** 同名冲突：路径 + 为什么不能写（用户文件永不被改写） */
export interface CopyConflict {
  rel: string
  reason: string
}

export interface CopyOutcome {
  copied: string[]
  skipped: CopyConflict[]
}

/**
 * 预检目标目录相对模板的全部写入冲突：同名文件、文件/目录类型不符、目标侧符号链接。
 * 复用目录（--force）前必须先跑一遍——合同是「只补缺失文件，绝不改写已有内容」。
 */
export function scanTemplateConflicts(from: string, to: string): CopyConflict[] {
  const conflicts: CopyConflict[] = []
  const walk = (srcDir: string, relDir: string): void => {
    for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
      if (isExcluded(entry.name)) continue
      const rel = relDir ? `${relDir}/${entry.name}` : entry.name
      const src = path.join(srcDir, entry.name)
      const dest = path.join(to, rel)
      let destStat: fs.Stats | undefined
      try {
        destStat = fs.lstatSync(dest)
      } catch {
        /* 目标不存在 → 可复制 */
      }
      if (!destStat) {
        if (entry.isDirectory()) walk(src, rel)
        continue
      }
      if (destStat.isSymbolicLink()) {
        conflicts.push({ rel, reason: '目标已有符号链接，不写入' })
        continue
      }
      if (entry.isDirectory()) {
        if (!destStat.isDirectory()) conflicts.push({ rel, reason: '模板是目录，目标同名路径是文件' })
        else walk(src, rel)
        continue
      }
      if (destStat.isDirectory()) conflicts.push({ rel, reason: '模板是文件，目标同名路径是目录' })
      else conflicts.push({ rel, reason: '同名文件已存在（保留你的版本）' })
    }
  }
  walk(from, '')
  return conflicts
}

/** 只复制目标缺失的条目；conflicts 里的路径一律不写（预检产物） */
export function copyMissingFiles(from: string, to: string, conflicts: CopyConflict[]): CopyOutcome {
  const blocked = new Set(conflicts.map((c) => c.rel))
  const outcome: CopyOutcome = { copied: [], skipped: [] }
  const walk = (srcDir: string, relDir: string): void => {
    fs.mkdirSync(to, { recursive: true })
    for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
      if (isExcluded(entry.name)) continue
      const rel = relDir ? `${relDir}/${entry.name}` : entry.name
      const src = path.join(srcDir, entry.name)
      const dest = path.join(to, rel)
      if (blocked.has(rel)) {
        outcome.skipped.push({ rel, reason: conflicts.find((c) => c.rel === rel)?.reason ?? '同名冲突' })
        continue
      }
      if (entry.isDirectory()) {
        walk(src, rel)
        continue
      }
      fs.mkdirSync(path.dirname(dest), { recursive: true })
      fs.copyFileSync(src, dest)
      outcome.copied.push(rel)
    }
  }
  walk(from, '')
  return outcome
}

/** 整目录复制（目标应为空目录）：先预检冲突，有任何冲突即抛错，不写半个文件 */
export function copyTemplate(from: string, to: string): CopyOutcome {
  const conflicts = scanTemplateConflicts(from, to)
  if (conflicts.length > 0) {
    throw new Error(
      `[fulgurjs:create] 目标目录存在同名冲突，拒绝写入：\n` +
        conflicts.map((c) => `  ${c.rel} — ${c.reason}`).join('\n') +
        `\n  修法：换一个空目录（--dir），或加 --force 复用目录（只补缺失文件，不改写以上冲突项）`,
    )
  }
  return copyMissingFiles(from, to, conflicts)
}

/** 复制后的完整性校验：缺任一关键文件即失败（防半份模板 / 包收录遗漏） */
export function validateTemplateDir(dir: string): string[] {
  const required = ['package.json', 'pnpm-workspace.yaml', 'pnpm-lock.yaml', 'scripts/dev.mjs', 'scripts/dev.config.json']
  return required.filter((f) => !fs.existsSync(path.join(dir, f)))
}

export interface TemplateAppConfig {
  apps: Array<{ name: string; dir: string; port: number; host?: boolean }>
}

/** 模板启动清单（任务 C 的 dev-runner 与 create 的入口提示共用同一份） */
export function readDevConfig(templateDir: string): TemplateAppConfig {
  const file = path.join(templateDir, 'scripts', 'dev.config.json')
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as TemplateAppConfig
  if (!Array.isArray(parsed.apps) || parsed.apps.length === 0) {
    throw new Error(`[fulgurjs:create] ${file} 缺少 apps 数组`)
  }
  for (const app of parsed.apps) {
    if (typeof app.name !== 'string' || typeof app.dir !== 'string' || typeof app.port !== 'number') {
      throw new Error(`[fulgurjs:create] ${file} 的 apps 条目需要 name/dir/port 三个字段`)
    }
  }
  return parsed
}

/** 插件版本从子应用 package.json 读取（workspace 根不声明依赖） */
function pluginVersionOf(templateDir: string, apps: TemplateAppConfig['apps']): string {
  for (const app of apps) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(templateDir, app.dir, 'package.json'), 'utf8')) as {
        dependencies?: Record<string, string>
      }
      const version = pkg.dependencies?.['@fulgurjs/federation']
      if (version) return version
    } catch {
      /* 下一子应用 */
    }
  }
  return '（未在子应用声明中找到 @fulgurjs/federation）'
}

export function formatCreateResult(result: CreateResult): string {
  const apps = result.apps
  const lines: string[] = []
  lines.push(`[fulgurjs:create] 已创建完整工程 ${result.target}（模板 ${result.template}，插件依赖 ${result.pluginVersion}）`)
  if (result.skippedConflicts.length > 0) {
    lines.push(`以下 ${result.skippedConflicts.length} 个同名文件保留你的版本、未被改写（如需与模板对齐请手工合并）：`)
    for (const c of result.skippedConflicts) lines.push(`  ${c.rel} — ${c.reason}`)
  }
  lines.push('后续步骤：')
  lines.push(`  cd "${result.target}"`)
  if (!result.installRan) lines.push('  pnpm install --frozen-lockfile')
  lines.push('  pnpm dev                # 按启动顺序拉起全部应用，失败会整组退出并说明原因')
  lines.push('访问入口（远程先于宿主就绪）：')
  for (const app of apps) {
    lines.push(`  http://localhost:${app.port}/    ${app.name}${app.dir !== app.name ? `（目录 ${app.dir}）` : ''}`)
  }
  const hosts = apps.filter((a) => a.host)
  const hostList = hosts.length ? hosts : apps.slice(-1)
  lines.push(
    '浏览器打开宿主入口：' +
      hostList.map((a) => `http://localhost:${a.port}/（${a.name}）`).join('  '),
  )
  lines.push('  pnpm build              # 各子应用生产构建（远程生成 fulgurjs-remoteEntry.js / fulgurjs-manifest.json）')
  lines.push('  部署规则（no-cache / SPA 回退 / base 对齐）见模板内各子应用 README；部署后可用 npx fulgurjs doctor --base <站点> --apps <部署子目录> 体检')
  lines.push('  改端口（四处同步，漏一处启动器会被旧端口卡住）：')
  lines.push('    1. 各应用 package.json 的 dev 与 preview 脚本 --port')
  lines.push('    2. 宿主 fulgurjs.config.ts 里 remotes 的 dev 地址')
  lines.push('    3. scripts/dev.config.json 里该应用的 port（启动器预检/探活都用它）')
  lines.push('    4. 模板 README 顶部的端口表（自行保持记录一致）')
  return lines.join('\n')
}

function formatCreateJson(result: CreateResult): string {
  return JSON.stringify(
    {
      template: result.template,
      target: result.target,
      pluginVersion: result.pluginVersion,
      apps: result.apps,
      installRan: result.installRan,
      ...(result.installCode !== undefined ? { installCode: result.installCode } : {}),
      copiedCount: result.copiedCount,
      skippedConflicts: result.skippedConflicts,
      next: {
        cd: result.target,
        dev: 'pnpm dev',
        build: 'pnpm build',
      },
    },
    null,
    2,
  )
}

/** 引擎范围核查（>=X.Y.Z 形态；模板 package.json engines.node 声明）：不满足返回失败原因 */
export function nodeEnginesViolation(nodeVersion: string, range: string | undefined): string | undefined {
  if (!range) return undefined
  const m = range.trim().match(/^>=?(\d+)\.(\d+)(?:\.(\d+))?/)
  if (!m) return undefined
  const parse = (v: string) => v.replace(/^v/, '').split(/[.-]/).map((x) => Number(x) || 0)
  const [curMajor, curMinor = 0, curPatch = 0] = parse(nodeVersion)
  const [minMajor, minMinor = 0, minPatch = 0] = [Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0)]
  const ge = (a: number[], b: number[]) =>
    a[0] !== b[0] ? a[0] > b[0] : a[1] !== b[1] ? a[1] > b[1] : (a[2] ?? 0) >= (b[2] ?? 0)
  if (range.startsWith('>=')) {
    if (!ge([curMajor, curMinor, curPatch], [minMajor, minMinor, minPatch])) {
      return `当前 Node ${nodeVersion} 不满足模板要求 engines.node ${range}`
    }
    return undefined
  }
  const major = Number(nodeVersion.replace(/^v/, '').split('.')[0])
  if (Number.isFinite(major) && major < minMajor) {
    return `当前 Node ${nodeVersion} 低于模板要求 engines.node ${range}`
  }
  return undefined
}

export async function createProject(opts: CreateOptions, io: CreateIo): Promise<CreateResult> {
  const templateName = opts.template ?? (await io.prompt('选择模板（' + TEMPLATE_CATALOG.map((t) => t.name).join(' / ') + '）：'))
  const info = TEMPLATE_CATALOG.find((t) => t.name === templateName)
  if (!info) {
    throw new Error(
      `[fulgurjs:create] 未知模板：${templateName}\n` +
        `可用模板：${TEMPLATE_CATALOG.map((t) => t.name).join('、')}\n` +
        `修法：fulgurjs create --list 查看说明，或 fulgurjs create <模板名> --dir <目标目录>`,
    )
  }
  const templateDir = path.join(opts.templatesRoot, templateName)
  if (!fs.existsSync(path.join(templateDir, 'package.json'))) {
    throw new Error(`[fulgurjs:create] 包内模板不完整：${templateDir} 缺少 package.json`)
  }

  const target = path.resolve(opts.cwd, opts.dir ?? templateName)
  if (fs.existsSync(target) && !fs.statSync(target).isDirectory()) {
    throw new Error(
      `[fulgurjs:create] 目标路径已存在且是文件，无法作为工程目录：${target}\n` +
        '  修法：换一个目录（--dir），或先移走该文件',
    )
  }
  if (fs.existsSync(target)) {
    const existing = fs.readdirSync(target)
    if (existing.length > 0 && !opts.force) {
      throw new Error(
        `[fulgurjs:create] 目标目录非空，拒绝覆盖：${target}\n` +
          '  根因：静默合并可能掩盖与你已有文件的冲突。\n' +
          '  修法：换一个目录（--dir），或加 --force 复用目录（只补缺失文件；同名冲突逐项列出并保留你的版本，绝不改写）',
      )
    }
  }

  // UX-07：环境校验前置——在写入/安装发生之前，按模板真实 engines 与工具链校验；
  // 不满足即失败并给准确升级方法，不产生半份工程
  const enginesViolation = nodeEnginesViolation(process.version, templateEnginesNode(templateDir))
  if (enginesViolation) {
    throw new Error(
      `[fulgurjs:create] 环境校验失败：${enginesViolation}\n` +
        '  修法：升级 Node（nvm install <版本> && nvm use <版本>，或从 https://nodejs.org 安装 LTS）后重试；' +
        '未写入任何文件',
    )
  }
  if (opts.install) {
    const pnpmMissing = await pnpmUnavailableReason()
    if (pnpmMissing) {
      throw new Error(
        `[fulgurjs:create] 环境校验失败：${pnpmMissing}\n` +
          '  修法：corepack enable（Node 自带），或 npm i -g pnpm；未写入任何文件',
      )
    }
  }

  let outcome: CopyOutcome
  try {
    if (fs.existsSync(target) && fs.readdirSync(target).length > 0) {
      const conflicts = scanTemplateConflicts(templateDir, target)
      io.log(
        `[fulgurjs:create] --force：向非空目录 ${target} 复制（只补缺失文件，不改写已有内容；` +
          `预检到 ${conflicts.length} 个同名冲突将保留你的版本）`,
      )
      outcome = copyMissingFiles(templateDir, target, conflicts)
    } else {
      outcome = copyTemplate(templateDir, target)
    }
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e)
    if (detail.includes('同名冲突，拒绝写入')) throw e
    throw new Error(
      `[fulgurjs:create] 复制模板中途失败：${detail}\n` +
        `  已写入的文件保留在 ${target}，你已有的文件未被删除；排查（磁盘/权限/路径）后重新运行 ` +
        `fulgurjs create ${templateName} --dir <目录> --force——只补缺失文件，不会改写已复制内容`,
    )
  }
  const missing = validateTemplateDir(target)
  if (missing.length > 0) {
    throw new Error(
      `[fulgurjs:create] 复制后的模板缺少关键文件：${missing.join('、')}——包内模板资产不完整，或同名冲突覆盖了关键文件（保留的是你的版本），请对照包内模板手工合并`,
    )
  }
  const apps = readDevConfig(target).apps
  const pluginVersion = pluginVersionOf(target, apps)

  let installRan = false
  let installCode: number | undefined
  if (opts.install) {
    installRan = true
    io.log(`[fulgurjs:create] 安装依赖（pnpm install --frozen-lockfile，目录 ${target}）…`)
    installCode = await io.install(target)
    if (installCode !== 0) {
      throw new Error(
        `[fulgurjs:create] 依赖安装失败（退出码 ${installCode}）。上面的输出包含具体原因；` +
          '常见原因：pnpm 未安装（corepack enable 或 npm i -g pnpm）、registry 不可达、Node 版本过低。\n' +
          `工程文件已完整保留在 ${target}（便于排查）；修复后进入该目录手动执行 pnpm install --frozen-lockfile 再 pnpm dev`,
      )
    }
  } else {
    io.log('[fulgurjs:create] 按要求跳过安装（--no-install）：进入目录后先执行 pnpm install --frozen-lockfile')
  }
  const result: CreateResult = {
    template: templateName,
    target,
    pluginVersion,
    apps,
    installRan,
    installCode,
    copiedCount: outcome.copied.length,
    skippedConflicts: outcome.skipped,
  }
  if (opts.json) io.out(formatCreateJson(result))
  else io.log(formatCreateResult(result))
  return result
}

/** 模板根 package.json 的 engines.node（未声明返回 undefined——不虚构要求） */
export function templateEnginesNode(templateDir: string): string | undefined {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(templateDir, 'package.json'), 'utf8')) as {
      engines?: { node?: string }
    }
    return pkg.engines?.node
  } catch {
    return undefined
  }
}

/** pnpm 不可用时的具体原因（可用返回 undefined）；用于安装前置校验 */
export async function pnpmUnavailableReason(): Promise<string | undefined> {
  const code = await new Promise<number>((resolve) => {
    const child = spawn('pnpm', ['--version'], { stdio: 'ignore' })
    child.once('error', () => resolve(127))
    child.once('close', (c) => resolve(c ?? 1))
  })
  if (code === 127) return 'pnpm 未安装或不在 PATH'
  if (code !== 0) return `pnpm --version 退出码 ${code}（pnpm 安装异常）`
  return undefined
}

/** CLI 默认安装器：继承 stdio 透传原因，退出码原样返回；json 模式传 'stderr' 保持 stdout 数据流纯净 */
export function defaultInstall(cwd: string, output: 'inherit' | 'stderr' = 'inherit'): Promise<number> {
  return new Promise((resolve) => {
    const child =
      output === 'inherit'
        ? spawn('pnpm', ['install', '--frozen-lockfile'], { cwd, stdio: 'inherit' })
        : spawn('pnpm', ['install', '--frozen-lockfile'], { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    if (output === 'stderr') {
      child.stdout?.on('data', (c) => process.stderr.write(c))
      child.stderr?.on('data', (c) => process.stderr.write(c))
    }
    child.once('error', (e) => {
      console.error(`[fulgurjs:create] 无法启动 pnpm：${e.message}（corepack enable 或 npm i -g pnpm）`)
      resolve(1)
    })
    child.once('close', (code) => resolve(code ?? 1))
  })
}
