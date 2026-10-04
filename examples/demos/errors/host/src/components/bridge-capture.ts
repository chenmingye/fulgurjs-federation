/**
 * 桥接错误对象捕获占位：作为 createVueBridgeApp 的 errorComponent 使用。
 *
 * 插件契约（README §8.2）：自定义 errorComponent 完全接管展示，只接收 error prop。
 * 本组件把桥接层内部产生的真实错误对象（MFU-015 / MFU-016 等）回调给宿主面板，
 * 并渲染一份只读摘要——与「插件默认占位」并列展示，两条通道互不替代。
 */
import { defineComponent, h, type Component } from 'vue'

export function createBridgeErrorCapture(onCapture: (error: unknown) => void): Component {
  return defineComponent({
    name: 'FulgurjsBridgeErrorCapture',
    props: {
      error: { type: null as unknown as () => unknown, required: false, default: undefined },
    },
    setup(props) {
      onCapture(props.error)
      return () => {
        const err = props.error as { code?: string; message?: string } | undefined
        return h('div', { style: 'padding:8px;border:1px dashed #d48806;background:#fffbe6;border-radius:6px;font-size:12px' }, [
          h('p', { style: 'margin:0 0 4px;font-weight:600' }, `捕获到真实错误对象（code: ${err?.code ?? 'UNKNOWN'}）`),
          h('p', { style: 'margin:0;white-space:pre-wrap;word-break:break-all' }, err?.message ?? String(props.error ?? 'unknown')),
        ])
      }
    },
  })
}
