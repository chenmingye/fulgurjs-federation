/**
 * 单项目配置契约（4.2.0 默认接入形态）。
 *
 * 每个项目根目录一份 `fulgurjs.config.ts`，默认导出**直接可传给 federation() 的选项对象**
 * （`satisfies FederationOptions` 做编译期形状检查，无运行时包装函数）；可选具名导出
 * `hostPages`（宿主页面数据：pages / remotePrefixes / deriveSpec）仅供 CLI
 * explain/check-pages 读取——浏览器与 Vite 都不加载本加载器，页面数据的运行时消费方
 * 是应用自身的 `createHostPages` 调用代码（同模块，唯一手工维护位置）。
 *
 * 旧聚合配置（root + apps[]）保留兼容：本加载器按默认导出形状自动识别并分流到
 * loadRepoConfig 的校验语义（见 isAggregateShape）。兼容不等于推荐——文档主路径一律是
 * `import fulgurjsConfig from './fulgurjs.config'` + `federation(fulgurjsConfig)`。
 *
 * 加载机制与约束（区别于 loadRepoConfig 的临时文件裸 import）：
 * - 用 esbuild 把配置与**本项目内相对导入的纯数据模块**打成一个临时 bundle——相对导入
 *   以原配置文件为解析基准（extensionless/TS 均可），Node 18 可用，不依赖原生类型剥离；
 * - bundle 内对 `@fulgurjs/federation`（含 /config、/runtime 子路径）的运行时导入重定向到
 *   用户工程实际安装的本包入口（createRequire(configPath) 解析；自引用兜底），
 *   避免 bundle 把 CLI 自身代码重复打包进配置求值环境；
 * - 临时文件按任务独立目录写入 os.tmpdir()，import 完成即清理，不写业务源码；
 * - 本模块只服务 CLI（init/explain/check-pages），不应出现在项目 Vite 接入代码里。
 */
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import type { FederationOptions } from './options'
import type { PageEntry } from './config'
import { loadRepoConfig, type RepoConfig } from './config'

/** 宿主页面数据（fulgurjs.config.ts 的可选具名导出 hostPages；仅 CLI 消费） */
export interface HostPagesData {
  pages: PageEntry[]
  /** 路由前缀 → 远程容器名 */
  remotePrefixes: Record<string, string>
  /** 页面 spec 推导规则（缺省 = 去首段 + 剥 :参 段） */
  deriveSpec?: (route: string) => string
}

export interface AppConfigLoadBase {
  /** 配置文件绝对路径 */
  configPath: string
  /** 应用根目录 = 配置文件所在目录（单项目形态；exposes/setup 相对它解析） */
  appRoot: string
}

/** 单项目形态加载结果 */
export interface AppKindLoadResult extends AppConfigLoadBase {
  kind: 'app'
  /** 默认导出的 federation() 选项 */
  options: FederationOptions
  /** 可选 hostPages 具名导出（未提供 = undefined，CLI 明确报告） */
  hostPages?: HostPagesData
}

/** 旧聚合形态加载结果（兼容识别） */
export interface RepoKindLoadResult extends AppConfigLoadBase {
  kind: 'repo'
  repo: RepoConfig
}

export type AppConfigLoadResult = AppKindLoadResult | RepoKindLoadResult

/** 统一三段式错误（症状 → 根因 → 修法），带配置文件定位 */
function appConfigError(what: string, cause: string, fix: string): never {
  throw new Error(`[fulgurjs:config] ${what}\n根因：${cause}\n修法：${fix}`)
}

/** 旧聚合配置形状识别：root+apps[]（允许 UserConfig 的 Partial 形态） */
function isAggregateShape(value: unknown): boolean {
  return (
    !!value &&
    typeof value === 'object' &&
    Array.isArray((value as { apps?: unknown }).apps)
  )
}

/** 单项目配置字段形状错误：给出字段与期望形态 */
function fieldError(field: string, got: unknown, expect: string, example: string): never {
  appConfigError(
    `fulgurjs.config.ts 的 ${field} 形状不合法（实际 ${JSON.stringify(got)}）`,
    `CLI 按单项目契约读取：默认导出直接是 federation() 选项对象`,
    `期望 ${expect}。示例：\n  ${example}`,
  )
}

/** 校验默认导出的单项目配置基本形状（深度校验交给 federation() 的 CFG 报错体系） */
function validateAppOptions(options: Record<string, unknown>): void {
  if (typeof options.name !== 'string' || options.name.trim() === '') {
    fieldError(
      '默认导出 name',
      options.name,
      '非空字符串（联邦容器名）',
      `export default { name: 'my-app', exposes: { './pages/home': './src/views/Home.vue' } } satisfies FederationOptions`,
    )
  }
  for (const legacyField of ['root', 'apps', 'deploy', 'host', 'remote'] as const) {
    if (options[legacyField] !== undefined) {
      appConfigError(
        `默认导出包含旧聚合/角色壳字段 "${legacyField}"`,
        '单项目契约的默认导出直接是 federation() 选项（name/exposes/setup/remotes/shared/…），不包 host/remote 角色壳，也没有 root/apps[]',
        legacyField === 'host' || legacyField === 'remote'
          ? '把 host/remote 内的字段拍平到顶层：host.remotes → remotes；remote.exposes → exposes；remote.setup → setup；host.pages/remotePrefixes/deriveSpec → 具名导出 hostPages'
          : `${legacyField} 属于旧聚合配置（root + apps[]，兼容期保留）。单项目形态请删除该字段；聚合用法见 README「历史兼容」章节`,
      )
    }
  }
}

/** 校验 hostPages 具名导出形状（可选；形状错误显式报错而非静默忽略） */
function validateHostPages(value: unknown): HostPagesData {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fieldError('具名导出 hostPages', value, '对象 { pages, remotePrefixes, deriveSpec? }', `export const hostPages = { pages, remotePrefixes, deriveSpec }`)
  }
  const hp = value as Record<string, unknown>
  if (!Array.isArray(hp.pages)) {
    fieldError('hostPages.pages', hp.pages, 'PageEntry[]（路由表数组）', `export const hostPages = { pages: [{ route: '/remote-a/home', name: 'Home', title: '首页' }], remotePrefixes: { '/remote-a/': 'remote-a' } }`)
  }
  if (!hp.remotePrefixes || typeof hp.remotePrefixes !== 'object') {
    fieldError('hostPages.remotePrefixes', hp.remotePrefixes, 'Record<路由前缀, 远程容器名>', `remotePrefixes: { '/remote-a/': 'remote-a' }`)
  }
  if (hp.deriveSpec !== undefined && typeof hp.deriveSpec !== 'function') {
    fieldError('hostPages.deriveSpec', hp.deriveSpec, '函数 (route) => spec 或省略', `deriveSpec: (route) => 'pages/' + route.split('/').filter((s) => !s.startsWith(':')).join('/')`)
  }
  return hp as unknown as HostPagesData
}

/** 校验 exposes/setup/remotes 指向本项目内文件（独立仓库诊断核心：路径逃逸立即报错） */
function validatePathsInsideApp(
  options: Record<string, unknown>,
  appRoot: string,
  fs: typeof import('node:fs'),
  path: typeof import('node:path'),
): void {
  const checkModule = (field: string, value: unknown) => {
    if (typeof value !== 'string' || value.trim() === '') return
    if (/^(https?:)?\/\//.test(value) || path.isAbsolute(value)) {
      appConfigError(
        `${field} "${value}" 不是本项目内的模块路径`,
        'exposes/setup 的值是相对本应用根目录的源文件路径（URL/绝对路径无法在独立仓库间移植）',
        `改为相对路径，如 './src/views/Home.vue'（配置文件目录 = 应用根 ${appRoot}）`,
      )
    }
    const abs = path.resolve(appRoot, value)
    if (!fs.existsSync(abs)) {
      appConfigError(
        `${field} 指向的文件不存在：${value}`,
        `按应用根 ${appRoot} 解析后未找到该文件`,
        `核对相对路径（以配置文件所在目录为基准）；文件被移动/删除时同步更新 ${field}`,
      )
    }
  }
  const exposes = options.exposes
  if (exposes !== undefined && (typeof exposes !== 'object' || exposes === null || Array.isArray(exposes))) {
    fieldError('exposes', exposes, 'Record<"./键", "./源文件">', `exposes: { './pages/home': './src/views/Home.vue' }`)
  }
  for (const target of Object.values(exposes ?? {})) {
    checkModule('exposes 条目', typeof target === 'string' ? target : (target as { import?: unknown })?.import)
  }
  checkModule('setup', options.setup)
}

/**
 * 解析配置内对本包的运行时导入（defineRepoConfig 等聚合兼容形态需要）。
 * 顺序：用户工程安装的本包（createRequire(configPath)，pnpm 严格布局正确）→
 * 本 CLI 自身（包自引用；dist 内运行时 = 已安装包形态）。
 */
function resolveSelfEntry(configPath: string, spec: string): string | undefined {
  const tries = [(): string => createRequire(configPath).resolve(spec), (): string => createRequire(import.meta.url).resolve(spec)]
  for (const t of tries) {
    try {
      return t()
    } catch {
      /* 下一候选 */
    }
  }
  return undefined
}

/** 从指定基准解析模块（返回文件路径，供 createRequire 二次解析用） */
function resolveSpec(spec: string, from: string): string | undefined {
  try {
    return createRequire(from).resolve(spec)
  } catch {
    return undefined
  }
}

/** esbuild 定位——pnpm 严格布局下 esbuild 是 vite 的传递依赖，直连失败时经 vite 间接解析 */
function resolveEsbuild(configPath: string): typeof import('esbuild') {
  const esbuildOf = (base: string): typeof import('esbuild') | undefined => {
    const direct = resolveSpec('esbuild', base)
    if (direct) return createRequire(direct)('esbuild') as typeof import('esbuild')
    // 经 vite（其 dependencies 必含 esbuild，pnpm 下从 vite 自身文件起解析可见）
    const viteEntry = resolveSpec('vite', base)
    if (viteEntry) {
      const viaVite = resolveSpec('esbuild', viteEntry)
      if (viaVite) return createRequire(viaVite)('esbuild') as typeof import('esbuild')
    }
    return undefined
  }
  for (const base of [configPath, import.meta.url]) {
    const got = esbuildOf(base)
    if (got) return got
  }
  appConfigError(
    '无法加载 esbuild（单项目配置加载需要它转译 TS 与相对导入）',
    '配置工程（含其 vite 依赖树）与 CLI 依赖树中都解析不到 esbuild',
    '项目内有 vite 依赖即可（经其依赖树解析）；确实缺失时 npm i -D esbuild 后重试',
  )
}

/**
 * 加载 fulgurjs.config.ts/js/json（单项目契约默认形态 + 旧聚合配置自动识别）。
 * 相对导入以原配置文件为解析基准（esbuild bundle），Node 18 兼容。
 */
export async function loadAppConfig(configPath: string): Promise<AppConfigLoadResult> {
  const fs = await import('node:fs')
  const os = await import('node:os')
  const path = await import('node:path')
  const abs = path.resolve(configPath)
  if (!fs.existsSync(abs)) {
    appConfigError(
      `配置文件不存在：${abs}`,
      '--config 指向的路径在本机不存在（相对路径以 CLI 进程 cwd 解析）',
      '核对路径；从应用根目录运行时直接用 fulgurjs.config.ts',
    )
  }

  if (abs.endsWith('.json')) {
    const parsed = JSON.parse(fs.readFileSync(abs, 'utf8')) as Record<string, unknown>
    if (isAggregateShape(parsed)) {
      const repo = await loadRepoConfig(abs)
      return { kind: 'repo', configPath: abs, appRoot: path.dirname(abs), repo }
    }
    return finishAppShape(parsed, {}, abs, path.dirname(abs), fs, path)
  }

  // esbuild bundle：相对导入按原配置路径解析进 bundle；本包导入重定向到用户工程安装的入口
  // （插件仅异步 API 支持——buildSync 会直接拒绝 plugins）
  const esbuild = resolveEsbuild(abs)
  const selfRedirect = {
    name: 'fulgurjs-self-redirect',
    setup(build: import('esbuild').PluginBuild) {
      build.onResolve({ filter: /^@fulgurjs\/federation(\/|$)/ }, (args) => {
        const resolved = resolveSelfEntry(abs, args.path)
        if (!resolved) {
          return { errors: [{ text: `cannot resolve "${args.path}" from the config project or the CLI itself` }] }
        }
        return { path: resolved }
      })
    },
  }
  const out = await esbuild.build({
    entryPoints: [abs],
    bundle: true,
    write: false,
    format: 'esm',
    target: 'node18',
    platform: 'node',
    plugins: [selfRedirect],
    logLevel: 'silent',
  })
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fulgurjs-appcfg-'))
  try {
    const bundleFile = path.join(tmpDir, 'fulgurjs.config.bundle.mjs')
    fs.writeFileSync(bundleFile, out.outputFiles[0].text)
    const mod = (await import(`${pathToFileURL(bundleFile).href}?t=${Date.now()}`)) as {
      default?: unknown
      hostPages?: unknown
    }
    if (isAggregateShape(mod.default)) {
      // 兼容形态：统一走既有聚合校验语义（root/apps/角色必填）
      const repo = await loadRepoConfig(abs)
      return { kind: 'repo', configPath: abs, appRoot: path.dirname(abs), repo }
    }
    return finishAppShape(mod.default, { hostPages: mod.hostPages }, abs, path.dirname(abs), fs, path)
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
}

/** 单项目形状收尾：默认导出校验 + hostPages 校验 + 路径逃逸检查 */
function finishAppShape(
  def: unknown,
  named: { hostPages?: unknown },
  configPath: string,
  appRoot: string,
  fs: typeof import('node:fs'),
  path: typeof import('node:path'),
): AppConfigLoadResult {
  if (def === undefined || def === null) {
    appConfigError(
      'fulgurjs.config.ts 没有可用的默认导出',
      '单项目契约：默认导出直接是 federation() 选项对象（satisfies FederationOptions）',
      `export default { name: 'my-app', ... } satisfies FederationOptions`,
    )
  }
  if (typeof def !== 'object' || Array.isArray(def)) {
    fieldError('默认导出', def, '对象（federation() 选项）', `export default { name: 'my-app', exposes: { /* … */ } } satisfies FederationOptions`)
  }
  const options = def as Record<string, unknown>
  validateAppOptions(options)
  validatePathsInsideApp(options, appRoot, fs, path)
  const hostPages = named.hostPages !== undefined ? validateHostPages(named.hostPages) : undefined
  return {
    kind: 'app',
    configPath,
    appRoot,
    options: options as unknown as FederationOptions,
    hostPages,
  }
}

/** 单项目/聚合形态通用的角色判定（按实际 federation 选项，不要求人为写 host 字段） */
export function roleOfOptions(options: FederationOptions): 'host' | 'remote' | 'dual' {
  const hasRemotes = Object.keys(options.remotes ?? {}).length > 0
  const hasProvides = Object.keys(options.exposes ?? {}).length > 0 || !!options.setup
  if (hasRemotes && hasProvides) return 'dual'
  return hasRemotes ? 'host' : 'remote'
}
