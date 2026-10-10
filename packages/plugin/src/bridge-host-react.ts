/**
 * React 宿主桥接工厂（/bridge、/bridge/react 导出 createReactBridgeApp；任务书 §3.4）。
 *
 * 定位：接收注入的 loadRemote（不静态引用运行时内核，dist 壳绑定），返回
 * `ComponentType<{ appProps: P; sessionKey?: string | null }>`，负责：
 * - DOM 所有权（§4.5）：只创建并保持稳定的空挂载 el（fragment 的固定子节点）；
 *   pending/error 占位是它的兄弟节点，宿主重渲染不 patch 子应用 root 内部；
 * - 会话代次（§4.3）：受控 sessionKey 驱动 挂载/换会话/登出；同会话重渲染不重挂；
 * - StrictMode 安全（§4.5）：双 effect 走 cleanup(作废+卸载)→setup(新代次) 顺序，
 *   顺序 unmount/mount 不产生双实例或残留；
 * - unmount 抛错（BN09）：报告 MFU-016（phase: unmount）并封锁该容器的新挂载。
 *
 * appProps 是挂载时浅拷贝快照（顶层替换不追踪，重挂由 key 重建）；sessionKey
 * 是桥接控制参数，不混入业务 props。
 */
import {
  createElement,
  Fragment,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react'
import type { AppContext } from './context'
import { provideAppContext } from './context'
import {
  assertBridgeContract,
  assertBridgeOptions,
  assertControlledSessionKey,
  acquireBridgeSession,
  releaseBridgeSession,
  resolveBridgeContext,
  withBridgeTimeout,
  type BridgeApp,
} from './bridge-core'
import { bridgeHostError } from './bridge-errors'
import { RoutingChannel, assertBridgeRoutingProtocol, type BridgeHostRouting } from './bridge-router-core'
import type { FgBridgeEntry, FgBridgeAppProps } from './remote-types'
import type { FgTypeAuto } from '@fulgurjs/federation/internal/registry.js'

type LoadRemoteFn = (spec: string, opts?: { retries?: number }) => Promise<any>

/** routing prop 的绑定键：basePath + navigation 可用性（同键不重挂、不重复订阅） */
function routingKey(routing: BridgeHostRouting | undefined): string | undefined {
  if (!routing) return undefined
  return routing.basePath + '|' + String(routing.navigation && typeof routing.navigation.navigate === 'function')
}

/** 渲染函数形态的错误占位：(error, retry) => ReactNode */
export type BridgeErrorFallback = (error: unknown, retry: () => void) => ReactNode

export interface ReactBridgeAppOptions {
  /** 加载 pending 占位（默认 null） */
  fallback?: ReactNode
  /** 加载/挂载失败占位；默认内置中文诊断 + 「重试加载 / 刷新页面重试」 */
  error?: ReactNode | BridgeErrorFallback
  /** 透传现行 loadRemote 的重试选项（0-10 整数），不另叠自动重试 */
  retries?: number
  /** 本次桥接加载等待上限 ms；不取消已发出的共享请求，迟到结果一律丢弃 */
  timeout?: number
  /** 无副作用的同步 getter：首次、重试及换会话的实际加载前返回本次所需上下文快照 */
  getContext?: () => Partial<AppContext> & Record<string, unknown>
}

type BridgeStatus = 'idle' | 'pending' | 'ready' | 'error'

const ERROR_STYLE: Record<string, string> = {
  padding: '16px', border: '1px solid #fde2e2', borderRadius: '4px',
  background: '#fef0f0', color: '#c45656', fontSize: '13px', lineHeight: '1.6',
  boxSizing: 'border-box',
}
const MESSAGE_STYLE = { margin: '0 0 8px', wordBreak: 'break-all' } as const
const BUTTON_STYLE = {
  padding: '4px 14px', marginRight: '8px', border: '1px solid #c45656',
  borderRadius: '4px', background: '#c45656', color: '#fff',
  fontSize: '13px', cursor: 'pointer',
} as const
const SECONDARY_BUTTON_STYLE = {
  padding: '4px 14px', border: '1px solid #c45656',
  borderRadius: '4px', background: '#fff', color: '#c45656',
  fontSize: '13px', cursor: 'pointer',
} as const

function DefaultBridgeErrorView({ error, retry, blocked }: { error: unknown; retry: () => void; blocked?: boolean }): ReactNode {
  const err = error as (Error & { code?: string }) | undefined
  const code = err?.code ?? 'UNKNOWN'
  const message = err?.message ?? String(error ?? 'unknown error')
  return createElement('div', { style: ERROR_STYLE, 'data-fulgurjs-error': code }, [
    createElement('p', { key: 't', style: { margin: '0 0 4px', fontWeight: 600 } }, `桥接应用加载失败（错误码 ${code}）`),
    createElement('p', { key: 'm', style: MESSAGE_STYLE }, message),
    createElement('p', { key: 'n', style: { margin: '0 0 10px' } },
      blocked
        ? '该容器已封锁（同页无法安全重挂），只能整页刷新恢复——点击「刷新页面重试」会重新加载页面（保留当前地址），未保存的页面状态会丢失。'
        : '「重试加载」在当前页面重建挂载；若浏览器已缓存失败的模块，请用「刷新页面重试」——它会整页刷新（保留当前地址），未保存的页面状态会丢失。'),
    blocked
      ? null
      : createElement('button', { key: 'r', type: 'button', style: BUTTON_STYLE, 'data-fulgurjs-retry': '', onClick: retry }, '重试加载'),
    createElement('button', {
      key: 'rl', type: 'button', style: SECONDARY_BUTTON_STYLE, 'data-fulgurjs-reload': '',
      onClick: () => window.location.reload(),
    }, '刷新页面重试'),
  ])
}

function renderBridgeErrorNode(
  errorOpt: ReactNode | BridgeErrorFallback | undefined,
  error: unknown,
  retry: () => void,
  blocked: boolean,
): ReactNode {
  if (typeof errorOpt === 'function') return errorOpt(error, retry)
  if (errorOpt !== undefined) return errorOpt
  return createElement(DefaultBridgeErrorView, { error, retry, blocked })
}

/**
 * 构建 React 宿主桥接工厂（dist 壳与 dev 门面绑定各自运行时的 loadRemote 后导出）。
 */
/** 桥接 appProps 解析：显式 P（老用法/接管）优先；默认按注册表推导（FgTypeAuto 标记） */
type FgResolvedBridgeProps<P, S extends string> = P extends FgTypeAuto ? FgBridgeAppProps<S> : P

export function createReactBridgeAppWithLoader(loadRemote: LoadRemoteFn) {
  return function createReactBridgeApp<P = FgTypeAuto, S extends string = string>(
    spec: S & FgBridgeEntry<S>,
    options: ReactBridgeAppOptions = {},
  ): ComponentType<{ appProps?: FgResolvedBridgeProps<P, S>; sessionKey?: string | null; routing?: BridgeHostRouting }> {
    type ResolvedProps = FgResolvedBridgeProps<P, S>
    assertBridgeOptions(`createReactBridgeApp("${spec}")`, options)
    const displayName = 'FulgurjsBridge_' + spec.replace(/[^A-Za-z0-9_-]/g, '_')

    function BridgeHost(props: { appProps?: ResolvedProps; sessionKey?: string | null; routing?: BridgeHostRouting }): ReactNode {
      const [status, setStatus] = useState<BridgeStatus>('idle')
      const [error, setError] = useState<unknown>(undefined)
      const [attempt, setAttempt] = useState(0)
      /** 稳定挂载容器：fragment 的固定子节点，占位是它的兄弟节点（§4.5 DOM 所有权） */
      const containerRef = useRef<HTMLDivElement | null>(null)
      /** 当前有效代次；作废即递增（迟到的加载/挂载结果一律丢弃） */
      const generationRef = useRef(0)
      const contractRef = useRef<BridgeApp | undefined>(undefined)
      const acquiredRef = useRef<string | undefined>(undefined)
      /** unmount 抛错后封锁：容器清理状态不明，不得再启动新实例（BN09） */
      const blockedRef = useRef(false)
      /** 当前代次的路由通道与作废信号（URL 同步启用时存在） */
      const channelRef = useRef<RoutingChannel | undefined>(undefined)
      const abortRef = useRef<AbortController | undefined>(undefined)
      // 最新 props 引用（挂载快照读这里；appProps 引用变化不进 effect 依赖 → 不重挂）
      const latest = useRef(props)
      latest.current = props

      useEffect(() => {
        if (blockedRef.current) return
        const myGen = ++generationRef.current
        const el = containerRef.current
        const release = (): void => {
          if (acquiredRef.current !== undefined) {
            releaseBridgeSession(acquiredRef.current)
            acquiredRef.current = undefined
          }
        }

        const disposeChannel = (): void => {
          channelRef.current?.dispose()
          channelRef.current = undefined
          abortRef.current?.abort()
          abortRef.current = undefined
        }
        const run = async (): Promise<void> => {
          if (!el) return
          const sk = latest.current.sessionKey
          setStatus('pending')
          setError(undefined)
          if (sk === null) {
            // 登出态：保持空容器，不再 getContext/provide/loadRemote/自动重试（§4.3）
            setStatus('idle')
            return
          }
          try {
            assertControlledSessionKey(spec, sk)
            const controlled = typeof sk === 'string' ? sk : undefined
            // 会话登记：同页已有不同受控会话的活跃实例 → MFU-017（先登记后写全局，防覆盖）
            if (controlled !== undefined && controlled !== acquiredRef.current) {
              release()
              acquireBridgeSession(spec, controlled)
              acquiredRef.current = controlled
            }
            // 1) 会话/上下文校验（副作用自由）；通过后才由桥接层写 AppContext（§4.3）
            const resolution = resolveBridgeContext(spec, controlled, options.getContext)
            if (resolution.provide) provideAppContext(resolution.provide)
            // 2) loadRemote 取契约（retries/timeout 透传现行语义；迟到结果按代次丢弃）
            const load = loadRemote(spec, { retries: options.retries })
            const mod = options.timeout !== undefined ? await withBridgeTimeout(load, options.timeout, spec) : await load
            if (generationRef.current !== myGen) return
            const contract = assertBridgeContract(spec, mod)
            contractRef.current = contract
            // 3) 挂载（首次根提交语义由契约实现保证；appProps 挂载时浅拷贝快照）
            abortRef.current = new AbortController()
            let mountOptions: { signal: AbortSignal; routing?: RoutingChannel } = { signal: abortRef.current.signal }
            const routing = latest.current.routing
            if (routing) {
              // URL 同步（§4.1）：协议校验 → 建通道（前缀登记冲突 MFU-030；通道构造读取
              // navigation 的最新位置，不用渲染期旧快照）→ 通道随第三参数交给子应用
              assertBridgeRoutingProtocol(spec, contract)
              if (generationRef.current !== myGen) return
              channelRef.current = new RoutingChannel(`bridge-react:${spec}:${myGen}`, routing.basePath, routing.navigation, spec)
              mountOptions = { signal: abortRef.current.signal, routing: channelRef.current }
            }
            // mount 边界单点包装（5.5.0）：子应用契约原样抛出的原始错误 → MFU-016（真实
            // spec + phase + cause）；其余校验/加载错误已是 FgError 诊断，保持原语义
            try {
              await contract.mount(el, { ...(latest.current.appProps ?? {}) }, mountOptions)
            } catch (mountError) {
              throw bridgeHostError('mount', spec, mountError)
            }
            if (generationRef.current !== myGen) return
            setStatus('ready')
          } catch (e) {
            if (generationRef.current !== myGen) return
            setError(e)
            setStatus('error')
          }
        }
        void run()

        return () => {
          // cleanup = 作废代次 + 释放会话登记 + 销毁路由通道 + 同步卸载契约实例
          // （StrictMode 双 effect、换会话、组件卸载共用同一条路径，§4.5）
          generationRef.current++
          release()
          disposeChannel()
          const c = contractRef.current
          contractRef.current = undefined
          if (c && el) {
            try {
              c.unmount(el)
            } catch (e) {
              // MFU-016（phase: unmount，单点包装，5.5.0）：已是插件诊断的错误原样保留，
              // 不再出现 spec 占位 'bridge' 或 cause 双重包装
              const err = bridgeHostError('unmount', spec, e)
              console.error('[fulgurjs] 桥接应用卸载失败：', err)
              blockedRef.current = true
              setError(err)
              setStatus('error')
            }
          }
        }
        // sessionKey 变化（换账号/登出/重登）、attempt（重试）与 routing 绑定键变化
        // （启用/关闭/换前缀/换端口）都重走加载生命周期；同会话重渲染或只换 appProps
        // 引用不重挂（§4.3）。routing 引用重建但键相同 → 不重挂、不重复订阅。
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [props.sessionKey, attempt, routingKey(latest.current.routing)])

      const retry = (): void => setAttempt((a) => a + 1)

      const children: ReactNode[] = []
      if (status === 'pending' && options.fallback !== undefined) {
        children.push(createElement(Fragment, { key: 'loading' }, options.fallback))
      }
      if (status === 'error') {
        children.push(createElement(Fragment, { key: 'error' }, renderBridgeErrorNode(options.error, error, retry, blockedRef.current)))
      }
      // 容器默认占满宿主挂载区（与 Vue 宿主一致）：子应用普遍按 height:100% 布局，
      // 无尺寸的裸容器会让其高度链塌陷为 0
      children.push(createElement('div', {
        key: 'bridge-root',
        ref: containerRef,
        style: { width: '100%', height: '100%' },
        'data-fulgurjs-bridge-root': spec,
        'data-fulgurjs-bridge-status': status,
      }))
      return createElement(Fragment, null, children)
    }
    ;(BridgeHost as { displayName?: string }).displayName = displayName
    return BridgeHost as ComponentType<{ appProps?: ResolvedProps; sessionKey?: string | null; routing?: BridgeHostRouting }>
  }
}
