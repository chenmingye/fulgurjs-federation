/**
 * React 适配层：remoteComponent() / useLoadRemote() / RemoteErrorBoundary /
 * createReactHostPages()。只接收加载函数，不静态引用运行时内核（同 vue-adapter 形态，
 * dist/react.js 由构建脚本绑定 loadRemote 后再导出）。
 *
 * 语义要点（README React 章节的实现依据）：
 * - remoteComponent：工厂与页面表声明零加载副作用；首次渲染才 loadRemote；
 *   加载状态机自带 pending/error/ready 三态，不用 React.lazy——lazy 的失败 Promise
 *   会缓存在实例上，仅重置错误边界无法恢复，必须重建加载尝试。retry 以受控 attempt
 *   计数触发（不在普通 render 中重建加载器，组件本地状态不因重渲染反复重置）。
 * - timeout 是本次组件加载等待上限（适配层实现），不取消 loadRemote 的共享请求，
 *   不修改远程入口配置超时；迟到的成功/失败一律丢弃，不产生未处理 rejection。
 *   retry 对已成功缓存的模块不重新下载（运行时缓存），只重走生命周期（onSession 按代次去重）。
 * - 渲染期异常由内置 RemoteRenderBoundary 捕获，与网络/导出错误分开记录与展示；
 *   ErrorBoundary 不捕获事件处理器与任意异步回调（React 边界语义，README 已声明）。
 * - 代码全部 createElement（无 JSX）：适配器自身不依赖 jsx-runtime，减少共享子路径面。
 */
import {
  Component,
  createElement,
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type ErrorInfo,
  type ReactNode,
  type Ref,
} from 'react'
import type { LoadRemoteOptions } from './runtime/index'
import type { PageRouteLike } from './pages'
import {
  cleanCompName,
  createHostPagesCore,
  noRenderableExportError,
  readSessionKey,
  shouldResetSessionCache,
  type HostPagesCoreOptions,
  type ResolvedHostPage,
} from './host-pages-core'

export type { ResolvedHostPage } from './host-pages-core'

type LoadRemoteFn = (spec: string, opts?: LoadRemoteOptions) => Promise<any>

/** 渲染函数形态的错误占位：(error, retry) => ReactNode；与 remoteComponent.error 一致 */
export type RemoteErrorFallback = (error: unknown, retry: () => void) => ReactNode

export interface ReactRemoteComponentOptions {
  /** 本次加载 pending 时的占位（区别于失败占位）；默认 null */
  fallback?: ReactNode
  /** 加载失败或子树渲染错误的展示；默认内置中文占位（错误码+根因+修法+重试） */
  error?: ReactNode | RemoteErrorFallback
  /** 透传现行 loadRemote 的重试选项（0-10 整数），不另叠自动重试 */
  retries?: number
  /** 本次组件加载等待上限 ms；不提供则沿用 loadRemote 自身超时。不取消已发出的共享请求 */
  timeout?: number
}

const ERROR_STYLE: Record<string, string> = {
  padding: '16px', border: '1px solid #fde2e2', borderRadius: '4px',
  background: '#fef0f0', color: '#c45656', fontSize: '13px', lineHeight: '1.6',
  boxSizing: 'border-box',
}
const TITLE_STYLE = { margin: '0 0 4px', fontWeight: 600 } as const
const MESSAGE_STYLE = { margin: '0 0 8px', wordBreak: 'break-all' } as const
const FIX_STYLE = { margin: '0 0 8px' } as const

const DefaultErrorView = function FulgurjsRemoteError({ error, retry, phase }: {
  error: unknown
  retry: () => void
  phase: 'load' | 'render'
}): ReactNode {
  const err = error as (Error & { code?: string }) | undefined
  const code = err?.code ?? 'UNKNOWN'
  const message = err?.message ?? String(error ?? 'unknown error')
  return createElement('div', { style: ERROR_STYLE, 'data-fulgurjs-error': code }, [
    createElement('p', { key: 't', style: TITLE_STYLE },
      phase === 'load' ? `远程组件加载失败（错误码 ${code}）` : `远程组件渲染出错（错误码 ${code}）`),
    createElement('p', { key: 'm', style: MESSAGE_STYLE }, message),
    createElement('p', { key: 'f', style: FIX_STYLE }, phase === 'render'
      ? '修法：查看浏览器 console 中的组件调用栈定位远程组件内部的渲染异常（错误抛自远程代码本身，与网络加载无关）。'
      : '修法：① 核对 spec 的「远程名/expose 名」与远程应用 exposes 是否一致（MFU-006/008）；② 核对 remotes 地址端口与远程服务可达性（MFU-001）；③ 查看 window 的 fulgurjs:error 事件与 console 同源错误定位根因。'),
    createElement('button', { key: 'r', onClick: retry, type: 'button' }, '重试'),
  ])
}

type ErrorViewProps = { error: unknown; retry: () => void; phase: 'load' | 'render' }

/** 校验远程导出是否为合法组件类型：函数（函数/class 组件）或 memo/forwardRef 等带 $$typeof 的对象 */
function isValidComponentType(v: unknown): boolean {
  if (typeof v === 'function') return true
  if (v !== null && typeof v === 'object' && typeof (v as { $$typeof?: unknown }).$$typeof === 'symbol') return true
  return false
}

/** 适配层参数校验（与运行时 assertRemoteParams 同口径：retries 0-10 整数、timeout 正有限数） */
function assertAdapterOptions(source: string, opts: { retries?: number; timeout?: number }): void {
  if (opts.retries !== undefined && (typeof opts.retries !== 'number' || !Number.isInteger(opts.retries) || opts.retries < 0 || opts.retries > 10)) {
    throw new Error(
      `[fulgurjs] ${source} 的 retries 配置无效：当前为 ${String(opts.retries)}，应为 0 到 10 的整数。请修正选项。`,
    )
  }
  if (opts.timeout !== undefined && (typeof opts.timeout !== 'number' || !Number.isFinite(opts.timeout) || opts.timeout <= 0)) {
    throw new Error(
      `[fulgurjs] ${source} 的 timeout 配置无效：当前为 ${String(opts.timeout)}，应为大于 0 的有限毫秒数。请修正选项。`,
    )
  }
}

function renderErrorNode(
  errorOpt: ReactNode | RemoteErrorFallback | undefined,
  error: unknown,
  retry: () => void,
  phase: 'load' | 'render',
): ReactNode {
  if (typeof errorOpt === 'function') return errorOpt(error, retry)
  if (errorOpt !== undefined) return errorOpt
  return createElement(DefaultErrorView, { error, retry, phase } as ErrorViewProps)
}

// ── RemoteErrorBoundary：独立页面级兜底 ───────────────────────────────────────

export interface RemoteErrorBoundaryProps {
  children?: ReactNode
  /** 错误占位：节点或 ({ error, reset }) 渲染函数；默认内置中文占位 */
  fallback?: ReactNode | ((args: { error: unknown; reset: () => void }) => ReactNode)
  /** 渲染异常回调（error + React componentStack 信息） */
  onError?: (error: unknown, info: ErrorInfo) => void
  /** 任一项变化时重置边界状态（受控重试的常用形态：传 [retryEpoch]） */
  resetKeys?: readonly unknown[]
}

interface BoundaryState { error: unknown | null }

/**
 * 页面级错误边界：只捕获传到它的子树渲染错误。remoteComponent 内置边界已处理自身错误，
 * 外层边界看不到内层已消费的异常。reset 只重置边界状态；子组件若持有失败缓存
 * （如 React.lazy），还需要由调用方重建加载尝试（remoteComponent 的 retry 已含两者）。
 */
export class RemoteErrorBoundary extends Component<RemoteErrorBoundaryProps, BoundaryState> {
  override state: BoundaryState = { error: null }

  static getDerivedStateFromError(error: unknown): BoundaryState {
    return { error }
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    // 渲染异常与加载异常分开记录：这里只有渲染路径（加载错误不经 ErrorBoundary）
    console.error('[fulgurjs] 远程组件渲染异常（RemoteErrorBoundary 捕获）：', error, info?.componentStack ?? '')
    this.props.onError?.(error, info)
  }

  override componentDidUpdate(prev: RemoteErrorBoundaryProps): void {
    if (this.state.error !== null && !shallowArrayEq(prev.resetKeys, this.props.resetKeys)) {
      this.reset()
    }
  }

  readonly reset = (): void => {
    this.setState({ error: null })
  }

  override render(): ReactNode {
    if (this.state.error !== null) {
      const f = this.props.fallback
      if (typeof f === 'function') return f({ error: this.state.error, reset: this.reset })
      if (f !== undefined) return f
      return renderErrorNode(undefined, this.state.error, this.reset, 'render')
    }
    return this.props.children
  }
}

function shallowArrayEq(a: readonly unknown[] | undefined, b: readonly unknown[] | undefined): boolean {
  if (a === b) return true
  if (!a || !b || a.length !== b.length) return false
  return a.every((v, i) => v === b[i])
}

// ── remoteComponent：加载状态机 ────────────────────────────────────────────────

interface LoadState {
  phase: 'pending' | 'error' | 'ready'
  error?: unknown
  Comp?: unknown
}

interface RemoteLoaderProps {
  spec: string
  opts: ReactRemoteComponentOptions
  loadRemote: LoadRemoteFn
  beforeLoad?: () => void | Promise<void>
  /** 受控加载尝试计数：变化即重跑加载 effect（retry / 代次切换） */
  attempt: number
  /** 当前有效登录代次（页面级 AppContext.sessionKey）：变化即重跑加载 effect（会话切换） */
  sessionKey: string | undefined
  /** 错误占位可操作的重试（触发外层 attempt 递增） */
  retry: () => void
  /** 透传给远程组件的用户 props（已剥除内部字段与 ref） */
  passthrough: Record<string, unknown>
  fwdRef?: Ref<unknown>
}

function RemoteLoader({ spec, opts, loadRemote, beforeLoad, attempt, sessionKey, retry, passthrough, fwdRef }: RemoteLoaderProps): ReactNode {
  const [state, setState] = useState<LoadState>({ phase: 'pending' })
  // 最新 passthrough/fwdRef 引用（createElement 用，无需触发重渲染）
  const latest = useRef({ passthrough, fwdRef })
  latest.current = { passthrough, fwdRef }

  useEffect(() => {
    // 每轮 effect 独立守卫：cancelled（本 effect 已清理）或 settled（本代次已终态写入）
    // 都拒绝旧结果——超时后迟到的成功/失败、旧 attempt/旧会话的返回都不覆盖当前状态
    let cancelled = false
    let settled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const gen = `${attempt}@${sessionKey ?? ''}`
    const commit = (next: LoadState): void => {
      if (cancelled || settled || gen !== `${attempt}@${sessionKey ?? ''}`) return
      settled = true
      setState(next)
    }

    setState({ phase: 'pending' })
    const run = (async () => {
      await beforeLoad?.()
      return loadRemote(spec, { retries: opts.retries })
    })()
    // 迟到失败吞掉（timeout 先到已终态时，run 的 rejection 若无 handler 会成为未处理拒绝）
    run.catch(() => {})

    const race: Promise<unknown> = opts.timeout === undefined
      ? run
      : Promise.race([
          run,
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
              reject(new Error(
                `[fulgurjs] 远程组件 "${spec}" 加载等待超过 ${opts.timeout} 毫秒（适配层 timeout）。` +
                  `该超时只结束本次等待，不取消已发出的共享请求；可点击重试建立新的加载尝试。`,
              ))
            }, opts.timeout)
          }),
        ])
    race.then(
      (ns) => {
        if (timer !== undefined) clearTimeout(timer)
        const inner = (ns as any)?.default ?? ns
        if (!isValidComponentType(inner)) {
          commit({ phase: 'error', error: noRenderableExportError(spec, inner) })
          return
        }
        commit({ phase: 'ready', Comp: inner })
      },
      (err: unknown) => {
        if (timer !== undefined) clearTimeout(timer)
        commit({ phase: 'error', error: err })
      },
    )

    return () => {
      cancelled = true
      if (timer !== undefined) clearTimeout(timer)
    }
    // attempt 受控递增（retry）；sessionKey 变化即重跑（会话切换 A→B/登出/重登）；
    // spec/opts/loadRemote/beforeLoad 为工厂闭包常量
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, sessionKey])

  if (state.phase === 'pending') return opts.fallback ?? null
  if (state.phase === 'error') return renderErrorNode(opts.error, state.error, retry, 'load')
  const Comp = state.Comp as ComponentType<Record<string, unknown>>
  const merged = fwdRef === undefined ? latest.current.passthrough : { ...latest.current.passthrough, ref: latest.current.fwdRef }
  return createElement(Comp, merged)
}

/** 渲染边界：捕获远程组件渲染异常；key=attempt 保证 retry 时重建（清掉边界错误态） */
class RemoteRenderBoundary extends Component<
  { onRetry: () => void; render: (error: unknown | null, retry: () => void) => ReactNode },
  { error: unknown | null }
> {
  override state = { error: null as unknown | null }

  static getDerivedStateFromError(error: unknown) {
    return { error }
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error('[fulgurjs] 远程组件渲染异常（remoteComponent 内置边界）：', error, info?.componentStack ?? '')
  }

  private readonly retry = (): void => {
    // 渲染错误与加载错误统一走外层 attempt 递增：已成功模块经运行时缓存不重新下载
    this.props.onRetry()
  }

  override render() {
    return this.props.render(this.state.error, this.retry)
  }
}

/**
 * 构建单个远程组件（remoteComponent 工厂与页面表共用）。
 * beforeLoad 在每次实际加载尝试前执行（含 retry），供宿主提供最新 context。
 */
function buildRemoteComponent<P>(
  spec: string,
  opts: ReactRemoteComponentOptions,
  loadRemote: LoadRemoteFn,
  beforeLoad?: () => void | Promise<void>,
): ComponentType<P & { ref?: Ref<unknown> }> {
  const displayName = cleanCompName(spec)

  function RemoteRoot(props: Record<string, unknown> & { __fulgurjsRef?: Ref<unknown> }): ReactNode {
    const [attempt, setAttempt] = useState(0)
    const retry = useCallback(() => setAttempt((a) => a + 1), [])
    const { __fulgurjsRef, ...rest } = props
    const passthrough = rest as Record<string, unknown>
    // 渲染期读取当前登录代次：宿主 provide 新 context 后 rerender ⇒ 本值变化 ⇒
    // RemoteLoader 的 effect 依赖变化 ⇒ 已挂载实例重新走加载生命周期（D01 修复核心）。
    // 同代次 rerender 值不变，不触发重载（state 保持，组件本地状态不重置）。
    const sessionKey = readSessionKey()
    return createElement(
      RemoteRenderBoundary,
      {
        key: attempt,
        onRetry: retry,
        render: (boundaryError: unknown | null): ReactNode =>
          boundaryError !== null
            ? renderErrorNode(opts.error, boundaryError, retry, 'render')
            : createElement(RemoteLoader, {
                spec,
                opts,
                loadRemote,
                beforeLoad,
                attempt,
                sessionKey,
                retry,
                passthrough,
                fwdRef: __fulgurjsRef,
              } as RemoteLoaderProps),
      },
    )
  }
  RemoteRoot.displayName = displayName

  const Wrapped = forwardRef<unknown, P & Record<string, unknown>>((props, ref) =>
    createElement(RemoteRoot, { ...(props as Record<string, unknown>), __fulgurjsRef: ref } as never),
  )
  ;(Wrapped as { displayName?: string }).displayName = displayName
  return Wrapped as ComponentType<P & { ref?: Ref<unknown> }>
}

export function createRemoteComponent(loadRemote: LoadRemoteFn) {
  return function remoteComponent<P = Record<string, unknown>>(
    spec: string,
    opts: ReactRemoteComponentOptions = {},
  ): ComponentType<P & { ref?: Ref<unknown> }> {
    assertAdapterOptions(`remoteComponent("${spec}")`, opts)
    return buildRemoteComponent<P>(spec, opts, loadRemote)
  }
}

// ── useLoadRemote：请求代次守卫的模块加载 hook ─────────────────────────────────

export interface UseLoadRemoteOptions {
  /** 透传 loadRemote 的 shareScope */
  shareScope?: string
  /** 透传 loadRemote 的重试次数（0-10 整数） */
  retries?: number
  /**
   * 用户显式配置的失败兜底模块（透传 loadRemote.fallbackModule）：配置后加载失败返回
   * 兜底值而不写 error。这是显式声明的行为，不是静默成功——README 已说明。
   */
  fallbackModule?: () => any
}

export interface UseLoadRemoteResult<Module = any> {
  /** 加载成功后的模块命名空间；未成功时 undefined */
  data: Module | undefined
  /** 失败原因；无错误时恒为 undefined（统一空值） */
  error: unknown
  /** 是否有请求在途 */
  loading: boolean
  /** 重新走一次加载生命周期；已成功的模块经运行时缓存不会重新下载。Promise<void> 正常结束（不抛） */
  reload: () => Promise<void>
}

export function createUseLoadRemote(loadRemote: LoadRemoteFn) {
  return function useLoadRemote<Module = any>(
    spec: string,
    opts: UseLoadRemoteOptions = {},
  ): UseLoadRemoteResult<Module> {
    assertAdapterOptions(`useLoadRemote("${spec}")`, opts)
    const { shareScope, retries, fallbackModule } = opts
    const [data, setData] = useState<Module | undefined>(undefined)
    const [error, setError] = useState<unknown>(undefined)
    const [loading, setLoading] = useState(true)
    /** 请求代次：effect/reload 各自递增，只有最新代次可写状态（StrictMode 双 effect、
     * 快速 A→B、慢请求晚返回、卸载后返回均被拦截） */
    const reqGen = useRef(0)
    // 最新 opts（reload 闭包用）：render 期同步写入，避免 effect 依赖对象引用
    const optsRef = useRef(opts)
    optsRef.current = opts
    // 渲染期读取当前登录代次：宿主 provide 新 context 后 rerender ⇒ 本值变化 ⇒
    // effect 依赖变化 ⇒ 重新加载（D01）。同代次 rerender 值不变，不重载。
    const sessionKey = readSessionKey()

    useEffect(() => {
      const gen = ++reqGen.current
      let cancelled = false
      const isCurrent = (): boolean => gen === reqGen.current && !cancelled

      // 统一状态契约（§3.4）：首次加载/spec/有效选项/会话变化均重置为 undefined/undefined/true；
      // 当前尝试成功写 data、失败写 error，二者都令 loading=false；过期尝试不修改三者
      setData(undefined)
      setError(undefined)
      setLoading(true)
      loadRemote(spec, { shareScope, retries, fallbackModule }).then(
        (ns) => {
          if (!isCurrent()) return
          setData(ns as Module)
          setLoading(false)
        },
        (err) => {
          if (!isCurrent()) return
          setError(err)
          setLoading(false)
        },
      )
      return () => {
        cancelled = true
      }
      // 按字段依赖（非对象引用）：调用方每次 render 新建 options 对象不会无限重载；
      // sessionKey 变化（登录/换账号/登出）即重跑
    }, [spec, shareScope, retries, fallbackModule, loadRemote, sessionKey])

    const reload = useCallback(async (): Promise<void> => {
      const gen = ++reqGen.current
      setLoading(true)
      setError(undefined)
      const o = optsRef.current
      try {
        const ns = (await loadRemote(spec, { shareScope: o.shareScope, retries: o.retries, fallbackModule: o.fallbackModule })) as Module
        // gen === reqGen：期间无新 effect（如会话切换触发的重载）或新 reload——过期不写
        if (gen === reqGen.current) {
          setData(ns)
          setLoading(false)
        }
      } catch (err) {
        if (gen === reqGen.current) {
          setError(err)
          setLoading(false)
        }
      }
      // 失败写 error 后按 Promise<void> 合同正常结束：按钮 onClick 调用不产生未处理拒绝
    }, [spec, loadRemote])

    return { data, error, loading, reload }
  }
}

// ── createReactHostPages：页面表 + React 组件适配 ─────────────────────────────

export interface ReactHostPagesOptions extends HostPagesCoreOptions {
  /** 每次页面模块实际加载尝试前执行（同步或异步）；宿主在此提供最新 context */
  beforeLoad?: () => void | Promise<void>
  /** 页面加载 pending 占位（同 remoteComponent.fallback） */
  fallback?: ReactNode
  /** 页面加载/渲染错误占位（同 remoteComponent.error） */
  error?: ReactNode | RemoteErrorFallback
  /** 透传 loadRemote 重试（0-10 整数） */
  retries?: number
  /** 单次页面组件加载等待上限 ms（同 remoteComponent.timeout） */
  timeout?: number
}

export interface ReactHostPages {
  /** 原页面记录 */
  pages: PageRouteLike[]
  /** 路径 → 页面解析（base 前缀、最长前缀、参数解码、R1–R5 语义与 Vue 完全一致） */
  resolve(path: string): ResolvedHostPage | null
  /** 按 spec 取页面组件（同 spec 同登录代次复用；新非空 sessionKey 到来时重建以触发 onSession） */
  component<P = Record<string, unknown>>(spec: string): ComponentType<P>
}

export function createReactHostPages(
  options: ReactHostPagesOptions,
  loadRemote: LoadRemoteFn,
): ReactHostPages {
  const { beforeLoad, fallback, error, retries, timeout } = options
  assertAdapterOptions('createReactHostPages()', { retries, timeout })
  const core = createHostPagesCore(options)

  let cacheSession: string | undefined
  const compCache = new Map<string, ComponentType<Record<string, unknown>>>()

  const component = (spec: string): ComponentType<any> => {
    const sessionKey = readSessionKey()
    // 与 Vue 相同的代次语义：仅新的非空 sessionKey 重置（登出 undefined 不重建）。
    // React 侧无 KeepAlive 对应物；重置的目的是换账号后重建加载链以触发新代次 onSession
    if (shouldResetSessionCache(sessionKey, cacheSession)) {
      compCache.clear()
      cacheSession = sessionKey
    }
    let comp = compCache.get(spec)
    if (!comp) {
      comp = buildRemoteComponent(spec, { fallback, error, retries, timeout }, loadRemote, beforeLoad)
      compCache.set(spec, comp)
    }
    return comp
  }

  return { pages: core.pages, resolve: core.resolve, component }
}
