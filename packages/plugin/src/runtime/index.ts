/**
 * fulgurjs 浏览器运行时内核。
 *
 * 设计要点（与 webpack MF 语义对齐）：
 * - share scope 为普通对象：scopeName -> name -> version -> { get, from, eager, loaded }，
 *   容器 init 时按引用"收养"传入的 scope map，双向供给、兄弟 remote 互享。
 * - 版本裁决：满足 requiredVersion 的最高版本胜出；已注册/已加载版本永不替换（first-wins）；
 *   singleton 冲突警告并使用唯一实例；strictVersion 冲突抛错。
 * - 页面级单例：通过 globalThis.__FULGURJS_RUNTIME__ 保证宿主与远程各自打包的运行时副本
 *   在同一页面只实例化一次。
 * - 自包含容器协议：remoteEntry 导出 { name, init(shareScopeMap), get(module) }，不 import 运行时。
 */
import { satisfies, compareVersions } from '../semver'
import { FgError, ErrorCodes } from './errors'
import { RUNTIME_VERSION } from '../version'

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
  /**
   * 加载超时 ms，默认 15000。注意：超时只代表"调用方不再等待"，浏览器不会取消已发出的
   * 动态 import——下一次调用复用同一条 in-flight 记录，不会重复初始化同一容器。
   */
  timeout?: number
  /** 失败重试次数，默认 2（上限 10；配置期与运行时注册均校验，非法当场抛错） */
  retries?: number
  /** 备用 remoteEntry 地址（首个失败后依次尝试） */
  fallback?: string[]
  breaker?: { threshold?: number; resetMs?: number }
  /** promise-based remote：运行时解析出容器或容器地址（其解析同样受 timeout 约束） */
  promise?: () => Promise<any>
  /** 内部：远程自报的发布路径（preload 用） */
  manifestUrl?: string
}

/** @deprecated 兼容旧版公开类型；新代码使用 RemoteConfig。 */
export interface RemoteInput extends RemoteConfig {
  container?: unknown
  containerPromise?: Promise<unknown>
}

export interface LoadRemoteOptions {
  shareScope?: string
  retries?: number
  fallbackModule?: () => any
}

export interface PreloadRemoteOptions {
  mode?: 'preload' | 'prefetch'
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
  onRemoteError?: (info: { remote: string; error: FgError }) => void
}

export interface RemoteDebugInfo {
  entry: string
  status: 'idle' | 'loading' | 'loaded' | 'failed'
  lastLoadMs?: number
  error?: string
  /** setup 生命周期状态（§3.3.1）：none=未配置 / pending=执行中 / ready=应用级已完成 / failed=失败可重试 */
  setup?: 'none' | 'pending' | 'ready' | 'failed'
}

/**
 * 远程初始化上下文（federation({ setup }) 模块的默认导出与具名 onSession 收到的参数）。
 * appContext 是调用时从页面级 AppContext 取得的当前快照（不缓存旧引用）；
 * signal 在登录代次变化或退出清理时失效，业务异步写回前必须检查 aborted。
 */
export interface RemoteSetupContext {
  appContext: Readonly<Record<string, any>>
  sessionKey?: string
  signal: AbortSignal
}

/** setup 模块的固定导出契约：默认导出必为函数；onSession 可选且必须是函数 */
export interface RemoteSetupModule {
  default: (ctx: RemoteSetupContext) => void | Promise<void>
  onSession?: (ctx: RemoteSetupContext) => void | Promise<void>
}

/** 每个远程的初始化状态（应用级 setup 一次；会话级 onSession 按 sessionKey 去重） */
interface LifecycleState {
  setupPromise?: Promise<void>
  setupExports?: Record<string, any>
  sessionKey?: string
  sessionPromise?: Promise<void>
  controller?: AbortController
}

/**
 * 容器上的 setup 元数据字段名（dev/prod 容器入口一致导出；与 src/options.ts 的
 * SETUP_CONTAINER_KEY 同值——运行时 bundle 自包含，不能反向 import node 侧模块，
 * 一致性由 tests/virtual.test.ts 守护）。
 */
const SETUP_META_KEY = '__fulgurjsSetup'
/** AppContext 页面级镜像对象键（跨版本互操作契约，见 context.ts） */
const APP_CONTEXT_GLOBAL_KEY = '__FULGURJS_APP_CONFIG__'

interface RemoteInternal extends Omit<RemoteConfig, 'breaker'> {
  state: 'idle' | 'loading' | 'loaded' | 'failed'
  container?: any
  containerPromise?: Promise<any>
  lastLoadMs?: number
  /** WP6：按 remote 生效的熔断参数（注册时从 breaker 配置归一；重复注册时刷新参数、保留状态） */
  breakerThreshold: number
  breakerResetMs: number
  breakerState: { fails: number; openUntil: number }
  /** WP6：entry 动态 import 的单一 in-flight 记录（按 URL；超时不清除——import 无法取消） */
  entryInflight: Map<string, Promise<any>>
  debug: RemoteDebugInfo
}

const DEFAULT_TIMEOUT = 15000
const DEFAULT_RETRIES = 2
const BREAKER_THRESHOLD = 5
const BREAKER_RESET_MS = 30000
/** WP6：重试退避上限与抖动系数（指数退避 200ms 起，封顶 4s，±20% 抖动） */
const BACKOFF_MAX_MS = 4000
const BACKOFF_JITTER = 0.2

function createRuntime() {
  // WP6：注册表全部使用无原型字典——scope 名 / share 键 / 版本号来自外部输入（配置或
  // 远程 manifest），'__proto__'/'constructor' 一类键在普通对象上会命中原型链（读污染
  // 判定、写污染原型），null 原型从根上消除该类歧义。
  const shareScopeMap: ShareScopeMap = Object.create(null)
  const remotes = new Map<string, RemoteInternal>()
  const plugins: RuntimePlugin[] = []
  const loadedModules = new Map<string, Promise<any>>()
  const remoteManifests = new Map<string, Promise<any | undefined>>()
  const stylesheetLoads = new WeakMap<HTMLLinkElement, Promise<void>>()
  const containerInitScopes = new WeakMap<object, string>()

  const hooks: RuntimeHooks = {}
  const applyPlugins = () => {
    for (const p of plugins) {
      try {
        p.init?.(hooks)
      } catch (err) {
        console.warn('[fulgurjs] runtimePlugin init failed:', p.name, err)
      }
    }
  }

  // ── setup/onSession 生命周期（§3.3.1）───────────────────────────────────────
  const lifecycleStates = new Map<string, LifecycleState>()
  /** setup/onSession 同步执行段标记：该段内对同一远程的 loadRemote 即自递归（MFU-014） */
  let lifecycleSyncRemote: string | undefined
  const lifecycleOf = (name: string): LifecycleState => {
    let st = lifecycleStates.get(name)
    if (!st) lifecycleStates.set(name, (st = {}))
    return st
  }
  const currentAppContext = (): Record<string, any> =>
    ((globalThis as any)[APP_CONTEXT_GLOBAL_KEY] ?? {}) as Record<string, any>

  /** 执行 setup/onSession：同步段守递归；执行失败包装为 MFU-012（带 remote/阶段/修法） */
  async function invokeLifecycleFn(
    remoteName: string,
    fn: (ctx: RemoteSetupContext) => void | Promise<void>,
    ctx: RemoteSetupContext,
    phase: 'setup' | 'onSession',
  ): Promise<void> {
    const wrap = (err: unknown): FgError => {
      if (err instanceof FgError) return err
      return new FgError(
        ErrorCodes.SETUP_RUN_FAILED,
        `${phase} of "${remoteName}" threw: ${String((err as Error)?.message ?? err)}\n` +
          `  修法: 修复该 ${phase} 的初始化逻辑后重新加载（失败的初始化缓存已清除，可直接重试）`,
        { remote: remoteName, phase },
      )
    }
    lifecycleSyncRemote = remoteName
    let result: void | Promise<void>
    try {
      result = fn(ctx)
    } catch (err) {
      // 同步抛出与异步拒绝统一包装（业务侧 sync throw 不经 await 路径）
      throw wrap(err)
    } finally {
      // 同步段结束：fn 返回（或同步抛出）后，后续异步续体不再归属本调用——
      // 同窗口内的并发 loadRemote 是合法并发（T3），不能误报递归
      lifecycleSyncRemote = undefined
    }
    try {
      await result
    } catch (err) {
      throw wrap(err)
    }
  }

  /** 应用级 setup：容器 init 后执行一次；并发共享同一 Promise，失败清缓存可重试 */
  async function runSetupPhase(remote: RemoteInternal, container: any, setupKey: string, st: LifecycleState): Promise<void> {
    remote.debug.setup = 'pending'
    try {
      // 预载 setup 资源（其 CSS 在 manifest exposes 中，随 preload 注入；失败不阻断）
      if (remote.manifestUrl) {
        try {
          await preloadRemote(`${remote.name}/${setupKey}`)
        } catch {
          /* 预载失败由 MFU-007 通道上报，不阻断 setup 模块导入 */
        }
      }
      const mod = await container.get(setupKey)
      const setupFn = mod?.default
      if (typeof setupFn !== 'function') {
        throw new FgError(
          ErrorCodes.SETUP_INVALID_EXPORT,
          `setup module "${setupKey}" of "${remote.name}": default export is ${mod == null ? String(mod) : typeof setupFn}, expected a function\n` +
            `  expected: export default async function setup(context: RemoteSetupContext) { ... }\n` +
            `  修法: 在 federation({ setup }) 指向的文件补默认导出函数（具名 onSession 可选；其他导出不作为生命周期入口）`,
          { remote: remote.name, module: setupKey },
        )
      }
      if (mod.onSession !== undefined && typeof mod.onSession !== 'function') {
        throw new FgError(
          ErrorCodes.SETUP_INVALID_EXPORT,
          `setup module "${setupKey}" of "${remote.name}": export "onSession" is ${typeof mod.onSession}, expected a function\n` +
            `  修法: 将 onSession 修正为函数导出，或删除该具名导出（其他导出名不作为生命周期入口）`,
          { remote: remote.name, module: setupKey },
        )
      }
      st.setupExports = mod
      await invokeLifecycleFn(
        remote.name,
        setupFn,
        { appContext: currentAppContext(), signal: (st.controller ??= new AbortController()).signal },
        'setup',
      )
      remote.debug.setup = 'ready'
    } catch (err) {
      remote.debug.setup = 'failed'
      // 只清应用级缓存：onSession 语义不存在，重试从 setup 重新开始
      st.setupExports = undefined
      throw err
    }
  }

  /** 会话级 onSession：按非敏感 sessionKey 去重；换代先作废旧信号再串行衔接 */
  async function ensureSessionPhase(remote: RemoteInternal, st: LifecycleState, onSession: (ctx: RemoteSetupContext) => void | Promise<void>): Promise<void> {
    const appContext = currentAppContext()
    const sessionKey = appContext?.sessionKey
    if (typeof sessionKey !== 'string' || sessionKey === '') {
      throw new FgError(
        ErrorCodes.SETUP_SESSION_KEY_MISSING,
        `remote "${remote.name}" declares onSession but AppContext.sessionKey is ${sessionKey === undefined ? 'missing' : JSON.stringify(sessionKey)}\n` +
          `  expected: 宿主登录后 provideAppContext({ ..., sessionKey: '<非敏感登录代次 ID>' })\n` +
          `  修法: 宿主登录流程每次成功登录/重登生成新代次 ID（禁止用 token 充当），并在 loadRemote 前提供`,
        { remote: remote.name },
      )
    }
    if (st.sessionPromise && st.sessionKey === sessionKey) return st.sessionPromise
    // 新登录代次：先作废旧信号（业务代码在 await 后写状态前检查 aborted），再串行衔接旧调用
    st.controller?.abort()
    const controller = new AbortController()
    st.controller = controller
    st.sessionKey = sessionKey
    const prev = st.sessionPromise ? st.sessionPromise.catch(() => {}) : Promise.resolve()
    const run = (async () => {
      await prev
      if (controller.signal.aborted) return
      await invokeLifecycleFn(remote.name, onSession, { appContext, sessionKey, signal: controller.signal }, 'onSession')
    })()
    st.sessionPromise = run
    run.catch(() => {
      // 失败只清当前代次的缓存（支持重试）；更高代次已接管时不动其状态
      if (st.sessionKey === sessionKey) {
        st.sessionKey = undefined
        st.sessionPromise = undefined
      }
    })
    return run
  }

  /** 取得容器（init 完成）之后、返回业务模块之前执行：无 setup 元数据时零开销直返 */
  async function ensureLifecycle(remote: RemoteInternal, container: any): Promise<void> {
    const setupKey = container?.[SETUP_META_KEY]
    if (typeof setupKey !== 'string' || setupKey === '') return
    const st = lifecycleOf(remote.name)
    if (!st.setupPromise) {
      st.setupPromise = runSetupPhase(remote, container, setupKey, st).catch((err) => {
        st.setupPromise = undefined
        throw err
      })
    }
    await st.setupPromise
    const onSession = st.setupExports?.onSession
    if (typeof onSession === 'function') {
      await ensureSessionPhase(remote, st, onSession)
    }
  }

  /** 退出清理（clearAppContext 调用）：作废全部会话信号、失效 onSession 去重状态。
   *  应用级 setup 与容器/共享模块保留——重新登录只重跑会话级初始化。 */
  function clearSessionState(): void {
    for (const st of lifecycleStates.values()) {
      try {
        st.controller?.abort()
      } catch {
        /* 极端环境 AbortController 异常不阻断清理 */
      }
      st.sessionKey = undefined
      st.sessionPromise = undefined
    }
  }

  const getScope = (name: string): ShareScope => (shareScopeMap[name] ??= Object.create(null))

  function emitError(info: { remote: string; error: FgError }) {
    try {
      hooks.onRemoteError?.(info)
    } catch {}
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('fulgurjs:error', { detail: info }))
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
    // own-property 判定 + null 原型字典：'__proto__'/'constructor' 等键不误读/误写原型
    const own = Object.hasOwn(scope, name) ? scope[name] : undefined
    let byName: Record<string, ShareEntry> = own && typeof own === 'object' ? (own as Record<string, ShareEntry>) : undefined as never
    if (!byName) {
      byName = Object.create(null)
      scope[name] = byName
    }
    if (Object.hasOwn(byName, version) && byName[version]) {
      // 已注册版本永不替换（webpack 语义：first-wins）
      return
    }
    byName[version] = { version, get, from: opts.from ?? 'unknown', eager: !!opts.eager, loaded: !!opts.loaded }
  }

  /** WP6：运行时注册参数校验（配置期 CFG-009 之外的直连防线）——坏数值当场抛错 */
  function assertRemoteParams(r: RemoteConfig): void {
    const check = (v: unknown, name: string, int10?: boolean) => {
      if (v === undefined) return
      const ok = typeof v === 'number' && (int10 ? Number.isInteger(v) && v >= 0 && v <= 10 : Number.isFinite(v) && v > 0)
      if (!ok) {
        throw new Error(
          `[fulgurjs] registerRemote("${r.name}"): ${name} must be a ${int10 ? 'integer 0..10' : 'finite positive number'}, got ${String(v)}`,
        )
      }
    }
    check(r.timeout, 'timeout')
    check(r.retries, 'retries', true)
    if (r.breaker) {
      check(r.breaker.threshold, 'breaker.threshold')
      check(r.breaker.resetMs, 'breaker.resetMs')
    }
  }

  function registerRemotes(list: RemoteConfig[]): void {
    for (const r of list) {
      assertRemoteParams(r)
      const prev = remotes.get(r.name)
      remotes.set(r.name, {
        timeout: DEFAULT_TIMEOUT,
        retries: DEFAULT_RETRIES,
        ...prev,
        ...r,
        // 熔断参数随最新配置刷新；计数状态（fails/openUntil）跨注册保留——半开窗口不被重置
        breakerThreshold: r.breaker?.threshold ?? prev?.breakerThreshold ?? BREAKER_THRESHOLD,
        breakerResetMs: r.breaker?.resetMs ?? prev?.breakerResetMs ?? BREAKER_RESET_MS,
        state: prev?.state ?? 'idle',
        breakerState: prev?.breakerState ?? { fails: 0, openUntil: 0 },
        entryInflight: prev?.entryInflight ?? new Map(),
        debug: prev?.debug ?? { entry: r.entry, status: 'idle', setup: 'none' },
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
        const msg = `singleton skew "${shareKey}": req "${req ?? 'any'}" use ${pick} from ${entry0.from}`
        if (opts.strictVersion) {
          const err = new FgError(ErrorCodes.SHARE_STRICT_VERSION, msg, {
            shareKey,
            requiredVersion: req,
          })
          emitError({ remote: entry0.from, error: err })
          throw err
        }
        // MFU-010：singleton 版本漂移告警（消费方要求与作用域实际提供不一致时的可诊断性）
        console.warn(`[fulgurjs:MFU-010] ${msg}`)
      }
    } else {
      pick = [...satisfying].sort(compareVersions).pop()
      if (!pick) {
        if (opts.strictVersion) {
          const err = new FgError(
            ErrorCodes.SHARE_STRICT_VERSION,
            `no satisfying version for "${shareKey}" (required "${req}") in share scope "${scopeName}"`,
          )
          emitError({ remote: shareKey, error: err })
          throw err
        }
        if (opts.fallback) return opts.fallback()
        const err = new FgError(
          ErrorCodes.SHARE_NOT_AVAILABLE,
          `shared "${shareKey}" (${req ?? 'any'}) unavailable in scope "${scopeName}" (no local fallback)`,
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

  /** WP6：错误信息用的 URL 脱敏——去凭证（user:pass@）与 query/hash */
  function sanitizeUrl(u: string): string {
    try {
      const x = new URL(u, typeof location < 'u' ? location.href : 'http://f.invalid')
      return x.protocol + '//' + x.host + x.pathname
    } catch {
      return String(u).replace(/[?#].*$/, '')
    }
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
        console.warn(`[fulgurjs] ${msg} (promise-based remote, continuing)`)
      } else {
        throw Object.assign(new Error(msg), { code: ErrorCodes.REMOTE_NAME_MISMATCH })
      }
    }
  }

  async function importEntry(url: string, remote: RemoteInternal): Promise<any> {
    // WP6：单一 in-flight 记录——动态 import 无法取消，调用方超时只代表不再等待；
    // 后续调用（含超时后的重试）复用同一条 promise，绝不重复发起同一 URL 的 import。
    // 请求层失败（fetch error）后清除记录以允许真实重试。
    const cached = remote.entryInflight.get(url)
    const inflight = cached ?? import(/* @vite-ignore */ url)
    if (!cached) {
      remote.entryInflight.set(url, inflight)
      inflight.catch(() => remote.entryInflight.delete(url))
    }
    return withTimeout(inflight, remote.timeout ?? DEFAULT_TIMEOUT, `load remoteEntry ${url}`)
  }

  async function acquireContainer(remote: RemoteInternal, overrides?: { retries?: number }): Promise<any> {
    const scopeKey = remote.shareScope || 'default'
    if (remote.container) {
      // 缓存路径同样校验：对已 init 的容器换 scope → MFU-005（webpack 语义）
      const prevScope = containerInitScopes.get(remote.container)
      if (prevScope && prevScope !== scopeKey) {
        throw new FgError(
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
      const err = new FgError(
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
          // WP6：promise() 的异步解析同样受 timeout 约束（否则 promise remote 可永久 pending）
          const resolved = await withTimeout(
            remote.promise!(),
            remote.timeout ?? DEFAULT_TIMEOUT,
            `resolve promise remote "${remote.name}"`,
          )
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
              // WP6：指数退避封顶 + 随机抖动（防同批失败的重试风暴整齐共振）
              await sleep(Math.min(BACKOFF_MAX_MS, 200 * 2 ** attempt) * (1 - BACKOFF_JITTER * (1 - 2 * Math.random())))
            }
          }
        }
        if (succeeded) break
      }
      if (!succeeded || !container) {
        // WP6：错误信息中的 URL 脱敏——去用户名/密码与 query 参数（凭证可能藏在 query），
        // 诊断保留 remote 名与 origin
        const shown = sanitizeUrl(remote.entry)
        const hints: string[] = []
        if (/^https?:\/\//.test(remote.entry) && typeof location !== 'undefined') {
          hints.push(`1. is the remote dev server running?  open ${shown} in a browser — it must return JS, not HTML`)
          hints.push(`2. is the URL correct in federation({ remotes })?  dev/prod entries can differ`)
          hints.push(`3. CORS: the remote dev server must allow cross-origin requests (check its server.cors)`)
        } else {
          hints.push(`1. is the remote deployed?  open ${shown} in a browser — it must return JS`)
          hints.push(`2. NGINX/CDN routing: the entry path must serve the remoteEntry JS (check try_files)`)
        }
        throw new FgError(
          ErrorCodes.REMOTE_LOAD_FAILED,
          `failed to load remote "${remote.name}" from ${shown}: ${String((lastErr as Error)?.message ?? lastErr)}\n` +
            hints.join('\n'),
          { remote: remote.name },
        )
      }

      validateContainerInterface(container, remote)

      // init：容器收养整个 share scope map（按引用），注册自己的 provided modules
      // 模块命名空间对象是密封的，init scope 标记存 WeakMap
      const prevScope = containerInitScopes.get(container)
      if (prevScope && prevScope !== scopeKey) {
        throw new FgError(
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
      if (b.fails >= remote.breakerThreshold) {
        b.openUntil = Date.now() + remote.breakerResetMs
        b.fails = 0
      }
      if (err instanceof FgError) {
        emitError({ remote: remote.name, error: err })
        throw err
      }
      // 带 code 的领域错误（如 MFU-002 名称不匹配）原样穿透，不重包装为 MFU-001
      if ((err as any)?.code) {
        emitError({ remote: remote.name, error: err as FgError })
        throw err
      }
      const wrapped = new FgError(ErrorCodes.REMOTE_LOAD_FAILED, String((err as Error)?.message ?? err), {
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

  async function loadRemote<T = Record<string, any>>(
    spec: string,
    opts?: LoadRemoteOptions,
  ): Promise<T> {
    const { remote: name, module } = parseSpec(spec)
    // MFU-014：setup/onSession 同步执行段内递归 loadRemote 同一远程（自等待死锁的显式报错）
    if (module && lifecycleSyncRemote === name) {
      throw new FgError(
        ErrorCodes.SETUP_RECURSION,
        `loadRemote("${spec}") re-entered from setup/onSession of "${name}" — the initialization promise would await itself (deadlock)\n` +
          `  修法: setup/onSession 内不 loadRemote 同一远程的模块；需要的业务模块改为在页面组件内加载，或经 context 通道解耦`,
        { remote: name },
      )
    }
    // WP6：观测 hook 自身抛错不把成功的模块加载改成失败（仅告警）
    try {
      hooks.beforeLoadRemote?.({ remote: name, module })
    } catch (hookErr) {
      console.warn('[fulgurjs] beforeLoadRemote hook error (ignored):', hookErr)
    }
    const remote = remotes.get(name)
    if (!remote) {
      throw new FgError(
        ErrorCodes.REMOTE_UNKNOWN,
        `unknown remote "${name}". Register it via federation({ remotes }) or registerRemote().`,
        { remote: name },
      )
    }
    let container: any
    try {
      const stylesReady = module && remote.manifestUrl ? preloadRemote(spec) : Promise.resolve()
      ;[container] = await Promise.all([acquireContainer(remote, { retries: opts?.retries }), stylesReady])
    } catch (err) {
      if (opts?.fallbackModule) {
        console.error(`[fulgurjs] loadRemote("${spec}") failed; returning fallbackModule (显式降级，错误已透出)`, err)
        emitError({ remote: name, error: err as FgError })
        return await opts.fallbackModule()
      }
      throw err
    }
    if (!module) return container
    // setup/onSession 生命周期：容器 init（shared 作用域收养）完成后、返回业务模块前执行；
    // 已缓存的业务模块同样经过此处——换账号后打开已加载过的页面仍会触发新代次的 onSession
    await ensureLifecycle(remote, container)
    const cacheKey = `${name}@${remote.shareScope || 'default'}#${module}`
    if (!loadedModules.has(cacheKey)) {
      loadedModules.set(
        cacheKey,
        container.get(module).catch((err: unknown) => {
          loadedModules.delete(cacheKey)
          if (err instanceof FgError || (err as any)?.code) throw err
          throw new FgError(
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
        console.error(`[fulgurjs] loadRemote("${spec}") failed; returning fallbackModule (显式降级，错误已透出)`, err)
        emitError({ remote: name, error: err as FgError })
        return await opts.fallbackModule()
      }
      throw err
    }
    try {
      hooks.afterLoadRemote?.({ remote: name, module, module_ns: ns })
    } catch (hookErr) {
      console.warn('[fulgurjs] afterLoadRemote hook error (ignored):', hookErr)
    }
    // MFU-009：加载到的模块没有任何导出——exposes 指向了不导出内容的文件（误导出/空文件）。
    // 仅告警不抛错：命名空间为空对调用方必然不可用，但保留返回值避免破坏既有容错路径
    if (ns && typeof ns === 'object' && Object.keys(ns).length === 0) {
      const err = new FgError(
        ErrorCodes.EMPTY_EXPORTS,
        `no exports: ${module} @ ${name}`,
        { remote: name, module },
      )
      emitError({ remote: name, error: err })
      console.error(`[fulgurjs:MFU-009] ${err.message}`)
    }
    return ns
  }

  function getContainer(name: string): Promise<any> {
    const remote = remotes.get(name)
    if (!remote) {
      throw new FgError(ErrorCodes.REMOTE_UNKNOWN, `unknown remote "${name}"`, { remote: name })
    }
    return acquireContainer(remote)
  }

  async function preloadRemote(
    spec: string,
    opts: PreloadRemoteOptions = {},
  ): Promise<void> {
    const { remote: name, module } = parseSpec(spec)
    const remote = remotes.get(name)
    if (!remote) {
      throw new FgError(ErrorCodes.REMOTE_UNKNOWN, `unknown remote "${name}"`, { remote: name })
    }
    const mode = opts.mode ?? 'preload'
    const waitForStylesheet = (link: HTMLLinkElement, href: string): Promise<void> => {
      if (link.sheet) return Promise.resolve()
      const pending = stylesheetLoads.get(link)
      if (pending) return pending
      const loaded = new Promise<void>((resolve) => {
        const finish = () => {
          link.removeEventListener('load', finish)
          link.removeEventListener('error', failed)
          resolve()
        }
        const failed = () => {
          emitError({
            remote: name,
            error: new FgError(ErrorCodes.PRELOAD_FAILED, `failed to load remote stylesheet ${href}`, {
              remote: name,
            }),
          })
          finish()
        }
        link.addEventListener('load', finish, { once: true })
        link.addEventListener('error', failed, { once: true })
        if (link.sheet) finish()
      })
      stylesheetLoads.set(link, loaded)
      return loaded
    }
    const inject = (href: string, as: 'modulepreload' | 'style'): Promise<void> => {
      if (typeof document === 'undefined') return Promise.resolve()
      const existing = document.querySelector(`link[href="${href}"]`) as HTMLLinkElement | null
      if (existing) {
        // Only wait on stylesheets whose load event this runtime tracks; an unrelated existing
        // link may have completed before listeners could be attached.
        return as === 'style' && mode === 'preload'
          ? (stylesheetLoads.get(existing) ?? Promise.resolve())
          : Promise.resolve()
      }
      const link = document.createElement('link')
      link.rel = as === 'style' ? 'stylesheet' : 'modulepreload'
      link.href = href
      if (mode === 'prefetch') {
        // prefetch 语义：低优先级，等浏览器空闲
        ;(link as any).fetchPriority = 'low'
      }
      const loaded = as === 'style' ? waitForStylesheet(link, href) : Promise.resolve()
      document.head.appendChild(link)
      return as === 'style' && mode === 'preload' ? loaded : Promise.resolve()
    }

    const resolveAssetUrl = (asset: string) => {
      const pageUrl = typeof document !== 'undefined' ? document.baseURI : undefined
      const base = new URL(remote.entry, pageUrl || 'http://fulgurjs.invalid/')
      // URL 相对基准 = entry 所在目录（manifest 契约）。entry 是文件（…/remoteEntry.js）时
      // URL() 天然取其目录；entry 是目录形态（'/remote-a'，根相对配置）时补尾斜杠，
      // 否则 'assets/x.js' 会被解析到站点根（404）。
      if (!base.pathname.endsWith('/') && !base.pathname.split('/').pop()!.includes('.')) {
        base.pathname += '/'
      }
      return new URL(asset, base).href
    }

    try {
      if (remote.manifestUrl) {
        let manifestPromise = remoteManifests.get(remote.manifestUrl)
        if (!manifestPromise) {
          // WP6：manifest fetch 带超时（不设超时的 fetch 可能让 preloadRemote 永久 pending）
          manifestPromise = fetch(remote.manifestUrl, {
            cache: 'no-cache',
            signal: AbortSignal.timeout(8000),
          }).then((res) => (res.ok ? res.json() : undefined))
          remoteManifests.set(remote.manifestUrl, manifestPromise)
          manifestPromise.then(
            (manifest) => {
              if (!manifest) remoteManifests.delete(remote.manifestUrl!)
            },
            () => remoteManifests.delete(remote.manifestUrl!),
          )
        }
        const manifest = await manifestPromise
        if (manifest) {
          // WP4 契约：未知主版本拒绝消费（不静默当空 manifest），降级为仅预载 entry
          const sv = (manifest as { schemaVersion?: unknown }).schemaVersion
          if (typeof sv === 'number' && (!Number.isInteger(sv) || sv > 1)) {
            emitError({
              remote: name,
              error: new FgError(ErrorCodes.PRELOAD_FAILED, `unsupported manifest schemaVersion ${String(sv)} (expected 1)`, {
                remote: name,
              }),
            })
            await inject(remote.entry, 'modulepreload')
            return
          }
          await inject(remote.entry, 'modulepreload')
          const exposes = manifest.exposes
          const entries: Array<[string, any]> = Array.isArray(exposes)
            ? exposes
                .filter((item: any) => item && typeof item === 'object')
                .map((item: any) => [String(item.name ?? ''), item])
            : exposes && typeof exposes === 'object'
              ? Object.entries(exposes)
              : []
          const selected = module
            ? entries.filter(([key, item]) => normalizeModuleName(String(item?.name ?? key)) === module)
            : entries
          const cssLoads: Promise<void>[] = []
          for (const [, item] of selected) {
            if (typeof item?.file === 'string') {
              await inject(resolveAssetUrl(item.file), 'modulepreload')
            }
            if (Array.isArray(item?.css)) {
              for (const css of item.css) {
                if (typeof css !== 'string') continue
                const loading = inject(resolveAssetUrl(css), 'style')
                if (mode === 'preload') cssLoads.push(loading)
              }
            }
          }
          await Promise.all(cssLoads)
          return
        }
      }
      await inject(remote.entry, 'modulepreload')
    } catch (err) {
      // 预加载失败不阻断业务，仅上报
      emitError({
        remote: name,
        error: new FgError(ErrorCodes.PRELOAD_FAILED, String((err as Error)?.message ?? err), {
          remote: name,
        }),
      })
    }
  }

  // 调试出口：window.__FULGURJS_SCOPE__ / __FULGURJS_INFO__
  const attachDebug = () => {
    if (typeof window === 'undefined') return
    ;(window as any).__FULGURJS_SCOPE__ = shareScopeMap
    ;(window as any).__FULGURJS_INFO__ = {
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
  // setup 状态变化不重挂 debug 对象：remotes getter 每次展开最新 debug（含 setup 字段）

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
    clearSessionState,
  }
}

export type FgRuntime = ReturnType<typeof createRuntime>

const g = globalThis as any
export const runtime: FgRuntime = g.__FULGURJS_RUNTIME__ ?? createRuntime()
g.__FULGURJS_RUNTIME__ = runtime

// 运行时单例契约固化：跨源消费方（远程页面/最小宿主）只允许经 globalThis.__FULGURJS_RUNTIME__
// 或 getRuntime() 取这份实例；方法面冻结防意外覆写（shareScopeMap 注册表本身仍可变）。
// 冻结的是单例本体——无论它由哪份打包副本先创建，后续副本拿到的都是同一个冻结对象。
try {
  Object.freeze(runtime)
} catch {
  /* 极端环境（不可冻结）静默降级：契约仍由文档与 getRuntime 保证 */
}

/** 插件版本（与 package.json 同步维护于 src/version.ts，测试拦截漂移；用于跨源副本一致性诊断） */
export const version: string = RUNTIME_VERSION

/**
 * 取当前页面生效的运行时单例（与 globalThis.__FULGURJS_RUNTIME__ 同一实例）。
 *
 * 远程页面禁止静态 import 'virtual:fulgurjs-runtime'——该虚拟模块由远程 dev server
 * 求值，会在远程模块图内实例化独立的运行时副本，破坏渲染上下文
 * （resolveComponent / withDirectives / ref owner 告警、内容区空白）。
 * 跨源取运行时一律用本入口，或直接读全局单例。
 */
export function getRuntime(): FgRuntime {
  return runtime
}

export const initSharing = runtime.initSharing
export const registerShare = runtime.registerShare
export const registerRemotes = runtime.registerRemotes
export const registerRemote = runtime.registerRemote
export const registerPlugins = runtime.registerPlugins
export const loadShare = runtime.loadShare
export const loadRemote = runtime.loadRemote
export const getContainer = runtime.getContainer
export const preloadRemote = runtime.preloadRemote
export const parseSpec = runtime.parseSpec
/** 退出清理的运行时侧：作废全部远程的会话信号与 onSession 去重状态（clearAppContext 调用） */
export const clearSessionState = runtime.clearSessionState
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
