/**
 * 卡 8 故障注入：mount 正常成功，但 unmount 阶段抛错。
 *
 * 宿主在会话换代（受控 sessionKey 变化）触发卸载时收到 MFU-016
 * （details.phase = unmount），且插件按 BN09 语义**持久封锁该容器**：
 * 同页「重试加载」与再次换会话都不会在此容器重新挂载，只能整页刷新恢复。
 *
 * 手法：工厂返回正常 VueApp 后，把实例的 app.unmount 替换为抛错实现——
 * defineBridgeApp 的 unmount 会把 app.unmount() 的异常包装为 MFU-016（phase: unmount）。
 */
import { createApp, defineComponent, h, onMounted, type PropType } from 'vue'
import { defineBridgeApp } from '@fulgurjs/federation/runtime'

const UnmountFailRoot = defineComponent({
  name: 'ErrGoodUnmountFailRoot',
  props: {
    onReady: { type: Function as PropType<() => void>, required: false, default: undefined },
  },
  setup(props) {
    onMounted(() => {
      props.onReady?.()
    })
    return () =>
      h('div', { style: 'padding:8px;border:1px solid #b7eb8f;background:#f6ffed;border-radius:6px' }, [
        h('p', { style: 'margin:0 0 6px;font-weight:600' }, 'bridge-unmount-fail 子应用已挂载'),
        h('p', { style: 'margin:0;font-size:12px;color:#555' }, '本实例 mount 正常；卸载（换会话）时会抛错 → MFU-016 phase:unmount + 容器持久封锁'),
      ])
  },
})

export default defineBridgeApp((props) => {
  const app = createApp(UnmountFailRoot, {
    onReady: typeof props.onReady === 'function' ? (props.onReady as () => void) : undefined,
  })
  // 故障注入核心：卸载必然同步抛错（该子应用无法被正常清理）
  app.unmount = () => {
    throw new Error('bridge-unmount-fail 故障注入：unmount 阶段抛错（err-good，examples/demos/errors 卡 8）')
  }
  return app
})
