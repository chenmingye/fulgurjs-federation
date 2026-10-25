/** Vue 适配层只接收加载函数，不静态引用运行时内核。 */
import { defineAsyncComponent, defineComponent, getCurrentInstance, h, onErrorCaptured, ref, openBlock, createVNode, createElementVNode, shallowRef, onActivated, onUnmounted, version as vueRuntimeVersion, type App, type Component, type PropType } from 'vue'
import type { PageRouteLike, RemoteSchemaEntry } from './pages'
import { ErrorCodes, diagnosticMessage } from './runtime/errors'
import {
  cleanCompName,
  createHostPagesCore,
  noRenderableExportError,
  readSessionKey,
  remoteNameOf,
  moduleNameOf,
  reportRemoteObservation,
  shouldResetSessionCache,
  type HostPagesCoreOptions,
  type ResolvedHostPage,
} from './host-pages-core'

export type { ResolvedHostPage } from './host-pages-core'

/**
 * Vue 组件导出形态判定（MFU-018 的证据来源）：
 * 可渲染 = 函数（函数式/异步包装）或带 render/setup/template 的选项对象。
 * 只判形态，不执行组件；缺三者之一的对象交给 Vue 也会报
 * "missing template or render function"，在这里提前给出带错误码的修法。
 */
function isVueRenderableComponent(inner: unknown): inner is Component {
  if (!inner) return false
  if (typeof inner === 'function') return true
  if (typeof inner !== 'object') return false
  const c = inner as Record<string, unknown>
  return typeof c.render === 'function' || typeof c.setup === 'function' || typeof c.template === 'string'
}

/**
 * MFU-019 只比较当前 SFC 实际导入的 Vue 函数，不从默认 scope 猜远程依赖。
 * 构建器在已编译 SFC 上保留非枚举引用证据；旧远程/普通 TS 模块没有证据时不判。
 * 桥接应用有自己的 renderer，不经过普通组件消费检查。
 */
function vueRuntimeIdentityError(spec: string, component: Component): Error | undefined {
  const bindings = { ref, openBlock, createVNode, createElementVNode, defineComponent, h }
  const evidence = (component as Record<symbol, unknown>)[Symbol.for('fulgurjs.vue-runtime')] as
    { key?: keyof typeof bindings; value?: unknown } | undefined
  const key = evidence?.key
  if (!key || !Object.hasOwn(bindings, key) || typeof evidence?.value !== 'function') return undefined
  if (bindings[key] === evidence.value) return undefined
  return Object.assign(
    new Error(
      `现象：消费方直渲染远程组件 "${spec}" 时，当前组件实际导入的 Vue ${key} 与渲染器不是同一引用（渲染器版本 ${vueRuntimeVersion}）。\n` +
        `根因（已证实）：编译后的当前 SFC 导入引用与消费方渲染器不一致；此判断不使用默认共享作用域，也不把版本号相同当作实例相同。\n` +
        `修法：核对该组件与消费方的 shared.vue、shareScope 和 dev 依赖解析，使同一渲染链收敛到同一 Vue；需要独立运行时的完整子应用应使用 defineBridgeApp/createVueBridgeApp。组件运行时的版本若未取得可靠证据，不据共享表猜测。`,
    ),
    {
      code: ErrorCodes.VUE_RUNTIME_IDENTITY_MISMATCH,
      details: { remote: remoteNameOf(spec), module: moduleNameOf(spec), stage: 'adapter',
        rendererVueVersion: vueRuntimeVersion, runtimeBinding: key, evidenceSource: 'compiled-sfc-import' },
    },
  )
}

export interface RemoteComponentOptions {
  loadingComponent?: Component
  errorComponent?: Component
  /**
   * 远程组件子树渲染错误占位（P01 可选接线）：提供后，本组件边界接管远程组件内部
   * setup/render/嵌套异步组件的渲染错误——停止该错误向全局继续传播（本边界已消费），
   * 渲染此组件（props：error 原始异常 + retry 重新挂载远程组件）。
   * 未提供时仅观测上报（fulgurjs:error，错误码 MFU-020，原始异常保留在 cause），
   * 不改变错误传播语义——业务 errorHandler / onErrorCaptured 行为与接入前完全一致。
   */
  renderErrorComponent?: Component
  retries?: number
  delay?: number
  timeout?: number
}

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

/**
 * 默认错误占位（加载阶段）：错误码 + 现象 + 修法 + 两个用户恢复操作。
 * - 「重试加载」：同页重建加载链（重跑真实 loader，含 beforeLoad；运行时缓存语义不变；
 *   entry/expose 失败经 fulgurjs_retry 换 URL 穿透浏览器失败缓存）。retrying 期间按钮禁用。
 * - 「刷新页面重试」：整页恢复。浏览器 module map 会缓存静态子依赖的失败
 *  （同 URL 再 import 直接拒绝），同页重试无法穿透时由用户点击刷新清除；
 *   保留 pathname/query/hash，不追加随机参数，绝不自动触发（无刷新循环）。
 * 自定义 errorComponent 完全接管展示（契约不变：只接收 error prop），不注入按钮。
 */
const RemoteErrorPlaceholder = /*#__PURE__*/ defineComponent({
  name: 'FulgurjsRemoteError',
  props: {
    error: { type: Object as PropType<unknown>, default: undefined },
    retry: { type: Function as PropType<() => void>, required: false, default: undefined },
    retrying: { type: Boolean, default: false },
  },
  setup(props) {
    const reloadPage = (): void => {
      window.location.reload()
    }
    return () => {
      const err = props.error as (Error & { code?: string }) | undefined
      const code = err?.code ?? 'UNKNOWN'
      const message = diagnosticMessage(err ?? props.error ?? 'unknown error')
      const buttons = [
        props.retry
          ? h('button', {
              key: 'retry', style: BUTTON_STYLE, type: 'button', 'data-fulgurjs-retry': '',
              disabled: props.retrying, onClick: () => props.retry?.(),
            }, props.retrying ? '加载中…' : '重试加载')
          : null,
        h('button', {
          key: 'reload', style: SECONDARY_BUTTON_STYLE, type: 'button', 'data-fulgurjs-reload': '',
          disabled: props.retrying, onClick: reloadPage,
        }, '刷新页面重试'),
      ].filter(Boolean)
      return h('div', { style: ERROR_STYLE, 'data-fulgurjs-error': code }, [
        h('p', { style: 'margin:0 0 4px;font-weight:600' }, `远程组件加载失败（错误码 ${code}）`),
        h('p', { style: 'margin:0 0 8px;word-break:break-all' }, message),
        h('p', { style: 'margin:0 0 8px' }, '修法：① 核对 spec 的「远程名/expose 名」与远程应用 exposes 是否一致（MFU-006/008/018）；② 核对 remotes 地址端口与远程服务可达性、remoteEntry 是否可访问（MFU-001）；③ 查看 window 的 fulgurjs:error 事件与 console 同源错误定位根因。'),
        h('p', { style: 'margin:0 0 8px' }, '下一步取证（按事实区分，不预判结论）：① 本错误上方「原因」与 fulgurjs:error 事件的 details.stage 标明失败阶段——container=入口/网络，expose=模块求值/导出，setup=远程初始化，render=远程组件内部渲染；前置校验或配置类拒绝不发起网络请求，Network 面板零新请求也可能完全正常。② Network 面板确有红色请求时，读该请求实际 status 与响应内容（404/502=资源缺失或代理错误；200 但返回 HTML=入口被 SPA fallback 误回退）。③ Network 面板零新请求且消息含 import/Failed to fetch：可能是浏览器缓存了上次同 URL 的 import 失败（module map 对失败 URL 不再发请求），也可能是加载前的本地校验拒绝——先用「刷新页面重试」整页重试再判断。④ 外壳正常而内部空白：可能原因包括远程组件渲染错误被业务 handler 接管、合法空数据或依赖缺失，不等于已确认 shared.vue 实例分裂；核对 window 的 fulgurjs:error（含 MFU-020/019）与 __FULGURJS_SCOPE__ 后再定位。'),
        h('p', { style: 'margin:0 0 10px' }, '「重试加载」在当前页面重建加载；若浏览器已缓存失败的模块（如远程静态子依赖曾加载失败），请用「刷新页面重试」——它会整页刷新（保留当前地址），未保存的页面状态会丢失。'),
        h('div', { style: 'margin:0' }, buttons),
      ])
    }
  },
})

/**
 * 可恢复错误占位（默认占位的载体）。
 *
 * 为什么不用 defineAsyncComponent 的 onError/retry：Vue 的 userRetry 只能 resolve
 * 尚未定型的 userOnError Promise——userFail() 调用后 Promise 已 reject，此后再调用
 * userRetry 是无效 no-op（3.5.43 源码语义，实测复现）。因此「先展示错误、再允许重试」
 * 必须由占位组件自身完成：持有真实 loader 闭包，点击重试重跑加载，成功后**原位渲染**
 * 业务组件（attrs 透传给路由参数/业务 props）。
 * - 组件树形状与 5.1.4 一致：异步包装器仍是唯一外层（KeepAlive include 按 name 匹配
 *   不受影响；恢复内容在错误态内部，不新增包装层——外层加包装曾触发 deactivate 竞态）。
 * - 并发守卫：retrying 期间忽略再次点击，不创建重复并发加载。
 * - 重试失败：展示新错误（retryError 优先），占位保留、两个操作仍可用。
 * 自定义 errorComponent 存在时原样透传（完全接管，契约不变）。
 */
function createRecoverableErrorPlaceholder(
  loader: () => Promise<any>,
  spec: string,
  userErrorComponent?: Component,
): Component {
  if (userErrorComponent) return userErrorComponent
  return defineComponent({
    name: 'FulgurjsRemoteErrorWithRetry',
    props: { error: { type: Object as PropType<unknown>, default: undefined } },
    setup(props, { attrs }) {
      const recovered = ref<Component | null>(null)
      const retrying = ref(false)
      const retryError = ref<unknown>(undefined)
      const retry = async (): Promise<void> => {
        if (retrying.value) return
        retrying.value = true
        retryError.value = undefined
        try {
          const mod = await loader()
          const inner = (mod?.default ?? mod) as Component | undefined
          if (!isVueRenderableComponent(inner)) throw noRenderableExportError(spec, inner)
          recovered.value = inner
        } catch (e) {
          // 重试失败同样进入统一观测（P03）：新尝试的新错误对象各自可见；
          // 运行时已报告过的同一对象经全页去重跳过
          reportRemoteObservation({ remote: remoteNameOf(spec), error: e })
          retryError.value = e
        } finally {
          retrying.value = false
        }
      }
      return () => {
        const inner = recovered.value
        if (inner) return h(inner as never, attrs as never)
        return h(RemoteErrorPlaceholder, {
          error: retryError.value ?? props.error,
          retry,
          retrying: retrying.value,
        } as never)
      }
    },
  })
}

/**
 * 远程组件子树错误的观测包装（P01）：所有渲染路径（首载/重试/会话重建）共用。
 *
 * 两个职责严格分开：
 * 1. 观测（默认，零行为变化）：errorCaptured 捕获远程组件子树内部的 setup/render/
 *    嵌套异步组件错误，包装为 MFU-020（原始异常保留在 cause，details 带 remote/
 *    module/phase=render 与 Vue 的 info 阶段串）经 reportRemoteObservation 上报；
 *    不返回 false——错误继续沿原语义传播（业务 errorHandler/onErrorCaptured 照旧）。
 * 2. 接管（仅消费方显式传入 renderErrorComponent）：本边界消费该错误（返回 false
 *    停止继续传播），渲染消费方提供的占位（props：error/retry）；retry 通过
 *    renderEpoch 变更 key 强制重挂远程组件（重跑 setup，等价「重试加载」的恢复语义）。
 * 加载阶段错误不经此处（errorCaptured 只覆盖后代组件渲染期错误），仍由
 * createRecoverableErrorPlaceholder 承担。
 */
function remoteRenderBoundary(
  spec: string,
  renderErrorComponent: Component | undefined,
): { onErrorCaptured: (err: unknown, instance: unknown, info: string) => boolean | void; error: { value: unknown }; epoch: { value: number }; retry: () => void; view: Component | undefined } {
  const error = shallowRef<unknown>(undefined)
  const epoch = ref(0)
  const retry = (): void => {
    error.value = undefined
    epoch.value += 1
  }
  const onErrorCaptured = (err: unknown, _instance: unknown, info: string): boolean | void => {
    const reported = Object.assign(
      new Error(
        `现象：远程组件 "${spec}" 的子树内部抛出错误（渲染阶段：${info || '未知'}）。\n` +
          `根因（已证实）：错误抛自远程组件自身的 setup/render/嵌套异步组件，与联邦的模块加载无关；原始异常保留在本错误的 cause 与事件 detail 中。\n` +
          `修法：查看 cause 的原始调用栈定位远程组件内部代码。需要在本组件位置直接展示错误并提供恢复时，为 remoteComponent/createHostPages 传入 renderErrorComponent（本边界将接管展示，错误不再向全局传播）。`,
      ),
      {
        code: ErrorCodes.REMOTE_RENDER_ERROR,
        details: { remote: remoteNameOf(spec), module: moduleNameOf(spec), phase: 'render', renderInfo: info || undefined },
        cause: err,
      },
    )
    reportRemoteObservation({ remote: remoteNameOf(spec), error: reported })
    if (renderErrorComponent) {
      error.value = err
      return false
    }
    return undefined
  }
  return { onErrorCaptured, error, epoch, retry, view: renderErrorComponent }
}

/** consumerApp 协议实现：globalComponents 注册 + pageProviders 捕获（runtime 经此交付） */
function consumerRegistry(app: App | undefined, captured?: { providers?: unknown[] }) {
  return app ? {
    component(name: string, comp: unknown) {
      const wrapped = isComponentLoader(comp)
        ? defineAsyncComponent(async () => {
            const mod = await (comp as () => Promise<any>)()
            return mod?.default ?? mod
          })
        : comp
      return app.component(name, wrapped as Component)
    },
    pageProviders(list: unknown[]) {
      if (captured) captured.providers = list
    },
  } : undefined
}

// ── pageProviders（祖先 Provider）解析与包裹 ───────────────────────────────────
//
// 提供方 setup 声明 pageProviders 后，本远程的组件在组件提取点统一包裹（首载/重试恢复/
// 会话重建三条路径都过该点）。loader 解析与缓存见 page-providers.ts（与 React 适配器
// 共用）；本层只做 Vue 的包裹渲染。

import { isComponentLoader, resolvePageProviderEntries } from './page-providers'

function resolvePageProviders(list: unknown[] | undefined): Promise<Component[] | undefined> {
  return resolvePageProviderEntries(list) as Promise<Component[] | undefined>
}

/** 业务组件外按 外→内 顺序包 Provider；attrs/slots 全部透传给最内层业务组件 */
function withPageProviders(inner: Component, providers: Component[]): Component {
  return defineComponent({
    name: 'FgRemotePageProviders',
    inheritAttrs: false,
    setup(_, { attrs, slots }) {
      const renderNested = (idx: number): ReturnType<typeof h> =>
        idx >= providers.length
          ? h(inner as never, attrs as never, slots as never)
          : h(providers[idx] as never, null, { default: () => renderNested(idx + 1) } as never)
      return () => renderNested(0)
    },
  })
}

/** 组件提取点的统一包裹：无 Provider 声明时原样返回（零包装层，既有行为不变） */
async function applyPageProviders(comp: Component | undefined, captured: { providers?: unknown[] } | undefined): Promise<Component | undefined> {
  if (!comp || !captured?.providers || captured.providers.length === 0) return comp
  const providers = await resolvePageProviders(captured.providers)
  return providers && providers.length > 0 ? withPageProviders(comp, providers) : comp
}

/** 异步组件解析后仍会跨挂载复用；每个消费方及登录代次须重新完成初始化。 */
function sessionComponent(
  inner: Component, name: string | undefined, initialApp: App | undefined,
  initialSession: string | undefined, load: (app: App | undefined) => Promise<Component>,
  spec: string, loadingComponent?: Component, errorComponent?: Component,
  renderErrorComponent?: Component,
): Component {
  return defineComponent({
    name, inheritAttrs: false,
    setup(_, { attrs, slots }) {
      const app = getCurrentInstance()?.appContext.app
      const current = shallowRef<Component>()
      const failure = shallowRef<unknown>()
      // 远程子树渲染错误边界（P01）：默认仅观测上报；传入 renderErrorComponent 才接管展示
      const boundary = remoteRenderBoundary(spec, renderErrorComponent)
      onErrorCaptured(boundary.onErrorCaptured)
      let session = initialSession
      let generation = 0
      let disposed = false
      let pending = false
      const refresh = async () => {
        if (pending) return
        pending = true
        const requestedSession = readSessionKey()
        const request = ++generation
        current.value = undefined
        failure.value = undefined
        boundary.error.value = undefined
        try {
          const result = await load(app)
          if (disposed || request !== generation) return
          if (shouldResetSessionCache(readSessionKey(), requestedSession)) {
            queueMicrotask(() => { void refresh() })
            return
          }
          session = requestedSession
          current.value = result
        } catch (error) {
          if (!disposed && request === generation) {
            // 加载失败进入 UI 错误态的同时纳入统一观测（P03）：
            // 运行时已报告的同一对象被去重；适配器自判的 MFU-018/019 在此首次可见
            reportRemoteObservation({ remote: remoteNameOf(spec), error })
            failure.value = error
          }
        } finally {
          pending = false
        }
      }
      if (app === initialApp && !shouldResetSessionCache(readSessionKey(), initialSession)) {
        current.value = inner
      } else {
        void refresh()
      }
      onActivated(() => {
        if (shouldResetSessionCache(readSessionKey(), session)) void refresh()
      })
      onUnmounted(() => { disposed = true; generation++ })
      const ErrorView = createRecoverableErrorPlaceholder(() => load(app), spec, errorComponent)
      return () => {
        // 接管态：远程子树渲染错误已由本边界消费，渲染消费方提供的占位（error/retry）
        if (boundary.view && boundary.error.value !== undefined) {
          return h(boundary.view, { error: boundary.error.value, retry: boundary.retry } as never)
        }
        const c = current.value
        // key 拼入 renderEpoch：retry 后强制重挂远程组件（重跑 setup），实现渲染错误恢复
        return c
          ? h(c, { ...attrs, key: `${generation}-${boundary.epoch.value}` }, slots)
          : failure.value ? h(ErrorView, { ...attrs, error: failure.value }, slots)
          : loadingComponent ? h(loadingComponent) : null
      }
    },
  })
}

import type { DefineComponent } from 'vue'
import type { FgComponentEntry, FgModuleDefault, FgComponentLike } from './remote-types'
import type { FgRemoteTypes } from './runtime-entry'

/**
 * remoteComponent 返回类型：已同步的组件暴露 → 远程组件真实类型（props/events/泛型
 * 经声明闭包保留，vue-tsc 模板与 h() 均可检查）；未同步/动态入口 → 无约束组件
 * （DefineComponent 第三类型参数必须 unknown——any 会让 vue-tsc 模板检查全宽松）。
 */
export type FgRemoteVueComponent<S extends string> = S extends keyof FgRemoteTypes
  ? (FgModuleDefault<FgRemoteTypes[S]> extends FgComponentLike ? FgModuleDefault<FgRemoteTypes[S]> : never)
  : DefineComponent<{}, {}, unknown>

/**
 * remoteComponent 组件的 props 提取（与 /react 的 FgReactRemoteProps 对应）：
 * 已同步的组件暴露 → 远程组件真实 props——构造型组件（DefineComponent/选项组件）取
 * 实例 $props（必填/可选、readonly、联合、嵌套与事件回调语义与提供方声明一致，
 * 不 Omit VNodeProps/AllowedComponentProps，避免误删同名业务字段）；函数组件按
 * 首参（props）签名提取。非组件入口 → never（无 props 合同可言，调用点另行由
 * FgComponentEntry 报入口错误）；未同步/动态入口 → 宽松对象面（与 remoteComponent
 * 的放行语义一致，不伪造字段）。type-only，不产生运行时代码。
 */
export type FgVueRemoteProps<S extends string> = S extends keyof FgRemoteTypes
  ? (FgModuleDefault<FgRemoteTypes[S]> extends FgComponentLike ? FgVueComponentPropsOf<FgModuleDefault<FgRemoteTypes[S]>> : never)
  : Record<string, unknown>

/** Vue 组件形态 → props 类型：构造签名 $props 优先；函数组件取首参；无可证明合同 → unknown */
type FgVueComponentPropsOf<C> = C extends new (...args: any) => { $props: infer P }
  ? P
  : C extends (props: infer P, ...rest: any) => any
    ? P
    : unknown

export function createRemoteComponent(loadRemote: (spec: string, opts?: { retries?: number; consumerApp?: unknown }) => Promise<any>) {
  return function remoteComponent<S extends string>(spec: S & FgComponentEntry<S>, opts: RemoteComponentOptions = {}): FgRemoteVueComponent<S> {
    // consumerApp：当前渲染远程组件的 app 实例（异步包装组件 setup 内同步可得）。
    // 远程 setup 声明的 globalComponents 借它注册进消费方全局注册表——桥接子应用
    // 每次挂载新建 app 也能拿到；无组件上下文（重试等）时为 undefined，仅跳过注册。
    // 注册器包装：globalComponents 值为「零参 loader（() => import(...)）」时包一层
    // defineAsyncComponent——setup 模块因此可以完全惰性引用组件，不把框架依赖图
    // 拖进非本框架消费页面（跨框架纯 TS 模块消费实测会因根相对 dev URL 断链）。
    const load = (app: App | undefined): Promise<any> => {
      const captured: { providers?: unknown[] } = {}
      return loadRemote(spec, {
        retries: opts.retries, consumerApp: consumerRegistry(app, captured),
      }).then(async (m: any) => {
        // 边界检查顺序：先证伪导出形态（MFU-018），再证伪运行时身份（MFU-019）。
        // 身份检查放在模块求值完成后——此时远程的共享门面已把实例收敛进作用域，可比。
        // 适配器自判错误在抛出点纳入统一观测（P03）；sessionComponent/重试占位对同一
        // 对象的再次上报经全页去重跳过。
        const inner = (m?.default ?? m) as Component | undefined
        if (!isVueRenderableComponent(inner)) {
          const err = noRenderableExportError(spec, inner)
          reportRemoteObservation({ remote: remoteNameOf(spec), error: err })
          throw err
        }
        const identity = vueRuntimeIdentityError(spec, inner)
        if (identity) {
          reportRemoteObservation({ remote: remoteNameOf(spec), error: identity })
          throw identity
        }
        return applyPageProviders(inner, captured)
      })
    }
    let initialApp: App | undefined
    const loader = async (): Promise<any> => {
      const app = getCurrentInstance()?.appContext.app ?? initialApp
      initialApp = app
      const session = readSessionKey()
      const inner = await load(app)
      return sessionComponent(inner, inner?.name, app, session, load, spec, opts.loadingComponent, opts.errorComponent, opts.renderErrorComponent)
    }
    return defineAsyncComponent({
      loader,
      loadingComponent: opts.loadingComponent,
      errorComponent: createRecoverableErrorPlaceholder(loader, spec, opts.errorComponent),
      delay: opts.delay,
      timeout: opts.timeout,
    }) as unknown as FgRemoteVueComponent<S>
    // 说明：运行时包装器（异步加载/错误占位/重试）的真实类型是 DefineComponent；
    // 类型面按注册表返回远程组件真实类型——加载中/失败态是运行时行为，不在类型上
    // 建模（attrs/事件透传语义由包装器保证）。此 cast 是声明层的诚实近似，非 any 逃逸。
  }
}

// ── createHostPages：可选宿主页面适配器（§3.2）─────────────────────────────────
//
// 以项目侧页面表为唯一页面来源：URL 解析、最长前缀远程归属、异步组件缓存、
// 骨架屏/错误占位、保活名称由本适配器统一处理；登录态等宿主业务经 beforeLoad
// 提供；远程初始化（setup/onSession）由 loadRemote 的运行时生命周期承担——
// 宿主不再手写「loadRemote 启动器并手动调用」的样板。
// 5.1.0 起纯解析（definePages 校验/前缀/base/参数匹配）提取至 host-pages-core，
// 与 React 适配器共用一份实现；本层只保留 Vue 的组件缓存、命名与保活策略。

export interface HostPagesOptions extends HostPagesCoreOptions {
  /** 每次页面模块实际加载前执行（同步或异步）；宿主在此提供最新 context */
  beforeLoad?: () => void | Promise<void>
  /** 加载期占位组件（骨架屏） */
  loadingComponent?: Component
  /** 错误占位（缺省 = 内置错误占位：错误码+根因+修法+重试加载/刷新页面重试；自定义时完全接管） */
  errorComponent?: Component
  /** 远程页面子树渲染错误占位（可选接管：提供后本边界消费渲染错误并展示 error/retry；缺省仅观测上报） */
  renderErrorComponent?: Component
  /** 骨架屏延迟 ms（默认 200，防闪） */
  delay?: number
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

export function createHostPages(
  options: HostPagesOptions,
  load: (spec: string, opts?: { retries?: number; consumerApp?: unknown }) => Promise<any>,
): HostPages {
  const { beforeLoad, loadingComponent, errorComponent, renderErrorComponent, delay } = options
  const core = createHostPagesCore(options)

  // 会话感知的组件缓存：AppContext.sessionKey 变化（换账号/重登/退出）后清除组件缓存，
  // 下一次 component(spec) 重建异步组件 → loader 重跑 → loadRemote 触发新代次的
  // onSession（模块本体经 loadRemote 缓存复用，不会重复下载）。无 sessionKey 的普通
  // 用法恒为 undefined，缓存永不失效（与 remoteComponent 语义一致）。
  let cacheSession: string | undefined
  const compCache = new Map<string, Component>()

  const component = (spec: string): Component => {
    const sessionKey = readSessionKey()
    // 缓存代次重置只在「新的非空 sessionKey 出现」时执行（换账号/重登）。
    // 登出（sessionKey 变 undefined）不清缓存：clearAppContext 后路由过渡期 LayoutContent
    // 仍会重渲染当前联邦页，此刻重建组件会让 KeepAlive 在激活路径上换子组件——
    // 实测触发 Vue core `parentComponent.ctx.deactivate is not a function`（MES-ZC 4.3.0）。
    // 会话语义不受影响：onSession 的去重由 runtime 在 loadRemote 时按当前 sessionKey 判定。
    if (shouldResetSessionCache(sessionKey, cacheSession)) {
      compCache.clear()
      cacheSession = sessionKey
    }
    let comp = compCache.get(spec)
    if (!comp) {
      const name = cleanCompName(spec)
      // 页面 loader 与可恢复占位共用同一闭包：重试重跑 beforeLoad + load，
      // 与首载语义完全一致（会话 context、导出校验零差异）。
      const keepAlivePage = core.pages.some((p) => p.keepAlive && core.specOf(p) === spec)
      const loadPage = async (app: App | undefined): Promise<any> => {
        await beforeLoad?.()
        const captured: { providers?: unknown[] } = {}
        const mod = await load(spec, { consumerApp: consumerRegistry(app, captured) })
        let inner = mod?.default ?? mod
        if (!isVueRenderableComponent(inner)) {
          const err = noRenderableExportError(spec, inner)
          reportRemoteObservation({ remote: remoteNameOf(spec), error: err })
          throw err
        }
        const identity = vueRuntimeIdentityError(spec, inner)
        if (identity) {
          reportRemoteObservation({ remote: remoteNameOf(spec), error: identity })
          throw identity
        }
        if (keepAlivePage && inner && typeof inner === 'object') {
          // keepAlive 页（Vue 3.5 KeepAlive 语义）：include 对「已解析的异步组件」按
          // __asyncResolved.name 匹配，而非包装名——解析后若内层组件名与包装名不一致，
          // 保活页每次进出都会重挂。这里以浅克隆创建【独立命名副本】（不改写共享导出
          // 对象——多页共享同一模块导出时改写会串名），选项组件为普通对象可安全展开；
          // 非选项组件（函数式）保持原样退化为旧行为（每次重挂），不阻断加载。
          inner = Object.defineProperties({ ...inner }, { name: { value: name, configurable: true } })
        }
        // 祖先 Provider 包裹放在命名副本之后：KeepAlive include 匹配的是外层异步包装名，
        // Provider 包装层不影响保活；三条渲染路径（首载/重试/会话重建）都经过本提取点。
        return applyPageProviders(inner as Component, captured)
      }
      let initialApp: App | undefined
      const pageLoader = async (): Promise<any> => {
        const app = getCurrentInstance()?.appContext.app ?? initialApp
        initialApp = app
        const session = readSessionKey()
        const inner = await loadPage(app)
        return sessionComponent(inner, keepAlivePage ? name : inner.name, app, session, loadPage, spec, loadingComponent, errorComponent, renderErrorComponent)
      }
      const asyncComp: Component = defineAsyncComponent({
        loader: pageLoader,
        loadingComponent,
        errorComponent: createRecoverableErrorPlaceholder(pageLoader, spec, errorComponent),
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

  const keepAliveNames = core.pages
    .filter((p) => p.keepAlive)
    .map((p) => cleanCompName(core.specOf(p)))

  return { pages: core.pages, resolve: core.resolve, component, keepAliveNames }
}
