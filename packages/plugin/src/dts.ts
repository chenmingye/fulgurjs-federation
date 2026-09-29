/**
 * dev 类型直连：host 的 dev server 启动后，拉取各 remote 的 dev manifest，
 * 为 exposes 生成 declare module 声明，映射到 remote 本机源码（同机联调时获得源码级补全）。
 * remote 未提供可访问源码时生成 any 声明并提示。
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import type { ViteDevServer } from 'vite'
import type { NormalizedOptions } from './options'
import { parseManifest, type DevFederationManifest } from './manifest'

async function fetchManifest(devEntry: string, origin: string, attempts = 30, delayMs = 2000): Promise<DevFederationManifest | null> {
  let manifestUrl: URL
  try {
    const u = new URL(devEntry, origin)
    // 容器入口 @fulgurjs-entry.js → 对应 manifest 端点 @fulgurjs-manifest.json
    u.pathname = u.pathname.replace('@fulgurjs-entry.js', '@fulgurjs-manifest.json')
    manifestUrl = u
  } catch {
    return null
  }
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(manifestUrl, { signal: AbortSignal.timeout(3000) })
      if (res.ok) {
        // WP4：manifest 按契约模块校验（缺 schemaVersion 按 v1 兼容；坏形状/未知版本拒绝消费）
        const parsed = parseManifest(await res.json())
        if (parsed.unsupportedVersion) {
          console.warn(
            `[fulgurjs] 类型生成：远程 manifest 的协议版本为 ${parsed.unsupportedVersion}，当前仅支持版本 1；` +
              `已跳过类型映射。请对齐宿主与远程的 @fulgurjs/federation 版本。`,
          )
          return null
        }
        if (parsed.issues.length > 0) {
          console.warn(
            `[fulgurjs] 类型生成：远程 manifest 契约校验失败（${manifestUrl.href}）：` +
              parsed.issues.map((x) => `${x.field}: ${x.message}`).join('；') +
              `。类型映射跳过。`,
          )
          return null
        }
        // fsRoot 是 dev-only 可选字段：缺失（devFsRoot:false 或旧版本）由 generateDevTypes
        // 给出明确的降级提示，这里不做契约拒绝
        return parsed.manifest as DevFederationManifest
      }
    } catch {
      // remote 可能尚未启动，静默重试
    }
    await new Promise((r) => setTimeout(r, delayMs))
  }
  return null
}

function sourceHasDefaultExport(file: string): boolean {
  try {
    const text = fs.readFileSync(file, 'utf8')
    return /export\s+default\b/.test(text) || /export\s*\{[^}]*\bdefault\b[^}]*\}/.test(text)
  } catch {
    return false
  }
}

/**
 * 源码 re-export 的导入路径：非 .vue 一律去扩展名——TS 默认禁止 `.ts` 后缀导入
 * （allowImportingTsExtensions 才行），带后缀的 `export * from 'x.ts'` 在用户
 * skipLibCheck 下静默解析失败 → 模块类型为空（回归：SharedState 类型直连失效）。
 * .vue 保留扩展名（SFC 必须带后缀才能解析）。
 */
export function sourceImportPath(rel: string): string {
  return rel.startsWith('.') ? rel : `./${rel}`
}

export function stripTsExtension(importPath: string): string {
  return importPath.replace(/\.(mts|cts|ts|tsx)$/, '')
}

/**
 * 枚举 TS 源文件的顶层具名导出（正则面，够声明生成用）。
 * 环境模块（declare module）里的 `export *` 不转发具名导出（TS 实测限制，
 * 回归：SharedState 类型直连为空）——必须显式 `export { names } from`。
 */
export function extractTsExportNames(text: string): string[] {
  const names = new Set<string>()
  const push = (n: string | undefined) => {
    if (n && /^[A-Za-z_$][\w$]*$/.test(n) && n !== 'default') names.add(n)
  }
  for (const m of text.matchAll(/export\s+(?:declare\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/g)) push(m[1])
  for (const m of text.matchAll(/export\s+(?:declare\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/g)) push(m[1])
  for (const m of text.matchAll(/export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) push(m[1])
  for (const m of text.matchAll(/export\s+(?:interface|type|enum)\s+([A-Za-z_$][\w$]*)/g)) push(m[1])
  for (const m of text.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(',')) {
      const seg = part.trim()
      if (!seg) continue
      const typeOnly = /^type\s/.test(seg)
      const base = typeOnly ? seg.replace(/^type\s+/, '') : seg
      const asMatch = base.match(/^([\w$]+)\s+as\s+([\w$]+)$/)
      // export { a as b } → 导出名是别名 b；无别名 → 本名；default 不进具名列表
      if (asMatch) {
        if (asMatch[2] !== 'default') names.add(asMatch[2])
      } else if (base !== 'default') {
        names.add(base)
      }
    }
  }
  return [...names]
}

/**
 * 解析 dts 输出目录：默认统一进 `src/fulgurjs/types`（联邦所有产物集中一个文件夹，
 * src 布局项目 tsconfig include "src/**" 天然覆盖=零配置）；无 src 布局回退根目录
 * `.fulgurjs/types`。`dts: { dir }` 显式覆盖；`dts: false` 返回空串（不生成）。
 * ⚠️ 插件只写 types/ 子目录，src/fulgurjs/exposes/ 等用户代码绝不触碰。
 */
export function resolveDtsDir(dtsOpt: boolean | { dir?: string; mode?: 'source' | 'shim' } | undefined, rootHasSrc: boolean): string {
  if (dtsOpt === false) return ''
  return (typeof dtsOpt === 'object' ? dtsOpt.dir : undefined) ?? (rootHasSrc ? 'src/fulgurjs/types' : '.fulgurjs/types')
}

/** 解析 dts 形态：'source'（默认，跨工程源码直连=补全直达源码）/ 'shim'（宽松占位，IDE 全程干净） */
export function resolveDtsMode(dtsOpt: boolean | { dir?: string; mode?: 'source' | 'shim' } | undefined): 'source' | 'shim' {
  if (dtsOpt === false) return 'source'
  return (typeof dtsOpt === 'object' ? dtsOpt.mode : undefined) ?? 'source'
}

/**
 * shim 形态的单个模块声明块：只读源文件文本枚举导出名（不 re-export 源文件），
 * 生成宽松占位——IDE 不会跟进跨工程源文件，红波浪线根治；代价是无源码级补全/跳转。
 */
export function buildShimModule(abs: string, moduleSpecifier: string): string {
  // WP5：模块名统一合法 TS 字符串序列化（远程提供的 name 不直接拼进声明代码）
  const lines: string[] = [`declare module ${JSON.stringify(moduleSpecifier)} {`]
  if (abs.endsWith('.vue')) {
    lines.push(`  import type { DefineComponent } from 'vue'`)
    lines.push(`  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, any>`)
    lines.push(`  export default component`)
  } else {
    const text = fs.readFileSync(abs, 'utf8')
    for (const name of extractTsExportNames(text)) {
      lines.push(`  export const ${name}: any`)
    }
    if (sourceHasDefaultExport(abs)) {
      lines.push(`  const _default: any`)
      lines.push(`  export default _default`)
    }
    if (!fs.existsSync(abs)) {
      // 源文件不可读（理论上前置已过滤）：宽松 any 模块
      lines.push(`  export const __module: any`)
    }
  }
  lines.push(`}`)
  return lines.join('\n')
}

/** 无源码可读取时，以环境模块简写同时支持默认、具名和副作用导入。 */
function writeAnyModules(outDir: string, remoteKey: string, manifest: DevFederationManifest): void {
  const modules = manifest.exposes
    .filter((expose) => !manifest.setup || expose.name !== manifest.setup)
    .map((expose) => `declare module ${JSON.stringify(`${remoteKey}/${expose.name.replace(/^\.\//, '')}`)};`)
  const file = path.join(outDir, `${remoteKey}.d.ts`)
  // 降级同时清理插件自有的精确轨输出（<outDir>/<remoteKey>.d/，D03）：源码不可用后
  // 旧转发文件是失效 import（消费者 TS2307）。只删插件命名形态的自有输出，不触碰
  // 用户类型文件或其他远程目录。宿主 paths 指向该目录时目标缺失 → TS 跳过该映射 →
  // 回退到本函数写入的 ambient（导入可解析 any），不要求用户手动删 paths。
  fs.rmSync(path.join(outDir, `${remoteKey}.d`), { recursive: true, force: true })
  if (modules.length === 0) {
    if (fs.existsSync(file)) fs.unlinkSync(file)
    return
  }
  // 覆盖旧源码映射，避免切换为跨机开发后仍引用过期的本机路径。
  fs.writeFileSync(file, ['// 自动生成：远程源码不可访问，模块导出降级为 any。', ...modules, ''].join('\n'))
}


/**
 * JSONC → JSON 文本（保留字符串字面量，去 // 与 块注释、去 } ] 前的尾逗号）。
 * 线性扫描一次完成：JSON 只有 " 一种字符串，转义形态 \\ 与 \" 可靠判别；
 * 不用 eval/Function 构造（插件产物保持无 eval 纪律）。
 */
export function stripJsonc(text: string): string {
  let out = ''
  let i = 0
  const n = text.length
  let inStr = false
  let esc = false
  const skipWsAndComments = (from: number): number => {
    let j = from
    for (;;) {
      while (j < n && /\s/.test(text[j]!)) j++
      if (text[j] === '/' && text[j + 1] === '/') { while (j < n && text[j] !== '\n') j++; continue }
      if (text[j] === '/' && text[j + 1] === '*') { j += 2; while (j < n && !(text[j] === '*' && text[j + 1] === '/')) j++; j += 2; continue }
      return j
    }
  }
  while (i < n) {
    const c = text[i]!
    if (inStr) {
      out += c
      if (esc) esc = false
      else if (c === '\\') esc = true
      else if (c === '"') inStr = false
      i++
      continue
    }
    if (c === '"') { inStr = true; out += c; i++; continue }
    if (c === '/' && text[i + 1] === '/') { while (i < n && text[i] !== '\n') i++; continue }
    if (c === '/' && text[i + 1] === '*') { i += 2; while (i < n && !(text[i] === '*' && text[i + 1] === '/')) i++; i += 2; continue }
    if (c === ',') {
      const j = skipWsAndComments(i + 1)
      if (text[j] === '}' || text[j] === ']') { i = i + 1; continue } // 尾逗号：丢弃
      out += c
      i++
      continue
    }
    out += c
    i++
  }
  return out
}

function parseJsoncFile(file: string): ParsedTsConfig | null {
  let text: string
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch {
    return null
  }
  try {
    return JSON.parse(stripJsonc(text)) as ParsedTsConfig
  } catch {
    return null
  }
}

interface ParsedTsConfig {
  compilerOptions?: { paths?: Record<string, readonly string[]>; baseUrl?: string }
  extends?: string
  include?: unknown
  files?: unknown
  exclude?: unknown
  references?: unknown
}

/** extends 链解析出的生效 paths 及其声明位置（用于按声明配置的目录/baseUrl 解析目标） */
interface EffectivePaths {
  paths: Record<string, readonly string[]>
  declaredIn: string
  baseUrlDir: string | null
}

/**
 * 单个 include/exclude 模式是否在目录级覆盖 target（目录覆盖即递归含其下全部文件，
 * 与 TS include 的目录语义一致；足够上下文判定，不做完整 glob 语义）。
 */
function patternCoversDir(pattern: string, target: string, cfgDir: string): boolean {
  const norm = pattern.replace(/^\.\//, '').replace(/\\/g, '/')
  if (norm === '' || norm === '.') return target === cfgDir || target.startsWith(cfgDir + path.sep)
  let base: string
  if (norm.includes('**')) {
    base = norm.slice(0, norm.indexOf('**')).replace(/\/+$/, '')
  } else if (norm.endsWith('/*')) {
    base = norm.slice(0, -2)
  } else {
    base = norm.replace(/\/+$/, '')
  }
  const abs = base === '' ? cfgDir : path.resolve(cfgDir, base)
  return target === abs || target.startsWith(abs + path.sep)
}

/** include 语义：缺省 = 默认覆盖配置目录下全部；显式 = 任一模式覆盖即可 */
function includeCoversDir(target: string, include: unknown, cfgDir: string): boolean {
  if (!Array.isArray(include)) return target === cfgDir || target.startsWith(cfgDir + path.sep)
  return (include as unknown[]).some((p) => typeof p === 'string' && patternCoversDir(p, target, cfgDir))
}

/** exclude 语义：缺省排除不含工程内目录（node_modules 等默认排除不覆盖 src/输出目录） */
function excludeCoversDir(target: string, exclude: unknown, cfgDir: string): boolean {
  if (!Array.isArray(exclude)) return false
  return (exclude as unknown[]).some((p) => typeof p === 'string' && patternCoversDir(p, target, cfgDir))
}

/**
 * 该 tsconfig 的编译范围是否覆盖「应用源码或类型输出目录」——用于 references/多候选
 * 配置中识别真正消费应用导入的 TS 上下文（tsconfig.node.json 只含 vite.config.ts、
 * 独立 tsconfig.test.json 只含 tests 等，都算不上应用上下文）。
 */
function configCoversAppSource(cfgFile: string, cfg: ParsedTsConfig, root: string, outDir?: string): boolean {
  const cfgDir = path.dirname(cfgFile)
  const srcRoot = fs.existsSync(path.join(root, 'src')) ? path.join(root, 'src') : root
  const targets = outDir && outDir !== srcRoot ? [srcRoot, outDir] : [srcRoot]
  const hasInclude = Array.isArray(cfg.include)
  if (!hasInclude && Array.isArray(cfg.files) && cfg.files.length > 0) {
    // files 显式列出：仅当列出的文件位于应用源码/输出目录下才算覆盖
    return (cfg.files as unknown[]).some((f) => {
      if (typeof f !== 'string') return false
      const abs = path.resolve(cfgDir, f)
      return targets.some((t) => abs === t || abs.startsWith(t + path.sep))
    })
  }
  return targets.some((t) => includeCoversDir(t, cfg.include, cfgDir) && !excludeCoversDir(t, cfg.exclude, cfgDir))
}

/**
 * 选择主配置（浏览器应用导入的解析入口）：
 * - 有 tsconfig.json → 它（TS/IDE 约定的默认工程入口）；
 * - 无主配置且只有一份 tsconfig*.json（如仅 tsconfig.typecheck.json）→ 它即有效检查入口；
 * - 无主配置且多份候选 → 按 include 覆盖应用源码筛选；仍不唯一 → 判定失败（安全回退）。
 */
function selectPrimaryConfig(root: string, outDir?: string): string | null {
  const primary = path.join(root, 'tsconfig.json')
  if (fs.existsSync(primary)) return primary
  let files: string[]
  try {
    files = fs.readdirSync(root).filter((f) => /^tsconfig[\w.-]*\.json$/i.test(f))
  } catch {
    return null
  }
  if (files.length === 0) return null
  if (files.length === 1) return path.join(root, files[0]!)
  const matched = files.filter((f) => {
    const file = path.join(root, f)
    const cfg = parseJsoncFile(file)
    return cfg !== null && configCoversAppSource(file, cfg, root, outDir)
  })
  if (matched.length === 1) return path.join(root, matched[0]!)
  console.warn(
    `[fulgurjs] 类型生成：无法唯一确定应用 tsconfig 上下文（候选：${files.join('、')}）；` +
      `按未配置 paths 处理，生成默认宽松声明（导入可解析）。`,
  )
  return null
}

/**
 * 宿主是否为该 remote 配置了 paths（精确轨开关，决定是否跳过同名 ambient）。
 *
 * 语义化判定（5.1.2 修正：按真实 TS 上下文，不再全目录扫描）：
 * - 上下文选择：主配置（tsconfig.json，或唯一/唯一覆盖源码的 tsconfig*.json）+
 *   references 链上「include 覆盖应用源码或类型输出目录」的子项目。独立存在的
 *   tsconfig.test.json、只含 vite.config.ts 的 node 配置等不构成应用上下文，
 *   其 paths 不参与判定（不再按文件名排除，按语义过滤）；
 * - solution 型配置（files:[] + references）自身不编译文件，以其 references 判定；
 * - 沿 extends 链继承：链上第一个声明 paths 的配置生效（TS 继承语义：子级声明整体覆盖
 *   父级 paths）；extends 相对路径按声明文件所在目录解析；
 * - paths 目标与 baseUrl 按声明所在配置解析（baseUrl 相对其声明配置目录，目标相对
 *   生效 baseUrl，无 baseUrl 时相对声明配置目录）——继承自父目录配置的 paths 不再按
 *   子配置目录误算；
 * - 语义解析（JSONC 注释/尾逗号安全），不做原文正则匹配；
 * - 命中键：通配键 `<remote>/*`（TS 用 wildcard 匹配 `<remote>/Button`）。仅 exact 键
 *   不能覆盖 `<remote>/Button` 子路径，不算命中；
 * - 返回 true = 用户已接管该 remote 的解析（任何目标都算——ambient 一旦生成会遮蔽 paths
 *   命中的模块，必须跳过）；目标未指向插件精确目录时由调用方给出提示。
 * 配置无效或无法唯一确定上下文：按「未配置」处理（生成默认宽松轨，导入可解析）——宁可
 * 多生成可用声明，不让导入因误判失效。
 */
export function hostPathsCovers(root: string, remoteKey: string, preciseDir?: string, outDir?: string): boolean {
  const primary = selectPrimaryConfig(root, outDir)
  if (!primary) return false
  const contexts: string[] = []
  const visited = new Set<string>()
  const walk = (file: string, isPrimary: boolean, depth: number): void => {
    if (visited.has(file) || depth > 10) return
    visited.add(file)
    const cfg = parseJsoncFile(file)
    if (!cfg) return
    const isSolution = Array.isArray(cfg.files) && cfg.files.length === 0
    // solution 配置自身不编译文件（paths 对应用导入无作用），不计入；其余主配置恒计入，
    // 被 references 引用的配置按覆盖语义筛选
    if ((isPrimary || configCoversAppSource(file, cfg, root, outDir)) && !isSolution) contexts.push(file)
    if (!Array.isArray(cfg.references)) return
    for (const ref of cfg.references as unknown[]) {
      const refPath = (ref as { path?: unknown } | null)?.path
      if (typeof refPath !== 'string' || refPath === '') continue
      let next: string | null = null
      if (path.isAbsolute(refPath)) next = refPath
      else next = path.resolve(path.dirname(file), refPath)
      if (next !== null && !next.endsWith('.json')) next = `${next}.json`
      if (next !== null && fs.existsSync(next)) walk(next, false, depth + 1)
    }
  }
  walk(primary, true, 0)

  for (const ctxFile of contexts) {
    const eff = inheritedPaths(ctxFile)
    if (!eff) continue
    // 命中判定：只有通配键 `<remote>/*` 才覆盖 `<remote>/Button` 子路径（TS 语义——exact 键
    // 只映射模块 `<remote>` 本身，与生成的 `<remote>/<expose>` 声明无遮蔽关系，不算接管）
    if (!Object.keys(eff.paths).some((k) => k === `${remoteKey}/*`)) continue
    // 目标核对（诊断级）：任一通配目标应解析到插件生成的精确目录；否则提示用户自查。
    // 无论如何都跳过 ambient——ambient 一旦生成会遮蔽 paths 命中的模块（实测行为），
    // 用户自有映射（指向别处）同样会被遮蔽，必须让位。
    if (preciseDir) {
      const preciseReal = safeReal(preciseDir)
      const coversPrecise = preciseReal !== null && Object.entries(eff.paths)
        .filter(([k]) => k === `${remoteKey}/*`)
        .some(([, targets]) =>
          (Array.isArray(targets) ? targets : [targets]).some((t) => {
            if (typeof t !== 'string') return false
            const base = t.includes('*') ? t.slice(0, t.indexOf('*')) : t
            const resolvedBase = eff.baseUrlDir !== null
              ? path.resolve(eff.baseUrlDir, base)
              : path.resolve(path.dirname(eff.declaredIn), base)
            return preciseReal === resolvedBase || preciseReal.startsWith(resolvedBase + path.sep)
          }),
        )
      if (!coversPrecise) {
        console.warn(
          `[fulgurjs] 类型生成：宿主 ${path.relative(root, ctxFile)} 已为 "${remoteKey}" 配置 paths，` +
            `但目标未指向插件生成的精确目录（${preciseDir}）。` +
            `已跳过同名宽松声明以避免遮蔽你的映射；源码级类型由你的 paths 目标决定，请核对其解析结果。`,
        )
      }
    }
    return true
  }
  return false
}

/**
 * 沿 extends 链取该配置实际生效的 paths（链上第一个声明者生效——TS 继承语义：子级声明
 * 整体覆盖父级），并记录声明位置与生效 baseUrl：目标解析按声明配置目录/baseUrl 进行，
 * 不按使用方（子配置）目录误算。
 */
function inheritedPaths(tsconfigFile: string): EffectivePaths | undefined {
  const seen = new Set<string>()
  let current: string | null = tsconfigFile
  let baseUrlDecl: { file: string; value: string } | null = null
  while (current && !seen.has(current)) {
    seen.add(current)
    const cfg = parseJsoncFile(current)
    if (!cfg) return undefined
    if (!baseUrlDecl && cfg.compilerOptions?.baseUrl) {
      baseUrlDecl = { file: current, value: cfg.compilerOptions.baseUrl }
    }
    if (cfg.compilerOptions?.paths) {
      // 生效 baseUrl：距 paths 声明者最近的声明（子级覆盖父级），相对其声明配置目录解析
      const own = cfg.compilerOptions.baseUrl
      const baseUrlDir = own !== undefined
        ? path.resolve(path.dirname(current), own)
        : baseUrlDecl !== null ? path.resolve(path.dirname(baseUrlDecl.file), baseUrlDecl.value) : null
      return {
        paths: cfg.compilerOptions.paths as Record<string, readonly string[]>,
        declaredIn: current,
        baseUrlDir,
      }
    }
    if (!cfg.extends) return undefined
    // extends 解析：相对路径按声明文件所在目录（TS 语义，无 .json 后缀自动补）；包名走 node 解析
    const ext = cfg.extends
    let next: string | null = null
    if (path.isAbsolute(ext)) {
      next = ext
    } else if (ext.startsWith('.')) {
      next = path.resolve(path.dirname(current), ext)
    } else {
      try {
        next = createRequire(current).resolve(ext.endsWith('.json') ? ext : `${ext}.json`, { paths: [path.dirname(current)] })
      } catch {
        next = null
      }
    }
    if (next !== null && !next.endsWith('.json')) next = `${next}.json`
    current = next && fs.existsSync(next) ? next : null
  }
  return undefined
}

function safeReal(p: string): string | null {
  try {
    return fs.realpathSync(p)
  } catch {
    return path.resolve(p)
  }
}

export async function generateDevTypes(options: NormalizedOptions, server: ViteDevServer): Promise<void> {
  const dtsOpt = options.dts === undefined ? true : options.dts
  if (dtsOpt === false) return
  const mode = resolveDtsMode(dtsOpt)
  const dir = resolveDtsDir(dtsOpt, fs.existsSync(path.join(options.root, 'src')))
  const outDir = path.join(options.root, dir)
  fs.mkdirSync(outDir, { recursive: true })

  const origin = server.config?.server?.origin ?? server.resolvedUrls?.local[0] ??
    `${server.config?.server?.https ? 'https' : 'http'}://localhost:${server.config?.server?.port ?? 5173}`

  for (const remote of options.remotes) {
    if (!remote.devEntry || remote.promise) continue
    const manifest = await fetchManifest(remote.devEntry, origin)
    if (!manifest || !manifest.exposes) {
      console.warn(`[fulgurjs] 类型生成：远程应用 "${remote.key}" 的开发 manifest 不可用，已跳过类型映射。请检查远程开发服务和 manifest 地址。`)
      continue
    }
    const remoteRoot = manifest.fsRoot
    if (!remoteRoot) {
      console.warn(
        `[fulgurjs] 类型生成：远程应用 "${remote.key}" 的 manifest 未携带 fsRoot（可能关闭了 devFsRoot，或远程插件版本过旧）；` +
          `已生成 any 模块声明；不提供源码补全或跳转。同机联调请在远程启用 devFsRoot: true（默认值）并重启开发服务。`,
      )
      writeAnyModules(outDir, remote.key, manifest)
      continue
    }
    // WP5 路径边界：fsRoot 经 realpath 解析后再做包含判定——symlink 指向 root 外同样越界
    let realRoot: string
    try {
      realRoot = fs.realpathSync(remoteRoot)
    } catch {
      console.warn(
        `[fulgurjs] 类型生成：远程应用 "${remote.key}" 的 fsRoot 在本机不可访问，已生成 any 模块声明，不提供源码补全或跳转。请检查项目位置或关闭本机类型直连。`,
      )
      writeAnyModules(outDir, remote.key, manifest)
      continue
    }

    const lines: string[] = [
      `// 自动生成：fulgurjs-federation dev 类型直连（remote: ${remote.name}，mode: ${mode}）`,
      `// 重新生成：重启 host dev server`,
    ]
    // 双轨输出（5.1.0）：本文件是「零配置轨」的 ambient 声明；同名的 remote.d/ 目录是
    // 「精确轨」的转发模块（普通模块文件里的相对 re-export 合法）。TS 语言限制：ambient
    // declare module 内禁止相对 re-export（TS2439，用户工程常规 skipLibCheck 会把该错误
    // 静默吞掉使导出退 any），且模块文件不能声明新外部模块——精确类型只能经 tsconfig
    // paths 解析到转发模块获得（配置见 remote.d/ 内注释）。
    const preciseDir = path.join(outDir, `${remote.key}.d`)
    fs.rmSync(preciseDir, { recursive: true, force: true }) // 重启重建：移除已下线 expose 的残留转发文件
    fs.mkdirSync(preciseDir, { recursive: true })
    const preciseFiles: string[] = []
    let accepted = 0
    for (const expose of manifest.exposes ?? []) {
      // 内部 setup 生命周期入口不生成用户可导入的类型声明（manifest.setup 标识；
      // 用户不直接 loadRemote 该键，其文件也不属于公开 API 面）
      if (manifest.setup && expose.name === manifest.setup) continue
      const skipped = (reason: string) =>
        console.warn(`[fulgurjs] 类型生成：远程应用 "${remote.key}" 的暴露模块 ${JSON.stringify(expose.name)} 已跳过。原因：${reason}。请检查该模块在远程 manifest 中的源文件路径。`)
      // WP5：expose src 只接受相对路径——绝对路径 / 含 .. / 空路径一律拒绝（不可信 manifest 防线）
      const src = expose.src
      if (!src || typeof src !== 'string') {
        skipped('src 缺失')
        continue
      }
      if (src.startsWith('/') || /^[a-z]+:/i.test(src)) {
        skipped(`src 必须是相对路径，当前值为 ${JSON.stringify(src)}`)
        continue
      }
      if (src.split('/').includes('..')) {
        skipped(`src 不得包含 ..，当前值为 ${JSON.stringify(src)}`)
        continue
      }
      const abs = path.join(realRoot, src)
      // 越界判定在读取源码之前完成：realpath 解析 symlink 后 target 必须仍位于 realRoot 内
      let realAbs: string
      try {
        realAbs = fs.realpathSync(abs)
      } catch {
        skipped(`源文件不存在（${src}）`)
        continue
      }
      if (path.relative(realRoot, realAbs).startsWith('..')) {
        skipped(`解析结果越出 fsRoot（${src} → ${realAbs}）`)
        continue
      }
      if (!fs.existsSync(realAbs)) continue
      const rel = path.relative(outDir, realAbs).split(path.sep).join('/')
      const importPath = realAbs.endsWith('.vue') ? sourceImportPath(rel) : stripTsExtension(sourceImportPath(rel))
      // 精确轨转发文件的相对路径按其自身位置计算（expose 含目录层级时转发文件在子目录）
      const preciseFileDir = path.join(outDir, `${remote.key}.d`, path.dirname(expose.name.replace(/^\.\//, '').split('/').map((seg) => seg.replace(/[^A-Za-z0-9_-]/g, '_')).join('/')))
      const relPrecise = path.relative(preciseFileDir, realAbs).split(path.sep).join('/')
      const importPathPrecise = realAbs.endsWith('.vue') ? sourceImportPath(relPrecise) : stripTsExtension(sourceImportPath(relPrecise))
      // WP5：模块名统一合法 TS 字符串序列化（远程提供的 name 不直接拼进声明代码）
      const moduleSpecifier = `${remote.key}/${expose.name.replace(/^\.\//, '')}` // 'remote-a' + './Button' → 'remote-a/Button'
      const moduleLiteral = JSON.stringify(moduleSpecifier)
      const importLiteral = JSON.stringify(importPath)
      lines.push('')
      if (mode === 'shim') {
        lines.push(buildShimModule(realAbs, moduleSpecifier))
        accepted++
        continue
      }
      if (realAbs.endsWith('.vue')) {
        // .vue：宽松形态（宿主 tsc 解析 .vue import 需要自备 shim，不能假设）
        lines.push(`declare module ${moduleLiteral} {`)
        lines.push(`  import type { DefineComponent } from 'vue'`)
        lines.push(`  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>`)
        lines.push(`  export default component`)
        lines.push(`}`)
        // 精确轨：同样宽松（.vue 的精确类型依赖宿主 vue-tsc/shim，非插件可解）。
        // 子路径保留 expose 的目录层级（paths 通配 $1 直接命中）
        const subPath = expose.name.replace(/^\.\//, '').split('/').map((seg) => seg.replace(/[^A-Za-z0-9_-]/g, '_')).join('/')
        const preciseFile = path.join(preciseDir, `${subPath}.ts`)
        fs.mkdirSync(path.dirname(preciseFile), { recursive: true })
        preciseFiles.push(`${subPath}.ts`)
        fs.writeFileSync(
          preciseFile,
          [
            `// 自动生成（精确轨）：.vue expose 为宽松形态（精确类型需宿主 vue-tsc/shim）`,
            `import type { DefineComponent } from 'vue'`,
            `declare const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>`,
            `export default component`,
            ``,
          ].join('\n'),
        )
      } else {
        // .ts/.tsx：零配置轨用带体 ambient（default/具名导出/类型均为 any——可解析）。
        // 不能用简写 `declare module "x";`：简写会拦截同名 paths 解析，精确轨失效
        // （实测 paths 已命中转发文件仍被简写 shadow 成 any）。带体 ambient 不参与
        // resolution 竞争，配置 paths 后转发文件（源码级类型）自然接管。TS 语言限制：
        // 声明文件一旦有顶层 import 即成模块文件、其 declare module 失去全局性（TS2307）；
        // ambient 体内又禁止相对 re-export（TS2439，skipLibCheck 下静默退 any）、嵌套
        // import 的类型不流动——零配置下不存在合法的精确通路，源码级类型经精确轨
        // （remote.d/ 转发模块 + tsconfig paths）获得，见 _paths.d.ts 的启用说明。
        const srcText = fs.readFileSync(realAbs, 'utf8')
        const names = extractTsExportNames(srcText)
        const hasDefault = sourceHasDefaultExport(realAbs)
        lines.push(`declare module ${moduleLiteral} {`)
        if (hasDefault) lines.push(`  const __fg_default: any`, `  export default __fg_default`)
        for (const n of names) lines.push(`  export const ${n}: any`, `  export type ${n} = any`)
        if (!hasDefault && names.length === 0) lines.push(`  // 纯副作用模块（无可枚举导出）`)
        lines.push(`}`)
        // 精确轨：转发模块（普通文件相对 re-export 合法；paths 命中后经此拿到源码级类型）。
        // 子路径保留 expose 的目录层级（paths 通配 * 直接命中）
        const subPath = expose.name.replace(/^\.\//, '').split('/').map((seg) => seg.replace(/[^A-Za-z0-9_-]/g, '_')).join('/')
        // 普通模块（非 ambient）：export * 完整转发类型与值（含 interface/type）。
        // 后缀用 .ts（非 .d.ts）：.d.ts 引用 .tsx 实现文件时 TS 会把导出折叠成
        // namespace（TS2709 无法用作类型），普通源文件参与编译则类型从源符号流动
        const preciseFile = path.join(preciseDir, `${subPath}.ts`)
        fs.mkdirSync(path.dirname(preciseFile), { recursive: true })
        const fwd: string[] = [`// 自动生成（精确轨）：经 tsconfig paths 解析到本文件后获得源码级类型`]
        const preciseImportLiteral = JSON.stringify(importPathPrecise)
        if (names.length > 0 || hasDefault) fwd.push(`export * from ${preciseImportLiteral}`)
        if (hasDefault) fwd.push(`export { default } from ${preciseImportLiteral}`)
        if (fwd.length === 1) fwd.push(`import ${preciseImportLiteral}`) // 副作用模块
        fwd.push('')
        preciseFiles.push(`${subPath}.ts`)
        fs.writeFileSync(preciseFile, fwd.join('\n'))
      }
      accepted++
    }
    // WP5：异常 remote 只跳过自身（continue 已处理）；此处仅在有产出时落盘，杜绝半截声明
    if (accepted > 0) {
      // 智能双轨：宿主 tsconfig 已为该 remote 配置 paths（精确轨已启用）时不写同名
      // ambient——任何同名 ambient（含带体）都会 shadow paths 命中的转发文件（实测：
      // paths 解析成功但类型仍被 ambient 拦成 any），二者的切换开关就是 paths 配置本身
      const pathsEnabled = hostPathsCovers(options.root, remote.key, preciseDir, outDir)
      if (pathsEnabled) {
        if (fs.existsSync(path.join(outDir, `${remote.key}.d.ts`))) fs.unlinkSync(path.join(outDir, `${remote.key}.d.ts`))
        console.log(
          `[fulgurjs] 类型生成：检测到宿主 tsconfig 已配置 "${remote.key}/*" 的 paths——精确轨生效，跳过同名 ambient 声明（避免 shadow 转发模块）。`,
        )
      } else {
        fs.writeFileSync(path.join(outDir, `${remote.key}.d.ts`), `${lines.join('\n')}\n`)
      }
      // 精确轨 paths 说明（README 同步）：include 目录不变，加一段 paths 即升级精确类型
      fs.writeFileSync(
        path.join(preciseDir, '_paths.d.ts'),
        [
          `// 精确轨启用方法（把下面片段合入宿主 tsconfig 的 compilerOptions；baseUrl 指向本 tsconfig 所在目录）：`,
          `//   "paths": { "${remote.key}/*": ["${dir}/${remote.key}.d/*"] }`,
          `// 说明：零配置轨（${remote.key}.d.ts 的 ambient 声明）可解析但导出为宽松类型；`,
          `// 配置 paths 后同形态导入解析到本目录的转发模块，获得远程源码级类型精度。`,
          ``,
        ].join('\n'),
      )
    }
    console.log(
      `[fulgurjs] 类型生成：已生成 ${dir}/${remote.key}.d.ts（已收录 ${accepted}/${manifest.exposes?.length ?? 0} 个暴露模块，模式 ${mode}）。` +
        `请确保 tsconfig 的 include 包含 "${dir}"，以获得类型补全。`,
    )
  }
}
