/** Vue 适配层只接收加载函数，不静态引用运行时内核。 */
import { defineAsyncComponent, defineComponent, h, type Component, type PropType } from 'vue'

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
