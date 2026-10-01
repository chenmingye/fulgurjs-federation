/**
 * 宿主会话上下文（任务书 §3.4）：getLatestHostContext 是宿主自有的纯同步业务函数，
 * 返回当前 user/sessionKey 等完整快照；不调 provideAppContext、不返回 Promise。
 */
export interface HostSession {
  key: string | null
  user: { id: number; name: string }
}

let current: HostSession = { key: 'sess-A', user: { id: 1, name: 'alice' } }
let revoked = false

export function getLatestHostContext(): Record<string, unknown> & { sessionKey: string } {
  if (revoked || current.key === null) {
    throw new Error('宿主会话已登出（host-bridge-react）：此时不应有桥接代次请求 context')
  }
  return {
    sessionKey: current.key,
    user: current.user,
    getToken: () => `token-for-${current.key}`,
    hostName: 'host-bridge-react',
  }
}

export function switchSession(key: string, user: { id: number; name: string }): void {
  current = { key, user }
  revoked = false
}

export function logoutSession(): void {
  current = { key: null, user: { id: 0, name: '' } }
  revoked = true
}
