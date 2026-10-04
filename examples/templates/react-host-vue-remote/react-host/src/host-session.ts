/**
 * 宿主自有会话源（示例实现）：同步纯 getter，语义要求同 vue-host/src/host-session.ts。
 */
export interface HostSession {
  key: string | null
  user: { id: number; name: string }
}

let current: HostSession = { key: 'login-1-alice', user: { id: 1, name: 'Alice' } }

export function getLatestHostContext(): Record<string, unknown> & { sessionKey: string } {
  if (current.key === null) throw new Error('已登出：此刻不应有桥接代次请求 context')
  return {
    sessionKey: current.key,
    user: current.user,
    getToken: () => `token-for-${current.key}`,
  }
}

export function login(key: string, user: { id: number; name: string }): void {
  current = { key, user }
}

export function logout(): void {
  current = { key: null, user: { id: 0, name: '' } }
}
