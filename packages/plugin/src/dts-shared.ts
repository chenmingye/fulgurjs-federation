/**
 * 远程类型资源协议（6.5.0 远程类型自动生成）——共享契约与校验。
 *
 * 提供方构建/dev 产出「类型 bundle」目录：
 *   fulgurjs-types/
 *     index.json        # 本协议清单（schemaVersion、exposes 映射、文件摘要、externals）
 *     files/<相对路径>.d.ts   # 声明闭包（说明符已重写为 bundle 内相对路径）
 *
 * 宿主下载 bundle → 校验 → 生成 ambient 声明 + 类型注册表（dts-ambient）。
 * 本模块只做纯数据形状校验，不做 IO——Node 侧各模块与单测共用。
 */

/** 类型协议自身版本（与运行时 manifest 的 schemaVersion 相互独立） */
export const TYPES_SCHEMA_VERSION = 1

export interface DtsBundleExposeEntry {
  /** 声明文件相对 bundle 根的路径（files/...） */
  declaration: string
}

export interface DtsBundleIndex {
  schemaVersion: number
  generator: string
  pluginVersion: string
  /** 内容摘要（对除 revision 外全字段做 sha256，截取 16 hex）；宿主据此识别代次 */
  revision: string
  exposes: Record<string, DtsBundleExposeEntry>
  /** 声明闭包引用的外部类型依赖包名（vue/react 等；宿主须可解析） */
  externals: string[]
  /** bundle 内全部声明文件 → sha256（宿主逐文件校验；只允许下载登记过的文件） */
  files: Record<string, string>
}

export interface DtsIndexIssue {
  field: string
  message: string
  got?: unknown
}

export interface DtsIndexParseResult {
  index?: DtsBundleIndex
  issues: DtsIndexIssue[]
  unsupportedVersion?: number
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** bundle 内文件路径的安全形态：无 ..、非绝对、无反斜杠、无空白的相对路径 */
export function isSafeBundlePath(v: unknown): v is string {
  if (typeof v !== 'string' || v.length === 0) return false
  if (v.startsWith('/') || v.startsWith('\\')) return false
  if (v.includes('\\')) return false
  if (v.split('/').includes('..')) return false
  if (/[\s\u0000-\u001f]/.test(v)) return false
  return true
}

/** 校验类型 bundle 清单（任意来源：下载或本地生成）。未知主版本拒绝消费。 */
export function parseDtsIndex(input: unknown): DtsIndexParseResult {
  const issues: DtsIndexIssue[] = []
  if (!isPlainObject(input)) {
    return { issues: [{ field: '$', message: '类型清单必须是 JSON 对象', got: typeof input }] }
  }
  const raw = input as Record<string, unknown>

  if (raw.schemaVersion !== TYPES_SCHEMA_VERSION) {
    return {
      issues: [{
        field: 'schemaVersion',
        message: `不支持的类型协议版本（当前消费端支持 ${TYPES_SCHEMA_VERSION}）`,
        got: raw.schemaVersion,
      }],
      unsupportedVersion: typeof raw.schemaVersion === 'number' ? raw.schemaVersion : undefined,
    }
  }
  if (typeof raw.revision !== 'string' || !/^[0-9a-f]{8,64}$/.test(raw.revision)) {
    issues.push({ field: 'revision', message: '必须是 8-64 位十六进制内容摘要', got: raw.revision })
  }
  if (!isPlainObject(raw.exposes) || Object.keys(raw.exposes).length === 0) {
    issues.push({ field: 'exposes', message: '必须是非空对象（暴露入口 → 声明文件映射）', got: typeof raw.exposes })
  } else {
    for (const [name, v] of Object.entries(raw.exposes)) {
      if (!/^\.[\w./-]+$/.test(name)) {
        issues.push({ field: `exposes["${name}"]`, message: '键必须是 "./xxx" 形态的 expose 名' })
      }
      if (!isPlainObject(v) || !isSafeBundlePath(v.declaration)) {
        issues.push({ field: `exposes["${name}"].declaration`, message: '必须是 bundle 内安全相对路径', got: v })
      }
    }
  }
  if (!isPlainObject(raw.files) || Object.keys(raw.files).length === 0) {
    issues.push({ field: 'files', message: '必须是非空对象（文件 → sha256）', got: typeof raw.files })
  } else {
    for (const [file, digest] of Object.entries(raw.files)) {
      if (!isSafeBundlePath(file)) {
        issues.push({ field: `files["${file}"]`, message: '不安全的 bundle 文件路径（拒绝越界）' })
      }
      if (typeof digest !== 'string' || !/^[0-9a-f]{64}$/.test(digest)) {
        issues.push({ field: `files["${file}"]`, message: '必须是 sha256 十六进制摘要', got: digest })
      }
    }
    // 每个 expose 的声明文件必须在 files 登记内（防止引用清单外文件）
    if (isPlainObject(raw.exposes)) {
      for (const [name, v] of Object.entries(raw.exposes)) {
        if (isPlainObject(v) && typeof v.declaration === 'string' && !Object.hasOwn(raw.files, v.declaration)) {
          issues.push({ field: `exposes["${name}"].declaration`, message: `声明文件未在 files 中登记（${v.declaration}）` })
        }
      }
    }
  }
  if (raw.externals !== undefined) {
    if (!Array.isArray(raw.externals) || raw.externals.some((e) => typeof e !== 'string')) {
      issues.push({ field: 'externals', message: '必须是字符串数组（外部类型依赖包名）', got: typeof raw.externals })
    }
  }
  if (issues.length > 0) return { issues }
  return {
    index: {
      schemaVersion: TYPES_SCHEMA_VERSION,
      generator: typeof raw.generator === 'string' ? raw.generator : '@fulgurjs/federation',
      pluginVersion: typeof raw.pluginVersion === 'string' ? raw.pluginVersion : '',
      revision: raw.revision as string,
      exposes: raw.exposes as Record<string, DtsBundleExposeEntry>,
      externals: Array.isArray(raw.externals) ? (raw.externals as string[]) : [],
      files: raw.files as Record<string, string>,
    },
    issues,
  }
}

/** 单文件大小上限（声明文件远小于此；防异常资源） */
export const DTS_FILE_MAX_BYTES = 5 * 1024 * 1024
/** bundle 总大小上限 */
export const DTS_TOTAL_MAX_BYTES = 64 * 1024 * 1024
/** 单 bundle 文件数上限 */
export const DTS_FILE_COUNT_MAX = 4000
