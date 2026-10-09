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
  for (const spec of [pkg, `${pkg}/package.json`]) {
    try {
      const resolved = req.resolve(spec)
      return spec.endsWith('/package.json') ? resolved : path.dirname(resolved)
    } catch { /* 尝试下一个形态 */ }
  }
  return null
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

  // .vue 需求判定：入口是 .vue，或工程输入含 .vue（入口可能传递依赖 SFC）
  const needsVueTsc =
    entryFiles.some((f) => f.endsWith('.vue')) ||
    ctx.projectFiles.some((f) => f.endsWith('.vue'))

  // rootDir：全工程文件公共目录（空时退到入口公共目录）
  const rootDir = ctx.projectFiles.length > 0 ? commonDirOf(ctx.projectFiles) : commonDirOf(entryFiles)
  if (!rootDir) return { ok: false, diagnostics: ['无法确定声明输出根目录（rootDir）。请检查工程 tsconfig 的 include。'] }

  const emitted = new Map<string, string>() // 绝对源文件 → 声明文本
  let tool: 'typescript' | 'vue-tsc' = 'typescript'

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
    const baseCo: Record<string, unknown> = { ...ctx.rawOptions }
    delete baseCo.noEmit
    delete baseCo.incremental
    delete baseCo.composite
    delete baseCo.tsBuildInfoFile
    delete baseCo.emitDeclarationOnly
    delete baseCo.declarationDir
    delete baseCo.extends
    fs.writeFileSync(tmpCfg, JSON.stringify({
      compilerOptions: {
        ...baseCo,
        noEmit: false,
        declaration: true,
        emitDeclarationOnly: true,
        declarationMap: false,
        sourceMap: false,
        outDir,
        rootDir,
      },
      include: entryFiles.map((f) => path.relative(root, f)),
    }))
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
              // vue-tsc 的编译诊断走 stdout；两路都收（取尾部防刷屏）
              const tail = `${String(stdout ?? '')}\n${String(stderr ?? '')}\n${err.message}`.trim().split('\n').slice(-40).join('\n')
              diagnostics.push(`vue-tsc 声明生成失败（暴露闭包存在编译错误）——类型资源未产出：\n${tail}`)
              reject(err)
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
    collectEmitted(ts, outDir, rootDir, emitted)
    fs.rmSync(outDir, { recursive: true, force: true })
  } else {
    const outDir = fs.mkdtempSync(path.join(root, 'node_modules', '.fulgurjs-types-emit-'))
    const program = ts.createProgram(entryFiles, {
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
    if (errs.length > 0) {
      fs.rmSync(outDir, { recursive: true, force: true })
      diagnostics.push(
        `声明生成失败：暴露闭包存在 ${errs.length} 个编译错误——类型资源未产出（修复后重新构建/重启 dev）。前若干条：`,
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
    collectEmitted(ts, outDir, rootDir, emitted)
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

/** 收集 emit 产物 → { 绝对源文件 → 声明文本 }（.vue → .vue.d.ts；.ts/.tsx → .d.ts） */
function collectEmitted(ts: TsModule, outDir: string, rootDir: string, out: Map<string, string>): void {
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
        externals.add(spec.split('/')[0] === '@' ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]!)
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
      externals.add(seg[0] === '@' ? seg.slice(0, 2).join('/') : seg[0]!)
      return full
    }
    const targetRel = resolveTarget(spec)
    return targetRel ? `import(${q}${rewriteTo(targetRel)}${q})` : full
  })
  return out
}
