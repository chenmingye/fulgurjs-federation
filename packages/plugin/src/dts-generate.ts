/**
 * 提供方声明 bundle 生成（6.5.0 远程类型自动生成）。
 *
 * 从 exposes 出发建立声明闭包并产出可分发 bundle（协议见 dts-shared）：
 * - 纯 TS/TSX：TypeScript 编译器 API（createProgram + declaration emit）；
 * - 含 .vue（入口或工程内）：vue-tsc CLI（官方 SFC 声明工具链，不用正则猜 props）；
 * - 重写 pass：源码 alias（tsconfig paths）与相对导入 → bundle 内相对路径；
 *   裸包名保留并登记 externals（宿主自行解析，不复制 node_modules）；
 * - 闭包内编译错误 → 拒绝产出（ok:false + 诊断），绝不发布标记成功的残缺资源。
 *
 * 编译工具（typescript/vue-tsc）从**提供方工程**解析（createRequire(root)），
 * 不依赖插件包自身 devDependencies 或父目录 node_modules；缺失时给出当前包
 * 管理器的安装命令。本模块只在 Node 侧运行，产物不进入浏览器运行时。
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { createRequire } from 'node:module'
import { execFile } from 'node:child_process'
import { TYPES_SCHEMA_VERSION, type DtsBundleIndex } from './dts-shared'

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
  /** 中止信号：vue-tsc 子进程立即 kill（TS API 路径为进程内同步段，仅边界检查） */
  signal?: AbortSignal
}

export interface DtsGenerateOk {
  ok: true
  /** bundle 内容（相对路径 → 文本）；index.json 是键 'index.json' */
  files: Map<string, string>
  index: DtsBundleIndex
  tool: 'typescript' | 'vue-tsc'
  /** 闭包内文件数（不含 index.json） */
  fileCount: number
}

export interface DtsGenerateFail {
  ok: false
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
): Set<string> {
  const closure = new Set<string>()
  const queue = [...entryFiles]
  while (queue.length > 0) {
    const file = queue.pop()!
    if (closure.has(file)) continue
    closure.add(file)
    let text: string
    try {
      text = fs.readFileSync(file, 'utf8')
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
    const sfile = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)
    const imports: string[] = []
    const visitType = (node: import('typescript').Node): void => {
      if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) imports.push(node.argument.literal.text)
      ts.forEachChild(node, visitType)
    }
    visitType(sfile)
    for (const stmt of sfile.statements) {
      const specNode: import('typescript').StringLiteral | null =
        ((ts.isImportDeclaration(stmt) || ts.isExportDeclaration(stmt)) && stmt.moduleSpecifier && ts.isStringLiteral(stmt.moduleSpecifier))
          ? stmt.moduleSpecifier
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
  delete baseCo.types
  if (!Array.isArray(raw)) return []
  const req = createRequire(path.join(root, 'package.json'))
  const out: string[] = []
  for (const entry of raw) {
    if (typeof entry !== 'string' || entry.length === 0) continue
    const direct = [path.resolve(root, `${entry}.d.ts`), path.resolve(root, entry, 'index.d.ts')]
    let hit = direct.find((c) => fs.existsSync(c))
    if (!hit && !entry.startsWith('.') && !path.isAbsolute(entry)) {
      try {
        const r = req.resolve(entry)
        for (const c of [r.replace(/\.js$/, '.d.ts'), `${r}.d.ts`, r]) {
          if (fs.existsSync(c)) { hit = c; break }
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
  compilerOptions: Record<string, unknown>
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
function loadTsContext(root: string, ts: TsModule, diagnostics: string[]): TsConfigContext | null {
  const tsconfigFile = ts.findConfigFile(root, ts.sys.fileExists, 'tsconfig.json')
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
  const raw = ts.readConfigFile(tsconfigFile, ts.sys.readFile)
  if (raw.error) {
    diagnostics.push(`tsconfig 解析失败（${tsconfigFile}）：${ts.flattenDiagnosticMessageText(raw.error.messageText, ' ')}`)
    return null
  }
  const parsed = ts.parseJsonConfigFileContent(raw.config, ts.sys, path.dirname(tsconfigFile))
  const co: Record<string, unknown> = { ...parsed.options }
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
function makeResolver(ts: TsModule, co: Record<string, unknown>) {
  return (spec: string, fromFile: string): { resolved: string; fromNodeModules: boolean } | null => {
    const r = ts.resolveModuleName(spec, fromFile, co as never, ts.sys)
    const resolved = r.resolvedModule?.resolvedFileName
    if (!resolved) return null
    return { resolved, fromNodeModules: resolved.includes(`${path.sep}node_modules${path.sep}`) }
  }
}

/**
 * 生成声明 bundle。所有失败都走 ok:false + diagnostics（人读文案含修法）；
 * 成功产出 index.json + files/*.d.ts（in-memory Map，由调用方决定落盘/服务/打包）。
 */
export async function generateTypesBundle(input: DtsGenerateInput): Promise<DtsGenerateResult> {
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
  const ctx = loadTsContext(root, ts, diagnostics)
  if (!ctx) return { ok: false, diagnostics }

  // 入口解析：exposes.import 相对 root；alias 形态（@/x）经 TS resolver 解析
  const resolver = makeResolver(ts, ctx.compilerOptions)
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
  const rootDir = ctx.projectFiles.length > 0 ? commonDirOf(ctx.projectFiles) : commonDirOf(entryFiles)
  if (!rootDir) return { ok: false, diagnostics: ['无法确定声明输出根目录（rootDir）。请检查工程 tsconfig 的 include。'] }

  const emitted = new Map<string, string>() // 绝对源文件 → 声明文本
  let tool: 'typescript' | 'vue-tsc' = 'typescript'

  // 入口**静态**导入闭包：诊断门禁与产物范围都限定在它——动态导入（如桥接契约的
  // 装配模块）只是类型边，其文件的存量业务错误与公开声明面无关，不进闭包也不阻断
  // 生成（设计合同：「与 exposed 声明依赖无关的业务错误不要被偷换成类型生成失败」）。
  const closure = computeStaticClosure(ts, entryFiles, resolver, root)

  if (needsVueTsc) {
    const vueTscDir = resolveFromRoot(root, 'vue-tsc')
    if (!vueTscDir) {
      return {
        ok: false,
        diagnostics: [
          `工程包含 .vue 暴露项，声明生成需要 vue-tsc。${installHint(root, 'vue-tsc')}`,
          '（纯 TS/React 工程不需要 vue-tsc；它只用于 SFC 的声明生成，不进入浏览器运行时。）',
        ],
      }
    }
    tool = 'vue-tsc'
    const vueTscPkg = JSON.parse(fs.readFileSync(path.join(vueTscDir, 'package.json'), 'utf8')) as {
      version: string
      bin: Record<string, string>
    }
    const binRel = vueTscPkg.bin?.['vue-tsc'] ?? vueTscPkg.bin?.['vue-tsc.js'] ?? 'bin/vue-tsc.js'
    const binPath = path.resolve(vueTscDir, binRel)
    if (!fs.existsSync(binPath)) {
      return { ok: false, diagnostics: [`vue-tsc 入口不存在（${binPath}）。请重新安装 vue-tsc。`] }
    }
    // 临时 tsconfig 写在提供方根（include 相对路径语义正确；用完即删）
    const tmpCfg = path.join(root, `.fulgurjs-types-tsconfig-${process.pid}.json`)
    const outDir = fs.mkdtempSync(path.join(root, 'node_modules', '.fulgurjs-types-emit-'))
    const baseCo: Record<string, unknown> = { ...rawOptionsWithInherited(ctx) }
    delete baseCo.noEmit
    delete baseCo.incremental
    delete baseCo.composite
    delete baseCo.tsBuildInfoFile
    delete baseCo.emitDeclarationOnly
    delete baseCo.declarationDir
    delete baseCo.extends
    // types 条目改为显式文件 include：显式 typeRoots 下 TS 的 types 条目只查 typeRoots
    // （"vite/client" 落不进 ./types → TS2688，MESZC bpm 实测）；自行按包解析出具体
    // .d.ts 并纳入 include，绕开该解析歧义；解析失败的条目丢弃（如实记录诊断）
    const resolvedTypeFiles = resolveTypesEntries(root, baseCo, diagnostics)

    fs.writeFileSync(tmpCfg, JSON.stringify({
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
      },
      include: [
        ...entryFiles.map((f) => path.relative(root, f)),
        ...ctx.ambientInputs.map((f) => path.relative(root, f)),
        ...resolvedTypeFiles.map((f) => path.relative(root, f)),
      ],
    }))
    if (process.env.FG_DUMP_TSCFG) fs.writeFileSync(process.env.FG_DUMP_TSCFG, fs.readFileSync(tmpCfg, 'utf8'))
    try {
      await new Promise<void>((resolve, reject) => {
        const child = execFile(
          process.execPath,
          [binPath, '-p', tmpCfg, '--noErrorTruncation'],
          { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 10 * 60 * 1000 },
          (err, stdout, stderr) => {
            if (err) {
              if (signal?.aborted) {
                diagnostics.push('vue-tsc 声明生成被中止（dev server 关闭）。')
                reject(err)
                return
              }
              // 门禁 = 入口静态闭包内的错误（file(line,col): error TSxxxx 形态解析）；
              // 闭包外（动态导入类型边/无关业务文件）的错误如实丢弃，不偷换成生成失败
              const errFiles = parseErrorFiles(String(stdout ?? ''), root)
              const closureErrs = new Set([...errFiles].filter((f) => closure.has(f)))
              const globalError = /(?:^|\n)(?:error )?TS\d+:/.test(String(stdout ?? '') + '\n' + String(stderr ?? ''))
              if (closureErrs.size > 0 || globalError || errFiles.size === 0) {
                const tail = `${String(stdout ?? '')}\n${String(stderr ?? '')}\n${err.message}`
                  .split('\n').filter((line) => {
                    const m = line.match(/^([^)(]+)\(\d+,\d+\): error TS/)
                    return !m || closureErrs.has(path.resolve(root, m[1]!.trim()))
                  }).slice(-40).join('\n')
                diagnostics.push(`vue-tsc 声明生成失败（暴露闭包内存在编译错误）——类型资源未产出：\n${tail}`)
                reject(err)
              } else {
                // 仅闭包外错误：声明 emit 已产出（noEmitOnError:false），继续
                resolve()
              }
            } else {
              resolve()
            }
          },
        )
        signal?.addEventListener('abort', () => child.kill('SIGKILL'), { once: true })
      })
    } catch {
      fs.rmSync(outDir, { recursive: true, force: true })
      fs.rmSync(tmpCfg, { force: true })
      return { ok: false, diagnostics }
    } finally {
      fs.rmSync(tmpCfg, { force: true })
    }
    collectEmitted(ts, outDir, rootDir, emitted, closure)
    fs.rmSync(outDir, { recursive: true, force: true })
  } else {
    const outDir = fs.mkdtempSync(path.join(root, 'node_modules', '.fulgurjs-types-emit-'))
    const program = ts.createProgram([...entryFiles, ...ctx.ambientInputs, ...resolveTypesEntries(root, ctx.rawOptions, [])], {
      ...(ctx.compilerOptions as Record<string, never>),
      noEmit: false,
      declaration: true,
      emitDeclarationOnly: true,
      declarationMap: false,
      sourceMap: false,
      incremental: false,
      composite: false,
      outDir,
      rootDir,
    })
    const errs = [
      ...program.getSyntacticDiagnostics(),
      ...program.getOptionsDiagnostics(),
      ...program.getSemanticDiagnostics(),
      ...program.getDeclarationDiagnostics(),
    ].filter((d) => d.category === ts.DiagnosticCategory.Error)
      // 门禁 = 入口静态闭包内的错误；闭包外业务文件不偷换成生成失败
      .filter((d) => !d.file || closure.has(path.resolve(d.file.fileName)))
    if (errs.length > 0) {
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
    const emitResult = program.emit()
    if (emitResult.emitSkipped) {
      fs.rmSync(outDir, { recursive: true, force: true })
      return { ok: false, diagnostics: ['TypeScript 声明 emit 失败（emitSkipped）。请检查 tsconfig 编译选项。'] }
    }
    collectEmitted(ts, outDir, rootDir, emitted, closure)
    fs.rmSync(outDir, { recursive: true, force: true })
  }

  if (signal?.aborted) return { ok: false, diagnostics: ['声明生成被中止。'] }
  if (emitted.size === 0) {
    return { ok: false, diagnostics: ['声明 emit 未产出任何文件。请检查暴露入口与 tsconfig include 是否覆盖。'] }
  }

  // ---- 重写 pass：alias/相对 → bundle 内相对；裸包名 → externals ----
  const externals = new Set<string>()
  const srcToRel = new Map<string, string>() // 绝对源文件 → bundle 相对路径（files/...）
  for (const srcAbs of emitted.keys()) {
    const rel = path.relative(rootDir, srcAbs).split(path.sep).join('/')
    const declRel = rel.endsWith('.vue')
      ? `files/${rel}.d.ts`
      : `files/${rel.replace(/\.(mts|cts|ts|tsx|jsx|js)$/, '')}.d.ts`
    srcToRel.set(srcAbs, declRel)
  }
  for (const [srcAbs, text] of emitted) {
    const rewritten = rewriteSpecifiers(ts, text, srcAbs, srcToRel, resolver, externals, root, diagnostics)
    if (rewritten === null) return { ok: false, diagnostics }
    emitted.set(srcAbs, rewritten)
  }

  // ---- 组装 bundle ----
  const files = new Map<string, string>()
  const filesDigest: Record<string, string> = {}
  let leaked = false
  for (const [srcAbs, text] of emitted) {
    const rel = srcToRel.get(srcAbs)!
    if (text.includes(root)) {
      diagnostics.push(`声明文件包含本机绝对路径（${path.relative(root, srcAbs)}），已拒绝产出。请检查该文件的类型是否引用了字面路径。`)
      leaked = true
    }
    files.set(rel, text)
    filesDigest[rel] = crypto.createHash('sha256').update(text, 'utf8').digest('hex')
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

  const index: Omit<DtsBundleIndex, 'revision'> = {
    schemaVersion: TYPES_SCHEMA_VERSION,
    generator: '@fulgurjs/federation',
    pluginVersion,
    exposes: exposesMap,
    externals: [...externals].sort(),
    files: filesDigest,
  }
  const revision = crypto.createHash('sha256').update(JSON.stringify(index)).digest('hex').slice(0, 16)
  const fullIndex: DtsBundleIndex = { ...index, revision }
  files.set('index.json', `${JSON.stringify(fullIndex, null, 2)}\n`)
  return { ok: true, files, index: fullIndex, tool, fileCount: filesDigest ? Object.keys(filesDigest).length : 0 }
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
): string | null {
  const declRel = srcToRel.get(srcAbs)!
  const fail = (spec: string): null => {
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
      return srcToRel.get(resolved) ?? null
    }
    const r = resolver(spec, srcAbs)
    if (!r || r.fromNodeModules) return fail(spec)
    let resolved = r.resolved
    if (resolved.endsWith('.d.ts')) {
      const candidates = [resolved.replace(/\.d\.ts$/, '.ts'), resolved.replace(/\.d\.ts$/, '.tsx'), resolved.replace(/\.d\.ts$/, '.vue')]
      resolved = candidates.find((c) => srcToRel.has(c)) ?? resolved
    }
    return srcToRel.get(resolved) ?? fail(spec)
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

  // import() 类型节点（typeof import('./x')）中的说明符：相对/alias → bundle 内相对；裸包名 → externals
  out = out.replace(/import\((['"])([^'"]+)\1\)/g, (full, q: string, spec: string) => {
    const viaResolver = spec.startsWith('.') ? null : resolver(spec, srcAbs)
    const isAlias = viaResolver !== null && !viaResolver.fromNodeModules
    if (!spec.startsWith('.') && !isAlias) {
      const seg = spec.split('/')
      externals.add(spec.startsWith('@') ? seg.slice(0, 2).join('/') : seg[0]!)
      return full
    }
    const targetRel = resolveTarget(spec)
    return targetRel ? `import(${q}${rewriteTo(targetRel)}${q})` : full
  })
  return out
}
