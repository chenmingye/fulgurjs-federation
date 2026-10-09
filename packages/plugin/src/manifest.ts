/**
 * WP4：联邦 manifest 契约（类型 + 纯函数校验器 + 规范化）。
 *
 * 两种形态共用 schemaVersion 语义：
 * - dev（remote dev server 中间件动态返回）：exposes 为数组（name/src/file），可含
 *   types（远程类型资源定位，6.5.0 起；宿主据此同步声明闭包）；
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
  /** 类型资源定位（dts 启用且声明 bundle 就绪时存在；旧版本远程无此字段） */
  types?: ManifestTypesRef
  exposes: DevManifestExpose[]
  shared: ManifestSharedEntry[]
  /** setup 生命周期入口的内部 expose 键（配置 federation({ setup }) 时存在；v1 向后兼容字段） */
  setup?: string
}

/** 类型资源定位（6.5.0 远程类型自动生成；dev/prod 共用形态，字段相对 manifest 地址解析） */
export interface ManifestTypesRef {
  /** 类型协议版本（与运行时 manifest 的 schemaVersion 相互独立） */
  schemaVersion: number
  /** 类型清单（index.json）地址（相对 manifest URL） */
  index: string
  /** 内容摘要（宿主据此识别代次与缓存） */
  revision: string
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
  /** 类型资源定位（dts 启用且声明 bundle 生成成功时随构建输出） */
  types?: ManifestTypesRef
  exposes: Record<string, ProdManifestExposeEntry>
  shared: ManifestSharedEntry[]
  /** setup 生命周期入口的内部 expose 键（配置 federation({ setup }) 时存在；v1 向后兼容字段） */
  setup?: string
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
    pushTypesIssues(m.types, issues, 'dev')
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
    pushTypesIssues(m.types, issues, 'prod')
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

/** types 描述校验（可选字段；存在时形状必须合法——宿主按它定位类型资源） */
function pushTypesIssues(t: unknown, issues: ManifestIssue[], form: 'dev' | 'prod'): void {
  if (t === undefined) return
  if (!isPlainObject(t)) {
    issues.push({ field: 'types', message: `${form} manifest 的 types 必须是对象`, got: typeof t })
    return
  }
  if (t.schemaVersion !== 1) {
    issues.push({ field: 'types.schemaVersion', message: '必须是 1（类型协议版本）', got: t.schemaVersion })
  }
  if (!validAssetRef(t.index)) {
    issues.push({ field: 'types.index', message: '必须是类型清单地址（相对 manifest）', got: t.index })
  }
  if (typeof t.revision !== 'string' || t.revision.length === 0) {
    issues.push({ field: 'types.revision', message: '必须是非空内容摘要字符串', got: t.revision })
  }
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
