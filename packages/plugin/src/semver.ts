/**
 * 紧凑版 semver 实现（浏览器运行时与 Node 构建端共用同一份，保证协商结果一致）。
 * 支持 npm 主流语法：精确版本、部分版本(1.2)、x/* 通配、^、~、比较器(>=,>,<=,<,=)、
 * 连字符范围(1.2.3 - 2.3.4)、||(组合)、prerelease。URL/git 形式的 requiredVersion 视为接受任意版本。
 */
export interface SemVer {
  major: number
  minor: number
  patch: number
  pre: string[]
}

const VERSION_RE = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-((?:[0-9A-Za-z-]+)(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z.-]+)?$/

/** 解析具体版本号；解析失败返回 null */
export function parseVersion(input: string): SemVer | null {
  const m = VERSION_RE.exec(String(input).trim())
  if (!m) return null
  return {
    major: Number(m[1]),
    minor: Number(m[2] ?? 0),
    patch: Number(m[3] ?? 0),
    pre: m[4] ? m[4].split('.') : [],
  }
}

function preCompare(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0
  // 无 prerelease 的版本更高
  if (a.length === 0) return 1
  if (b.length === 0) return -1
  const len = Math.max(a.length, b.length)
  for (let i = 0; i < len; i++) {
    const x = a[i]
    const y = b[i]
    if (x === undefined) return -1
    if (y === undefined) return 1
    const xn = /^\d+$/.test(x)
    const yn = /^\d+$/.test(y)
    if (xn && yn) {
      const d = Number(x) - Number(y)
      if (d !== 0) return d
    } else if (xn !== yn) {
      // 数字标识符低于字母标识符
      return xn ? -1 : 1
    } else if (x !== y) {
      return x < y ? -1 : 1
    }
  }
  return 0
}

/** 完整版本比较：a>b 返回 1，a<b 返回 -1，相等返回 0 */
export function compareVersions(a: string, b: string): number {
  const va = parseVersion(a)
  const vb = parseVersion(b)
  if (!va || !vb) return a < b ? -1 : a > b ? 1 : 0
  if (va.major !== vb.major) return va.major - vb.major
  if (va.minor !== vb.minor) return va.minor - vb.minor
  if (va.patch !== vb.patch) return va.patch - vb.patch
  return preCompare(va.pre, vb.pre)
}

interface Comparator {
  op: '>=' | '>' | '<' | '<=' | '='
  ver: SemVer
  /** 部分版本上限（1.2 → <1.3.0 用） */
  upper?: SemVer
  /** 是否允许匹配 prerelease（比较器本身带 prerelease 时） */
  allowPre?: boolean
}

const ANY_RANGE = /^[a-z]+[+:-]/i // git+ssh:, url: 等形式

/** 版本是否满足 semver range；无法识别的 range 视为满足任意版本 */
export function satisfies(version: string, range: string | false | undefined | null): boolean {
  if (range === false || range == null || range === '') return true
  const rangeStr = String(range).trim()
  if (!rangeStr || rangeStr === '*' || rangeStr === 'latest' || ANY_RANGE.test(rangeStr)) return true
  return rangeStr.split('||').some((part) => satisfiesSet(version, part.trim()))
}

function satisfiesSet(version: string, set: string): boolean {
  if (!set || set === '*') return !parseVersion(version)?.pre.length
  // 连字符范围
  const hyphen = set.split(/\s+-\s+/)
  if (hyphen.length === 2) {
    const lo = hyphen[0].trim()
    const hi = hyphen[1].trim()
    if (!satisfies(version, `>=${lo}`)) return false
    if (!satisfies(version, `<=${hi}`)) return false
    return true
  }
  const v = parseVersion(version)
  if (!v) return false
  const comps = parseComparators(set)
  if (comps === null) return true // 无法解析的语法，放行（与 webpack 对未知 requiredVersion 的宽容策略一致）
  for (const c of comps) {
    if (!testComparator(v, version, c)) return false
  }
  // prerelease 默认不匹配任何 range，除非 range 中存在同主版本号的 prerelease
  if (v.pre.length > 0 && !comps.some((c) => c.ver.pre.length > 0)) {
    const tupleMatch = comps.some(
      (c) => c.ver.major === v.major && c.ver.minor === v.minor && c.ver.patch === v.patch,
    )
    if (!tupleMatch) return false
  }
  return true
}

function parseComparators(set: string): Comparator[] | null {
  const comps: Comparator[] = []
  const tokens = set.trim().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return null
  for (const token of tokens) {
    const m = /^(>=|<=|>|<|=|\^|~)?(.*)$/.exec(token)
    if (!m) return null
    const op = m[1]
    const raw = m[2]
    const c = buildComparator(op, raw)
    if (c === null) return null
    comps.push(...c)
  }
  return comps
}

function buildComparator(op: string | undefined, raw: string): Comparator[] | null {
  const parsed = parseLoose(raw)
  if (!parsed) return null
  const { ver, partial } = parsed
  switch (op) {
    case '^': {
      const upper = caretUpper(ver)
      if (!upper) return null
      return [{ op: '>=', ver }, { op: '<', ver: upper }]
    }
    case '~': {
      const upper: SemVer =
        partial >= 2
          ? { major: ver.major, minor: ver.minor + 1, patch: 0, pre: [] }
          : { major: ver.major + 1, minor: 0, patch: 0, pre: [] }
      return [{ op: '>=', ver }, { op: '<', ver: upper }]
    }
    case '>=':
      return [{ op: '>=', ver }]
    case '>':
      // >1.2.x 等价于 >=1.3.0
      if (partial === 1) return [{ op: '>=', ver: { major: ver.major + 1, minor: 0, patch: 0, pre: [] } }]
      if (partial === 2)
        return [{ op: '>=', ver: { major: ver.major, minor: ver.minor + 1, patch: 0, pre: [] } }]
      return [{ op: '>', ver }]
    case '<':
      // <1.2.x 等价于 <1.2.0
      if (partial === 1) return [{ op: '<', ver: { major: ver.major, minor: 0, patch: 0, pre: [] } }]
      if (partial === 2)
        return [{ op: '<', ver: { major: ver.major, minor: ver.minor, patch: 0, pre: [] } }]
      return [{ op: '<', ver }]
    case '<=':
      return [{ op: '<=', ver }]
    case '=':
    case undefined:
      // 部分版本作为 range 表示 x-range：1.2 → >=1.2.0 <1.3.0
      if (partial === 1)
        return [
          { op: '>=', ver },
          { op: '<', ver: { major: ver.major + 1, minor: 0, patch: 0, pre: [] } },
        ]
      if (partial === 2)
        return [
          { op: '>=', ver },
          { op: '<', ver: { major: ver.major, minor: ver.minor + 1, patch: 0, pre: [] } },
        ]
      return [{ op: '=', ver }]
    default:
      return null
  }
}

function caretUpper(ver: SemVer): SemVer | null {
  if (ver.major > 0) return { major: ver.major + 1, minor: 0, patch: 0, pre: [] }
  if (ver.minor > 0) return { major: 0, minor: ver.minor + 1, patch: 0, pre: [] }
  return { major: 0, minor: 0, patch: ver.patch + 1, pre: [] }
}

/** 解析可能带 x/* 的版本；返回 partial 表示给出了几段数字（1/2/3） */
function parseLoose(raw: string): { ver: SemVer; partial: number } | null {
  const cleaned = raw.replace(/^v/, '').trim()
  if (!cleaned || cleaned === '*' || cleaned === 'x' || cleaned === 'X') {
    return { ver: { major: 0, minor: 0, patch: 0, pre: [] }, partial: 0 }
  }
  const parts = cleaned.split('.')
  const nums: number[] = []
  let partial = 0
  for (const p of parts.slice(0, 3)) {
    if (/^\d+$/.test(p)) {
      nums.push(Number(p))
      partial++
    } else if (p === 'x' || p === 'X' || p === '*') {
      break
    } else {
      // 带 prerelease 的完整版本
      break
    }
  }
  const rest = cleaned.split('-')
  const pre = rest.length > 1 ? rest.slice(1).join('-').split('+')[0].split('.') : []
  if (partial === 0 && pre.length === 0) return { ver: { major: 0, minor: 0, patch: 0, pre: [] }, partial: 0 }
  return {
    ver: { major: nums[0] ?? 0, minor: nums[1] ?? 0, patch: nums[2] ?? 0, pre },
    partial,
  }
}

function cmpToBool(cmp: number, op: Comparator['op']): boolean {
  switch (op) {
    case '>=':
      return cmp >= 0
    case '>':
      return cmp > 0
    case '<':
      return cmp < 0
    case '<=':
      return cmp <= 0
    case '=':
      return cmp === 0
  }
}

function testComparator(v: SemVer, versionStr: string, c: Comparator): boolean {
  const full = `${v.major}.${v.minor}.${v.patch}` + (v.pre.length ? `-${v.pre.join('.')}` : '')
  if (c.upper) {
    const cmpLo = compareVersions(full, `${c.ver.major}.${c.ver.minor}.${c.ver.patch}` + (c.ver.pre.length ? `-${c.ver.pre.join('.')}` : ''))
    if (!(cmpLo >= 0)) return false
    const cmpHi = compareVersions(full, `${c.upper.major}.${c.upper.minor}.${c.upper.patch}`)
    if (!(cmpHi < 0)) return false
    return true
  }
  const cmp = compareVersions(full, `${c.ver.major}.${c.ver.minor}.${c.ver.patch}` + (c.ver.pre.length ? `-${c.ver.pre.join('.')}` : ''))
  const baseOk = cmpToBool(cmp, c.op)
  // 带 prerelease 的比较器要求目标也有 prerelease（npm 语义简化）
  if (c.ver.pre.length > 0 && v.pre.length === 0 && (c.op === '>' || c.op === '<')) {
    return false
  }
  return baseOk
}
