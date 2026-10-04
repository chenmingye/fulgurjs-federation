/**
 * 演示用运行时插件（卡片③）：四类 hook 全部记录到 globalThis.__HOOK_LOG__。
 *
 * hook 错误契约（README「运行时插件」）：
 * - beforeLoadRemote / afterLoadRemote / onRemoteError 是观测 hook（onRemoteError 由
 *   runtime 在错误事件通道调用）；
 * - resolveShare 是决策 hook：本演示只记录、不返回值（返回 void = 不覆写默认裁决）。
 */
import type { RuntimePlugin } from '@fulgurjs/federation/runtime'

export interface HookLogEntry {
  time: string
  hook: string
  detail: string
}

const g = globalThis as Record<string, unknown>

export function readHookLog(): HookLogEntry[] {
  return (g.__HOOK_LOG__ as HookLogEntry[] | undefined) ?? []
}

export function clearHookLog(): void {
  g.__HOOK_LOG__ = []
}

export function appendHookLog(hook: string, detail: unknown): void {
  const log = readHookLog()
  log.push({
    time: new Date().toISOString().slice(11, 23),
    hook,
    detail: typeof detail === 'string' ? detail : JSON.stringify(detail),
  })
  g.__HOOK_LOG__ = log
}

const demoHooks: RuntimePlugin = {
  name: 'demo-hooks',
  init(hooks) {
    appendHookLog('init', '运行时插件 demo-hooks 已注册（registerPlugins）')
    hooks.beforeLoadRemote = ({ remote, module }) => {
      appendHookLog('beforeLoadRemote', { remote, module })
    }
    hooks.afterLoadRemote = ({ remote, module }) => {
      appendHookLog('afterLoadRemote', { remote, module })
    }
    hooks.onRemoteError = ({ remote, error }) => {
      appendHookLog('onRemoteError', { remote, code: error?.code, message: String(error?.message ?? error).slice(0, 220) })
    }
    hooks.resolveShare = ({ shareKey, picked, available }) => {
      appendHookLog('resolveShare', {
        shareKey,
        picked: picked ? `${picked.version} ← ${picked.from}` : null,
        available: available.map((entry) => `${entry.version}@${entry.from}`),
      })
      // 返回 void：不覆写默认裁决（决策 hook 显式返回 ShareEntry 才生效）
    }
  },
}

export default demoHooks
