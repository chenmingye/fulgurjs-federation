/**
 * 卡 7 故障注入：契约合法但 mount 阶段同步抛错（工厂在 mount 时失败）。
 * 宿主得到 MFU-016（details.phase = mount）默认占位，容器无半挂残留；
 * 恢复（切换 err-good/bridge-good）后可重试。
 * 注入手法与 fixtures/remote-react/src/bridge-mount-fail.tsx（BN02）一致。
 */
import { defineBridgeApp } from '@fulgurjs/federation/runtime'

export default defineBridgeApp(() => {
  throw new Error('bridge-mount-fail 故障注入：mount 阶段同步抛错（err-good，demo/errors 卡 7）')
})
