/**
 * WP4：联邦 manifest 契约（类型 + 纯函数校验器 + 规范化）。
 *
 * 两种形态共用 schemaVersion 语义：
 * - dev（remote dev server 中间件动态返回）：exposes 为数组（name/src/file），含 dev-only
 *   的 fsRoot（本机源码根，供宿主 dts 类型直连）；
 * - prod（构建产物 fulgurjs-manifest.json）：exposes 为按 expose 名索引的对象（file/css）。
 *
 * 消费端：
 * - Node 侧（dts / remote-schema / doctor / 测试）一律经本模块校验与规范化取数据；
 * - 浏览器运行时（runtime/index.ts 的 preloadRemote）受 gzip 体积门禁约束，保留内联的
 *   最小结构消费逻辑，但其行为由 tests/manifest.test.ts 与 runtime-preload 测试以本模块
 *   生成的同形 fixture 做契约对齐（含 schemaVersion 拒绝规则）。
 *
 * 兼容规则：缺少 schemaVersion 按 v1（2.0.x 历史形态）解析；未知主版本拒绝消费并给出
 * 明确诊断信息，不把错误形状当空 manifest 静默处理。
 */

export const MANIFEST_SCHEMA_VERSION = 1

export interface ManifestSharedEntry {
  name: string
  version: string
  singleton?: boolean
  requiredVersion?: string | false
  shareScope?: string
  eager?: boolean
}

/** dev manifest 的 expose 条目（数组形态） */
export interface DevManifestExpose {
  /** './Button' */
  name: string
  /** 相对 remote root 的源码路径（dev-only，dts 类型直连用） */
  src: string
  /** 浏览器可请求的模块 URL（base 前缀补齐；URL 相对基准 = 站点） */
  file: string
}

export interface DevFederationManifest {
  schemaVersion: number
  id: string
  name: string
  version?: string
  devServer: true
  /** 以 / 开头且 / 结尾 */
  base: string
  entry: string
  /** dev-only：remote 根目录的本机绝对路径（仅同机联调时存在） */
  fsRoot?: string
  exposes: DevManifestExpose[]
  shared: ManifestSharedEntry[]
}

/** prod manifest 的 expose 条目（对象形态，URL 相对基准 = entry 所在目录） */
export interface ProdManifestExposeEntry {
  file: string
  css?: string[]
}

export interface ProdFederationManifest {
  schemaVersion: number
  id: string
  name: string
  entry: string
  exposes: Record<string, ProdManifestExposeEntry>
  shared: ManifestSharedEntry[]
  buildInfo?: { builtBy?: string; timestamp?: number }
}

export type FederationManifest = DevFederationManifest | ProdFederationManifest

export interface ManifestIssue {
  field: string
  message: string
  got?: unknown
}

export interface ManifestParseResult {
  manifest?: FederationManifest
  issues: ManifestIssue[]
  /** 主版本非 1 时拒绝消费（携带所见版本） */
  unsupportedVersion?: number
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** 资源引用字符串：非空、无空白/控制字符、不带凭证（user:pass@）与 query/fragment 之外不做语义限制 */
function validAssetRef(v: unknown): boolean {
  if (typeof v !== 'string' || v.length === 0) return false
  if (/[\s\u0000-\u001f]/.test(v)) return false
  if (/^https?:\/\/[^/@\s]+:[^/@\s]+@/.test(v)) return false // 凭证形态
  return true
}

function validExposeName(v: unknown): boolean {
  return typeof v === 'string' && /^\.[\w./-]+$/.test(v)
}

/**
 * 校验并解析任意来源的 manifest（dev 数组 / prod 对象 / 2.0.x 历史无 schemaVersion 形态）。
 * 返回 issues（字段级）与 manifest（校验通过时）；未知主版本返回 unsupportedVersion。
 */
export function parseManifest(input: unknown): ManifestParseResult {
  const issues: ManifestIssue[] = []
  if (!isPlainObject(input)) {
    return { issues: [{ field: '$', message: 'manifest 必须是 JSON 对象', got: typeof input }] }
  }
  const m = input

  let schemaVersion = MANIFEST_SCHEMA_VERSION
  if (m.schemaVersion !== undefined) {
    if (typeof m.schemaVersion !== 'number' || !Number.isInteger(m.schemaVersion)) {
      issues.push({ field: 'schemaVersion', message: '必须是整数', got: m.schemaVersion })
    } else if (m.schemaVersion !== MANIFEST_SCHEMA_VERSION) {
      return {
        issues: [
          {
            field: 'schemaVersion',
            message: `不支持的 manifest 主版本（当前消费端支持 ${MANIFEST_SCHEMA_VERSION}）`,
            got: m.schemaVersion,
          },
        ],
        unsupportedVersion: m.schemaVersion,
      }
    }
  }
  // 缺 schemaVersion = 2.0.x 历史形态，按 v1 继续解析

  if (typeof m.name !== 'string' || m.name.length === 0) {
    issues.push({ field: 'name', message: '必须是非空字符串', got: m.name })
  }

  const exposes = m.exposes
  const shared = m.shared
  const sharedIssues = validateShared(shared)
  issues.push(...sharedIssues)

  if (Array.isArray(exposes)) {
    // dev 形态
    if (m.devServer !== true) {
      issues.push({ field: 'devServer', message: 'dev 数组形态 exposes 必须伴随 devServer: true', got: m.devServer })
    }
    if (typeof m.base !== 'string' || !/^\/(?:.*\/)?$/.test(m.base)) {
      issues.push({ field: 'base', message: '必须是以 / 开头且 / 结尾的路径', got: m.base })
    }
    if (!validAssetRef(m.entry)) {
      issues.push({ field: 'entry', message: '必须是合法资源地址', got: m.entry })
    }
    for (const [i, e] of exposes.entries()) {
      if (!isPlainObject(e)) {
        issues.push({ field: `exposes[${i}]`, message: '必须是对象', got: typeof e })
        continue
      }
      if (!validExposeName(e.name)) {
        issues.push({ field: `exposes[${i}].name`, message: '必须是 "./xxx" 形态的 expose 名', got: e.name })
      }
      if (typeof e.src !== 'string' || e.src.length === 0) {
        issues.push({ field: `exposes[${i}].src`, message: 'dev 形态必须提供源码相对路径', got: e.src })
      }
      if (!validAssetRef(e.file)) {
        issues.push({ field: `exposes[${i}].file`, message: '必须是可请求的模块地址', got: e.file })
      }
    }
  } else if (isPlainObject(exposes)) {
    // prod 形态
    if (!validAssetRef(m.entry)) {
      issues.push({ field: 'entry', message: '必须是合法资源地址（相对基准 = 所在目录）', got: m.entry })
    }
    for (const [key, v] of Object.entries(exposes)) {
      if (!validExposeName(key)) {
        issues.push({ field: `exposes["${key}"]`, message: '键必须是 "./xxx" 形态的 expose 名' })
      }
      if (!isPlainObject(v)) {
        issues.push({ field: `exposes["${key}"]`, message: '值必须是对象', got: typeof v })
        continue
      }
      if (!validAssetRef(v.file)) {
        issues.push({ field: `exposes["${key}"].file`, message: '必须是资源路径（相对 entry 目录）', got: v.file })
      }
      if (v.css !== undefined) {
        if (!Array.isArray(v.css)) {
          issues.push({ field: `exposes["${key}"].css`, message: '必须是字符串数组', got: typeof v.css })
        } else {
          v.css.forEach((css, i) => {
            if (!validAssetRef(css)) {
              issues.push({ field: `exposes["${key}"].css[${i}]`, message: '必须是资源路径', got: css })
            }
          })
        }
      }
    }
  } else {
    issues.push({ field: 'exposes', message: '必须是数组（dev）或对象（prod）', got: typeof exposes })
  }

  if (issues.length > 0) return { issues }
  return { manifest: input as unknown as FederationManifest, issues }
}

function validateShared(shared: unknown): ManifestIssue[] {
  if (shared === undefined) return []
  const issues: ManifestIssue[] = []
  if (!Array.isArray(shared)) {
    return [{ field: 'shared', message: '必须是数组', got: typeof shared }]
  }
  for (const [i, s] of shared.entries()) {
    if (!isPlainObject(s)) {
      issues.push({ field: `shared[${i}]`, message: '必须是对象', got: typeof s })
      continue
    }
    if (typeof s.name !== 'string' || s.name.length === 0) {
      issues.push({ field: `shared[${i}].name`, message: '必须是非空字符串', got: s.name })
    }
    if (typeof s.version !== 'string' || s.version.length === 0) {
      issues.push({ field: `shared[${i}].version`, message: '必须是非空字符串', got: s.version })
    }
  }
  return issues
}

export function isDevManifest(m: FederationManifest): m is DevFederationManifest {
  return Array.isArray((m as DevFederationManifest).exposes)
}

/** 规范化后的 expose 条目：dev/prod 统一（preload/doctor/类型直连的公共取数面） */
export interface NormalizedExpose {
  name: string
  file?: string
  css: string[]
  /** dev-only：源码相对路径 */
  src?: string
}

/**
 * 把 dev 数组与 prod 对象 exposes 规范化为同一内部 expose map（按 expose 名索引）。
 * 仅接受经 parseManifest 校验通过的输入；坏形态条目被跳过（调用方已拿到字段级 issues）。
 */
export function normalizeExposes(manifest: FederationManifest): Map<string, NormalizedExpose> {
  const out = new Map<string, NormalizedExpose>()
  if (isDevManifest(manifest)) {
    for (const e of manifest.exposes) {
      if (!validExposeName(e.name)) continue
      out.set(e.name, { name: e.name, file: e.file, css: [], src: e.src })
    }
  } else {
    for (const [key, v] of Object.entries(manifest.exposes)) {
      if (!validExposeName(key)) continue
      out.set(key, { name: key, file: v.file, css: Array.isArray(v.css) ? v.css.filter((c) => typeof c === 'string') : [] })
    }
  }
  return out
}
