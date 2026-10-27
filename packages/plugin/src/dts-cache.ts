/**
 * dev 提供方声明的跨进程缓存。只缓存成功产物；所有输入观察及声明摘要校验后才恢复。
 * 文件内容、解析探测、目录成员、链接目标和工具代码均参与验证，不以mtime代替内容。
 * 编译临时目录仍由每个服务独占；本模块只原子发布一个不可分割的成功快照。
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { gzipSync, gunzipSync } from 'node:zlib'
import type * as TS from 'typescript'
import type { DtsGenerateInput, DtsGenerateOk } from './dts-generate'
import { parseDtsIndex, DTS_FILE_COUNT_MAX, DTS_FILE_MAX_BYTES, DTS_TOTAL_MAX_BYTES } from './dts-shared'

type FileStamp = { hash: string; size: number; mtime: number; ctime: number; ino: number }
type DirectoryQuery = { kind: 'files' | 'dirs' | 'entries'; root: string; recurse?: boolean; extensions?: readonly string[]; excludes?: readonly string[]; includes?: readonly string[]; depth?: number; result: string[] }
export interface TypesInputSnapshot {
  caseSensitive: boolean
  directoryStats: Record<string, { mtime: number; ctime: number; ino: number }>
  files: Record<string, FileStamp>
  probes: Record<string, boolean>
  fileQueries: Record<string, Record<string, boolean>>
  directories: DirectoryQuery[]
  links: Record<string, string>
  resolutions: Array<{ from: string; request: string; resolved: string | null }>
  runtimeTools: string[]
}
export interface TypesCacheInput extends Pick<DtsGenerateInput, 'root' | 'exposes' | 'pluginVersion'> {
  dts?: unknown
  execution?: { env: Record<string, string | undefined>; execArgv: string[] }
}
const CACHE_FORMAT = 1
const PROCESS_START = Date.now() - process.uptime() * 1000
const MAX_CACHE_BYTES = DTS_TOTAL_MAX_BYTES * 2
const hash = (value: crypto.BinaryLike): string => crypto.createHash('sha256').update(value).digest('hex')
const sorted = (values: readonly string[]): string[] => [...values].sort()
const temporary = (file: string): boolean => path.basename(file).startsWith('.fulgurjs-types-tsconfig-')
const stamp = (file: string): FileStamp => {
  const data = fs.readFileSync(file)
  const stat = fs.statSync(file)
  return { hash: hash(data), size: stat.size, mtime: stat.mtimeMs, ctime: stat.ctimeMs, ino: stat.ino }
}
const resolve = (from: string, request: string): string | null => {
  try { return createRequire(from).resolve(request) } catch { return null }
}
function linkIdentity(file: string): string {
  try { return fs.realpathSync(file) }
  catch { return `!missing:${fs.readlinkSync(file)}` }
}
function ownModule(): string {
  return typeof __filename === 'string' ? __filename : fileURLToPath(import.meta.url)
}
function settings(input: TypesCacheInput): string {
  const env = Object.fromEntries(Object.entries(input.execution?.env ?? process.env).filter(([name]) => /^(NODE_ENV|NODE_OPTIONS|TS_NODE_|VUE_|VOLAR_)/.test(name)).sort(([a], [b]) => a < b ? -1 : 1))
  return hash(JSON.stringify({ format: CACHE_FORMAT, root: path.resolve(input.root), exposes: input.exposes,
    pluginVersion: input.pluginVersion, ownModule: ownModule(), dts: input.dts, node: process.version, platform: process.platform,
    arch: process.arch, execArgv: input.execution?.execArgv ?? process.execArgv, env }))
}
export function typesCachePath(root: string): string {
  return path.join(root, 'node_modules/.cache/fulgurjs/types', `provider-${hash(path.resolve(root)).slice(0, 12)}.json.gz`)
}

/** 保守收集编译可能读取的输入；不能建模的自定义编译扩展不使用持久缓存。 */
export function captureTypesInputs(input: TypesCacheInput): TypesInputSnapshot | null {
  const root = path.resolve(input.root)
  const from = path.join(root, 'package.json')
  const tsFile = resolve(from, 'typescript')
  if (!tsFile) return null
  let ts: typeof TS
  try { ts = createRequire(from)('typescript') as typeof TS } catch { return null }
  const snapshot: TypesInputSnapshot = { caseSensitive: ts.sys.useCaseSensitiveFileNames, directoryStats: {}, files: {}, probes: {}, fileQueries: {}, directories: [], links: {}, resolutions: [], runtimeTools: [] }
  const queues: string[] = []
  const visited = new Set<string>()
  const toolPackages = new Set<string>()
  const toolRuntime = new Set<string>()
  let unsupported = false
  const observeDirectory = (dir: string): void => {
    const absolute = path.resolve(dir)
    if (Object.hasOwn(snapshot.directoryStats, absolute)) return
    try {
      const stat = fs.statSync(absolute)
      if (stat.isDirectory()) snapshot.directoryStats[absolute] = { mtime: stat.mtimeMs, ctime: stat.ctimeMs, ino: stat.ino }
    } catch { /* 缺失由目录/解析探测记录 */ }
  }
  const entriesCache = new Map<string, Map<string, fs.Dirent>>()
  const sourceCache = new Map<string, string>()
  const entries = (dir: string): Map<string, fs.Dirent> => {
    const cached = entriesCache.get(dir)
    if (cached) return cached
    let rows: fs.Dirent[] = []
    observeDirectory(dir)
    observeDirectory(path.dirname(dir))
    try {
      rows = fs.readdirSync(dir, { withFileTypes: true })
      snapshot.links[dir] = fs.realpathSync(dir)
    } catch (e) {
      if (!['ENOENT', 'ENOTDIR'].includes((e as NodeJS.ErrnoException).code ?? '')) throw e
    }
    const result = new Map(rows.flatMap(row => [[`e:${row.name}`, row], [`f:${row.name.toLowerCase()}`, row]] as Array<[string, fs.Dirent]>))
    entriesCache.set(dir, result)
    return result
  }
  const fileExists = (file: string): boolean => {
    const absolute = path.resolve(file)
    const dir = path.dirname(absolute)
    const name = path.basename(absolute)
    const query = snapshot.fileQueries[dir] ??= Object.create(null) as Record<string, boolean>
    if (Object.hasOwn(query, name)) return query[name]!
    const table = entries(dir)
    const entry = table.get(`e:${name}`) ?? (!snapshot.caseSensitive ? table.get(`f:${name.toLowerCase()}`) : undefined)
    let exists = entry?.isFile() ?? false
    if (entry && entry.name !== name) {
      try { exists = fs.statSync(absolute).isFile() } catch { exists = false }
    }
    if (entry?.isSymbolicLink() && (exists || fs.existsSync(absolute))) {
      snapshot.links[absolute] = linkIdentity(absolute)
      try { exists = fs.statSync(absolute).isFile() } catch { exists = false }
    }
    query[name] = exists
    return exists
  }
  const directoryExists = (dir: string): boolean => {
    const absolute = path.resolve(dir)
    const key = `d:${absolute}`
    if (Object.hasOwn(snapshot.probes, key)) return snapshot.probes[key]!
    observeDirectory(absolute)
    observeDirectory(path.dirname(absolute))
    const exists = ts.sys.directoryExists?.(absolute) ?? false
    snapshot.probes[key] = exists
    return exists
  }
  const read = (file: string): string | undefined => {
    const absolute = path.resolve(file)
    if (sourceCache.has(absolute)) return sourceCache.get(absolute)
    if (!fileExists(absolute)) return undefined
    const before = fs.statSync(absolute)
    const data = fs.readFileSync(absolute)
    const after = fs.statSync(absolute)
    if (before.ctimeMs !== after.ctimeMs || before.mtimeMs !== after.mtimeMs || before.size !== after.size || before.ino !== after.ino) throw new Error('输入在读取过程中变化')
    const real = fs.realpathSync(absolute)
    snapshot.links[absolute] = real
    snapshot.files[absolute] = { hash: hash(data), size: after.size, mtime: after.mtimeMs, ctime: after.ctimeMs, ino: after.ino }
    const text = data.toString('utf8')
    sourceCache.set(absolute, text)
    return text
  }
  const requirePath = (file: string, request: string): string | null => {
    const resolved = resolve(file, request)
    snapshot.resolutions.push({ from: file, request, resolved })
    if (request.startsWith('.') || path.isAbsolute(request)) {
      const base = path.resolve(path.dirname(file), request)
      for (const candidate of [base, `${base}.js`, `${base}.json`, `${base}.node`, path.join(base, 'package.json'), path.join(base, 'index.js')]) fileExists(candidate)
    } else if (resolved && path.isAbsolute(resolved)) {
      const packageName = request.startsWith('@') ? request.split('/').slice(0, 2).join('/') : request.split('/')[0]!
      for (const directory of createRequire(file).resolve.paths(request) ?? []) {
        const candidate = path.join(directory, packageName)
        if (!directoryExists(candidate)) continue
        const actual = fs.realpathSync(candidate)
        snapshot.links[candidate] = actual
        // require.resolve自身会缓存解析；链接切换后不能把旧进程当成新工具保存。
        if (!(resolved === actual || resolved.startsWith(`${actual}${path.sep}`))) unsupported = true
        break
      }
    }
    return resolved
  }
  const host: TS.ParseConfigHost & TS.ModuleResolutionHost = {
    useCaseSensitiveFileNames: ts.sys.useCaseSensitiveFileNames,
    readFile: read,
    fileExists: file => fileExists(file) || (file.endsWith('.vue.ts') && fileExists(file.slice(0, -3))),
    directoryExists,
    realpath: file => {
      const resolved = ts.sys.realpath?.(file) ?? file
      try { snapshot.links[file] = fs.realpathSync(file) } catch { /* Vue的虚拟.vue.ts不是实际文件 */ }
      return resolved
    },
    readDirectory: (dir, extensions, excludes, includes, depth) => {
      observeDirectory(dir)
      const result = sorted(ts.sys.readDirectory(dir, extensions, excludes, includes, depth).filter(file => !temporary(file)))
      snapshot.directories.push({ kind: 'files', root: dir, extensions, excludes, includes, depth, result })
      return result
    },
    getDirectories: dir => {
      observeDirectory(dir)
      const result = sorted(ts.sys.getDirectories(dir))
      snapshot.directories.push({ kind: 'dirs', root: dir, result })
      return result
    },
  }
  const add = (file: string): void => { if (fileExists(file) && !temporary(file)) queues.push(path.resolve(file)) }
  const packageRoot = (file: string): string | null => {
    for (let dir = path.dirname(file);; dir = path.dirname(dir)) {
      if (fileExists(path.join(dir, 'package.json'))) return dir
      if (path.dirname(dir) === dir) return null
    }
  }
  const walkCode = (dir: string, recurse: boolean, tools: boolean, inspect?: (file: string, text: string) => void): void => {
    observeDirectory(dir)
    const entries = fs.readdirSync(dir, { withFileTypes: true }).filter(e => !['node_modules', '.git', '.svn', '.cache'].includes(e.name)
      && (e.isDirectory() ? recurse : /\.(?:[cm]?js|[cm]?tsx?|json|vue|node|wasm)$/.test(e.name)))
    snapshot.directories.push({ kind: 'entries', root: dir, recurse, result: sorted(entries.map(e => e.name)) })
    for (const entry of entries) {
      const file = path.join(dir, entry.name)
      if (entry.isDirectory()) { if (recurse) walkCode(file, true, tools, inspect); continue }
      if (!/\.(?:[cm]?js|[cm]?tsx?|json|vue|node|wasm)$/.test(entry.name)) continue
      const text = read(file)
      if (tools && !/\.d\.[cm]?ts$/.test(entry.name)) toolRuntime.add(file)
      if (text !== undefined && /\.[cm]?js$/.test(file)) inspect?.(file, text)
    }
  }
  const tool = (file: string): void => {
    if (!path.isAbsolute(file)) return
    const directory = packageRoot(file)
    if (!directory || toolPackages.has(directory)) return
    toolPackages.add(directory)
    walkCode(directory, true, true, (source, text) => {
      for (const imported of ts.preProcessFile(text, true, true).importedFiles) {
        const dependency = requirePath(source, imported.fileName)
        if (dependency) tool(dependency)
      }
    })
    const json = JSON.parse(read(path.join(directory, 'package.json')) ?? '{}') as { dependencies?: Record<string, string>; peerDependencies?: Record<string, string> }
    for (const name of Object.keys({ ...json.dependencies, ...json.peerDependencies })) {
      const dependency = requirePath(path.join(directory, 'package.json'), `${name}/package.json`)
        ?? requirePath(path.join(directory, 'package.json'), name)
      if (dependency) tool(dependency)
    }
  }
  try {
    requirePath(from, 'typescript')
    tool(tsFile)
    for (const request of ['typescript/lib/tsc.js', 'vue-tsc/package.json', 'vue/compiler-sfc']) {
      const file = requirePath(from, request)
      if (file) tool(file)
    }
    // 分发包的拆分chunk/本地源码也属于生成器版本，不能只依赖package.json版本号。
    const ownFile = ownModule()
    const ownDirectory = path.dirname(ownFile)
    walkCode(ownDirectory, ownFile.endsWith('.ts'), true)
    for (let dir = root;; dir = path.dirname(dir)) {
      for (const name of ['package.json', 'package-lock.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'yarn.lock', 'bun.lock', 'bun.lockb']) read(path.join(dir, name))
      if (path.dirname(dir) === dir) break
    }
    const config = ts.findConfigFile(root, fileExists, 'tsconfig.json')
    let options: TS.CompilerOptions = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler ?? ts.ModuleResolutionKind.NodeJs, allowJs: true, skipLibCheck: true }
    if (config) {
      const raw = ts.readConfigFile(config, read)
      if (raw.error) return null
      const parsed = ts.parseJsonConfigFileContent(raw.config, host, path.dirname(config), undefined, undefined, undefined,
        [{ extension: '.vue', isMixedContent: true, scriptKind: ts.ScriptKind.Deferred }])
      if (parsed.errors.some(d => d.category === ts.DiagnosticCategory.Error)) return null
      options = parsed.options
      for (const file of parsed.fileNames) add(file)
    }
    const resolutionCache = ts.createModuleResolutionCache(root, file => ts.sys.useCaseSensitiveFileNames ? file : file.toLowerCase(), options)
    const module = (name: string, containing: string): void => {
      for (const mode of [ts.ModuleKind.ESNext, ts.ModuleKind.CommonJS] as const) {
        const result = ts.resolveModuleName(name, containing, options, host, resolutionCache, undefined, mode).resolvedModule
        if (result) {
          let file = result.resolvedFileName
          if (file.endsWith('.vue.ts') && fileExists(file.slice(0, -3))) file = file.slice(0, -3)
          add(file)
        }
      }
      // Vue源文件不属于原生TS扩展，补足同一paths/相对路径的SFC观察。
      const bases: string[] = []
      if (name.startsWith('.')) bases.push(path.resolve(path.dirname(containing), name))
      const base = options.baseUrl ?? (typeof options.pathsBasePath === 'string' ? options.pathsBasePath : root)
      for (const [pattern, targets] of Object.entries(options.paths ?? {})) {
        const star = pattern.indexOf('*')
        const match = star < 0 ? name === pattern : name.startsWith(pattern.slice(0, star)) && name.endsWith(pattern.slice(star + 1))
        if (match) for (const target of targets) bases.push(path.resolve(base, target.replace('*', star < 0 ? '' : name.slice(star, name.length - (pattern.length - star - 1)))))
      }
      if (path.isAbsolute(name)) bases.push(name)
      if (options.baseUrl) bases.push(path.resolve(options.baseUrl, name))
      for (const target of bases) for (const candidate of [target, `${target}.vue`, `${target}.ts`, `${target}.tsx`, path.join(target, 'index.vue'), path.join(target, 'index.ts')]) add(candidate)
    }
    const typeReference = (name: string, containing: string): void => {
      for (const mode of [ts.ModuleKind.ESNext, ts.ModuleKind.CommonJS] as const) {
        const resolved = ts.resolveTypeReferenceDirective(name, containing, options, host, undefined, undefined, mode).resolvedTypeReferenceDirective
        if (resolved?.resolvedFileName) add(resolved.resolvedFileName)
      }
    }
    for (const entry of input.exposes) {
      const file = path.resolve(root, entry.import.replace(/^\.?\//, ''))
      if (fileExists(file)) add(file)
      else module(entry.import, from)
    }
    for (const name of ts.getAutomaticTypeDirectiveNames(options, host)) typeReference(name, config ?? from)
    if (options.lib) for (const lib of options.lib) add(path.join(path.dirname(ts.getDefaultLibFilePath(options)), lib))
    else if (!options.noLib) add(ts.getDefaultLibFilePath(options))
    while (queues.length) {
      const file = queues.pop()!
      if (visited.has(file)) continue
      visited.add(file)
      let text = read(file)
      if (text === undefined) continue
      if (file.endsWith('.vue')) {
        const parser = createRequire(from)('vue/compiler-sfc') as { parse(text: string): { descriptor: { script?: { content: string; src?: string }; scriptSetup?: { content: string; src?: string }; template?: { src?: string; lang?: string }; styles: Array<{ module?: unknown; src?: string }> } } }
        const { descriptor } = parser.parse(text)
        // 外部模板/自定义模板编译与外部CSS模块可有未声明输入，保守走正常编译。
        if (descriptor.template?.src || (descriptor.template?.lang && descriptor.template.lang !== 'html')
          || descriptor.styles.some(s => s.module && s.src)) unsupported = true
        for (const script of [descriptor.script, descriptor.scriptSetup]) if (script?.src) module(script.src, file)
        text = [descriptor.script?.content, descriptor.scriptSetup?.content].filter(Boolean).join('\n')
      }
      if (!/\.(?:[cm]?[jt]sx?|vue)$/.test(file)) continue
      const info = ts.preProcessFile(text, true, true)
      for (const imported of info.importedFiles) module(imported.fileName, file)
      // preProcessFile不包含JSDoc的import类型；JS/JSDoc工程也必须跟踪这些依赖。
      if (text.includes('/**') && text.includes('import')) {
        const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true,
          /\.[jt]sx$/.test(file) ? ts.ScriptKind.TSX : /\.[cm]?js$/.test(file) ? ts.ScriptKind.JS : ts.ScriptKind.TS)
        const visit = (node: TS.Node): void => {
          if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) module(node.argument.literal.text, file)
          if (node.kind === ts.SyntaxKind.JSDocImportTag) {
            const specifier = (node as TS.JSDocImportTag).moduleSpecifier
            if (ts.isStringLiteral(specifier)) module(specifier.text, file)
          }
          ts.forEachChild(node, visit)
          for (const doc of (node as TS.Node & { jsDoc?: readonly TS.JSDoc[] }).jsDoc ?? []) visit(doc)
        }
        visit(source)
      }
      for (const ref of info.referencedFiles) add(path.resolve(path.dirname(file), ref.fileName))
      for (const ref of info.typeReferenceDirectives) typeReference(ref.fileName, file)
      for (const ref of info.libReferenceDirectives ?? []) {
        add(path.join(path.dirname(ts.getDefaultLibFilePath(options)), `lib.${ref.fileName.toLowerCase()}.d.ts`))
        module(`@typescript/lib-${ref.fileName.toLowerCase().replace('.', '/')}`, from)
      }
    }
    // Vue的自定义语言插件可读任意外部资源；不能把它们猜作确定性输入。
    for (const file of Object.keys(snapshot.files)) if (file.endsWith('.json')) {
      const configText = ts.parseConfigFileTextToJson(file, fs.readFileSync(file, 'utf8')).config as { vueCompilerOptions?: { plugins?: unknown[]; hooks?: unknown[] } } | undefined
      if (configText?.vueCompilerOptions?.plugins?.length || configText?.vueCompilerOptions?.hooks?.length) unsupported = true
    }
    snapshot.runtimeTools = [...toolRuntime]
    return unsupported ? null : snapshot
  } catch { return null }
}

/** 返回未通过原因；生成前后检查还比较stat，防止编译中改动后又撤回的ABA窗口。 */
export function validateTypesInputs(snapshot: TypesInputSnapshot, root: string, stable = false): string | null {
  try {
    // 每个文件先后检查本次读取的身份；再在全部解析和目录检查结束后复检，
    // 避免校验早期文件后、结束前发生外部修改而错误命中。
    const checked = new Map<string, FileStamp>()
    const checkedDirectories = new Map<string, { mtime: number; ctime: number; ino: number }>()
    for (const dir of Object.keys(snapshot.directoryStats ?? {})) {
      const stat = fs.statSync(dir)
      const now = { mtime: stat.mtimeMs, ctime: stat.ctimeMs, ino: stat.ino }
      // 目录mtime会被不相关的同级工程/编译临时文件更新；生成期间由文件身份、
      // 解析成员与监听事件判断，目录stat只封闭本次校验中的并发变化窗口。
      checkedDirectories.set(dir, now)
    }
    for (const [file, before] of Object.entries(snapshot.files)) {
      const prior = fs.statSync(file)
      const now = stamp(file)
      if (prior.ctimeMs !== now.ctime || prior.mtimeMs !== now.mtime || prior.ino !== now.ino || prior.size !== now.size
        || now.hash !== before.hash || (stable && (now.ctime !== before.ctime || now.mtime !== before.mtime || now.ino !== before.ino))) return `输入文件变化：${path.relative(root, file)}`
      checked.set(file, now)
    }
    for (const [probe, expected] of Object.entries(snapshot.probes)) {
      const file = probe.slice(2)
      let found = false
      try { const stat = fs.statSync(file); found = probe.startsWith('f:') ? stat.isFile() : stat.isDirectory() } catch { /* 缺失 */ }
      if (found !== expected) return `输入成员变化：${path.relative(root, file)}`
    }
    for (const [dir, queries] of Object.entries(snapshot.fileQueries)) {
      let rows: fs.Dirent[] = []
      try { rows = fs.readdirSync(dir, { withFileTypes: true }) } catch (e) {
        if (!['ENOENT', 'ENOTDIR'].includes((e as NodeJS.ErrnoException).code ?? '')) return '输入目录不可读取'
      }
      const entries = new Map(rows.flatMap(row => [[`e:${row.name}`, row], [`f:${row.name.toLowerCase()}`, row]] as Array<[string, fs.Dirent]>))
      for (const [name, expected] of Object.entries(queries)) {
        const row = entries.get(`e:${name}`) ?? (!snapshot.caseSensitive ? entries.get(`f:${name.toLowerCase()}`) : undefined)
        let actual = row?.isFile() ?? false
        if (row && row.name !== name) {
          try { actual = fs.statSync(path.join(dir, name)).isFile() } catch { actual = false }
        }
        if (row?.isSymbolicLink()) {
          try { actual = fs.statSync(path.join(dir, name)).isFile() } catch { actual = false }
        }
        if (actual !== expected) return `依赖解析候选变化：${path.relative(root, path.join(dir, name))}`
      }
    }
    for (const [file, expected] of Object.entries(snapshot.links)) if (linkIdentity(file) !== expected) return '依赖链接目标变化'
    for (const query of snapshot.resolutions) if (resolve(query.from, query.request) !== query.resolved) return '工具依赖解析变化'
    const tsPath = resolve(path.join(root, 'package.json'), 'typescript')
    if (!tsPath) return 'TypeScript工具不可用'
    const ts = createRequire(path.join(root, 'package.json'))('typescript') as typeof TS
    for (const query of snapshot.directories) {
      const result = query.kind === 'files'
        ? ts.sys.readDirectory(query.root, query.extensions, query.excludes, query.includes, query.depth).filter(file => !temporary(file))
        : query.kind === 'dirs' ? ts.sys.getDirectories(query.root)
        : fs.readdirSync(query.root, { withFileTypes: true }).filter(entry => !['node_modules', '.git', '.svn', '.cache'].includes(entry.name)
          && (entry.isDirectory() ? query.recurse : /\.(?:[cm]?js|[cm]?tsx?|json|vue|node|wasm)$/.test(entry.name))).map(entry => entry.name)
      if (JSON.stringify(sorted(result)) !== JSON.stringify(query.result)) return `输入目录成员变化：${path.relative(root, query.root)}`
    }
    for (const [dir, before] of checkedDirectories) {
      const stat = fs.statSync(dir)
      if (stat.mtimeMs !== before.mtime || stat.ctimeMs !== before.ctime || stat.ino !== before.ino) {
        // 父目录可能只新增了不相关的兄弟工程；只重查真实解析候选，不能因此重编译。
        for (const [name, expected] of Object.entries(snapshot.fileQueries[dir] ?? {})) {
          let actual = false
          try { actual = fs.statSync(path.join(dir, name)).isFile() } catch { /* 缺失 */ }
          if (actual !== expected) return `校验期间解析候选变化：${path.relative(root, path.join(dir, name))}`
        }
        if (snapshot.directories.some(query => query.root === dir)) return `校验期间输入目录变化：${path.relative(root, dir)}`
      }
    }
    for (const [file, before] of checked) {
      const now = fs.statSync(file)
      if (now.ctimeMs !== before.ctime || now.mtimeMs !== before.mtime || now.ino !== before.ino || now.size !== before.size) return `校验期间输入变化：${path.relative(root, file)}`
    }
    return null
  } catch { return '输入不可读取或快照无效' }
}
function runtimeIsStable(snapshot: TypesInputSnapshot): boolean {
  // Node模块不会在原地编辑后自动重新加载；这种进程不读写持久结果，重启后恢复。
  return snapshot.runtimeTools.every(file => (snapshot.files[file]?.ctime ?? Infinity) <= PROCESS_START)
}

/** 后台服务可延后输入校验，先安装外部监听，再调用validateTypesInputs；其他调用默认完整校验。 */
export function readTypesCache(input: TypesCacheInput, verifyInputs = true): { result: DtsGenerateOk; snapshot: TypesInputSnapshot } | null {
  try {
    const file = typesCachePath(input.root)
    if (fs.statSync(file).size > MAX_CACHE_BYTES) return null
    const envelope = JSON.parse(gunzipSync(fs.readFileSync(file), { maxOutputLength: MAX_CACHE_BYTES }).toString('utf8')) as { digest: string; payload: { format: number; key: string; snapshot: TypesInputSnapshot; files: Record<string, string>; tool: 'typescript' | 'vue-tsc' } }
    const p = envelope.payload
    if (envelope.digest !== hash(JSON.stringify(p)) || p.format !== CACHE_FORMAT || p.key !== settings(input)) return null
    const rawIndex = JSON.parse(p.files['index.json']!) as Record<string, unknown>
    const { revision, ...indexBody } = rawIndex
    if (revision !== hash(JSON.stringify(indexBody)).slice(0, 16)) return null
    const parsed = parseDtsIndex(rawIndex)
    const index = parsed.index
    if (!index || index.pluginVersion !== input.pluginVersion || index.generator !== '@fulgurjs/federation'
      || !['typescript', 'vue-tsc'].includes(p.tool) || Object.keys(index.files).length > DTS_FILE_COUNT_MAX) return null
    if (Object.keys(p.files).length !== Object.keys(index.files).length + 1) return null
    if (JSON.stringify(sorted(Object.keys(index.exposes))) !== JSON.stringify(sorted(input.exposes.map(e => e.name)))) return null
    let bytes = 0
    for (const [name, digest] of Object.entries(index.files)) {
      const text = p.files[name]
      if (typeof text !== 'string' || Buffer.byteLength(text) > DTS_FILE_MAX_BYTES || hash(text) !== digest) return null
      bytes += Buffer.byteLength(text)
    }
    if (bytes > DTS_TOTAL_MAX_BYTES || !runtimeIsStable(p.snapshot) || (verifyInputs && validateTypesInputs(p.snapshot, input.root))) return null
    return { snapshot: p.snapshot, result: { ok: true, index, files: new Map(Object.entries(p.files)), tool: p.tool, fileCount: Object.keys(index.files).length, notices: [] } }
  } catch { return null }
}

export function writeTypesCache(input: TypesCacheInput, snapshot: TypesInputSnapshot, result: DtsGenerateOk, temporaryId?: string): void {
  if (!runtimeIsStable(snapshot)) return
  const file = typesCachePath(input.root)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const payload = { format: CACHE_FORMAT, key: settings(input), snapshot, files: Object.fromEntries(result.files), tool: result.tool }
  const text = JSON.stringify({ digest: hash(JSON.stringify(payload)), payload })
  if (Buffer.byteLength(text) > MAX_CACHE_BYTES) return
  if (temporaryId && !/^[0-9a-f-]{36}$/i.test(temporaryId)) throw new Error('无效的缓存临时标识')
  const temporaryFile = `${file}.${process.pid}.${temporaryId ?? crypto.randomUUID()}.tmp`
  try { fs.writeFileSync(temporaryFile, gzipSync(text)); fs.renameSync(temporaryFile, file) }
  finally { fs.rmSync(temporaryFile, { force: true }) }
}
