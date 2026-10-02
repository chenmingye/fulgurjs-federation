/**
 * 合法桥接契约（卡 6/7 的恢复目标、卡 8 的正常对照）：
 * defineBridgeApp 工厂返回装配完成的 VueApp；根组件首次挂载完成回调 props.onReady，
 * 供宿主面板统计真实 mount 次数。
 */
import { createApp, defineComponent, h, onMounted, ref, type PropType } from 'vue'
import { defineBridgeApp } from '@fulgurjs/federation/runtime'

const BridgeGoodRoot = defineComponent({
  name: 'ErrGoodBridgeGoodRoot',
  props: {
    label: { type: String, required: false, default: 'bridge-good' },
    onReady: { type: Function as PropType<() => void>, required: false, default: undefined },
  },
  setup(props) {
    const clicks = ref(0)
    onMounted(() => {
      props.onReady?.()
    })
    return () =>
      h('div', { style: 'padding:8px;border:1px solid #91caff;background:#f0f9ff;border-radius:6px' }, [
        h('p', { style: 'margin:0 0 6px;font-weight:600' }, `bridge-good 子应用已挂载（label: ${props.label}）`),
        h(
          'button',
          {
            style: 'padding:4px 12px;border:none;border-radius:4px;background:#1677ff;color:#fff;cursor:pointer',
            type: 'button',
            onClick: () => {
              clicks.value++
            },
          },
          `子应用按钮（点击了 ${clicks.value} 次）`,
        ),
      ])
  },
})

export default defineBridgeApp((props) => {
  const app = createApp(BridgeGoodRoot, {
    label: typeof props.label === 'string' ? props.label : 'bridge-good',
    onReady: typeof props.onReady === 'function' ? (props.onReady as () => void) : undefined,
  })
  return app
})
