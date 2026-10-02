/**
 * err-good 初始化生命周期（federation({ setup })，README §10.2）。
 *
 * 故障注入契约（卡 9 专用）：宿主在 loadRemote 前把 globalThis.__FGX_FAIL_SETUP__
 * 置为 true 时，setup 同步抛错 → MFU-012（该次 loadRemote 拒绝；只清失败阶段缓存，
 * 可直接重试；__FULGURJS_INFO__.remotes['err-good'].setup === 'failed'）。
 *
 * 正常路径：登记 __FGX_SETUP_READY__ = true（应用级一次；不声明 onSession，
 * 因此不依赖宿主 AppContext.sessionKey，避免 MFU-013 耦合）。
 */
import type { RemoteSetupContext } from '@fulgurjs/federation/runtime'

export default async function setup(_context: RemoteSetupContext): Promise<void> {
  const globalFlags = globalThis as { __FGX_FAIL_SETUP__?: boolean; __FGX_SETUP_READY__?: boolean }
  if (globalFlags.__FGX_FAIL_SETUP__ === true) {
    throw new Error('setup 故障注入：__FGX_FAIL_SETUP__ 为 true（demo/errors 卡 9）')
  }
  globalFlags.__FGX_SETUP_READY__ = true
}
