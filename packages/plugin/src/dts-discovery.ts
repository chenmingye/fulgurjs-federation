/**
 * 类型目录的 tsconfig 发现检查（6.5.0 远程类型自动生成）。
 *
 * 生成目录（默认 src/fulgurjs/types）里的 ambient 声明要参与 IDE/tsc，必须被应用
 * 实际使用的 tsconfig 覆盖。本模块只**诊断不改写**：给出命中的（或全部未命中的）
 * 配置文件与最小修法。支持 extends 链、solution 型 references、严格 files 白名单、
 * exclude；目录级前缀语义与 TS include 的目录递归一致。
 */
import fs from 'node:fs'
import path from 'node:path'

export interface DtsDiscoveryResult {
  /** 是否被至少一个应用上下文配置覆盖 */
  covered: boolean
  /** 检查过的配置文件（相对 root） */
  configs: string[]
  /** 未覆盖时的最小修法（含具体配置文件与 include 片段） */
  fixHint: string | null
}

interface ParsedCfg {
  file: string
  include?: string[]
  files?: string[]
  exclude?: string[]
  references?: string[]
  extends?: string[]
}

/** JSONC → JSON（字符串字面量安全：去注释与尾逗号；不用 eval） */
export function stripJsoncForConfig(text: string): string {
  let out = ''
  let i = 0
  const n = text.length
  let inStr = false
  let esc = false
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
    out += c
    i++
  }
  // 去尾逗号
  return out.replace(/,(\s*[}\]])/g, '$1')
}

function readCfg(file: string): ParsedCfg | null {
  try {
    const raw = JSON.parse(stripJsoncForConfig(fs.readFileSync(file, 'utf8'))) as Record<string, unknown>
    const cfg: ParsedCfg = { file }
    for (const key of ['include', 'files', 'exclude'] as const) {
      const v = raw[key]
      if (Array.isArray(v)) cfg[key] = v.filter((x): x is string => typeof x === 'string')
    }
    if (Array.isArray(raw.references)) {
      cfg.references = (raw.references as { path?: unknown }[]).map((r) => (typeof r?.path === 'string' ? r.path : '')).filter(Boolean)
    }
    if (typeof raw.extends === 'string') cfg.extends = [raw.extends]
    else if (Array.isArray(raw.extends)) cfg.extends = raw.extends.filter((x): x is string => typeof x === 'string')
    return cfg
  } catch {
    return null
  }
}

/** 合并 extends 链的 include/files/exclude（后面的覆盖前面的；相对路径按声明文件目录解析） */
function effectiveCfg(cfg: ParsedCfg, depth = 0): ParsedCfg {
  if (depth > 16 || !cfg.extends || cfg.extends.length === 0) return cfg
  const merged = { ...cfg } as ParsedCfg
  delete merged.extends
  for (const parent of cfg.extends) {
    const parentFile = resolveConfigFile(parent, cfg.file)
    if (!parentFile) continue
    const parentCfg = effectiveCfg(readCfg(parentFile) ?? { file: parentFile }, depth + 1)
    const dirOf = (f: string, base: string) => path.resolve(path.dirname(base), f)
    if (parentCfg.include && !cfg.include) {
      merged.include = parentCfg.include.map((p) => path.relative(path.dirname(cfg.file), dirOf(p, parentFile)) || '.')
    }
    if (parentCfg.files && !cfg.files) {
      merged.files = parentCfg.files.map((p) => path.relative(path.dirname(cfg.file), dirOf(p, parentFile)))
    }
    if (parentCfg.exclude && !cfg.exclude) {
      merged.exclude = parentCfg.exclude.map((p) => path.relative(path.dirname(cfg.file), dirOf(p, parentFile)))
    }
  }
  return merged
}

function resolveConfigFile(value: string, declaringFile: string): string | null {
  let candidate = path.resolve(path.dirname(declaringFile), value)
  if (!candidate.endsWith('.json')) candidate += '.json'
  if (fs.existsSync(candidate)) return candidate
  const asDir = path.join(candidate, 'tsconfig.json')
  return fs.existsSync(asDir) ? asDir : null
}

/** 单个 include/exclude 模式是否在目录级覆盖 target（目录覆盖 = 递归含其下全部） */
function patternCoversDir(pattern: string, target: string, cfgDir: string): boolean {
  const norm = pattern.replace(/^\.\//, '')
  // A file-extension glob such as **/*.js does not exclude generated declarations.
  const extension = /\*([^/*]+)$/.exec(norm)?.[1]
  if (extension && !'__fulgurjs_probe__.d.ts'.endsWith(extension)) return false
  let base: string
  if (norm.includes('**')) base = norm.slice(0, norm.indexOf('**')).replace(/\/+$/, '')
  else if (norm.endsWith('/*')) base = norm.slice(0, -2)
  else base = norm.replace(/\/+$/, '')
  const abs = base === '' || base === '.' ? cfgDir : path.resolve(cfgDir, base)
  return target === abs || target.startsWith(abs + path.sep)
}

/**
 * typesRoot 是否被应用 tsconfig 覆盖。
 * 上下文选择：tsconfig.json 存在即主入口（TS/IDE 约定）；无主配置时取唯一 tsconfig*.json，
 * 多候选时全部检查（任一应用上下文覆盖即算发现——references/solution 由该配置自带）。
 */
export function checkTypesDiscovery(root: string, typesRoot: string): DtsDiscoveryResult {
  const relTypes = path.relative(root, typesRoot) || '.'
  const configs: string[] = []
  let primary = path.join(root, 'tsconfig.json')
  if (!fs.existsSync(primary)) {
    const candidates = fs.existsSync(root)
      ? fs.readdirSync(root).filter((f) => /^tsconfig[\w.-]*\.json$/i.test(f)).map((f) => path.join(root, f))
      : []
    if (candidates.length === 0) {
      return {
        covered: false,
        configs: [],
        fixHint: `工程没有 tsconfig：TypeScript 无法检查任何源码（含生成的远程类型）。请先为工程添加 tsconfig.json，include 至少覆盖 src 与 "${relTypes}"。`,
      }
    }
    primary = candidates[0]!
    if (candidates.length > 1) {
      // 多候选：逐个检查（任一覆盖即发现）
      let covered = false
      for (const file of candidates) {
        configs.push(path.relative(root, file))
        if (configCovers(file, typesRoot)) covered = true
      }
      if (covered) return { covered: true, configs, fixHint: null }
      return {
        covered: false,
        configs,
        fixHint: `TYP-006 类型目录 ${relTypes} 未被任何 tsconfig 的 include/files 覆盖（检查过：${configs.join('、')}）。最小修法：在应用主 tsconfig 的 include 数组加入 "${relTypes}/**/*.d.ts"（或把目录放在已覆盖的 src 之下）。`,
      }
    }
  }
  configs.push(path.relative(root, primary))
  if (configCovers(primary, typesRoot)) return { covered: true, configs, fixHint: null }
  return {
    covered: false,
    configs,
    fixHint: `TYP-006 类型目录 ${relTypes} 未被 ${path.relative(root, primary)} 的 include/files 覆盖（exclude 或严格 files 白名单都会让生成声明对 IDE/tsc 不可见）。最小修法：include 加入 "${relTypes}/**/*.d.ts"，或移除对它的 exclude/files 限制。`,
  }
}

/** 单个配置（含 references 与 extends 链）是否覆盖 typesRoot */
function configCovers(cfgFile: string, typesRoot: string): boolean {
  const raw = readCfg(cfgFile)
  if (!raw) return false
  const cfg = effectiveCfg(raw)
  const cfgDir = path.dirname(cfgFile)
  const isSolution = Array.isArray(cfg.files) && cfg.files.length === 0 && !cfg.include
  if (isSolution && cfg.references && cfg.references.length > 0) {
    return cfg.references.some((ref) => {
      const refFile = resolveConfigFile(ref.startsWith('.') || path.isAbsolute(ref) ? ref : `./${ref}`, cfgFile)
      return refFile !== null && configCovers(refFile, typesRoot)
    })
  }
  if (Array.isArray(cfg.files) && cfg.files.length > 0) {
    return cfg.files.some((f) => {
      const abs = path.resolve(cfgDir, f)
      return abs === typesRoot || abs.startsWith(typesRoot + path.sep)
    })
  }
  const includes = cfg.include
  if (!includes) return typesRoot === cfgDir || typesRoot.startsWith(cfgDir + path.sep)
  const included = includes.some((p) => patternCoversDir(p, typesRoot, cfgDir))
  if (!included) return false
  if (cfg.exclude && cfg.exclude.some((p) => patternCoversDir(p, typesRoot, cfgDir))) return false
  return true
}
