interface RemoteTracePush {
  (event: { source: 'remote'; label: string }): void
}

/**
 * 远程侧时序打点：宿主启动时在 globalThis.__PC_TRACE_PUSH__ 注册记录口，
 * 远程页面经它写入宿主「加载时序」面板（同一页面级单例，跨联邦模块共享）。
 * 远程独立运行（无宿主）时静默跳过，不影响独立开发。
 */
export function pushRemoteTrace(label: string): void {
  const push = (globalThis as unknown as { __PC_TRACE_PUSH__?: RemoteTracePush }).__PC_TRACE_PUSH__
  if (typeof push === 'function') {
    push({ source: 'remote', label })
  }
}
