/**
 * sh-remote-a 初始化生命周期（federation({ setup })，README §10.2）。
 *
 * 卡片⑫专用：声明 onSession——宿主提供 AppContext.sessionKey 时按会话代次执行，
 * 执行记录写入 globalThis.__SH_SETUP_LOG__（卡片⑫展示），配合 clearSessionState()
 * 演示「会话状态清理 → 新代次 onSession 重跑」的真实观测。
 */
import type { RemoteSetupContext } from '@fulgurjs/federation/runtime'

export interface SetupLogEntry {
  phase: 'setup' | 'onSession'
  sessionKey?: string
  at: string
}

function log(entry: SetupLogEntry): void {
  const g = globalThis as { __SH_SETUP_LOG__?: SetupLogEntry[] }
  ;(g.__SH_SETUP_LOG__ ??= []).push(entry)
}

export default async function setup(_context: RemoteSetupContext): Promise<void> {
  log({ phase: 'setup', at: new Date().toLocaleTimeString() })
}

export async function onSession(context: RemoteSetupContext): Promise<void> {
  log({ phase: 'onSession', sessionKey: context.sessionKey, at: new Date().toLocaleTimeString() })
}
