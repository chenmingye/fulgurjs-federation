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
  log: (message: string) => void
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
  apps: Array<{ name: string; dir: string; port: number }>
  installRan: boolean
  installCode?: number
}

/** 复制时排除的名称（安装痕迹、产物与缓存；源码、锁文件、脚本全部保留） */
export const COPY_EXCLUDED = new Set(['node_modules', 'dist', '.vite', '.run', '.DS_Store'])

export function isExcluded(name: string): boolean {
  if (COPY_EXCLUDED.has(name)) return true
  return name.endsWith('.log')
}

export function copyTemplate(from: string, to: string): void {
  fs.mkdirSync(to, { recursive: true })
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (isExcluded(entry.name)) continue
    const src = path.join(from, entry.name)
    const dest = path.join(to, entry.name)
    if (entry.isDirectory()) copyTemplate(src, dest)
    else fs.copyFileSync(src, dest)
  }
}

/** 复制后的完整性校验：缺任一关键文件即失败（防半份模板 / 包收录遗漏） */
export function validateTemplateDir(dir: string): string[] {
  const required = ['package.json', 'pnpm-workspace.yaml', 'pnpm-lock.yaml', 'scripts/dev.mjs', 'scripts/dev.config.json']
  return required.filter((f) => !fs.existsSync(path.join(dir, f)))
}

export interface TemplateAppConfig {
  apps: Array<{ name: string; dir: string; port: number }>
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
  lines.push('后续步骤：')
  lines.push(`  cd ${result.target}`)
  if (!result.installRan) lines.push('  pnpm install --frozen-lockfile')
  lines.push('  pnpm dev                # 按启动顺序拉起全部应用，失败会整组退出并说明原因')
  lines.push('访问入口（远程先于宿主就绪）：')
  for (const app of apps) {
    lines.push(`  http://localhost:${app.port}/    ${app.name}${app.dir !== app.name ? `（目录 ${app.dir}）` : ''}`)
  }
  const hosts = apps.slice().reverse()
  lines.push(`浏览器打开宿主入口：${hosts.length ? `http://localhost:${hosts[0].port}/` : '（见模板 README）'}`)
  lines.push('  pnpm build              # 各子应用生产构建（远程生成 fulgurjs-remoteEntry.js / fulgurjs-manifest.json）')
  lines.push('  部署规则（no-cache / SPA 回退 / base 对齐）见模板内各子应用 README；部署后可用 npx fulgurjs doctor --base <站点> --apps <部署子目录> 体检')
  lines.push('  改端口：改 <远程|宿主>/package.json 的 dev/preview 端口，并同步宿主 fulgurjs.config.ts 的 remotes dev 地址')
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

/** Node 版本核查（模板口径 Node ≥ 20，实测 24）：不满足仅警告不阻断 */
export function nodeVersionWarning(nodeVersion: string): string | undefined {
  const major = Number(nodeVersion.replace(/^v/, '').split('.')[0])
  if (Number.isFinite(major) && major < 20) {
    return `当前 Node ${nodeVersion} 低于模板要求（Node ≥ 20，实测 24.x）——安装可能成功，但与模板验证环境不符`
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
  if (fs.existsSync(target)) {
    const existing = fs.readdirSync(target)
    if (existing.length > 0 && !opts.force) {
      throw new Error(
        `[fulgurjs:create] 目标目录非空，拒绝覆盖：${target}\n` +
          '  根因：静默合并可能掩盖与你已有文件的冲突。\n' +
          '  修法：换一个目录（--dir），或确认后加 --force（只新增模板文件，不删除/改写你已有的文件）',
      )
    }
    if (existing.length > 0) {
      io.log(`[fulgurjs:create] --force：向非空目录 ${target} 增量复制（不删除已有文件）`)
    }
  }

  const warnings: string[] = []
  const nodeWarn = nodeVersionWarning(process.version)
  if (nodeWarn) warnings.push(nodeWarn)

  copyTemplate(templateDir, target)
  const missing = validateTemplateDir(target)
  if (missing.length > 0) {
    throw new Error(`[fulgurjs:create] 复制后的模板缺少关键文件：${missing.join('、')}——包内模板资产不完整，请反馈版本号`)
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
          `依赖未被假装成功：修复后进入 ${target} 手动执行 pnpm install --frozen-lockfile 再 pnpm dev`,
      )
    }
  } else {
    io.log('[fulgurjs:create] 按要求跳过安装（--no-install）：进入目录后先执行 pnpm install --frozen-lockfile')
  }
  for (const w of warnings) io.log(`[fulgurjs:create] 警告：${w}`)

  const result: CreateResult = { template: templateName, target, pluginVersion, apps, installRan, installCode }
  io.log(opts.json ? formatCreateJson(result) : formatCreateResult(result))
  return result
}

/** CLI 默认安装器：继承 stdio 透传原因，退出码原样返回 */
export function defaultInstall(cwd: string): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn('pnpm', ['install', '--frozen-lockfile'], { cwd, stdio: 'inherit' })
    child.once('error', (e) => {
      console.error(`[fulgurjs:create] 无法启动 pnpm：${e.message}（corepack enable 或 npm i -g pnpm）`)
      resolve(1)
    })
    child.once('close', (code) => resolve(code ?? 1))
  })
}
