/**
 * 宿主自有会话源（示例实现）：同步纯 getter（无副作用、不调 provideAppContext、
 * 不返回 Promise）。返回值即桥接 getContext 快照——桥接层校验受控 sessionKey 一致后
 * 才由插件调用 provideAppContext 写入全局（README §8.2）。
 * 真实项目里通常读登录 store / token 管理器，保持「同步快照 getter」语义即可。
 */
import type { AppContext } from '@fulgurjs/federation/react'

export interface HostUser {
  id: number
  name: string
}

let current: { key: string | null; user: HostUser } = {
  key: 'session-1-alice',
  user: { id: 1, name: 'Alice' },
}

/** 宿主登录（用户名可由页面输入框提供，作为 AppContext.user.name 快照） */
export function login(key: string, user: HostUser): void {
  current = { key, user }
}

export function logout(): void {
  current = { key: null, user: { id: 0, name: '' } }
}

export function currentSession(): { key: string | null; user: HostUser } {
  return { key: current.key, user: { ...current.user } }
}

export function getLatestHostContext(): Partial<AppContext> & Record<string, unknown> {
  if (current.key === null) throw new Error('已登出：此刻不应有桥接代次请求 context')
  const key = current.key
  return {
    sessionKey: key,
    user: { ...current.user },
    // 取最新 token 用拉取式函数引用，防止快照过期（README §9）
    getToken: () => `token-for-${key}`,
    hostLabel: 'sf-react-host',
  }
}
