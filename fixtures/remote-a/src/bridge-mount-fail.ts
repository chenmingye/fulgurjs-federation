/**
 * BN02 故障注入：契约合法但 mount 内部抛错（Vue 工厂在 mount 时同步失败）。
 * 宿主应得 MFU-016（phase: mount）占位，且容器无半挂残留。
 */
import { defineBridgeApp } from '@fulgurjs/federation/vue'

export default defineBridgeApp(() => {
  throw new Error('remote-a bridge mount 故障注入（BN02）')
})
