/** Vue 适配层只接收加载函数，不静态引用运行时内核。 */
import { defineAsyncComponent, defineComponent, h, type Component, type PropType } from 'vue'
import { definePages, type PageRouteLike, type RemoteSchemaEntry } from './pages'

export interface RemoteComponentOptions {
  loadingComponent?: Component
  errorComponent?: Component
  retries?: number
  delay?: number
  timeout?: number
}

const ERROR_STYLE = {
  padding: '16px', border: '1px solid #fde2e2', borderRadius: '4px',
  background: '#fef0f0', color: '#c45656', fontSize: '13px', lineHeight: '1.6',
} as const

const RemoteErrorPlaceholder = defineComponent({
  name: 'FulgurjsRemoteError',
  props: { error: { type: Object as PropType<unknown>, default: undefined } },
  setup(props) {
    return () => {
      const err = props.error as (Error & { code?: string }) | undefined
      const code = err?.code ?? 'UNKNOWN'
      const message = err?.message ?? String(props.error ?? 'unknown error')
      return h('div', { style: ERROR_STYLE }, [
        h('p', { style: 'margin:0 0 4px;font-weight:600' }, `远程组件加载失败（错误码 ${code}）`),
        h('p', { style: 'margin:0 0 8px;word-break:break-all' }, message),
        h('p', { style: 'margin:0' }, '修法：① 核对 spec 的「远程名/expose 名」与远程应用 exposes 是否一致（MFU-006/008）；② 核对 remotes 地址端口与远程服务可达性、remoteEntry 是否可访问（MFU-001）；③ 查看 window 的 fulgurjs:error 事件与 console 同源错误定位根因。'),
      ])
    }
  },
})

export function createRemoteComponent(loadRemote: (spec: string, opts?: { retries?: number }) => Promise<any>) {
  return function remoteComponent(spec: string, opts: RemoteComponentOptions = {}): Component {
    return defineAsyncComponent({
      loader: () => loadRemote(spec, { retries: opts.retries }).then(m => m.default ?? m),
      loadingComponent: opts.loadingComponent,
      errorComponent: opts.errorComponent ?? RemoteErrorPlaceholder,
      delay: opts.delay,
      timeout: opts.timeout,
    })
  }
}

// ── createHostPages：可选宿主页面适配器（§3.2）─────────────────────────────────
//
// 以项目侧页面表为唯一页面来源：URL 解析、最长前缀远程归属、异步组件缓存、
// 骨架屏/错误占位、保活名称由本适配器统一处理；登录态等宿主业务经 beforeLoad
// 提供；远程初始化（setup/onSession）由 loadRemote 的运行时生命周期承担——
// 宿主不再手写「loadRemote 启动器并手动调用」的样板。

export interface HostPagesOptions {
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
  /** 每次页面模块实际加载前执行（同步或异步）；宿主在此提供最新 context */
  beforeLoad?: () => void | Promise<void>
  /** 加载期占位组件（骨架屏） */
  loadingComponent?: Component
  /** 错误占位组件（缺省 = 内置三段式错误占位：错误码+根因+修法） */
  errorComponent?: Component
  /** 骨架屏延迟 ms（默认 200，防闪） */
  delay?: number
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

export interface HostPages {
  /** 原页面记录 */
  pages: PageRouteLike[]
  /** 路径 → 页面解析（兼容 base 前缀与深链；无匹配返回 null） */
  resolve(path: string): ResolvedHostPage | null
  /** 按 spec 取异步页面组件（同 spec 复用；换登录代次后重建以触发会话同步） */
  component(spec: string): Component
  /** 保活白名单：keepAlive 页面的组件 name（与实际被 KeepAlive 缓存的包装组件一致） */
  keepAliveNames: string[]
}

const cleanCompName = (spec: string): string => 'Fulgurjs_' + spec.replace(/[^A-Za-z0-9_-]/g, '_')

/** 缺省 spec 推导（与 pages.ts 默认一致）：去首段（远程前缀）+ 剥 :参数 段 */
function defaultDeriveSpec(route: string): string {
  return route
    .split('/')
    .filter(Boolean)
    .slice(1)
    .filter((seg) => !seg.startsWith(':'))
    .join('/')
}

export function createHostPages(
  options: HostPagesOptions,
  load: (spec: string, opts?: { retries?: number }) => Promise<any>,
): HostPages {
  const { pages, remotePrefixes, deriveSpec, schema, strict, base, beforeLoad, loadingComponent, errorComponent, delay } = options
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

  // 会话感知的组件缓存：AppContext.sessionKey 变化（换账号/重登/退出）后清除组件缓存，
  // 下一次 component(spec) 重建异步组件 → loader 重跑 → loadRemote 触发新代次的
  // onSession（模块本体经 loadRemote 缓存复用，不会重复下载）。无 sessionKey 的普通
  // 用法恒为 undefined，缓存永不失效（与 remoteComponent 语义一致）。
  let cacheSession: string | undefined
  const compCache = new Map<string, Component>()

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

  const component = (spec: string): Component => {
    const sk = ((globalThis as any).__FULGURJS_APP_CONFIG__ ?? {}).sessionKey
    const sessionKey = typeof sk === 'string' && sk !== '' ? sk : undefined
    // 缓存代次重置只在「新的非空 sessionKey 出现」时执行（换账号/重登）。
    // 登出（sessionKey 变 undefined）不清缓存：clearAppContext 后路由过渡期 LayoutContent
    // 仍会重渲染当前联邦页，此刻重建组件会让 KeepAlive 在激活路径上换子组件——
    // 实测触发 Vue core `parentComponent.ctx.deactivate is not a function`（MES-ZC 4.3.0）。
    // 会话语义不受影响：onSession 的去重由 runtime 在 loadRemote 时按当前 sessionKey 判定。
    if (sessionKey !== undefined && sessionKey !== cacheSession) {
      compCache.clear()
      cacheSession = sessionKey
    }
    let comp = compCache.get(spec)
    if (!comp) {
      const name = cleanCompName(spec)
      const asyncComp: Component = defineAsyncComponent({
        loader: async () => {
          await beforeLoad?.()
          const mod = await load(spec)
          const inner = mod?.default ?? mod
          if (!inner) {
            throw new Error(
              `[fulgurjs] 远程模块 "${spec}" 没有导出可渲染组件；当前值类型为 ${inner === null ? 'null' : typeof inner}。\n` +
                `  修法: 核对远程 exposes 键名与页面表 spec 是否一致（MFU-006 语义）`,
            )
          }
          return inner
        },
        loadingComponent,
        errorComponent: errorComponent ?? RemoteErrorPlaceholder,
        delay,
      })
      // 直接命名异步包装器（4.2.1 已验证形态，勿改回外层 defineComponent 包装）：
      // 包装对象按 spec 独立创建，改它的 name 不触碰远程模块导出对象（它可能被多页共享）；
      // KeepAlive include 按 wrapper name 匹配。实测教训：外层再包一层 stateless 组件时，
      // 「保活页 → 切到非联邦路由/登出」的卸载路径会触发 Vue core
      // `parentComponent.ctx.deactivate is not a function`（vnode 的 parentComponent
      // 与持有 deactivate 的 KeepAlive 上下文错位）——MES-ZC 4.3.0 验收实测复现。
      ;(asyncComp as { name?: string }).name = name
      comp = asyncComp
      compCache.set(spec, comp)
    }
    return comp
  }

  const keepAliveNames = pages
    .filter((p) => p.keepAlive)
    .map((p) => cleanCompName(specOf(p)))

  return { pages, resolve, component, keepAliveNames }
}
