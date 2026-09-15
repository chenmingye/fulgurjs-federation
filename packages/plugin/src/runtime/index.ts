/**
 * unifed 浏览器运行时内核。
 *
 * 设计要点（与 webpack MF 语义对齐）：
 * - share scope 为普通对象：scopeName -> name -> version -> { get, from, eager, loaded }，
 *   容器 init 时按引用"收养"传入的 scope map，双向供给、兄弟 remote 互享。
 * - 版本裁决：满足 requiredVersion 的最高版本胜出；已注册/已加载版本永不替换（first-wins）；
 *   singleton 冲突警告并使用唯一实例；strictVersion 冲突抛错。
 * - 页面级单例：通过 globalThis.__UNIFED_RUNTIME__ 保证宿主与远程各自打包的运行时副本
 *   在同一页面只实例化一次。
 * - 自包含容器协议：remoteEntry 导出 { name, init(shareScopeMap), get(module) }，不 import 运行时。
 */
import { satisfies, compareVersions } from '../semver'
import { UnifedError, ErrorCodes } from './errors'

export interface ShareEntry {
  version: string
  get: () => Promise<any>
  from: string
  eager: boolean
  loaded?: boolean
}

export type ShareScope = Record<string, Record<string, ShareEntry>>
export type ShareScopeMap = Record<string, ShareScope>

export interface RemoteConfig {
  name: string
  entry: string
  shareScope?: string
  /** 加载超时 ms，默认 15000 */
  timeout?: number
  /** 失败重试次数，默认 2 */
  retries?: number
  /** 备用 remoteEntry 地址（首个失败后依次尝试） */
  fallback?: string[]
  breaker?: { threshold?: number; resetMs?: number }
  /** promise-based remote：运行时解析出容器或容器地址 */
  promise?: () => Promise<any>
  /** 内部：远程自报的发布路径（preload 用） */
  manifestUrl?: string
}

export interface LoadShareOptions {
  requiredVersion?: string | false
  singleton?: boolean
  strictVersion?: boolean
  shareKey?: string
  shareScope?: string
  /** 本地副本兜底（webpack shared.import） */
  fallback?: () => Promise<any>
}

export interface RuntimePlugin {
  name?: string
  init?: (hooks: RuntimeHooks) => void
}

export interface RuntimeHooks {
  /** 覆写共享版本裁决结果：返回 ShareEntry 即生效 */
  resolveShare?: (shareInfo: {
    shareKey: string
    shareScope: string
    requiredVersion?: string | false
    picked?: ShareEntry
    available: ShareEntry[]
  }) => Promise<ShareEntry | void> | ShareEntry | void
  beforeLoadRemote?: (info: { remote: string; module: string }) => void
  afterLoadRemote?: (info: { remote: string; module: string; module_ns?: any }) => void
  onRemoteError?: (info: { remote: string; error: UnifedError }) => void
}

export interface RemoteDebugInfo {
  entry: string
  status: 'idle' | 'loading' | 'loaded' | 'failed'
  lastLoadMs?: number
  error?: string
}

interface RemoteInternal extends Omit<RemoteConfig, 'breaker'> {
  state: 'idle' | 'loading' | 'loaded' | 'failed'
  container?: any
  containerPromise?: Promise<any>
  lastLoadMs?: number
  breakerState: { fails: number; openUntil: number }
  debug: RemoteDebugInfo
}

const DEFAULT_TIMEOUT = 15000
const DEFAULT_RETRIES = 2
const BREAKER_THRESHOLD = 5
const BREAKER_RESET_MS = 30000

function createRuntime() {
  const shareScopeMap: ShareScopeMap = {}
  const remotes = new Map<string, RemoteInternal>()
  const plugins: RuntimePlugin[] = []
  const loadedModules = new Map<string, Promise<any>>()
  const containerInitScopes = new WeakMap<object, string>()

  const hooks: RuntimeHooks = {}
  const applyPlugins = () => {
    for (const p of plugins) {
      try {
        p.init?.(hooks)
      } catch (err) {
        console.warn('[unifed] runtimePlugin init failed:', p.name, err)
      }
    }
  }

  const getScope = (name: string): ShareScope => (shareScopeMap[name] ??= {})

  function emitError(info: { remote: string; error: UnifedError }) {
    try {
      hooks.onRemoteError?.(info)
    } catch {}
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('unifed:error', { detail: info }))
    }
  }

  function initSharing(scopeName = 'default'): ShareScopeMap {
    getScope(scopeName)
    return shareScopeMap
  }

  function registerShare(
    scopeName: string,
    name: string,
    version: string,
    get: () => Promise<any>,
    opts: { from?: string; eager?: boolean; loaded?: boolean } = {},
  ): void {
    const scope = getScope(scopeName || 'default')
    const byName = (scope[name] ??= {})
    if (byName[version]) {
      // 已注册版本永不替换（webpack 语义：first-wins）
      return
    }
    byName[version] = { version, get, from: opts.from ?? 'unknown', eager: !!opts.eager, loaded: !!opts.loaded }
  }

  function registerRemotes(list: RemoteConfig[]): void {
    for (const r of list) {
      const prev = remotes.get(r.name)
      remotes.set(r.name, {
        timeout: DEFAULT_TIMEOUT,
        retries: DEFAULT_RETRIES,
        ...prev,
        ...r,
        state: prev?.state ?? 'idle',
        breakerState: prev?.breakerState ?? { fails: 0, openUntil: 0 },
        debug: prev?.debug ?? { entry: r.entry, status: 'idle' },
      })
    }
  }

  function registerRemote(remote: RemoteConfig): void {
    registerRemotes([remote])
  }

  function registerPlugins(list: RuntimePlugin[]): void {
    plugins.push(...list)
    applyPlugins()
  }

  async function loadShare(name: string, opts: LoadShareOptions = {}): Promise<any> {
    const scopeName = opts.shareScope || 'default'
    const shareKey = opts.shareKey || name
    const scope = getScope(scopeName)
    const byName = scope[shareKey] || {}
    const versions = Object.keys(byName)
    const req = opts.requiredVersion

    const satisfying = versions.filter(
      (v) => req === undefined || req === false || satisfies(v, req),
    )

    let pick: string | undefined
    if (opts.singleton && versions.length > 0) {
      // webpack 语义：singleton 忽略 requiredVersion 的过滤作用——无论消费方要求什么版本，
      // 都使用作用域中的版本（保证全页单实例）。requiredVersion 只影响冲突告警与
      // strictVersion 抛错。
      // 优先选择已加载的版本（webpack 2B-3：已加载版本永不替换）——dev 宿主自身源码
      // 不经 share 通道（其应用实例已初始化 pinia/router 等全局状态），必须让远程协商
      // 命中宿主正在使用的这份，否则双实例导致 getActivePinia/inject 断链。
      // scope 为空（versions.length === 0，如容器 init 前的 loadShare）不在此分支，
      // 落到下方通用路径走 fallback/报错。
      const loadedVersions = versions.filter((v) => byName[v].loaded)
      pick = [...(loadedVersions.length ? loadedVersions : versions)].sort(compareVersions).pop()
      if (versions.length > 1 || !satisfying.includes(pick!)) {
        const entry0 = byName[pick!]
        const msg = `singleton conflict for "${shareKey}": required "${req ?? 'any'}", using ${pick} from ${entry0.from}`
        if (opts.strictVersion) {
          const err = new UnifedError(ErrorCodes.SHARE_STRICT_VERSION, msg, {
            shareKey,
            requiredVersion: req,
          })
          emitError({ remote: entry0.from, error: err })
          throw err
        }
        console.warn(`[unifed] ${msg}`)
      }
    } else {
      pick = [...satisfying].sort(compareVersions).pop()
      if (!pick) {
        if (opts.strictVersion) {
          const err = new UnifedError(
            ErrorCodes.SHARE_STRICT_VERSION,
            `no satisfying version for "${shareKey}" (required "${req}") in share scope "${scopeName}"`,
          )
          emitError({ remote: shareKey, error: err })
          throw err
        }
        if (opts.fallback) return opts.fallback()
        const err = new UnifedError(
          ErrorCodes.SHARE_NOT_AVAILABLE,
          `shared module "${shareKey}" (${req ?? 'any'}) is not available in share scope "${scopeName}" and has no local fallback`,
          { shareKey, requiredVersion: req },
        )
        emitError({ remote: shareKey, error: err })
        throw err
      }
    }

    let entry: ShareEntry = byName[pick!]
    if (hooks.resolveShare) {
      const picked = await hooks.resolveShare({
        shareKey,
        shareScope: scopeName,
        requiredVersion: req,
        picked: entry,
        available: Object.values(byName),
      })
      if (picked) entry = picked
    }
    entry.loaded = true
    return entry.get()
  }

  function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`timeout after ${ms}ms: ${label}`)), ms)
      p.then(
        (v) => {
          clearTimeout(t)
          resolve(v)
        },
        (e) => {
          clearTimeout(t)
          reject(e)
        },
      )
    })
  }

  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

  function validateContainerInterface(container: any, remote: RemoteInternal): void {
    if (!container || typeof container.get !== 'function') {
      throw new Error(
        `remoteEntry of "${remote.name}" does not export a container interface (get/init)`,
      )
    }
    // webpack promise-based remote 不承诺容器名：名称不匹配仅告警；URL 型 remoteEntry 严格校验
    if (container.name && remote.name && container.name !== remote.name) {
      const msg = `remoteEntry self-reported name "${container.name}" mismatches configured name "${remote.name}"`
      if (remote.promise) {
        console.warn(`[unifed] ${msg} (promise-based remote, continuing)`)
      } else {
        throw Object.assign(new Error(msg), { code: ErrorCodes.REMOTE_NAME_MISMATCH })
      }
    }
  }

  async function importEntry(url: string, remote: RemoteInternal): Promise<any> {
    // 动态地址导入：dev 下必须阻止 vite 对该 import 做转换
    return withTimeout(
      import(/* @vite-ignore */ url),
      remote.timeout ?? DEFAULT_TIMEOUT,
      `load remoteEntry ${url}`,
    )
  }

  async function acquireContainer(remote: RemoteInternal, overrides?: { retries?: number }): Promise<any> {
    const scopeKey = remote.shareScope || 'default'
    if (remote.container) {
      // 缓存路径同样校验：对已 init 的容器换 scope → MFU-005（webpack 语义）
      const prevScope = containerInitScopes.get(remote.container)
      if (prevScope && prevScope !== scopeKey) {
        throw new UnifedError(
          ErrorCodes.CONTAINER_REINIT_CONFLICT,
          `container "${remote.name}" already initialized with share scope "${prevScope}", cannot re-init with "${scopeKey}"`,
        )
      }
      return remote.container
    }
    if (remote.containerPromise) return remote.containerPromise

    // 熔断：连续失败达到阈值后快速失败
    const b = remote.breakerState
    if (b.openUntil > Date.now()) {
      const err = new UnifedError(
        ErrorCodes.REMOTE_LOAD_FAILED,
        `circuit breaker open for remote "${remote.name}" until ${new Date(b.openUntil).toISOString()}`,
        { remote: remote.name },
      )
      emitError({ remote: remote.name, error: err })
      throw err
    }

    remote.state = 'loading'
    remote.debug.status = 'loading'
    const containerPromise = (async () => {
      // URL 与 promise-based remote 统一走重试/超时/fallback 通道
      const loaders: Array<() => Promise<any>> = []
      if (remote.promise) {
        loaders.push(async () => {
          const resolved = await remote.promise!()
          const container = typeof resolved === 'string' ? await importEntry(resolved, remote) : resolved
          validateContainerInterface(container, remote)
          return container
        })
      } else {
        for (const url of [remote.entry, ...(remote.fallback ?? [])]) {
          loaders.push(async () => {
            const container = await importEntry(url, remote)
            validateContainerInterface(container, remote)
            return container
          })
        }
      }

      let container: any
      let lastErr: unknown
      let succeeded = false
      const maxRetries = overrides?.retries ?? remote.retries ?? DEFAULT_RETRIES
      for (const loader of loaders) {
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          const start = performance.now()
          try {
            container = await loader()
            remote.lastLoadMs = Math.round(performance.now() - start)
            remote.debug.lastLoadMs = remote.lastLoadMs
            succeeded = true
            break
          } catch (err) {
            lastErr = err
            // 领域错误（带 code）不重试，直接失败
            if ((err as any)?.code) throw err
            if (attempt < maxRetries) {
              await sleep(200 * 2 ** attempt)
            }
          }
        }
        if (succeeded) break
      }
      if (!succeeded || !container) {
        const hints: string[] = []
        if (/^https?:\/\//.test(remote.entry) && typeof location !== 'undefined') {
          hints.push(`1. is the remote dev server running?  try opening ${remote.entry} in the browser — it must return JS, not HTML/an error`)
          hints.push(`2. is the URL correct in federation({ remotes })?  dev and prod entries can differ`)
          hints.push(`3. CORS: the remote dev server must allow cross-origin requests (vite-plugin-unifed enables server.cors automatically; a custom server config may have disabled it)`)
        } else {
          hints.push(`1. is the remote deployed and reachable?  try opening ${remote.entry} in the browser — it must return JS`)
          hints.push(`2. NGINX/CDN routing: the entry path must serve the remoteEntry JS file (check try_files / fallback rules)`)
        }
        throw new UnifedError(
          ErrorCodes.REMOTE_LOAD_FAILED,
          `failed to load remote "${remote.name}" from ${remote.entry}: ${String((lastErr as Error)?.message ?? lastErr)}\n` +
            hints.join('\n'),
          { remote: remote.name },
        )
      }

      validateContainerInterface(container, remote)

      // init：容器收养整个 share scope map（按引用），注册自己的 provided modules
      // 模块命名空间对象是密封的，init scope 标记存 WeakMap
      const prevScope = containerInitScopes.get(container)
      if (prevScope && prevScope !== scopeKey) {
        throw new UnifedError(
          ErrorCodes.CONTAINER_REINIT_CONFLICT,
          `container "${remote.name}" already initialized with share scope "${prevScope}", cannot re-init with "${scopeKey}"`,
        )
      }
      if (typeof container.init === 'function') {
        await container.init(shareScopeMap)
      }
      containerInitScopes.set(container, scopeKey)
      remote.container = container
      remote.state = 'loaded'
      remote.debug.status = 'loaded'
      b.fails = 0
      return container
    })()

    remote.containerPromise = containerPromise
    try {
      return await containerPromise
    } catch (err) {
      remote.containerPromise = undefined
      remote.state = 'failed'
      remote.debug.status = 'failed'
      remote.debug.error = String((err as Error)?.message ?? err)
      b.fails += 1
      if (b.fails >= BREAKER_THRESHOLD) {
        b.openUntil = Date.now() + BREAKER_RESET_MS
        b.fails = 0
      }
      if (err instanceof UnifedError) {
        emitError({ remote: remote.name, error: err })
        throw err
      }
      // 带 code 的领域错误（如 MFU-002 名称不匹配）原样穿透，不重包装为 MFU-001
      if ((err as any)?.code) {
        emitError({ remote: remote.name, error: err as UnifedError })
        throw err
      }
      const wrapped = new UnifedError(ErrorCodes.REMOTE_LOAD_FAILED, String((err as Error)?.message ?? err), {
        remote: remote.name,
      })
      emitError({ remote: remote.name, error: wrapped })
      throw wrapped
    }
  }

  function parseSpec(spec: string): { remote: string; module: string } {
    const idx = spec.indexOf('/')
    if (idx === -1) return { remote: spec, module: '' }
    return { remote: spec.slice(0, idx), module: normalizeModuleName(spec.slice(idx + 1)) }
  }

  function normalizeModuleName(m: string): string {
    if (!m) return ''
    return m.startsWith('.') ? m : `./${m}`
  }

  async function loadRemote(
    spec: string,
    opts?: {
      shareScope?: string
      /** 单次调用覆盖 remote.retries（社区高频诉求：按调用控制重试次数） */
      retries?: number
      /**
       * 对齐 webpack MF 2.0 errorLoadRemote 语义：加载失败时返回 fallback 模块
       * （错误事件/console 仍显式发出，绝不静默——调用方不传则照旧抛错）
       */
      fallbackModule?: () => any
    },
  ): Promise<any> {
    const { remote: name, module } = parseSpec(spec)
    hooks.beforeLoadRemote?.({ remote: name, module })
    const remote = remotes.get(name)
    if (!remote) {
      throw new UnifedError(
        ErrorCodes.REMOTE_UNKNOWN,
        `unknown remote "${name}". Register it via federation({ remotes }) or registerRemote().`,
        { remote: name },
      )
    }
    let container: any
    try {
      container = await acquireContainer(remote, { retries: opts?.retries })
    } catch (err) {
      if (opts?.fallbackModule) {
        console.error(`[unifed] loadRemote("${spec}") failed; returning fallbackModule (显式降级，错误已透出)`, err)
        emitError({ remote: name, error: err as Error })
        return await opts.fallbackModule()
      }
      throw err
    }
    if (!module) return container
    const cacheKey = `${name}@${remote.shareScope || 'default'}#${module}`
    if (!loadedModules.has(cacheKey)) {
      loadedModules.set(
        cacheKey,
        container.get(module).catch((err: unknown) => {
          loadedModules.delete(cacheKey)
          if (err instanceof UnifedError || (err as any)?.code) throw err
          throw new UnifedError(
            ErrorCodes.REMOTE_LOAD_FAILED,
            `failed to load module "${module}" from remote "${name}": ${String((err as Error)?.message ?? err)}`,
            { remote: name, module },
          )
        }),
      )
    }
    let ns: any
    try {
      ns = await loadedModules.get(cacheKey)
    } catch (err) {
      if (opts?.fallbackModule) {
        console.error(`[unifed] loadRemote("${spec}") failed; returning fallbackModule (显式降级，错误已透出)`, err)
        emitError({ remote: name, error: err as Error })
        return await opts.fallbackModule()
      }
      throw err
    }
    hooks.afterLoadRemote?.({ remote: name, module, module_ns: ns })
    return ns
  }

  function getContainer(name: string): Promise<any> {
    const remote = remotes.get(name)
    if (!remote) {
      throw new UnifedError(ErrorCodes.REMOTE_UNKNOWN, `unknown remote "${name}"`, { remote: name })
    }
    return acquireContainer(remote)
  }

  async function preloadRemote(
    spec: string,
    opts: { mode?: 'preload' | 'prefetch' } = {},
  ): Promise<void> {
    const { remote: name } = parseSpec(spec)
    const remote = remotes.get(name)
    if (!remote) {
      throw new UnifedError(ErrorCodes.REMOTE_UNKNOWN, `unknown remote "${name}"`, { remote: name })
    }
    const mode = opts.mode ?? 'preload'
    const inject = (href: string, as: 'modulepreload' | 'style') => {
      if (typeof document === 'undefined') return
      if (document.querySelector(`link[href="${href}"]`)) return
      const link = document.createElement('link')
      link.rel = as === 'style' ? 'stylesheet' : 'modulepreload'
      link.href = href
      if (mode === 'prefetch') {
        // prefetch 语义：低优先级，等浏览器空闲
        ;(link as any).fetchPriority = 'low'
      }
      document.head.appendChild(link)
    }
    try {
      if (remote.manifestUrl) {
        const res = await fetch(remote.manifestUrl, { cache: 'no-cache' })
        if (res.ok) {
          const manifest = await res.json()
          inject(remote.entry, 'modulepreload')
          const exposes = manifest.exposes ?? {}
          for (const key of Object.keys(exposes)) {
            const item = exposes[key]
            if (item?.file) inject(new URL(item.file, remote.entry).href, 'modulepreload')
            for (const css of item?.css ?? []) inject(new URL(css, remote.entry).href, 'style')
          }
          return
        }
      }
      inject(remote.entry, 'modulepreload')
    } catch (err) {
      // 预加载失败不阻断业务，仅上报
      emitError({
        remote: name,
        error: new UnifedError(ErrorCodes.PRELOAD_FAILED, String((err as Error)?.message ?? err), {
          remote: name,
        }),
      })
    }
  }

  // 调试出口：window.__UNIFED_SCOPE__ / __UNIFED_INFO__
  const attachDebug = () => {
    if (typeof window === 'undefined') return
    ;(window as any).__UNIFED_SCOPE__ = shareScopeMap
    ;(window as any).__UNIFED_INFO__ = {
      get remotes() {
        const out: Record<string, RemoteDebugInfo> = {}
        for (const [k, v] of remotes) {
          out[k] = { ...v.debug, entry: v.entry }
        }
        return out
      },
      errors: [] as unknown[],
    }
  }
  attachDebug()

  return {
    shareScopeMap,
    initSharing,
    registerShare,
    registerRemotes,
    registerRemote,
    registerPlugins,
    loadShare,
    loadRemote,
    getContainer,
    preloadRemote,
    parseSpec,
  }
}

export type UnifedRuntime = ReturnType<typeof createRuntime>

const g = globalThis as any
export const runtime: UnifedRuntime = g.__UNIFED_RUNTIME__ ?? createRuntime()
g.__UNIFED_RUNTIME__ = runtime

export const initSharing = runtime.initSharing
export const registerShare = runtime.registerShare
export const registerRemotes = runtime.registerRemotes
export const registerRemote = runtime.registerRemote
export const registerPlugins = runtime.registerPlugins
export const loadShare = runtime.loadShare
export const loadRemote = runtime.loadRemote
export const getContainer = runtime.getContainer
export const preloadRemote = runtime.preloadRemote
export const shareScopeMap = runtime.shareScopeMap

/** default 导出 interop：ESM 取 .default；CJS 命名空间回退整体 */
export function unwrapDefault(ns: any): any {
  if (ns && typeof ns === 'object' && 'default' in ns) {
    const d = ns.default
    return d !== undefined ? d : ns
  }
  return ns
}

export default runtime
