/**
 * Vue 宿主桥接工厂（/bridge、/bridge/vue 导出 createVueBridgeApp；任务书 §3.4）。
 *
 * 定位：接收注入的 loadRemote（不静态引用运行时内核，dist 壳绑定），返回一个
 * 包装组件 `{ appProps: P; sessionKey?: string | null }`，负责：
 * - DOM 所有权（§4.5）：只创建并保持稳定的空挂载 el（多根 fragment 的固定子节点）；
 *   pending/error 占位是它的兄弟节点，宿主重渲染不 patch 子应用 root 内部；
 * - 会话代次（§4.3）：受控 sessionKey 驱动 挂载/换会话/登出；同会话重渲染不重挂；
 * - 错误诊断：契约非法 MFU-015、生命周期失败 MFU-016（phase 区分）、会话矛盾 MFU-017；
 *   默认占位含「重试加载 / 刷新页面重试」两条恢复操作（§4.4）。
 *
 * appProps 是挂载时浅拷贝快照（顶层替换不追踪、不重渲染子应用，重挂由 :key 重建）；
 * sessionKey 是桥接控制参数，不混入业务 props。
 */
import { defineComponent, h, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, shallowRef, toRaw, watch, type Component, type DefineComponent, type PropType } from 'vue'
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

const assertBridgeRoutingProtocolSpec = (spec: string, contract: BridgeApp): void => assertBridgeRoutingProtocol(spec, contract)

export interface VueBridgeAppOptions {
  /** 加载 pending 占位组件（默认无占位节点） */
  loadingComponent?: Component
  /** 加载/挂载失败占位（完全接管，契约不变：只接收 error prop；默认内置中文诊断 + 两条恢复操作） */
  errorComponent?: Component
  /** 透传现行 loadRemote 的重试选项（0-10 整数），不另叠自动重试 */
  retries?: number
  /** 本次桥接加载等待上限 ms；不取消已发出的共享请求，迟到结果一律丢弃 */
  timeout?: number
  /** 无副作用的同步 getter：首次、重试及换会话的实际加载前返回本次所需上下文快照 */
  getContext?: () => Partial<AppContext> & Record<string, unknown>
}

/** routing prop 的绑定键：normalized basePath + navigation 引用（同键不重挂、不重复订阅） */
function routingKey(routing: BridgeHostRouting | undefined): string | undefined {
  if (!routing) return undefined
  return routing.basePath + '|' + String(routing.navigation && typeof routing.navigation.navigate === 'function')
}

type BridgeStatus = 'idle' | 'pending' | 'ready' | 'error'

const ERROR_STYLE = {
  padding: '16px', border: '1px solid #fde2e2', borderRadius: '4px',
  background: '#fef0f0', color: '#c45656', fontSize: '13px', lineHeight: '1.6',
} as const

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

/** 默认错误占位：错误码 + 诊断 + 「重试加载 / 刷新页面重试」（与 remoteComponent 占位同口径） */
const BridgeErrorPlaceholder = defineComponent({
  name: 'FulgurjsBridgeError',
  props: {
    error: { type: Object as PropType<unknown>, default: undefined },
    retry: { type: Function as PropType<() => void>, required: false, default: undefined },
  },
  setup(props) {
    const reloadPage = (): void => {
      window.location.reload()
    }
    return () => {
      const err = props.error as (Error & { code?: string }) | undefined
      const code = err?.code ?? 'UNKNOWN'
      const message = err?.message ?? String(props.error ?? 'unknown error')
      return h('div', { style: ERROR_STYLE, 'data-fulgurjs-error': code }, [
        h('p', { style: 'margin:0 0 4px;font-weight:600' }, `桥接应用加载失败（错误码 ${code}）`),
        h('p', { style: 'margin:0 0 8px;word-break:break-all' }, message),
        h('p', { style: 'margin:0 0 10px' }, '「重试加载」在当前页面重建挂载；若浏览器已缓存失败的模块，请用「刷新页面重试」——它会整页刷新（保留当前地址），未保存的页面状态会丢失。'),
        h('div', { style: 'margin:0' }, [
          props.retry
            ? h('button', {
                key: 'retry', style: BUTTON_STYLE, type: 'button', 'data-fulgurjs-retry': '',
                onClick: () => props.retry?.(),
              }, '重试加载')
            : null,
          h('button', {
            key: 'reload', style: SECONDARY_BUTTON_STYLE, type: 'button', 'data-fulgurjs-reload': '',
            onClick: reloadPage,
          }, '刷新页面重试'),
        ]),
      ])
    }
  },
})

/**
 * 构建 Vue 宿主桥接工厂（dist 壳与 dev 门面绑定各自运行时的 loadRemote 后导出）。
 */
/** 包装组件返回形态：appProps 类型显式 P 优先，默认从注册表推导（第三类型参数 unknown） */
export type FgVueBridgeWrapperResolved<P0, S extends string> = DefineComponent<
  { appProps?: (P0 extends FgTypeAuto ? FgBridgeAppProps<S> : P0); sessionKey?: string | null; routing?: BridgeHostRouting },
  {},
  unknown
>
export type FgVueBridgeWrapper<S extends string> = FgVueBridgeWrapperResolved<FgTypeAuto, S>

export function createVueBridgeAppWithLoader(loadRemote: LoadRemoteFn) {
  return function createVueBridgeApp<P0 = FgTypeAuto, S extends string = string>(
    spec: S & FgBridgeEntry<S>,
    options: VueBridgeAppOptions = {},
  ): FgVueBridgeWrapperResolved<P0, S> {
    // appProps 类型：显式 P0（老用法/接管）优先；默认按注册表推导（提供方 defineBridgeApp
    // 声明 → 声明闭包 → phantom 提取）。见 types/registry.d.ts 的 FgTypeAuto 说明
    type P = P0 extends FgTypeAuto ? FgBridgeAppProps<S> : P0
    type Wrapper = FgVueBridgeWrapperResolved<P0, S>
    assertBridgeOptions(`createVueBridgeApp("${spec}")`, options)
    const componentName = 'FulgurjsBridge_' + spec.replace(/[^A-Za-z0-9_-]/g, '_')

    return defineComponent({
      name: componentName,
      // 多根组件：宿主传入的 class/style 等不自动继承（v1 不提供样式透传，外观由宿主外层元素控制）
      inheritAttrs: false,
      props: {
        appProps: { type: Object as PropType<P>, required: false, default: undefined },
        // 桥接控制参数：undefined（不启用受控会话）/ null（登出态）/ 非空字符串（登录代次）
        sessionKey: { type: null as unknown as PropType<string | null>, required: false, default: undefined },
        // URL 同步控制通道（独立于 appProps/Context；省略 = 原 memory 模式）
        routing: { type: Object as PropType<BridgeHostRouting>, required: false, default: undefined },
      },
      setup(props) {
        const status = ref<BridgeStatus>('idle')
        const error = shallowRef<unknown>(undefined)
        /** 稳定挂载容器：多根 fragment 的固定子节点，占位是它的兄弟节点（§4.5 DOM 所有权） */
        const container = ref<HTMLElement | null>(null)
        /** 当前有效代次；作废即递增（迟到的加载/挂载结果一律丢弃） */
        let generation = 0
        let contract: BridgeApp | undefined
        /** unmount 抛错后的持久封锁：容器清理状态不明，重试/换会话都不得在此容器再启动实例（BN09） */
        let containerBlocked = false
        /** 当前代次已登记的受控会话（页面级单会话登记；换会话/卸载时释放） */
        let acquiredSession: string | undefined
        /** 当前代次的路由通道（URL 同步启用时存在；invalidate 时销毁） */
        let channel: RoutingChannel | undefined
        /** 当前代次的作废信号（异步写回前检查 aborted） */
        let genAbort: AbortController | undefined

        const releaseAcquired = (): void => {
          if (acquiredSession !== undefined) {
            releaseBridgeSession(acquiredSession)
            acquiredSession = undefined
          }
        }

        /** 作废当前代次：失效迟到结果 + 同步卸载契约实例；unmount 抛错返回 false（清理状态不明） */
        const invalidate = (): boolean => {
          // 已封锁容器：不再递增代次、不再触碰契约（保持 error 态，等待整页刷新恢复）
          if (containerBlocked) return false
          generation++
          const el = container.value
          releaseAcquired()
          genAbort?.abort()
          genAbort = undefined
          channel?.dispose()
          channel = undefined
          if (contract && el) {
            const c = contract
            contract = undefined
            try {
              c.unmount(el)
            } catch (e) {
              // MFU-016（phase: unmount，单点包装）：宿主报告但不崩溃；持久封锁该容器——
              // 后续重试与 sessionKey 变化都不得在清理状态不明的 el 上重挂（BN09）
              const err = bridgeHostError('unmount', spec, e)
              containerBlocked = true
              console.error('[fulgurjs] 桥接应用卸载失败，该容器已封锁（同页只能刷新恢复）：', err)
              error.value = err
              status.value = 'error'
              return false
            }
          }
          return true
        }

        const run = async (myGeneration: number): Promise<void> => {
          const el = container.value
          if (!el) return
          const sk = props.sessionKey
          status.value = 'pending'
          error.value = undefined
          if (sk === null) {
            // 登出态：保持空容器，不再 getContext/provide/loadRemote/自动重试（§4.3）
            status.value = 'idle'
            return
          }
          try {
            assertControlledSessionKey(spec, sk)
            const controlled = typeof sk === 'string' ? sk : undefined
            // 会话登记：同页已有不同受控会话的活跃实例 → MFU-017（先登记后写全局，防覆盖）
            if (controlled !== undefined && controlled !== acquiredSession) {
              releaseAcquired()
              acquireBridgeSession(spec, controlled)
              acquiredSession = controlled
            }
            // 1) 会话/上下文校验（副作用自由）；通过后才由桥接层写 AppContext（§4.3）
            const resolution = resolveBridgeContext(spec, controlled, options.getContext)
            if (resolution.provide) provideAppContext(resolution.provide)
            // 2) loadRemote 取契约（retries/timeout 透传现行语义；迟到结果按代次丢弃）
            const load = loadRemote(spec, { retries: options.retries })
            const mod = options.timeout !== undefined ? await withBridgeTimeout(load, options.timeout, spec) : await load
            if (myGeneration !== generation) return
            contract = assertBridgeContract(spec, mod)
            // 3) 挂载（首次根提交语义由契约实现保证；appProps 挂载时浅拷贝快照——
            //    toRaw 先还原 Vue props 的 reactive 包装，保证嵌套对象/函数为原引用）
            const appPropsSource = props.appProps ? (toRaw(props.appProps) as P) : undefined
            genAbort = new AbortController()
            let mountOptions: { signal: AbortSignal; routing?: RoutingChannel } = { signal: genAbort.signal }
            if (props.routing) {
              // URL 同步（§4.1）：协议校验 → 挂载前读最新宿主位置（不能用旧快照）→
              // 建通道（前缀登记冲突 MFU-030）→ 通道随第三参数交给子应用
              assertBridgeRoutingProtocolSpec(spec, contract)
              const navigation = props.routing.navigation
              const latestLoc = navigation.getLocation()
              if (myGeneration !== generation) return
              channel = new RoutingChannel(`bridge-vue:${spec}:${myGeneration}`, props.routing.basePath, navigation, spec)
              mountOptions = { signal: genAbort.signal, routing: channel }
              void latestLoc
            }
            // mount 边界单点包装（5.5.0）：子应用契约原样抛出的原始错误 → MFU-016（真实
            // spec + phase + cause）；其余校验/加载错误已是 FgError 诊断，保持原语义
            try {
              await contract.mount(el, { ...(appPropsSource ?? {}) }, mountOptions)
            } catch (e) {
              throw bridgeHostError('mount', spec, e)
            }
            if (myGeneration !== generation) return
            status.value = 'ready'
          } catch (e) {
            if (myGeneration !== generation) return
            error.value = e
            status.value = 'error'
          }        }

        const start = (): void => {
          const ok = invalidate()
          if (!ok) return
          const myGeneration = generation
          void run(myGeneration)
        }

        const retry = (): void => {
          start()
        }

        onMounted(() => {
          const myGeneration = generation
          void run(myGeneration)
        })
        // 会话变化（换账号 A→B / 登出 →null / 重登）：作废旧代次并卸载后启动新代次；
        // 同会话重渲染不触发（sessionKey 值未变），只换 appProps 引用也不重挂（§4.3）
        watch(() => props.sessionKey, () => { start() })
        // routing 配置变化：引用重建但键相同（normalized basePath + navigation）不重挂；
        // 启用/关闭/换前缀/换端口属于控制配置变化 → 旧代次作废重挂（旧监听器随通道销毁）
        watch(() => routingKey(props.routing), (after, before) => {
          if (after !== before) start()
        })
        // KeepAlive：缓存离页暂停通道写入（不抢占 URL、不销毁共享端口），激活重同步
        onDeactivated(() => { channel?.setActive(false) })
        onActivated(() => { channel?.setActive(true) })
        onBeforeUnmount(() => {
          // 组件卸载：先通知契约清理，再释放容器（§4.5）；清理失败仅记录，不阻断 Vue 卸载
          invalidate()
        })

        return () => {
          const children: ReturnType<typeof h>[] = []
          if (status.value === 'pending' && options.loadingComponent) {
            children.push(h(options.loadingComponent, { key: 'loading' }))
          }
          if (status.value === 'error') {
            const err = error.value
            if (options.errorComponent) {
              children.push(h(options.errorComponent, { key: 'error', error: err } as Record<string, unknown>))
            } else {
              // 容器已封锁（unmount 抛错）：不提供「重试加载」——重挂不安全，只留整页刷新恢复（BN09）
              children.push(h(BridgeErrorPlaceholder, { key: 'error', error: err, retry: containerBlocked ? undefined : retry } as never))
            }
          }
          children.push(h('div', {
            key: 'bridge-root',
            ref: container,
            'data-fulgurjs-bridge-root': spec,
            'data-fulgurjs-bridge-status': status.value,
          }))
          return children
        }
      },
    }) as unknown as FgVueBridgeWrapperResolved<P0, S>
    // 说明：包装器真实形态是 defineComponent 的多根组件（容器节点+占位兄弟）；
    // 类型面声明为 appProps/sessionKey/routing 的 DefineComponent（第三类型参数
    // unknown——any 会让 vue-tsc 模板检查全宽松）。cast 是声明层近似，运行时语义不变。
  }
}
