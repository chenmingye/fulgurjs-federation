/**
 * 代码改写器（dev 与 prod 共用，保证两环境行为一致）。
 *
 * 架构（v2：绑定门面）：
 * 1. shared 依赖的静态导入 → 保留 import 语句形态，仅把 specifier 原位替换为"绑定门面"虚拟模块
 *    （门面内做 loadShare 协商并转发所请求的绑定；消费方保持同步求值——
 *     兼容 auto-import / qiankun 等会在其后注入 import 的插件，也不改变大型工程循环依赖的求值顺序）
 * 2. shared 的动态导入 / 命名空间导入 → `loadShare(...)`（TLA，仅这两种少见形态落在消费方）
 * 3. remote 导入（'remote-a/Button'）→ 绑定门面（静态）/ `loadRemote(...)`（动态）
 */
import { init as initLexer, parse } from 'es-module-lexer'
import MagicString from 'magic-string'
import path from 'node:path'
import type { NormalizedOptions, NormalizedShared } from './options'
import { SHARED_FACADE_PREFIX } from './options'

let lexerReady: Promise<unknown> | null = null
function ensureLexer() {
  lexerReady ??= initLexer
  return lexerReady
}

/**
 * 判断被 transform 的文件是否为 exposes 目标源文件（联邦远程页面的入口）。
 * exposes 声明可省略扩展名（'./src/x' → x.ts/.vue/...），故逐个候选扩展名比对；
 * cleanPath 已剥离 query（.vue 的 script 子请求 clean 后与主请求同路径，同样命中）。
 */
export function isExposeTargetFile(cleanPath: string, root: string, exposes: { import: string }[]): boolean {
  for (const e of exposes) {
    const abs = path.resolve(root, e.import.replace(/^\.\//, ''))
    if (cleanPath === abs) return true
    for (const ext of ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.vue']) {
      if (cleanPath === abs + ext) return true
    }
  }
  return false
}

/**
 * D.1 守卫报错文案（三段式：现象 → 根因 → 修法）。
 * exposes 目标文件静态导入虚拟运行时是明确误用：该文件必然被宿主跨源加载，
 * 导入会改由远程 dev server 求值，在远程模块图内实例化第二份运行时副本，
 * 破坏渲染上下文（resolveComponent / withDirectives / ref owner 告警、内容区空白）。
 */
export function staticRuntimeImportError(root: string, cleanPath: string): string {
  const rel = path.relative(root, cleanPath) || cleanPath
  return (
    `[fulgur] ${rel} statically imports 'virtual:fulgur-runtime'.\n` +
    `This file is a federation expose: when the host loads it cross-origin, the import is resolved by the REMOTE dev server and instantiates a second runtime copy inside the remote module graph, which breaks the render context (resolveComponent / withDirectives / "Missing ref owner" warnings, blank content area).\n` +
    `Fix: access the host-initialized singleton instead — e.g. const runtime = (globalThis as any).__FULGUR_RUNTIME__ — or use getRuntime() from the standalone /fulgur-runtime.js build. See docs/迁移指南.md (远程页面如何取宿主运行时).`
  )
}

interface SharedMatcher {
  exact: Map<string, NormalizedShared>
  prefixes: Array<{ prefix: string; item: NormalizedShared }>
}

function buildSharedMatcher(shared: NormalizedShared[]): SharedMatcher {
  const exact = new Map<string, NormalizedShared>()
  const prefixes: Array<{ prefix: string; item: NormalizedShared }> = []
  for (const s of shared) {
    // 别名（configKey / import / packageName）都指向同一共享项：
    // 覆盖 vue 等插件注入的 helper import（如 remote-b 场景下 helper 从 'vue' 导入）
    for (const alias of s.aliases) {
      if (!exact.has(alias)) exact.set(alias, s)
    }
    if (s.configKey.endsWith('/')) prefixes.push({ prefix: s.configKey, item: s })
  }
  return { exact, prefixes }
}

function matchShared(spec: string, matcher: SharedMatcher): NormalizedShared | null {
  const exact = matcher.exact.get(spec)
  if (exact) return exact
  for (const p of matcher.prefixes) {
    if (spec.startsWith(p.prefix)) return p.item
  }
  return null
}

/** loadShare 调用参数序列化（运行时协商所需的全部 webpack 语义）。fallbackUrl 覆盖默认的命名空间门面地址 */
export function serializeShareCallForFacade(item: NormalizedShared, fallbackUrl?: string): string {
  const opts: string[] = []
  opts.push(`shareScope: ${JSON.stringify(item.shareScope)}`)
  opts.push(`shareKey: ${JSON.stringify(item.shareKey)}`)
  if (item.requiredVersion !== false) opts.push(`requiredVersion: ${JSON.stringify(item.requiredVersion)}`)
  if (item.singleton) opts.push('singleton: true')
  if (item.strictVersion) opts.push('strictVersion: true')
  if (item.import !== false) {
    const facadeUrl = fallbackUrl ?? SHARED_FACADE_PREFIX + item.shareKey
    opts.push(`fallback: () => import(${JSON.stringify(facadeUrl)})`)
  }
  return `__fulgur_loadShare(${JSON.stringify(item.shareKey)}, { ${opts.join(', ')} })`
}

function serializeShareCall(item: NormalizedShared, devUrls?: TransformContext['devUrls']): string {
  const opts: string[] = []
  opts.push(`shareScope: ${JSON.stringify(item.shareScope)}`)
  opts.push(`shareKey: ${JSON.stringify(item.shareKey)}`)
  if (item.requiredVersion !== false) opts.push(`requiredVersion: ${JSON.stringify(item.requiredVersion)}`)
  if (item.singleton) opts.push('singleton: true')
  if (item.strictVersion) opts.push('strictVersion: true')
  if (item.import !== false) {
    const facadeUrl = devUrls ? devUrls.namespaceFacade(item.shareKey) : SHARED_FACADE_PREFIX + item.shareKey
    opts.push(`fallback: () => import(${JSON.stringify(facadeUrl)})`)
  }
  return `__fulgur_loadShare(${JSON.stringify(item.shareKey)}, { ${opts.join(', ')} })`
}

interface Binding {
  imported: string
  local: string
  isDefault: boolean
}

function stripComments(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

function parseBindings(inner: string): Binding[] {
  const out: Binding[] = []
  for (const piece of stripComments(inner).split(',')) {
    const raw = piece.trim()
    if (!raw) continue
    if (/^type\s/.test(raw)) continue // inline type 标识符
    const asMatch = raw.match(/^(.*?)\s+as\s+(.+)$/)
    const imported = asMatch ? asMatch[1].trim() : raw
    const local = asMatch ? asMatch[2].trim() : raw
    out.push({ imported, local, isDefault: imported === 'default' })
  }
  return out
}

/** 解析 `import <clause> from` 中的 clause（已去掉 'from' 尾巴） */
function parseImportClause(clause: string) {
  const nsMatch = clause.match(/\*\s+as\s+(\w+)/)
  const braceStart = clause.indexOf('{')
  const bindings = braceStart !== -1 ? parseBindings(clause.slice(braceStart + 1, clause.lastIndexOf('}'))) : null
  let head = clause.replace(/^\s*import\s*/, '')
  if (braceStart !== -1) head = head.slice(0, head.indexOf('{'))
  if (nsMatch) head = head.slice(0, head.indexOf('*'))
  const defaultLocal = head.replace(/,\s*$/, '').trim() || null
  return { ns: nsMatch?.[1] ?? null, bindings, defaultLocal }
}

export interface TransformContext {
  options: NormalizedOptions
  /** dev post 阶段：把 vite 依赖预构建 URL 映射回包名；prod 直接用原始 specifier */
  remapSpecifier?: (spec: string) => string | null
  /** 是否改写本应用源码中的 shared 导入（dev 宿主为 false，remote/build 为 true） */
  rewriteShared: boolean
  /**
   * 是否改写 node_modules 内的模块（远程应用需要：依赖包（element-plus 等）对 shared 键的
   * 导入也必须走门面，否则依赖 chunk 内联本地 shared 副本，与宿主形成双运行时——
   * 典型症状：宿主渲染远程组件时 element-plus 的 renderSlot 读到 null 实例）。
   * dev 下配合 optimizeDeps.exclude 使用（预构建产物内联代码无法改写）。
   */
  allowNodeModules?: boolean
  /**
   * build 专用：CJS/UMD 文本里的 require(<shared>) 重定向到 CJS 垫片虚拟模块
   * （赶在 vite:commonjs 转换前，防依赖子树内联第二份 vue 运行时）。
   * dev 不启用——dev 的 CJS 依赖走 optimizeDeps 预构建外部化。
   */
  cjsRequireRewrite?: boolean
  /** dev post 阶段：生成的运行时/门面引用必须是最终 URL（importAnalysis 已跑过） */
  devUrls?: {
    runtime: string
    namespaceFacade: (shareKey: string) => string
    bindingFacade: (facadeId: string) => string
  }
}

export interface TransformResult {
  code: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  map: any
}

const JS_EXT_RE = /\.(m|c)?[jt]sx?$/

export function isTransformableId(id: string, allowNodeModules = false): boolean {
  const clean = id.split('?')[0]
  if (!JS_EXT_RE.test(clean) && !clean.endsWith('.vue')) return false
  if (clean.includes('node_modules') && !allowNodeModules) return false
  return true
}

/**
 * 绑定门面注册表：完整绑定集不入 id（避免产物文件名超长），仅登记短签名。
 * transform 时注册，load 时反查。
 */
const facadeRegistry = new Map<string, { bindings: string[]; shareKey?: string; remoteName?: string; exposeName?: string }>()

function shortSig(kind: string, key: string, bindings: string[]): string {
  // 签名必须确定性：同 key+绑定集恒得同签名。dev 下签名进入源码转换产物并被
  // moduleGraph/浏览器持有，若掺入进程内状态（自增序号），dev server 重启或模块
  // 重转换后签名漂移，旧引用全部 404（element-plus 源码经改写管线时必现）
  const full = kind + '|' + key + '|' + bindings.join('|')
  let h = 5381
  for (let i = 0; i < full.length; i++) h = ((h << 5) + h + full.charCodeAt(i)) | 0
  // 绑定集长度入签名，降低不同绑定集哈希碰撞同 id 的概率
  const id = (h >>> 0).toString(36) + bindings.length.toString(36)
  facadeRegistry.set(id, kind === 'shared' ? { bindings, shareKey: key } : { bindings, remoteName: key })
  return id
}

export function getFacadeEntry(id: string) {
  return facadeRegistry.get(id)
}

/** 绑定门面虚拟 id：共享键 + 短签名（消费方 import 语句直接指向它） */
function canonicalBindings(bindings: string[]): string[] {
  const names = new Set<string>()
  for (const bRaw of bindings) {
    if (bRaw === 'default') continue
    const asMatch = bRaw.match(/^(.*?)\s+as\s+(.+)$/)
    names.add((asMatch ? asMatch[1] : bRaw).trim())
  }
  return [...names].sort()
}

function bindingFacadeId(item: NormalizedShared, bindings: string[]): string {
  const canonical = canonicalBindings(bindings)
  const sig = canonical.length ? `?f=${shortSig('shared', item.shareKey, canonical)}` : ''
  return `${SHARED_FACADE_PREFIX}${item.shareKey}${sig}`
}

function facadeSpecFor(ctx: TransformContext, item: NormalizedShared, bindings: string[]): string {
  const id = bindingFacadeId(item, bindings)
  return ctx.devUrls ? ctx.devUrls.bindingFacade(id) : id
}

function remoteBindingFacadeId(remoteName: string, exposeName: string, bindings: string[]): string {
  const canonical = canonicalBindings(bindings)
  const sig = canonical.length ? `?f=${shortSig('remote', `${remoteName}/${exposeName}`, canonical)}` : ''
  return `${SHARED_FACADE_PREFIX}__remote__${remoteName}/${exposeName}${sig}`
}

function remoteFacadeSpecFor(
  ctx: TransformContext,
  remoteName: string,
  exposeName: string,
  bindings: string[],
): string {
  const id = remoteBindingFacadeId(remoteName, exposeName, bindings)
  return ctx.devUrls ? ctx.devUrls.bindingFacade(id) : id
}

/** 主改写函数。返回 null 表示无需改写 */
export async function transformModule(
  code: string,
  id: string,
  ctx: TransformContext,
): Promise<TransformResult | null> {
  const { options } = ctx
  if (options.shared.length === 0 && options.remotes.length === 0) return null

  // 快速预检：源码必须包含某个 shared 键或 remote 键，否则跳过（性能）
  const candidates: string[] = []
  for (const s of options.shared) candidates.push(s.configKey.replace(/\/$/, ''))
  for (const r of options.remotes) candidates.push(r.key)
  if (!candidates.some((c) => code.includes(c))) return null

  // ---- CJS/UMD 依赖的 require(<shared>) 重定向（avue UMD、element-plus lib 等）----
  // 必须赶在 vite:commonjs 转换之前：commonjs 会把 require("vue") 解析为本地模块导入，
  // 把整条依赖子树钉死在第二份 vue 运行时上（联邦渲染即 'ce'/renderSlot null 崩溃）。
  // 这里把 require("vue") 重写为 require("virtual:fulgur-cjs-ns:vue")——保持 require 调用
  // 形态，commonjs 插件才会继续转换本模块（ESM import 前置会把文件变成 mixed 而被跳过，
  // module.exports 语义即断裂），并对垫片虚拟模块做 CJS→ESM interop。
  // 仅 build 启用；dev 的 CJS 依赖走 optimizeDeps 预构建（fulgur:optimize-shared-external）。
  if (ctx.cjsRequireRewrite && /require\s*\(\s*["']/.test(code)) {
    const sharedByAlias = new Map<string, NormalizedShared>()
    for (const s of options.shared) {
      if (s.import === false) continue
      for (const a of s.aliases) if (!a.includes('/')) sharedByAlias.set(a, s)
    }
    let cjsEdited = false
    for (const [alias, item] of sharedByAlias) {
      const re = new RegExp(`require\\((["'])${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\1\\)`, 'g')
      if (!re.test(code)) continue
      code = code.replace(re, `require(${JSON.stringify(`virtual:fulgur-cjs-ns:${item.shareKey}`)})`)
      cjsEdited = true
    }
    if (!cjsEdited) return null
    // 继续走 ESM 词法分析无意义（CJS 文本），直接以纯文本改写结果返回
    return { code, map: null }
  }

  await ensureLexer()
  let imports: Awaited<ReturnType<typeof parse>>[0]
  try {
    ;[imports] = parse(code)
  } catch {
    return null
  }

  const matcher = ctx.rewriteShared ? buildSharedMatcher(options.shared) : null
  const remotesByKey = new Map(options.remotes.map((r) => [r.key, r]))
  const s = new MagicString(code)
  let edited = false
  let usesRuntimeHelpers = false
  const tlaLines: string[] = [] // namespace / export * as 等少见形态的 TLA 兜底
  let tempIdx = 0
  const genTemp = () => `__fulgur_m${tempIdx++}`

  const remap = (spec: string): string => ctx.remapSpecifier?.(spec) ?? spec

  const remoteExposeName = (spec: string, remoteKey: string): string | null => {
    if (!spec.startsWith(`${remoteKey}/`)) return null
    const exposeRaw = spec.slice(remoteKey.length + 1)
    if (!exposeRaw) return null
    return exposeRaw.startsWith('.') ? exposeRaw : `./${exposeRaw}`
  }

  const bindingsOf = (clause: ReturnType<typeof parseImportClause>): string[] => [
    ...(clause.defaultLocal ? ['default'] : []),
    ...(clause.bindings ?? []).map((b) => (b.imported === b.local ? b.imported : `${b.imported} as ${b.local}`)),
  ]

  /** namespace / export * as 等 TLA 兜底：生成 await loadShare/loadRemote 声明 */
  const genTlaOverwrite = (
    stmtStart: number,
    stmtEnd: number,
    shared: NormalizedShared | null,
    remoteName: string | null,
    exposeName: string | null,
    clauseRaw: string,
    clause: ReturnType<typeof parseImportClause>,
  ) => {
    usesRuntimeHelpers = true
    const call = shared
      ? serializeShareCall(shared, ctx?.devUrls)
      : `__fulgur_loadRemote(${JSON.stringify(`${remoteName}/${exposeName}`)})`
    const nsAs = clauseRaw.match(/export\s+\*\s+as\s+(\w+)\s+from/)
    if (nsAs) {
      s.overwrite(stmtStart, stmtEnd, `const ${nsAs[1]} = await ${call};\nexport { ${nsAs[1]} };`)
      return
    }
    if (!clause.ns && !clause.bindings && !clause.defaultLocal) {
      s.overwrite(stmtStart, stmtEnd, `await ${call};`)
      return
    }
    const tmp = genTemp()
    const parts: string[] = [`${tmp} = await ${call}`]
    if (clause.ns) parts.push(`${clause.ns} = ${tmp}`)
    if (clause.defaultLocal) parts.push(`${clause.defaultLocal} = __fulgurU(${tmp})`)
    const named = clause.bindings?.filter((b) => !b.isDefault) ?? []
    if (named.length) {
      const destructure = named.map((b) => (b.imported === b.local ? b.local : `${b.imported}: ${b.local}`))
      parts.push(`{ ${destructure.join(', ')} } = ${tmp}`)
    }
    for (const b of clause.bindings?.filter((x) => x.isDefault) ?? []) {
      parts.push(`${b.local} = __fulgurU(${tmp})`)
    }
    s.overwrite(stmtStart, stmtEnd, `const ${parts.join(', ')}`)
  }

  for (const imp of imports) {
    const { d } = imp
    if (d === -2) continue // import.meta

    if (d === -1) {
      // 静态 import / export-from
      const rawSpec = code.slice(imp.s, imp.e).replace(/['"]/g, '')
      const spec = remap(rawSpec)
      const stmtStart = imp.ss
      let stmtEnd = imp.se
      while (code[stmtEnd] === ';') stmtEnd++

      const head = code.slice(stmtStart, stmtStart + 24)
      if (/^\s*(import|export)\s+type[\s{]/.test(head)) continue // 仅类型导入

      const shared = matcher ? matchShared(spec, matcher) : null
      const firstSeg = spec.split('/')[0]
      const remote = remotesByKey.get(firstSeg)
      const exposeName = remote ? remoteExposeName(spec, remote.key) : null

      if (!shared && !(remote && exposeName)) continue
      edited = true

      // ss..s 覆盖 `import ... from '`（含开头引号），解析子句
      const clauseRaw = code.slice(stmtStart, imp.s).replace(/['"]\s*$/, '')
      const isImport = clauseRaw.trimStart().startsWith('import')
      const clause = parseImportClause(clauseRaw.replace(/\bfrom\s*$/, ''))

      // namespace / export * as：需要完整命名空间 → TLA 兜底（少见形态）
      if (clause.ns || /export\s+\*\s+as\s+\w+\s+from/.test(clauseRaw)) {
        genTlaOverwrite(stmtStart, stmtEnd, shared, remote?.name ?? null, exposeName, clauseRaw, clause)
        continue
      }

      if (!isImport) {
        // export { a, b } from 'shared'
        const inner = clauseRaw.slice(clauseRaw.indexOf('{') + 1, clauseRaw.lastIndexOf('}'))
        if (/export\s+\*/.test(clauseRaw) && !clauseRaw.includes('{')) {
          throw new Error(
            `[fulgur] "export * from '${spec}'" on a shared module is not supported (ESM cannot create dynamic export bindings). ` +
              `Use named re-exports: "export { a, b } from '${spec}'".`,
          )
        }
        const bindings = parseBindings(inner).map((b) => (b.imported === 'default' ? 'default' : b.imported))
        const facadeSpec = shared
          ? facadeSpecFor(ctx, shared, bindings)
          : remoteFacadeSpecFor(ctx, remote!.name, exposeName!, bindings)
        s.overwrite(imp.s, imp.e, facadeSpec)
        continue
      }

      // 静态 import：保留整条语句，仅原位替换 specifier → 绑定门面
      const facadeSpec = shared
        ? facadeSpecFor(ctx, shared, bindingsOf(clause))
        : remoteFacadeSpecFor(ctx, remote!.name, exposeName!, bindingsOf(clause))
      s.overwrite(imp.s, imp.e, facadeSpec)
      continue
    }

    // 动态 import('...')：d 指向左括号，s/e 为带引号的字符串字面量
    const specExpr = code.slice(imp.s, imp.e).trim()
    const literal = specExpr.match(/^['"](.*)['"]$/s)
    if (!literal) continue
    const spec = remap(literal[1])
    const shared = matcher ? matchShared(spec, matcher) : null
    const firstSeg = spec.split('/')[0]
    const remote = remotesByKey.get(firstSeg)
    const exposeName = remote ? remoteExposeName(spec, remote.key) : null

    if (!shared && !(remote && exposeName)) continue
    edited = true
    usesRuntimeHelpers = true
    const callStart = code.lastIndexOf('import', d)
    const closeParen = code.indexOf(')', imp.e)
    if (shared) {
      // 动态导入返回完整命名空间 → loadShare（Promise 语义一致）
      s.overwrite(callStart, closeParen + 1, serializeShareCall(shared, ctx?.devUrls))
    } else if (remote && exposeName) {
      s.overwrite(
        callStart,
        closeParen + 1,
        `__fulgur_loadRemote(${JSON.stringify(`${remote.name}/${exposeName}`)})`,
      )
    }
  }

  if (!edited) return null

  if (usesRuntimeHelpers) {
    const runtimeSpec = JSON.stringify(ctx.devUrls?.runtime ?? 'virtual:fulgur-runtime')
    s.prepend(
      `import { loadShare as __fulgur_loadShare, loadRemote as __fulgur_loadRemote, unwrapDefault as __fulgurU } from ${runtimeSpec};\n`,
    )
  }
  // 不生成 sourcemap：hires 映射在 3 万模块级工程会占用数 GB 内存；本插件仅做语句级改写
  return { code: s.toString(), map: null }
}
