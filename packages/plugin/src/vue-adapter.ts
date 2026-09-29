/** Vue 适配层只接收加载函数，不静态引用运行时内核。 */
import { defineAsyncComponent, defineComponent, h, ref, type Component, type PropType } from 'vue'
import type { PageRouteLike, RemoteSchemaEntry } from './pages'
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
const RemoteErrorPlaceholder = defineComponent({
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
      const message = err?.message ?? String(props.error ?? 'unknown error')
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
        h('p', { style: 'margin:0 0 8px' }, '修法：① 核对 spec 的「远程名/expose 名」与远程应用 exposes 是否一致（MFU-006/008）；② 核对 remotes 地址端口与远程服务可达性、remoteEntry 是否可访问（MFU-001）；③ 查看 window 的 fulgurjs:error 事件与 console 同源错误定位根因。'),
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
          if (!inner) throw noRenderableExportError(spec, inner)
          recovered.value = inner
        } catch (e) {
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

export function createRemoteComponent(loadRemote: (spec: string, opts?: { retries?: number }) => Promise<any>) {
  return function remoteComponent(spec: string, opts: RemoteComponentOptions = {}): Component {
    const loader = (): Promise<any> => loadRemote(spec, { retries: opts.retries }).then(m => m.default ?? m)
    return defineAsyncComponent({
      loader,
      loadingComponent: opts.loadingComponent,
      errorComponent: createRecoverableErrorPlaceholder(loader, spec, opts.errorComponent),
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
// 5.1.0 起纯解析（definePages 校验/前缀/base/参数匹配）提取至 host-pages-core，
// 与 React 适配器共用一份实现；本层只保留 Vue 的组件缓存、命名与保活策略。

export interface HostPagesOptions extends HostPagesCoreOptions {
  /** 每次页面模块实际加载前执行（同步或异步）；宿主在此提供最新 context */
  beforeLoad?: () => void | Promise<void>
  /** 加载期占位组件（骨架屏） */
  loadingComponent?: Component
  /** 错误占位组件（缺省 = 内置错误占位：错误码+根因+修法+重试加载/刷新页面重试；自定义时完全接管） */
  errorComponent?: Component
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
  load: (spec: string, opts?: { retries?: number }) => Promise<any>,
): HostPages {
  const { beforeLoad, loadingComponent, errorComponent, delay } = options
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
      const pageLoader = async (): Promise<any> => {
        await beforeLoad?.()
        const mod = await load(spec)
        const inner = mod?.default ?? mod
        if (!inner) {
          throw noRenderableExportError(spec, inner)
        }
        return inner
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
