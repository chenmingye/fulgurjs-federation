/**
 * 宿主自有会话源（示例实现）：返回「当前登录用户」的完整 AppContext 快照。
 * 要求（任务书 §4.3）：纯同步、无副作用、不调 provideAppContext、不返回 Promise。
 * 真实项目里通常读登录 store / token 管理器——只要保持「同步快照 getter」语义即可。
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
    // 取最新 token 用拉取式函数引用，防止快照过期（README §9）
    getToken: () => `token-for-${current.key}`,
  }
}

export function login(key: string, user: { id: number; name: string }): void {
  current = { key, user }
}

export function logout(): void {
  current = { key: null, user: { id: 0, name: '' } }
}
