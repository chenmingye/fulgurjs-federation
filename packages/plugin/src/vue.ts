/**
 * Vue 生态层：remoteComponent() 远程组件直渲染。
 *
 * 定位：runtime.js 保持框架无关（不 import vue，gzip 红线守卫），
 * Vue 封装按需引入——独立文件、零 runtime 体积增量。
 *
 * 语义（用法与选项见 README §8）：
 * - 内部 = defineAsyncComponent({ loader: () => loadRemote(spec, opts).then(m => m.default ?? m) })；
 * - H3 零兜底：加载失败显式进错误态（fulgurjs:error 事件由 runtime 层照常发出），
 *   不传 errorComponent 时渲染内置默认错误占位（文案含错误码+根因+修法，显式非静默）；
 * - 模块去重沿用 loadRemote 内部 Promise 缓存（同 spec 不重复加载）；
 * - 返回标准 Vue 异步组件，props（如 form-params）在使用处透传，不改分发机制。
 */
import { defineAsyncComponent, defineComponent, h, type Component, type PropType } from 'vue'
import { loadRemote } from './runtime/index'

export interface RemoteComponentOptions {
  /** 加载期间展示的组件 */
  loadingComponent?: Component
  /** 加载失败展示的组件（收到 error prop）；不传时用内置默认错误占位 */
  errorComponent?: Component
  /** 单次调用级重试覆盖，透传 loadRemote（缺省用远程注册值，默认 2） */
  retries?: number
  /** defineAsyncComponent delay（ms）：切换到 loadingComponent 前的等待，默认 200 */
  delay?: number
  /** defineAsyncComponent timeout（ms）：超时进错误态；不设则由 runtime 容器超时兜底 */
  timeout?: number
}

const ERROR_STYLE = {
  padding: '16px',
  border: '1px solid #fde2e2',
  borderRadius: '4px',
  background: '#fef0f0',
  color: '#c45656',
  fontSize: '13px',
  lineHeight: '1.6',
} as const

/**
 * 内置默认错误占位：错误码 + 根因 + 修法三段式，显式非静默（H3）。
 * defineAsyncComponent 把 loader 抛出的错误（FgError，message 已带
 * [fulgurjs:MFU-xxx] 前缀）作为 error prop 传入。
 */
const RemoteErrorPlaceholder = defineComponent({
  name: 'FulgurjsRemoteError',
  props: {
    error: { type: Object as PropType<unknown>, default: undefined },
  },
  setup(props) {
    return () => {
      const err = props.error as (Error & { code?: string }) | undefined
      const code = err?.code ?? 'UNKNOWN'
      const message = err?.message ?? String(props.error ?? 'unknown error')
      return h('div', { style: ERROR_STYLE }, [
        h('p', { style: 'margin:0 0 4px;font-weight:600' }, `远程组件加载失败（错误码 ${code}）`),
        h('p', { style: 'margin:0 0 8px;word-break:break-all' }, message),
        h(
          'p',
          { style: 'margin:0' },
          '修法：① 核对 spec 的「远程名/expose 名」与远程应用 exposes 是否一致（MFU-006/008）；② 核对 remotes 地址端口与远程服务可达性、remoteEntry 是否可访问（MFU-001）；③ 查看 window 的 fulgurjs:error 事件与 console 同源错误定位根因。',
        ),
      ])
    }
  },
})

/**
 * 创建远程组件：`remoteComponent('demo-host/FormRouterPage')`。
 * 返回标准 Vue 异步组件，使用处直接透传 props（如 form-params）。
 */
export function remoteComponent(spec: string, opts: RemoteComponentOptions = {}): Component {
  return defineAsyncComponent({
    loader: () => loadRemote(spec, { retries: opts.retries }).then(m => m.default ?? m),
    loadingComponent: opts.loadingComponent,
    errorComponent: opts.errorComponent ?? RemoteErrorPlaceholder,
    delay: opts.delay,
    timeout: opts.timeout,
  })
}
