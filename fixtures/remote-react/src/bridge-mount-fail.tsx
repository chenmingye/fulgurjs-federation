/**
 * BN02 故障注入：契约合法但 mount 内部抛错（React 工厂在 mount 时同步失败）。
 * 宿主应得 MFU-016（phase: mount）占位，且容器无半挂残留。
 */
import { defineBridgeApp } from '@fulgurjs/federation/react'

export default defineBridgeApp(() => {
  throw new Error('remote-react bridge mount 故障注入（BN02）')
})
