/**
 * 宿主页面表纯解析核心（框架无关）。
 *
 * 5.1.0 从 vue-adapter 提取：definePages 校验接入、最长前缀远程归属、缺省 spec 推导、
 * base 剥离、段式参数匹配——Vue 与 React 适配器共用同一份解析，组件缓存/错误边界/
 * 保活策略由各框架适配器自行负责（不把 Vue 的卸载策略强加给 React，反之亦然）。
 */
import { definePages, type PageRouteLike, type RemoteSchemaEntry } from './pages'

/** 页面表数据项（两个框架适配器共用；展示项 fallback/error 等在各适配器定义） */
export interface HostPagesCoreOptions {
  /** 页面表（宿主路由与布局共用的唯一数据源；definePages R1–R5 校验照常执行） */
  pages: PageRouteLike[]
  /** 路由前缀 → remote 名（最长前缀匹配；页面路由无匹配前缀时创建期即报错） */
  remotePrefixes: Record<string, string>
  /** 缺省 spec 推导（缺省 = 去首段前缀 + 剥 :参数 段，同 definePages 默认） */
  deriveSpec?: (route: string) => string
  /** 远程 exposes 清单（dev 由 remoteSchema 提供；build 为空表时按语义诚实降级） */
  schema?: Record<string, RemoteSchemaEntry>
  /** ERROR 级校验失败是否 throw（默认 true） */
  strict?: boolean
  /** 站点 base 前缀（如 '/main'）：resolve 时先剥离再匹配路由空间 */
  base?: string
}

export interface ResolvedHostPage {
  /** 原页面记录（含宿主自由扩展字段 name/title/keepAlive/...） */
  page: PageRouteLike
  /** 命中的 remote 名 */
  remote: string
  /** 完整加载 spec（`<remote>/<exposes 键>`，loadRemote 直用） */
  spec: string
  /** 路径参数（解码失败只让该次匹配失败，不让页面初始化崩溃） */
  params: Record<string, string>
}

export interface HostPagesCore {
  /** 原页面记录 */
  pages: PageRouteLike[]
  /** 路径 → 页面解析（兼容 base 前缀与深链；无匹配返回 null） */
  resolve(rawPath: string): ResolvedHostPage | null
  /** 路由 → remote 名（创建期已校验全部命中；此处为内部确定性查询） */
  remoteOf(route: string): string
  /** 页面记录 → 完整加载 spec */
  specOf(page: PageRouteLike): string
}

/** 组件包装器命名的 spec 净化（Vue 的 KeepAlive include 与 React 的 displayName 共用） */
export const cleanCompName = (spec: string): string => 'Fulgurjs_' + spec.replace(/[^A-Za-z0-9_-]/g, '_')

/** 缺省 spec 推导（与 pages.ts 默认一致）：去首段（远程前缀）+ 剥 :参数 段 */
export function defaultDeriveSpec(route: string): string {
  return route
    .split('/')
    .filter(Boolean)
    .slice(1)
    .filter((seg) => !seg.startsWith(':'))
    .join('/')
}

/** 读取页面级 AppContext 镜像上的当前登录代次（无则 undefined） */
export function readSessionKey(): string | undefined {
  const sk = ((globalThis as any).__FULGURJS_APP_CONFIG__ ?? {}).sessionKey
  return typeof sk === 'string' && sk !== '' ? sk : undefined
}

/**
 * 组件代次缓存重置判定：只在「新的非空 sessionKey 出现」时返回 true（换账号/重登）。
 * 登出（sessionKey 变 undefined）不重置——Vue 侧是 KeepAlive deactivate 竞态实测教训
 * （见 vue-adapter 注释），React 侧遵循同一会话语义：onSession 的去重由 runtime 在
 * loadRemote 时按当前 sessionKey 判定，缓存不重置不影响换号正确性。
 */
export function shouldResetSessionCache(sessionKey: string | undefined, cached: string | undefined): boolean {
  return sessionKey !== undefined && sessionKey !== cached
}

/** 远程模块无可渲染导出时的统一报错（Vue/React 适配器共用文案，MFU-006 语义） */
export function noRenderableExportError(spec: string, inner: unknown): Error {
  return new Error(
    `[fulgurjs] 远程模块 "${spec}" 没有导出可渲染组件；当前值类型为 ${inner === null ? 'null' : typeof inner}。\n` +
      `  修法: 核对远程 exposes 键名与页面表 spec 是否一致（MFU-006 语义）`,
  )
}

export function createHostPagesCore(options: HostPagesCoreOptions): HostPagesCore {
  const { pages, remotePrefixes, deriveSpec, schema, strict, base } = options
  // definePages 复用：剥参冲突（R1）/重复 spec（R2）/spec 存在性（R3，dev schema 可用时）/
  // 路由遮蔽（R4）/重名（R5）——校验行为与独立使用完全一致
  definePages(pages, { deriveSpec, remotes: remotePrefixes, schema, strict })

  const prefixes = Object.entries(remotePrefixes)
    .map(([p, name]) => [p.endsWith('/') ? p : `${p}/`, name] as [string, string])
    .sort((a, b) => b[0].length - a[0].length) // 最长前缀优先
  const remoteOf = (route: string): string => {
    for (const [prefix, name] of prefixes) {
      if (route.startsWith(prefix) || `${route}/` === prefix) return name
    }
    throw new Error(
      `[fulgurjs] 页面路由 "${route}" 未匹配任何 remotePrefixes：{ ${Object.entries(remotePrefixes).map(([k, v]) => `'${k}': '${v}'`).join(', ')} }\n` +
        `  根因: 页面表条目的路由不在任何已声明的远程前缀下。\n` +
        `  修法: 在 remotePrefixes 补充该路由前缀 → 远程名的映射，或修正页面表 route。`,
    )
  }
  // 创建期即校验每条页面都能归属远程（fail fast，不留到运行时）
  for (const page of pages) remoteOf(page.route)
  const specOf = (page: PageRouteLike): string => {
    const s = page.spec ?? (deriveSpec ? deriveSpec(page.route) : defaultDeriveSpec(page.route))
    return `${remoteOf(page.route)}/${String(s).replace(/^[./]+/, '')}`
  }

  const baseNorm = base && base !== '/' ? (base.endsWith('/') ? base : `${base}/`) : ''
  const matchSegments = (pattern: string, path: string): Record<string, string> | null => {
    const patSegs = pattern.split('/').filter(Boolean)
    const pathSegs = path.split('/').filter(Boolean)
    if (patSegs.length !== pathSegs.length) return null
    const params: Record<string, string> = {}
    for (let i = 0; i < patSegs.length; i++) {
      const seg = patSegs[i]!
      if (seg.startsWith(':')) {
        try {
          params[seg.slice(1)] = decodeURIComponent(pathSegs[i]!)
        } catch {
          // 参数解码失败（坏 % 序列等）：只让该条匹配失败，不让整表解析崩溃
          return null
        }
      } else if (seg !== pathSegs[i]) {
        return null
      }
    }
    return params
  }

  const resolve = (rawPath: string): ResolvedHostPage | null => {
    let clean = String(rawPath ?? '')
    if (baseNorm) {
      if (clean === baseNorm.replace(/\/$/, '')) clean = '/'
      else if (clean.startsWith(baseNorm)) clean = `/${clean.slice(baseNorm.length)}`
    }
    clean = (clean.replace(/\/+$/, '') || '/').split('?')[0].split('#')[0]
    for (const page of pages) {
      const params = matchSegments(page.route, clean)
      if (params) return { page, remote: remoteOf(page.route), spec: specOf(page), params }
    }
    return null
  }

  return { pages, resolve, remoteOf, specOf }
}
