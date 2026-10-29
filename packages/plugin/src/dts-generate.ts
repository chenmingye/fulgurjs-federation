/**
 * 提供方声明 bundle 生成（6.5.0 远程类型自动生成）。
 *
 * 从 exposes 出发建立声明闭包并产出可分发 bundle（协议见 dts-shared）：
 * - 纯 TS/TSX：TypeScript 编译器 API（createProgram + declaration emit）；
 * - 含 .vue（入口或工程内）：提供方官方Vue Program，能力不可用时回退vue-tsc CLI；
 * - 重写 pass：源码 alias（tsconfig paths）与相对导入 → bundle 内相对路径；
 *   裸包名保留并登记 externals（宿主自行解析，不复制 node_modules）；
 * - 闭包内编译错误 → 拒绝产出（ok:false + 诊断），绝不发布标记成功的残缺资源。
 *
 * 编译工具（typescript/vue-tsc）从**提供方工程**解析（createRequire(root)），
 * 不依赖插件包自身 devDependencies 或父目录 node_modules；缺失时给出当前包
 * 管理器的安装命令。本模块只在 Node 侧运行，产物不进入浏览器运行时。
 */
import fs from 'node:fs'
import { realPath } from './dts-realpath'
import { typeInputBytes } from './dts-input-hash'
import type { VueCompilerSession } from './dts-vue-session'
import path from 'node:path'
import { formatDeclarationDiagnostics } from './dts-diagnostics'
import { genVueDeclarationProgram } from './dts-vue-program'
import { createContractProjection } from './dts-contract'
import crypto from 'node:crypto'
import { createRequire } from 'node:module'
import { execFile } from 'node:child_process'
import { TYPES_SCHEMA_VERSION, type DtsBundleIndex } from './dts-shared'
import { nameVueDeclaration } from './dts-vue-display'
import { displayPublicDataTypes } from './dts-type-display'

export interface DtsGenerateExpose {
  /** './Button'（公开暴露；内部 setup 入口由调用方过滤，不进 bundle） */
  name: string
  /** 相对提供方根的源码路径（exposes.import） */
  import: string
}

export interface DtsGenerateInput {
  /** 提供方工程根（解析 tsconfig/编译工具/源码） */
  root: string
  exposes: DtsGenerateExpose[]
  pluginVersion: string
  /** 中止信号：vue-tsc 子进程立即 kill（独立CLI的TS API同步段仅边界检查） */
  signal?: AbortSignal
  /** dev 服务独占的临时缓存目录；同一服务串行复用，关闭后由服务删除，不进入类型包。 */
  incrementalDir?: string
  /** dev独占的内存编译会话；一次性CLI/build不传入。 */
  vueCompiler?: VueCompilerSession
  /** dev内部读取视图；结果必须先完成真实输入校验，无法校验时关闭此项重新生成。 */
  cacheCompilerReads?: boolean
  /** 开发期公开合同投影；未传仍完整实现诊断，build/CLI不启用。 */
  contractOnly?: boolean
  /** dev在读取全局声明前建立变更观察，及时取消已失效编译；build/CLI不使用。 */
  onAmbientInputs?: (files: string[]) => void
}

export interface DtsGenerateOk {
  ok: true
  /** bundle 内容（相对路径 → 文本）；index.json 是键 'index.json' */
  files: Map<string, string>
  index: DtsBundleIndex
  tool: 'typescript' | 'vue-tsc'
  /** 闭包内文件数（不含 index.json） */
  fileCount: number
  /** 非阻断提示（如默认堆 OOM 后提堆重试成功的过程说明）；无提示为空数组 */
  notices: string[]
  /** dev隔离编译进程的实际输入记录；仅在独占临时目录内使用，不进入公开类型资源。 */
  cacheTraceFile?: string
  /** 本结果使用了当轮读取视图，服务未验证输入前不能发布。 */
  requiresInputValidation?: boolean
  /** FG_DTS_TIMINGS=1 时的分阶段耗时（毫秒，父进程与编译子进程各一组）；默认不采集。 */
  timings?: { parent: Record<string, number>; child?: Record<string, number> }
  /** 开启计时时记录实际程序规模，不与毫秒值混用。 */
  graph?: { programFiles: number; checkedFiles: number; projectedFiles: number; declarationFiles?: number; vueFiles?: number }
}

export interface DtsGenerateFail {
  ok: false
  /** 失败编译也可留下输入记录，用于校验诊断和监听外部依赖修复；绝不缓存失败声明。 */
  cacheTraceFile?: string
  requiresInputValidation?: boolean
  /** 诊断（人读；含工具缺失安装命令 / 闭包编译错误定位） */
  diagnostics: string[]
}

export type DtsGenerateResult = DtsGenerateOk | DtsGenerateFail

type TsModule = typeof import('typescript')

/** 从提供方工程解析指定包（typescript / vue-tsc）；npm 生态三种包管理器布局兼容 */
function resolveFromRoot(root: string, pkg: string): string | null {
  const req = createRequire(path.join(root, 'package.json'))
  let resolved: string | null = null
  for (const spec of [`${pkg}/package.json`, pkg]) {
    try {
      resolved = req.resolve(spec)
      break
    } catch { /* 尝试下一个形态 */ }
  }
  if (!resolved) return null
  // 裸名解析可能落在包内文件（如旧版 vue-tsc 的 main=out/index.js）——向上爬升找包根
  let dir = path.dirname(resolved)
  for (let i = 0; i < 5 && !fs.existsSync(path.join(dir, 'package.json')); i++) {
    const parent = path.dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
  return fs.existsSync(path.join(dir, 'package.json')) ? dir : null
}

function installHint(root: string, pkg: string): string {
  const pkgManager = (() => {
    if (fs.existsSync(path.join(root, 'pnpm-lock.yaml'))) return 'pnpm'
    if (fs.existsSync(path.join(root, 'yarn.lock'))) return 'yarn'
    return 'npm'
  })()
  const devFlag = pkgManager === 'pnpm' ? '-D' : '--save-dev'
  const run = pkgManager === 'npm' ? `npm install ${devFlag} ${pkg}` : `${pkgManager} add ${devFlag} ${pkg}`
  return `请在提供方工程安装 ${pkg}（${run}）；它是声明生成工具，不进入浏览器运行时。`
}

/**
 * rawOptions（子配置原文）缺失的继承键从 parsed options 补齐——tsconfig 的 extends
 * 链解析结果只在 parsed.options 里，直接序列化 rawOptions 会丢掉父级 paths/baseUrl/
 * typeRoots 等关键解析配置。只合并**非枚举**键（parsed 里枚举键是数值，序列化会给
 * vue-tsc 报 TS5023/5024）；rawOptions 显式声明的键永远优先。
 */
const INHERITABLE_KEYS = [
  'paths', 'baseUrl', 'typeRoots', 'types', 'lib', 'rootDirs',
  'allowImportingTsExtensions', 'useDefineForClassFields', 'esModuleInterop',
  'allowSyntheticDefaultImports', 'allowJs', 'checkJs', 'skipLibCheck', 'strict',
  'experimentalDecorators', 'emitDecoratorMetadata', 'verbatimModuleSyntax',
  'isolatedModules', 'resolveJsonModule', 'jsxImportSource', 'allowUmdGlobalAccess',
] as const

function rawOptionsWithInherited(ctx: TsConfigContext): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...ctx.rawOptions }
  for (const key of INHERITABLE_KEYS) {
    if (merged[key] === undefined && ctx.compilerOptions[key] !== undefined) {
      merged[key] = ctx.compilerOptions[key]
    }
  }
  return merged
}

/**
 * 入口静态导入闭包（BFS）：沿 import/export 语句与 import() 之外的静态说明符解析。
 * 动态 import() 不入闭包（只是类型边）；.vue 说明符经 resolver 解析不到时按相对路径
 * 兜底（ts.resolveModuleName 不认 SFC）。入口本身恒在闭包内。
 */
function computeStaticClosure(
  ts: TsModule,
  entryFiles: string[],
  resolver: (spec: string, from: string) => { resolved: string; fromNodeModules: boolean } | null,
  root: string,
  readFile: (file: string) => string | undefined = file => fs.readFileSync(file, 'utf8'),
): Set<string> {
  const closure = new Set<string>()
  const queue = [...entryFiles]
  while (queue.length > 0) {
    const file = queue.pop()!
    if (closure.has(file)) continue
    closure.add(file)
    let text: string
    try {
      const source = readFile(file)
      if (source === undefined) continue
      text = source
    } catch {
      continue
    }
    if (file.endsWith('.vue')) {
      // SFC 的脚本依赖必须通过 Vue 解析器读取，不能把整个模板当作 TypeScript。
      const req = createRequire(path.join(root, 'package.json'))
      const { parse } = req('vue/compiler-sfc') as { parse(source: string): { descriptor: { script?: { content: string; src?: string }; scriptSetup?: { content: string; src?: string } } } }
      const { descriptor } = parse(text)
      text = [descriptor.script?.content, descriptor.scriptSetup?.content].filter(Boolean).join('\n')
      if (descriptor.script?.src) text += `\nimport ${JSON.stringify(descriptor.script.src)}`
    }
    // 这里只读取导入/导出与类型引用，不使用祖先信息；无需为整棵扫描AST建立parent指针。
    const sfile = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, false)
    const imports: string[] = sfile.referencedFiles.map(ref => ref.fileName)
    const visitType = (node: import('typescript').Node): void => {
      if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) imports.push(node.argument.literal.text)
      ts.forEachChild(node, visitType)
    }
    visitType(sfile)
    for (const stmt of sfile.statements) {
      const specNode: import('typescript').StringLiteral | null =
        ((ts.isImportDeclaration(stmt) || ts.isExportDeclaration(stmt)) && stmt.moduleSpecifier && ts.isStringLiteral(stmt.moduleSpecifier))
          ? stmt.moduleSpecifier
          : (ts.isImportEqualsDeclaration(stmt) && ts.isExternalModuleReference(stmt.moduleReference) && ts.isStringLiteral(stmt.moduleReference.expression))
            ? stmt.moduleReference.expression
            : null
      if (specNode) imports.push(specNode.text)
    }
    for (const spec of imports) {
      const r = resolver(spec, file)
      let resolved = r && !r.fromNodeModules ? r.resolved : null
      if (!resolved) {
        // .vue / 非常规扩展：相对路径兜底（SFC 不在 TS 解析面内）
        const base = path.resolve(path.dirname(file), spec)
        for (const c of [base, `${base}.vue`, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]) {
          if (fs.existsSync(c)) { resolved = c; break }
        }
      }
      if (resolved && !resolved.includes(`${path.sep}node_modules${path.sep}`)) {
        queue.push(path.resolve(resolved))
      }
    }
  }
  void root
  return closure
}

/** 从编译器 stdout 解析出错文件集合（file(line,col): error TSxxxx；相对路径按 root 归一） */
function parseErrorFiles(stdout: string, root: string): Set<string> {
  const out = new Set<string>()
  for (const line of stdout.split('\n')) {
    const m = line.match(/^([^)(]+)\((\d+),(\d+)\): error TS/)
    if (m) out.add(path.resolve(root, m[1]!.trim()))
  }
  return out
}

/**
 * 解析 compilerOptions.types 条目为具体 .d.ts 文件（相对路径/包子路径），并从
 * baseCo 中移除 types。条目形态两类：路径形态（相对 root 的 .d.ts / 目录）与包形态
 * （"vite/client" → node_modules/vite/client.d.ts）。解析失败的条目移除并记录诊断。
 */
function resolveTypesEntries(root: string, baseCo: Record<string, unknown>, diagnostics: string[]): string[] {
  const raw = baseCo.types
  if (raw === undefined) return []
  baseCo.types = []
  if (!Array.isArray(raw)) return []
  const req = createRequire(path.join(root, 'package.json'))
  const out: string[] = []
  for (const entry of raw) {
    if (typeof entry !== 'string' || entry.length === 0) continue
    const direct = [path.resolve(root, `${entry}.d.ts`), path.resolve(root, entry, 'index.d.ts'), path.resolve(root, 'node_modules', `${entry}.d.ts`), path.resolve(root, 'node_modules', entry, 'index.d.ts'), path.resolve(root, 'node_modules/@types', entry, 'index.d.ts')]
    let hit = direct.find((c) => fs.existsSync(c))
    if (!hit && !entry.startsWith('.') && !path.isAbsolute(entry)) {
      try {
        const r = req.resolve(entry)
        for (const c of [r.replace(/\.js$/, '.d.ts'), `${r}.d.ts`, r]) {
          if (c.endsWith('.d.ts') && fs.existsSync(c)) { hit = c; break }
        }
      } catch { /* 包形态解析失败 → 丢弃并记录 */ }
    }
    if (hit) out.push(hit)
    else diagnostics.push(`compilerOptions.types 条目 "${entry}" 无法解析为类型文件，已从声明生成程序中排除（不影响应用构建）。`)
  }
  return out
}

/** 源码树里是否存在 .vue（有界扫描：src/ 优先，最多 2000 文件；找不到 src 扫根下一层） */
function hasVueFilesUnderSources(root: string): boolean {
  const scan = (dir: string, budget: { left: number }): boolean => {
    if (budget.left <= 0) return false
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return false
    }
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name === '.git' || e.name === 'dist') continue
      const p = path.join(dir, e.name)
      budget.left -= 1
      if (e.isFile() && e.name.endsWith('.vue')) return true
      if (e.isDirectory() && scan(p, budget)) return true
    }
    return false
  }
  const srcDir = path.join(root, 'src')
  return scan(fs.existsSync(srcDir) ? srcDir : root, { left: 2000 })
}

/** 工程文件公共目录（bundle 布局的 rootDir；避免只用 entries 时目录塌缩） */
function commonDirOf(files: string[]): string {
  if (files.length === 0) return ''
  let dir = path.dirname(files[0]!)
  for (const f of files) {
    const rel = path.relative(dir, f)
    if (rel.startsWith('..')) {
      const parts = path.dirname(f).split(path.sep)
      const cur = dir.split(path.sep)
      let i = 0
      while (i < parts.length && i < cur.length && parts[i] === cur[i]) i++
      dir = parts.slice(0, i).join(path.sep) || path.sep
    }
  }
  return dir
}

interface TsConfigContext {
  ts: TsModule
  compilerOptions: import('typescript').CompilerOptions
  /** tsconfig 文件里的**原始** compilerOptions JSON——vue-tsc 临时配置必须写它：
   * 解析后的 parsed.options 含枚举数值（target: 99）与内部键（pathsBasePath），直接
   * 序列化会让 vue-tsc 报 TS5023/TS5024（原型外实测）。 */
  rawOptions: Record<string, unknown>
  /** 工程全部输入文件（绝对路径，非 .d.ts）——rootDir 与 vue 需求判定用 */
  projectFiles: string[]
  /** 工程自身的 ambient 声明输入（.d.ts，绝对路径）——Jeecg 系工程的全局类型
   * （Recordable/auto-imports 等）都在这里；声明闭包程序必须含它们，
   * 否则声明 emit 报 TS40xx private name（MESZC bpm 实测） */
  ambientInputs: string[]
  tsconfigFile: string | null
}

/** 读取并解析工程 tsconfig（无 tsconfig 时合成最小默认——JS/JSDoc 暴露项场景） */
function loadTsContext(root: string, ts: TsModule, diagnostics: string[], readFile = ts.sys.readFile, observedHost: Partial<import('typescript').ModuleResolutionHost> = {}): TsConfigContext | null {
  const tsconfigFile = ts.findConfigFile(root, observedHost.fileExists ?? ts.sys.fileExists, 'tsconfig.json')
  if (!tsconfigFile) {
    const defaults = {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'bundler',
      strict: false,
      allowJs: true,
      checkJs: false,
      esModuleInterop: true,
      skipLibCheck: true,
    }
    return {
      ts,
      rawOptions: defaults,
      ambientInputs: [],
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        strict: false,
        allowJs: true,
        checkJs: false,
        esModuleInterop: true,
        skipLibCheck: true,
      },
      projectFiles: [],
      tsconfigFile: null,
    }
  }
  const raw = ts.readConfigFile(tsconfigFile, readFile)
  if (raw.error) {
    diagnostics.push(`tsconfig 解析失败（${tsconfigFile}）：${ts.flattenDiagnosticMessageText(raw.error.messageText, ' ')}`)
    return null
  }
  // 原生 TS 的目录扫描不认识 .vue。纯 SFC 工程不能被误判为 TS18003「没有输入」；
  // 这里只登记扩展名，具体 SFC 解析和声明检查仍由提供方 vue-tsc 完成。
  const parsed = ts.parseJsonConfigFileContent(raw.config, { ...ts.sys, ...observedHost, readFile, useCaseSensitiveFileNames: ts.sys.useCaseSensitiveFileNames }, path.dirname(tsconfigFile), undefined, undefined, undefined, [
    { extension: '.vue', isMixedContent: true, scriptKind: ts.ScriptKind.Deferred },
  ])
  const co: import('typescript').CompilerOptions = { ...parsed.options }
  if (typeof co.baseUrl === 'string' && !path.isAbsolute(co.baseUrl)) {
    co.baseUrl = path.resolve(path.dirname(tsconfigFile), co.baseUrl)
  }
  if (parsed.errors.length > 0) {
    const fatal = parsed.errors.filter((e) => e.category === ts.DiagnosticCategory.Error)
    if (fatal.length > 0) {
      diagnostics.push(
        `tsconfig 存在解析错误（${tsconfigFile}）：` +
        fatal.slice(0, 5).map((e) => ts.flattenDiagnosticMessageText(e.messageText, ' ')).join('；'),
      )
      return null
    }
  }
  return {
    ts,
    compilerOptions: co,
    rawOptions: (raw.config.compilerOptions ?? {}) as Record<string, unknown>,
    projectFiles: parsed.fileNames.filter((f) => !f.endsWith('.d.ts')),
    ambientInputs: parsed.fileNames.filter((f) => f.endsWith('.d.ts') && !f.includes(`${path.sep}node_modules${path.sep}`)),
    tsconfigFile,
  }
}

/** 解析入口/依赖说明符到绝对源文件（paths alias / 相对 / node_modules 都走 TS 语义） */
function makeResolver(ts: TsModule, co: Record<string, unknown>, readFile = ts.sys.readFile, observedHost: Partial<import('typescript').ModuleResolutionHost> = {}, root = ts.sys.getCurrentDirectory()) {
  const cache = ts.createModuleResolutionCache(root, file => ts.sys.useCaseSensitiveFileNames ? file : file.toLowerCase(), co as import('typescript').CompilerOptions)
  return (spec: string, fromFile: string): { resolved: string; fromNodeModules: boolean } | null => {
    const exists = observedHost.fileExists ?? ts.sys.fileExists
    const host = { ...ts.sys, ...observedHost, readFile, fileExists: (file: string) => exists(file) || (file.endsWith('.vue.ts') && exists(file.slice(0, -3))) }
    const r = ts.resolveModuleName(spec, fromFile, co as never, host, cache)
    let resolved = r.resolvedModule?.resolvedFileName
    if (resolved?.endsWith('.vue.ts') && ts.sys.fileExists(resolved.slice(0, -3))) resolved = resolved.slice(0, -3)
    if (!resolved) return null
    return { resolved, fromNodeModules: resolved.includes(`${path.sep}node_modules${path.sep}`) }
  }
}

/**
 * 生成声明 bundle。所有失败都走 ok:false + diagnostics（人读文案含修法）；
 * 成功产出 index.json + files/*.d.ts（in-memory Map，由调用方决定落盘/服务/打包）。
 */
export async function generateTypesBundle(input: DtsGenerateInput): Promise<DtsGenerateResult> {
  const projection = { used: false, diagnosticFailure: false }
  const result = await generateTypesBundleOnce(input, projection)
  if (result.ok || !input.contractOnly || !projection.used || !projection.diagnosticFailure || input.signal?.aborted) return result
  // 投影不适用于某种工具/语法时由原编译器裁决，不能发布近似合同。
  const fallback = await generateTypesBundleOnce({ ...input, contractOnly: false })
  if (fallback.ok) {
    fallback.notices.push('公开合同快速路径未能完成检查，已使用完整源码路径生成精确声明。')
    if (process.env.FG_DTS_TIMINGS) fallback.notices.push(`快速路径诊断：${result.diagnostics.join('\n').slice(0, 1500)}`)
  } else fallback.diagnostics.unshift('公开合同投影检查未完成，已用完整源码重试；以下为完整路径诊断：')
  return fallback
}

async function generateTypesBundleOnce(input: DtsGenerateInput, projection = { used: false, diagnosticFailure: false }): Promise<DtsGenerateResult> {
  const generationStarted = Date.now()
  const timingsEnabled = !!process.env.FG_DTS_TIMINGS
  const timingStart = performance.now()
  const timings: Record<string, number> = {}
  const mark = (label: string): void => {
    if (timingsEnabled) timings[label] = Math.round(performance.now() - timingStart)
  }
  const { root, exposes, pluginVersion, signal } = input
  const diagnostics: string[] = []
  if (exposes.length === 0) {
    return { ok: false, diagnostics: ['没有公开 exposes，无需生成类型资源。'] }
  }

  const tsPkgDir = resolveFromRoot(root, 'typescript')
  if (!tsPkgDir) {
    return { ok: false, diagnostics: [`提供方工程未安装 typescript（声明生成必需）。${installHint(root, 'typescript')}`] }
  }
  const tsReq = createRequire(path.join(tsPkgDir, 'package.json'))
  const ts = tsReq('typescript') as TsModule
  let parseVue: ((text: string) => unknown) | undefined
  let projectionAllowed = true
  if (input.contractOnly) {
    let resolvedVueTool = false
    try {
      const provider = createRequire(path.join(root, 'package.json'))
      const tool = createRequire(provider.resolve('vue-tsc'))
      resolvedVueTool = true
      const core = tool('@vue/language-core')
      const config = ts.findConfigFile(root, ts.sys.fileExists)
      const rawVueOptions = config ? core.createParsedCommandLine(ts, ts.sys, config).vueOptions : undefined
      const options = rawVueOptions && typeof core.resolveVueCompilerOptions === 'function'
        ? core.resolveVueCompilerOptions(rawVueOptions) : rawVueOptions
      const special = options && (options.lib !== 'vue' || options.plugins?.length || options.hooks?.length
        || Object.keys(options).some(key => /^infer(?:Component|Template)Dollar/.test(key) && options[key])
        || options.fallthroughAttributes || options.vapor || options.jsxSlots || options.resolveStyleImports
        || options.experimentalAdditionalLanguageModules?.length || options.experimentalDefinePropProposal
        || JSON.stringify(options.optionsWrapper) !== JSON.stringify(["(await import('vue')).defineComponent(", ')'])
        || Object.entries(options.macros ?? {}).some(([name, aliases]) => JSON.stringify(aliases) !== JSON.stringify([name])))
      if (!special) parseVue = provider('vue/compiler-sfc').parse
      else projectionAllowed = false
    } catch { if (resolvedVueTool) projectionAllowed = false /* 旧版/自定义工具不投影；纯TS无需Vue */ }
  }
  const projectContract = input.contractOnly && projectionAllowed ? createContractProjection(ts, parseVue) : undefined
  const contractSources: Record<string, string> = {}
  const parentInputs: Record<string, { hash: string; size: number; mtime: number; ctime: number; ino: number }> = {}
  let parentChanged = false
  const parentQueries: Record<string, Record<string, boolean>> = {}
  const parentProbes: Record<string, boolean> = {}
  const parentLinks: Record<string, string> = {}
  const parentDirectories: Array<{ kind: 'dirs'; root: string; nodePackages: true; result: string[] }> = []
  const observedHost: Partial<import('typescript').ModuleResolutionHost> = {
    fileExists(file) {
      const exists = ts.sys.fileExists(file)
      ;(parentQueries[path.dirname(path.resolve(file))] ??= {})[path.basename(file)] = exists
      return exists
    },
    directoryExists(directory) { const exists = ts.sys.directoryExists(directory); parentProbes[`d:${path.resolve(directory)}`] = exists; return exists },
    realpath(file) { const resolved = ts.sys.realpath?.(file) ?? file; parentLinks[path.resolve(file)] = resolved; return resolved },
  }
  const readGenerationFile = (file: string): string | undefined => {
    try {
      const before = fs.statSync(file)
      const text = ts.sys.readFile(file)
      if (text === undefined) return undefined
      const bytes = fs.readFileSync(file)
      const after = fs.statSync(file)
      const value = { hash: crypto.createHash('sha256').update(typeInputBytes(file,bytes)).digest('hex'), size: after.size, mtime: after.mtimeMs, ctime: after.ctimeMs, ino: after.ino }
      const previous = parentInputs[path.resolve(file)]
      if (before.ctimeMs !== after.ctimeMs || before.mtimeMs !== after.mtimeMs || before.ino !== after.ino || before.size !== after.size
        || (previous && JSON.stringify(previous) !== JSON.stringify(value))) parentChanged = true
      parentInputs[path.resolve(file)] = value
      const projected = projectContract?.(file, text) ?? text
      if (projected !== text) { contractSources[path.resolve(file)] = projected; projection.used = true }
      return projected
    } catch { return undefined }
  }
  for (let directory = root;; directory = path.dirname(directory)) {
    for (const name of ['package.json', 'package-lock.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'yarn.lock', 'bun.lock', 'bun.lockb']) { const file = path.join(directory, name); observedHost.fileExists!(file); readGenerationFile(file) }
    const modules = path.join(directory, 'node_modules')
    const list = (folder: string): string[] => {
      const exists = observedHost.directoryExists!(folder)
      if (!exists) return []
      const names = ts.sys.getDirectories(folder).filter(name => !path.basename(name).startsWith('.')).sort()
      parentDirectories.push({ kind: 'dirs', root: folder, nodePackages: true, result: names })
      for (const name of names) { const file = path.resolve(folder, name); try { if (fs.lstatSync(file).isSymbolicLink()) parentLinks[file] = realPath(file) } catch { /* 真实变化由后续观察拒绝 */ } }
      return names
    }
    for (const name of list(modules)) if (path.basename(name).startsWith('@')) list(path.resolve(modules, name))
    if (path.dirname(directory) === directory) break
  }
  const ctx = loadTsContext(root, ts, diagnostics, readGenerationFile, observedHost)
  if (!ctx) return { ok: false, diagnostics }
  input.onAmbientInputs?.(ctx.ambientInputs)
  mark('config')

  // 入口解析：exposes.import 相对 root；alias 形态（@/x）经 TS resolver 解析
  const resolver = makeResolver(ts, ctx.compilerOptions, readGenerationFile, observedHost, root)
  const entryMap = new Map<string, string>() // expose 名 → 绝对源文件
  for (const expose of exposes) {
    const raw = expose.import.replace(/^\.?\//, '')
    let abs = path.resolve(root, raw)
    if (!fs.existsSync(abs)) {
      const viaResolver = resolver(expose.import, path.join(root, 'package.json'))
      if (viaResolver && !viaResolver.fromNodeModules) abs = viaResolver.resolved
    }
    abs = abs.replace(/\.js$/, '.ts')
    if (!fs.existsSync(abs) && fs.existsSync(`${abs}.ts`)) abs = `${abs}.ts`
    if (!fs.existsSync(abs) && fs.existsSync(`${abs}.tsx`)) abs = `${abs}.tsx`
    if (!fs.existsSync(abs)) {
      diagnostics.push(`暴露入口 ${expose.name} 的源文件不存在（${expose.import}）。请核对 exposes 配置。`)
      continue
    }
    entryMap.set(expose.name, abs)
  }
  if (entryMap.size === 0) return { ok: false, diagnostics }
  const entryFiles = [...entryMap.values()]

  // .vue 需求判定：入口是 .vue，或工程内存在 .vue（入口可能传递依赖 SFC——TS 的
  // 目录枚举只收 TS 扩展名，parsed.fileNames 看不到 .vue，必须实际扫文件系统）
  const needsVueTsc =
    entryFiles.some((f) => f.endsWith('.vue')) ||
    ctx.projectFiles.some((f) => f.endsWith('.vue')) ||
    hasVueFilesUnderSources(root)

  // rootDir：全工程文件公共目录（空时退到入口公共目录）
  const closure = computeStaticClosure(ts, entryFiles, resolver, root, readGenerationFile)
  mark('closure')
  const rootDir = commonDirOf([...ctx.projectFiles, ...closure])
  if (!rootDir) return { ok: false, diagnostics: ['无法确定声明输出根目录（rootDir）。请检查工程 tsconfig 的 include。'] }

  const emitted = new Map<string, string>() // 绝对源文件 → 声明文本
  let tool: 'typescript' | 'vue-tsc' = 'typescript'
  let cacheTraceFile: string | undefined
  let requiresInputValidation = false
  let childTimings: Record<string, number> | undefined
  let graph: DtsGenerateOk['graph']

  // 入口**静态**导入闭包：诊断门禁与产物范围都限定在它——动态导入（如桥接契约的
  // 装配模块）只是类型边，其文件的存量业务错误与公开声明面无关，不进闭包也不阻断
  // 生成（设计合同：「与 exposed 声明依赖无关的业务错误不要被偷换成类型生成失败」）。

  if (needsVueTsc || input.vueCompiler) {
    const vueTscDir = needsVueTsc ? resolveFromRoot(root, 'vue-tsc') : tsPkgDir
    if (!vueTscDir) {
      return {
        ok: false,
        diagnostics: [
          `工程包含 .vue 暴露项，声明生成需要 vue-tsc。${installHint(root, 'vue-tsc')}`,
          '（纯 TS/React 工程不需要 vue-tsc；它只用于 SFC 的声明生成，不进入浏览器运行时。）',
        ],
      }
    }
    tool = needsVueTsc ? 'vue-tsc' : 'typescript'
    const vueTscPkg = JSON.parse(readGenerationFile(path.join(vueTscDir, 'package.json'))!) as {
      version: string
      bin: Record<string, string>
    }
    const binRel = needsVueTsc ? (vueTscPkg.bin?.['vue-tsc'] ?? vueTscPkg.bin?.['vue-tsc.js'] ?? 'bin/vue-tsc.js') : 'lib/typescript.js'
    const binPath = path.resolve(vueTscDir, binRel)
    // Vue工具链公开Program能力可用时只检查/emit暴露闭包；不检查无关动态装配页面。
    // 旧createProgram或现代Volar公开代理均使用提供方的工具；能力不可用仍回到CLI。
    const scopedVueProgram = (() => {
      if (!needsVueTsc) return true
      if (/^1\./.test(vueTscPkg.version)) return true
      try {
        const req = createRequire(path.join(vueTscDir, 'package.json'))
        const volar = req('@volar/typescript') as { proxyCreateProgram?: unknown }
        const core = req('@vue/language-core') as { createParsedCommandLine?: unknown; createVueLanguagePlugin?: unknown }
        return typeof ts.createProgram === 'function' && typeof volar.proxyCreateProgram === 'function' && typeof core.createParsedCommandLine === 'function'
          && typeof core.createVueLanguagePlugin === 'function'
      } catch { return false }
    })()
    if (!fs.existsSync(binPath)) {
      return { ok: false, diagnostics: [`${tool} 入口不存在（${binPath}）。请重新安装 ${tool}。`] }
    }
    // 临时配置不能出现在Vite/自动组件工具扫描的工程根；路径统一按原配置解析后
    // 写入缓存目录，真实源码与原tsconfig不变。
    // 同一进程内重启/重建可与上一轮取消后的清理重叠，PID不能作为唯一文件名。
    // 每次生成拥有独立配置，避免旧任务finally删除新任务仍在读取的配置。
    // dev 服务为自己的串行生成保留编译状态和 emit；不能让不同服务共享此目录，
    // 否则取消旧服务或同时构建会删除另一轮仍在使用的输出。一次性构建仍用独立临时目录。
    const cacheDir = input.incrementalDir
    if (cacheDir) fs.mkdirSync(cacheDir, { recursive: true })
    const configDir = cacheDir ?? fs.mkdtempSync(path.join(root, 'node_modules', '.fulgurjs-types-config-'))
    const tmpCfg = path.join(configDir, `.fulgurjs-types-tsconfig-${process.pid}-${crypto.randomUUID()}.json`)
    const outDir = cacheDir ? path.join(cacheDir, 'emit') : fs.mkdtempSync(path.join(root, 'node_modules', '.fulgurjs-types-emit-'))
    const clearOutput = (): void => { if (!cacheDir) fs.rmSync(outDir, { recursive: true, force: true }) }
    // Program路径不使用tsbuildinfo或旧emit；先清理，避免未重新emit的旧声明掩盖缺失依赖。
    if (cacheDir && scopedVueProgram) fs.rmSync(outDir, { recursive: true, force: true })
    const traceFile = cacheDir && scopedVueProgram ? path.join(cacheDir, 'inputs.json') : undefined
    requiresInputValidation = !!(traceFile && input.cacheCompilerReads)
    if (traceFile) fs.rmSync(traceFile, { force: true })
    const programInputFile = `${tmpCfg}.inputs.json`
    const baseCo: Record<string, unknown> = { ...rawOptionsWithInherited(ctx) }
    for (const key of ['baseUrl', 'rootDirs', 'typeRoots'] as const) {
      if (ctx.compilerOptions[key] !== undefined) baseCo[key] = ctx.compilerOptions[key]
    }
    if (ctx.compilerOptions.paths && !ctx.compilerOptions.baseUrl) {
      const pathsBase = (ctx.compilerOptions as import('typescript').CompilerOptions & { pathsBasePath?: string }).pathsBasePath
        ?? (ctx.tsconfigFile ? path.dirname(ctx.tsconfigFile) : root)
      baseCo.paths = Object.fromEntries(Object.entries(ctx.compilerOptions.paths).map(([name, values]) => [name, values.map(value => path.resolve(pathsBase, value))]))
    }
    // 投影视图擦除了真实用途，unused诊断在该视图中没有源代码含义；
    // 仅关闭这两项实现lint，原tsconfig及build/CLI的完整检查不变。
    if (input.contractOnly && projectionAllowed) { baseCo.noUnusedLocals = false; baseCo.noUnusedParameters = false }
    delete baseCo.noEmit
    delete baseCo.incremental
    delete baseCo.composite
    delete baseCo.tsBuildInfoFile
    delete baseCo.emitDeclarationOnly
    delete baseCo.declarationDir
    delete baseCo.extends
    // types 条目解析为显式根文件：显式 typeRoots 下 TS 的 types 条目只查 typeRoots
    // （"vite/client" 落不进 ./types → TS2688，MESZC bpm 实测）；自行按包解析出具体
    // .d.ts 并纳入 files，绕开解析歧义及 exclude 过滤；解析失败的条目丢弃（如实记录诊断）
    const resolvedTypeFiles = resolveTypesEntries(root, baseCo, diagnostics)

    fs.writeFileSync(tmpCfg, JSON.stringify({
      ...(ctx.tsconfigFile ? { extends: ctx.tsconfigFile } : {}),
      compilerOptions: {
        ...baseCo,
        noEmit: false,
        // 程序级文件（含动态导入的类型边）可能有存量业务错误——声明照常产出，
        // 由「入口静态闭包内的错误」做门禁（见 computeStaticClosure 注释）
        noEmitOnError: false,
        declaration: true,
        emitDeclarationOnly: true,
        declarationMap: false,
        sourceMap: false,
        outDir,
        rootDir,
        ...(cacheDir && !scopedVueProgram ? { incremental: true, tsBuildInfoFile: path.join(cacheDir, 'state.tsbuildinfo') } : {}),
      },
      // 显式 types 是声明程序的根文件，不能再受工程 exclude: ["node_modules"] 过滤。
      // include 仍受继承的 exclude 约束；files 保留 vite/client 等已解析的全局声明。
      files: [...new Set([...resolvedTypeFiles, ...entryFiles, ...ctx.ambientInputs])],
      include: [],
    }))
    // 大型闭包与输入记录不塞进argv，避免macOS ARG_MAX/Linux单参数长度上限。
    if (scopedVueProgram) fs.writeFileSync(programInputFile, JSON.stringify({
      closure: [...closure], entries: entryFiles, traceFile, ambientInputs: ctx.ambientInputs, started: generationStarted,
      cacheCompilerReads: requiresInputValidation, contractSources, contractOnly: !!input.contractOnly && projectionAllowed, projectVue: !!parseVue, vue: needsVueTsc,
      ...(traceFile ? { parentInputs: { files: parentInputs, changed: parentChanged, fileQueries: parentQueries, probes: parentProbes, links: parentLinks, directories: parentDirectories } } : {}),
    }))
    if (process.env.FG_DUMP_TSCFG) fs.writeFileSync(process.env.FG_DUMP_TSCFG, fs.readFileSync(tmpCfg, 'utf8'))
    /** 子进程形态的 OOM 识别：v8 崩溃横幅固定行首（FATAL ERROR: …heap…）。
     * 不能裸匹配子串——语法错误的回显会把含这些词的「源码文本」带进 stderr。 */
    const isOom = (text: string): boolean =>
      /(^|\n)\s*FATAL ERROR:.*(heap out of memory|Ineffective mark-compacts|Allocation failed)/i.test(text)
    /**
     * 系统级终止识别：进程被 OS/外部终止或 execFile 超时强杀时，stderr 没有
     * V8 横幅与 TS 诊断，只表现为「Command failed」。这类失败不是代码错误，
     * 诊断必须另立，否则会再次误导成「闭包内编译错误」。
     * 超时强杀（killed && SIGTERM）单独走超时分支（下）。
     */
    const isSystemKilled = (e: import('node:child_process').ExecFileException | null, out: string, errText: string): boolean =>
      !!e && (e.signal != null || /(^|\n)\s*(Killed|-9)\s*(:9)?\s*$/i.test(errText)) && !isOom(errText) && !/error TS\d+/i.test(out + '\n' + errText)
    /** execFile 超时强杀判定（t.killed 由 node 置位且 signal 为终止信号） */
    const isTimeoutKill = (e: import('node:child_process').ExecFileException | null): boolean =>
      !!e && e.killed === true && !/error TS\d+/i.test(String(e.message ?? ''))
    /**
     * 单次生成超时上限：默认 10 分钟；提堆重试（大堆需要更久）默认 30 分钟；
     * FG_DTS_TIMEOUT_MS 可覆盖两者。大型真实闭包在 8GB 堆下可运行 10 分钟以上，
     * 旧实现固定 10 分钟会在提堆重试阶段被超时强杀，被误判为编译错误/系统终止。
     */
    const timeoutFor = (raisedHeap: boolean): number => {
      const env = Number(process.env.FG_DTS_TIMEOUT_MS)
      if (Number.isFinite(env) && env > 0) return env
      return raisedHeap ? 30 * 60 * 1000 : 10 * 60 * 1000
    }
    try {
      /** 运行一次 vue-tsc；extraNodeArgs 为 node 与脚本间的 V8 参数（提堆重试用） */
      const attempt = (extraNodeArgs: string[]): Promise<{ err: import('node:child_process').ExecFileException | null; stdout: string; stderr: string }> => {
        if (input.vueCompiler && traceFile) {
          const request = { root, script: genVueDeclarationProgram(), args: [tmpCfg,programInputFile], nodeArgs: extraNodeArgs, timeout: timeoutFor(extraNodeArgs.length > 0), signal }
          return input.vueCompiler.run(request).then(result => {
            if (result.err?.code !== 'FG_COMPILER_TOOL_CHANGED') return result
            diagnostics.push('检测到编译工具代码变化，已重建隔离编译进程后重新检查。')
            return input.vueCompiler!.run(request)
          })
        }
        return new Promise((resolve) => {
          if (signal?.aborted) {
            resolve({ err: Object.assign(new Error('声明生成已取消'), { code: 'ABORT_ERR' }), stdout: '', stderr: '' })
            return
          }
          const child = execFile(
            process.execPath,
            [...extraNodeArgs, ...(scopedVueProgram
              ? ['--eval', genVueDeclarationProgram(), tmpCfg, programInputFile]
              : [binPath, '-p', tmpCfg, '--noErrorTruncation', '--pretty', 'false'])],
            { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: timeoutFor(extraNodeArgs.length > 0) },
            (err, stdout, stderr) => {
              signal?.removeEventListener('abort', abort)
              resolve({ err: err ?? null, stdout: String(stdout ?? ''), stderr: String(stderr ?? '') })
            },
          )
          const abort = (): void => { child.kill('SIGKILL') }
          signal?.addEventListener('abort', abort, { once: true })
          if (signal?.aborted) abort()
        })
      }
      // 已确认需要大堆的同一 dev 服务不再每轮先 OOM 一次。记录仅存在于独占缓存，
      // 不改变其他工程/一次性构建的内存设置，也不把机器相关信息写入公开类型资源。
      const heapMarker = cacheDir ? path.join(cacheDir, 'raised-heap') : undefined
      const raisedArgs = [`--max-old-space-size=${process.env.FG_DTS_MAX_OLD_SPACE ?? '8192'}`]
      const initialArgs = heapMarker && fs.existsSync(heapMarker) ? raisedArgs : []
      mark('before-compiler')
      let { err, stdout, stderr } = await attempt(initialArgs)
      if (/FG_DTS_CONTRACT [1-9]\d*/.test(stderr)) projection.used = true
      mark('compiler')
      // 服务关闭是主动取消，不能误走「系统强杀」重试，重新启动无人使用的编译器。
      if (signal?.aborted) {
        clearOutput()
        return { ok: false, diagnostics: [`${tool} 声明生成被中止（dev server 关闭）。`] }
      }
      // 默认堆 OOM：提堆重试一次（大型真实应用的闭包可达数 GB）。OOM 必须与
      // 「闭包内编译错误」区分诊断——OOM 的 stdout 没有可修的 TS 错误。
      if (err && isOom(stderr)) {
        const raised = process.env.FG_DTS_MAX_OLD_SPACE ?? '8192'
        if (initialArgs.length === 0) {
          diagnostics.push(`${tool} 声明生成在默认堆下内存不足（V8 OOM），以 --max-old-space-size=${raised}MB 重试。`)
          if (heapMarker) fs.writeFileSync(heapMarker, '')
          ;({ err, stdout, stderr } = await attempt([`--max-old-space-size=${raised}`]))
        }
        if (err && isOom(stderr)) {
          clearOutput()
          diagnostics.push(
            `${tool} 声明生成内存不足（提高堆后仍 OOM）——类型资源未产出。`,
            '修法：用环境变量 FG_DTS_MAX_OLD_SPACE 提高生成器堆（如 16384），或缩小暴露模块的静态依赖面后重试。',
          )
          return { ok: false, diagnostics }
        }
      }
      // 超时强杀：首次超时 → 提堆+更长上限重试；重试再超时 → 明确超时诊断
      if (err && isTimeoutKill(err) && !isOom(stderr)) {
        const raised = process.env.FG_DTS_MAX_OLD_SPACE ?? '8192'
        diagnostics.push(`${tool} 声明生成超过单次上限（${Math.round(timeoutFor(false) / 60000)} 分钟）被强杀，以提堆 + 更长上限重试。`)
        ;({ err, stdout, stderr } = await attempt([`--max-old-space-size=${raised}`]))
        if (err && isTimeoutKill(err) && !isOom(stderr) && !/error TS\d+/i.test(stdout + '\n' + stderr)) {
          clearOutput()
          diagnostics.push(
            `${tool} 声明生成再次超时（单次上限 ${Math.round(timeoutFor(true) / 60000)} 分钟）——类型资源未产出。`,
            '修法：用环境变量 FG_DTS_TIMEOUT_MS 提高上限（毫秒，如 3600000），或缩小暴露模块的静态依赖面。',
          )
          return { ok: false, diagnostics }
        }
      }
      // 系统级终止（无 V8 横幅、无 TS 诊断、非超时）：重试一次；仍被终止则给出环境修法
      if (err && isSystemKilled(err, stdout, stderr) && !isTimeoutKill(err)) {
        diagnostics.push(`${tool} 声明生成进程被系统终止（signal=${err.signal ?? 'Killed'}，无 TypeScript 诊断输出），重试一次。`)
        ;({ err, stdout, stderr } = await attempt([]))
        if (err && isSystemKilled(err, stdout, stderr) && !isTimeoutKill(err)) {
          clearOutput()
          diagnostics.push(
            `${tool} 声明生成进程再次被系统终止——类型资源未产出。`,
            '常见原因：机器内存压力下被 OS 终止（如同时运行多个大型声明生成/构建），或进程被外部 kill。',
            '修法：释放内存后重试（dev 会按源码变化自动重跑；也可 `fulgurjs types` 手动触发），或缩小暴露闭包。',
          )
          return { ok: false, diagnostics }
        }
      }
      if (err) {
        if (signal?.aborted) {
          diagnostics.push(`${tool} 声明生成被中止（dev server 关闭）。`)
          clearOutput()
          return { ok: false, diagnostics }
        }
        // 门禁 = 入口静态闭包内的错误（file(line,col): error TSxxxx 形态解析）；
        // 闭包外（动态导入类型边/无关业务文件）的错误如实丢弃，不偷换成生成失败
        const errFiles = parseErrorFiles(stdout, root)
        const closureErrs = new Set([...errFiles].filter((f) => closure.has(f)))
        const globalError = /(?:^|\n)(?:error )?TS\d+:/.test(stdout + '\n' + stderr)
        if (closureErrs.size > 0 || globalError || errFiles.size === 0) {
          projection.diagnosticFailure = true
          const tail = formatDeclarationDiagnostics(stdout, stderr, err.message, root, closure)
          diagnostics.push(`${tool} 声明生成失败（暴露闭包内存在编译错误）——类型资源未产出：\n${tail}`)
          clearOutput()
          return { ok: false, diagnostics,
            ...(requiresInputValidation ? { requiresInputValidation: true,
              ...(traceFile && fs.existsSync(traceFile) ? { cacheTraceFile: traceFile } : {}) } : {}),
          }
        }
        // 仅闭包外错误：声明 emit 已产出（noEmitOnError:false），继续
      }
      if (timingsEnabled) {
        const trace = /FG_DTS_TIMINGS (\{[^\n]*\})/.exec(`${stdout}\n${stderr}`)
        if (trace) {
          try { childTimings = JSON.parse(trace[1]!) as Record<string, number> } catch { /* 输出不是计时行 */ }
        }
        const size = /FG_DTS_GRAPH (\{[^\n]*\})/.exec(`${stdout}\n${stderr}`)
        if (size) { try { graph = JSON.parse(size[1]!) } catch { /* 非规模记录 */ } }
      }
    } catch (error) {
      diagnostics.push(`${tool} 隔离声明生成异常：${(error as Error).message}。请检查提供方配置和临时目录读写权限。`)
      clearOutput()
      fs.rmSync(tmpCfg, { force: true })
      fs.rmSync(programInputFile, { force: true })
      if (!cacheDir) fs.rmSync(configDir, { recursive: true, force: true })
      return { ok: false, diagnostics }
    } finally {
      fs.rmSync(tmpCfg, { force: true })
      fs.rmSync(programInputFile, { force: true })
      if (!cacheDir) fs.rmSync(configDir, { recursive: true, force: true })
    }
    if (traceFile && fs.existsSync(traceFile)) cacheTraceFile = traceFile
    collectEmitted(ts, outDir, rootDir, emitted, closure)
    clearOutput()
  } else {
    const outDir = fs.mkdtempSync(path.join(root, 'node_modules', '.fulgurjs-types-emit-'))
    try {
      const compilerOptions: import('typescript').CompilerOptions = {
        ...(ctx.compilerOptions as Record<string, never>),
        ...(input.contractOnly && projectionAllowed ? { noUnusedLocals: false, noUnusedParameters: false } : {}),
        noEmit: false,
        declaration: true,
        emitDeclarationOnly: true,
        declarationMap: false,
        sourceMap: false,
        incremental: false,
        composite: false,
        outDir,
        rootDir,
      }
      const host = ts.createCompilerHost(compilerOptions)
      const originalRead = host.readFile
      host.readFile = file => { const text = originalRead(file); return projectContract?.(file, text) ?? text }
      const program = ts.createProgram([...entryFiles, ...ctx.ambientInputs, ...resolveTypesEntries(root, ctx.rawOptions, [])], compilerOptions, host)
      if (timingsEnabled) graph = { programFiles: program.getSourceFiles().length,
        checkedFiles: program.getSourceFiles().filter(source => closure.has(path.resolve(source.fileName))).length,
        projectedFiles: Object.keys(contractSources).length }
      const errs = [
        ...program.getSyntacticDiagnostics(),
        ...program.getOptionsDiagnostics(),
        ...program.getSemanticDiagnostics(),
        ...program.getDeclarationDiagnostics(),
      ].filter((d) => d.category === ts.DiagnosticCategory.Error)
        // 门禁 = 入口静态闭包内的错误；闭包外业务文件不偷换成生成失败
        .filter((d) => !d.file || closure.has(path.resolve(d.file.fileName)))
      if (errs.length > 0) {
        projection.diagnosticFailure = true
        fs.rmSync(outDir, { recursive: true, force: true })
        diagnostics.push(
          `声明生成失败：暴露闭包内存在 ${errs.length} 个编译错误——类型资源未产出（修复后重新构建/重启 dev）。前若干条：`,
          ...errs.slice(0, 20).map((d) => {
            const f = d.file ? path.relative(root, d.file.fileName) : '?'
            const pos = d.file ? d.file.getLineAndCharacterOfPosition(d.start ?? 0) : { line: 0 }
            return `  ${f}:${pos.line + 1} TS${d.code}: ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`
          }),
        )
      return { ok: false, diagnostics }
      }
      for (const source of program.getSourceFiles()) {
        if (source.isDeclarationFile || source.fileName.endsWith('.json') || !closure.has(path.resolve(source.fileName))) continue
        const emitResult = program.emit(source, undefined, undefined, true)
        if (emitResult.emitSkipped) {
          fs.rmSync(outDir, { recursive: true, force: true })
          return { ok: false, diagnostics: [`TypeScript 声明 emit 失败（emitSkipped）：${path.relative(root, source.fileName)}。请检查 tsconfig 编译选项。`] }
        }
      }
      collectEmitted(ts, outDir, rootDir, emitted, closure)
    } finally { fs.rmSync(outDir, { recursive: true, force: true }) }
  }

  // TypeScript does not emit existing declaration inputs; keep imported local contracts.
  for (const file of closure) {
    if (file.endsWith('.d.ts')) emitted.set(file, fs.readFileSync(file, 'utf8'))
  }
  // JSON 没有独立的 declaration emit，但它可以出现在公开类型中（typeof config）。
  // 用提供方的 TypeScript checker 保留真实结构，不把它误判为 emitSkipped，
  // 也不把 package.json 等运行时数据复制进公开类型包。
  const jsonFiles = [...closure].filter(file => file.endsWith('.json'))
  if (jsonFiles.length) {
    const jsonProgram = ts.createProgram(jsonFiles, {
      resolveJsonModule: true, module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.NodeJs, types: [], skipLibCheck: true,
    })
    const checker = jsonProgram.getTypeChecker()
    for (const file of jsonFiles) {
      const source = jsonProgram.getSourceFile(file)
      const first = source?.statements[0]
      if (!first || !ts.isExpressionStatement(first)) continue
      // JSON 根节点也可能是字符串/数字/布尔值；与对象字段一样展开为结构类型，
      // 避免把根字面量的运行时值写入公开声明。
      const type = checker.getBaseTypeOfLiteralType(checker.getTypeAtLocation(first.expression))
      const shape = checker.typeToString(type, first, ts.TypeFormatFlags.NoTruncation)
      emitted.set(file, `declare const value: ${shape};\nexport default value;\n`)
    }
  }

  if (signal?.aborted) return { ok: false, diagnostics: ['声明生成被中止。'] }
  if (emitted.size === 0) {
    return { ok: false, diagnostics: ['声明 emit 未产出任何文件。请检查暴露入口与 tsconfig include 是否覆盖。'] }
  }

  // 只为实际暴露的具体 SFC 保留组件名。完整原类型仍是继承源，内部模块和泛型函数不改。
  const namedVueSources = new Set<string>()
  for (const [name, srcAbs] of entryMap) {
    if (!srcAbs.endsWith('.vue') || namedVueSources.has(srcAbs)) continue
    const declaration = emitted.get(srcAbs)
    if (declaration !== undefined) {
      emitted.set(srcAbs, nameVueDeclaration(ts, declaration, name))
      namedVueSources.add(srcAbs)
    }
  }

  // ---- 重写 pass：alias/相对 → bundle 内相对；裸包名 → externals ----
  const externals = new Set<string>()
  const srcToRel = new Map<string, string>() // 绝对源文件 → bundle 相对路径（files/...）
  for (const srcAbs of emitted.keys()) {
    const rel = path.relative(rootDir, srcAbs).split(path.sep).join('/')
    const declRel = rel.endsWith('.d.ts')
      ? `files/${rel}`
      : rel.endsWith('.vue')
      ? `files/${rel}.d.ts`
      : `files/${rel.replace(/\.(mts|cts|ts|tsx|jsx|js)$/, '')}.d.ts`
    srcToRel.set(srcAbs, declRel)
  }
  // 源码闭包用于编译、推导和诊断；发布闭包只沿实际声明依赖遍历。
  // 运行时实现 import 被编译器擦除后，不应继续向消费方分发该实现的声明或 externals。
  // 复用重写器的解析结果建图，避免 alias、import type 与常规 import 使用两套解析规则。
  const relToSrc = new Map([...srcToRel].map(([src, rel]) => [rel, src]))
  const pending = [...entryMap.values()]
  const reachable = new Map<string, string>()
  while (pending.length > 0) {
    const srcAbs = pending.pop()!
    if (reachable.has(srcAbs)) continue
    const text = emitted.get(srcAbs)
    if (text === undefined) {
      diagnostics.push(`公开声明依赖未产出：${path.relative(root, srcAbs)}。`)
      return { ok: false, diagnostics }
    }
    const rewritten = rewriteSpecifiers(ts, text, srcAbs, srcToRel, resolver, externals, root, diagnostics,
      rel => { pending.push(relToSrc.get(rel)!) })
    if (rewritten === null) return { ok: false, diagnostics }
    reachable.set(srcAbs, rewritten)
  }

  // ---- 组装 bundle ----
  const files = new Map<string, string>()
  const filesDigest: Record<string, string> = {}
  let leaked = false
  for (const [srcAbs, text] of reachable) {
    const rel = srcToRel.get(srcAbs)!
    if (text.includes(root)) {
      diagnostics.push(`声明文件包含本机绝对路径（${path.relative(root, srcAbs)}），已拒绝产出。请检查该文件的类型是否引用了字面路径。`)
      leaked = true
    }
    files.set(rel, text)
  }
  if (leaked) return { ok: false, diagnostics }

  const exposesMap: Record<string, { declaration: string }> = {}
  for (const [name, srcAbs] of entryMap) {
    const declRel = srcToRel.get(srcAbs)
    if (!declRel || !files.has(declRel)) {
      diagnostics.push(`暴露入口 ${name} 未产出声明（${srcAbs}）。请检查该文件是否被 tsconfig include 排除。`)
      return { ok: false, diagnostics }
    }
    exposesMap[name] = { declaration: declRel }
  }

  mark('display')
  displayPublicDataTypes(ts, files, Object.values(exposesMap).map(entry => entry.declaration), root, ctx.compilerOptions)
  for (const [rel, text] of files) {
    if (text.includes(root)) {
      return { ok: false, diagnostics: [...diagnostics, `声明文件包含本机绝对路径（${rel}），已拒绝产出。`] }
    }
    filesDigest[rel] = crypto.createHash('sha256').update(text, 'utf8').digest('hex')
  }

  const index: Omit<DtsBundleIndex, 'revision'> = {
    schemaVersion: TYPES_SCHEMA_VERSION,
    generator: '@fulgurjs/federation',
    pluginVersion,
    exposes: exposesMap,
    externals: [...externals].sort(),
    files: filesDigest,
    ...(input.contractOnly ? { check: 'contract' as const } : {}),
  }
  const revision = crypto.createHash('sha256').update(JSON.stringify(index)).digest('hex').slice(0, 16)
  const fullIndex: DtsBundleIndex = { ...index, revision }
  files.set('index.json', `${JSON.stringify(fullIndex, null, 2)}\n`)
  mark('total')
  return {
    ok: true, files, index: fullIndex, tool, fileCount: filesDigest ? Object.keys(filesDigest).length : 0, notices: diagnostics,
    ...(cacheTraceFile ? { cacheTraceFile } : {}),
    ...(requiresInputValidation ? { requiresInputValidation: true } : {}),
    ...(timingsEnabled ? { timings: { parent: { ...timings }, ...(childTimings ? { child: childTimings } : {}) } } : {}),
    ...(graph ? { graph } : {}),
  }
}

/** 收集 emit 产物 → { 绝对源文件 → 声明文本 }（.vue → .vue.d.ts；.ts/.tsx → .d.ts）。
 * 只收入口静态闭包内的文件——程序级其他文件（动态导入类型边）的声明不进 bundle。 */
function collectEmitted(ts: TsModule, outDir: string, rootDir: string, out: Map<string, string>, closure: Set<string>): void {
  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
      const p = path.join(dir, d.name)
      return d.isDirectory() ? walk(p) : [p]
    })
  if (!fs.existsSync(outDir)) return
  for (const file of walk(outDir)) {
    if (!file.endsWith('.d.ts')) continue
    const rel = path.relative(outDir, file)
    const srcRel = rel.endsWith('.vue.d.ts') ? rel.replace(/\.d\.ts$/, '') : rel.replace(/\.d\.ts$/, '.ts')
    let srcAbs = path.join(rootDir, srcRel)
    if (!out.has(srcAbs) && !fs.existsSync(srcAbs)) {
      // .tsx/.jsx 源：.d.ts 同名（尝试相邻扩展）
      for (const ext of ['.tsx', '.jsx', '.mts', '.cts', '.js']) {
        const candidate = path.join(rootDir, rel.replace(/\.d\.ts$/, ext))
        if (fs.existsSync(candidate)) { srcAbs = candidate; break }
      }
    }
    if (!closure.has(srcAbs)) continue
    out.set(srcAbs, fs.readFileSync(file, 'utf8'))
  }
  void ts
}

/**
 * 说明符重写（AST 级）：import/export/import() 中——
 * - 相对或 paths alias 且解析到闭包内源文件 → bundle 内相对路径（去 .d.ts 后缀）；
 * - 裸包名（vue/react/…）→ 保留并登记 externals；
 * - 相对说明符解析失败 → 诊断（闭包不完整）。
 */
function rewriteSpecifiers(
  ts: TsModule,
  text: string,
  srcAbs: string,
  srcToRel: Map<string, string>,
  resolver: (spec: string, from: string) => { resolved: string; fromNodeModules: boolean } | null,
  externals: Set<string>,
  root: string,
  diagnostics: string[],
  onDependency: (declaration: string) => void,
): string | null {
  const declRel = srcToRel.get(srcAbs)!
  let failed = false
  const fail = (spec: string): null => {
    failed = true
    diagnostics.push(
      `声明依赖不完整：${path.relative(root, srcAbs)} 的导入 "${spec}" 无法解析到工程内文件。` +
      '请检查 tsconfig paths/include 是否覆盖该依赖。',
    )
    return null
  }
  const resolveTarget = (spec: string): string | null => {
    if (!spec.startsWith('.')) {
      const r = resolver(spec, srcAbs)
      if (!r || r.fromNodeModules) return null // 外部包
      let resolved = r.resolved
      if (resolved.endsWith('.d.ts')) {
        const candidates = [resolved.replace(/\.d\.ts$/, '.ts'), resolved.replace(/\.d\.ts$/, '.tsx'), resolved.replace(/\.d\.ts$/, '.vue')]
        resolved = candidates.find((c) => srcToRel.has(c)) ?? resolved
      }
      const target = srcToRel.get(resolved)
      if (!target) return fail(spec)
      onDependency(target)
      return target
    }
    const r = resolver(spec, srcAbs)
    if (!r || r.fromNodeModules) return fail(spec)
    let resolved = r.resolved
    if (resolved.endsWith('.d.ts')) {
      const candidates = [resolved.replace(/\.d\.ts$/, '.ts'), resolved.replace(/\.d\.ts$/, '.tsx'), resolved.replace(/\.d\.ts$/, '.vue')]
      resolved = candidates.find((c) => srcToRel.has(c)) ?? resolved
    }
    const target = srcToRel.get(resolved)
    if (!target) return fail(spec)
    onDependency(target)
    return target
  }
  // bundle 内相对导入：说明符去 .d.ts 后缀（bundler/NodeNext 均按声明解析规则命中）
  const rewriteTo = (targetRel: string): string => {
    const fromDir = path.posix.dirname(declRel)
    const toNoExt = targetRel.replace(/\.d\.ts$/, '')
    let rel = path.posix.relative(fromDir, toNoExt)
    if (!rel.startsWith('.')) rel = `./${rel}`
    return rel
  }

  const sfile = ts.createSourceFile(declRel, text, ts.ScriptTarget.Latest, true)
  // reference path 是声明依赖；它的路径不能沿用源码位置。
  const referenceEdits: Array<{ start: number; end: number; text: string }> = []
  for (const ref of sfile.referencedFiles) {
    const spec = ref.fileName.startsWith('.') ? ref.fileName : `./${ref.fileName}`
    const target = resolveTarget(spec)
    if (!target) return fail(spec)
    referenceEdits.push({ start: ref.pos, end: ref.end, text: rewriteTo(target) + '.d.ts' })
  }
  for (const ref of sfile.typeReferenceDirectives) {
    const spec = ref.fileName
    externals.add(spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]!)
  }
  // 先保持节点偏移不变完成 import 重写，最后单独改文件头的 reference。
  let out = ''
  let pos = 0
  const emitRange = (node: { getStart(s: unknown): number; getEnd(): number }, replacement?: string): void => {
    const s = sfile as unknown as import('typescript').SourceFile
    if (pos < node.getStart(s)) out += text.slice(pos, node.getStart(s))
    if (replacement !== undefined) out += replacement
    pos = node.getEnd()
  }
  for (const stmt of sfile.statements) {
    const specNode: import('typescript').StringLiteral | null =
      ((ts.isImportDeclaration(stmt) || ts.isExportDeclaration(stmt)) && stmt.moduleSpecifier && ts.isStringLiteral(stmt.moduleSpecifier))
        ? stmt.moduleSpecifier
        : (ts.isImportEqualsDeclaration(stmt) && ts.isExternalModuleReference(stmt.moduleReference) && ts.isStringLiteral(stmt.moduleReference.expression))
          ? stmt.moduleReference.expression
          : null
    if (specNode) {
      const spec = specNode.text
      // Style side effects have no declaration contract or runtime role in a type bundle.
      if (ts.isImportDeclaration(stmt) && !stmt.importClause && /\.(?:css|less|scss|sass|styl|stylus)(?:[?#].*)?$/.test(spec)) {
        emitRange(stmt, '')
        continue
      }
      const targetRel = resolveTarget(spec)
      if (targetRel) {
        emitRange(specNode, JSON.stringify(rewriteTo(targetRel)))
        out += text.slice(pos, stmt.getEnd())
        pos = stmt.getEnd()
      } else if (spec.startsWith('.')) {
        return fail(spec)
      } else {
        // scoped 包名取前两段（@scope/name）；判断必须用 startsWith——split[0] 对
        // scoped 包是 '@scope' 而非 '@'（实测曾把 @fulgurjs/federation 拆成 @fulgurjs）
        externals.add(spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]!)
        if (pos < stmt.getEnd()) { out += text.slice(pos, stmt.getEnd()); pos = stmt.getEnd() }
      }
      continue
    }
    if (pos < stmt.getEnd()) {
      if (pos < stmt.getStart(sfile)) out += text.slice(pos, stmt.getStart(sfile))
      out += text.slice(stmt.getStart(sfile), stmt.getEnd())
      pos = stmt.getEnd()
    }
  }
  out += text.slice(pos)

  // 重新解析声明，只处理真实 import 类型节点；注释/字符串中的示例不是依赖。
  const rewrittenFile = ts.createSourceFile(declRel, out, ts.ScriptTarget.Latest, true)
  const edits: Array<{ start: number; end: number; text: string }> = []
  const visit = (node: import('typescript').Node): void => {
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) {
      const literal = node.argument.literal
      const spec = literal.text
      const viaResolver = spec.startsWith('.') ? null : resolver(spec, srcAbs)
      const isAlias = viaResolver !== null && !viaResolver.fromNodeModules
      if (!spec.startsWith('.') && !isAlias) {
        const segments = spec.split('/')
        externals.add(spec.startsWith('@') ? segments.slice(0, 2).join('/') : segments[0]!)
      } else {
        const targetRel = resolveTarget(spec)
        if (targetRel) edits.push({ start: literal.getStart(rewrittenFile), end: literal.end, text: JSON.stringify(rewriteTo(targetRel)) })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(rewrittenFile)
  if (failed) return null
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    out = out.slice(0, edit.start) + edit.text + out.slice(edit.end)
  }

  for (const edit of referenceEdits.sort((a, b) => b.start - a.start)) {
    out = out.slice(0, edit.start) + edit.text + out.slice(edit.end)
  }
  return out
}
