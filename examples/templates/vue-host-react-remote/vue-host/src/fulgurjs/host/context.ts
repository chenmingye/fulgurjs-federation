/**
 * 演示宿主的业务登录状态与上下文。真实工程复用已有登录 store，不复制本示例的假账号。
 * session getter 仅返回非敏感用户ID；插件负责代次/恢复/卸载，token刷新不触发重挂。
 * 一个响应式快照让用户与token同时提交，避免在换号中间态把旧用户配上新凭据。
 */
import { shallowRef } from 'vue'

interface HostUser { id: number; name: string }
const current = shallowRef<{ user: HostUser; token: string } | null>({
  user: { id: 1, name: 'Alice' }, token: 'demo-alice-token',
})

export const currentUser = () => current.value?.user ?? null
export const sessionIdentity = () => current.value?.user.id ?? null

/** 业务快照不填sessionKey；桥接层从自动会话补入，函数每次读取当前登录状态。 */
export function getLatestHostContext() {
  return { user: current.value?.user ?? {}, getToken: () => current.value?.token }
}

export function login(user: HostUser): void {
  current.value = { user, token: `demo-token-${user.id}-${Date.now()}` }
}
export function logout(): void { current.value = null }
/** 只换凭据：身份不变，插件保持同一个子应用实例。 */
export function refreshToken(): void {
  if (current.value) current.value = { ...current.value, token: `demo-refresh-${Date.now()}` }
}
