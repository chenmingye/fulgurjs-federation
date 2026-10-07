/**
 * examples/templates/showcase/vue-host/src/guard.ts — 宿主真实权限守卫（Vue Router 4）。
 * /br-react/locked 需人工确认：异步 beforeEach 返回 Promise → Vue Router 等待用户选择；
 * 返回 false = 真实取消（NavigationFailure）→ 桥接通道收到 cancelled，URL/历史/子应用位置
 * 全部保持最后确认状态，插件绝不自动重试。
 */
import { ref } from 'vue'
import type { Router } from 'vue-router'
import { logNav } from './demo-log'
import { BRIDGE_BASE_PATH } from './routing'

export interface GuardPending {
  to: string
}

export const guardPending = ref<GuardPending | null>(null)
let resolver: ((allow: boolean) => void) | undefined

/** 守卫横幅按钮回调：放行（true）或取消（false） */
export function resolveGuard(allow: boolean): void {
  const current = resolver
  resolver = undefined
  current?.(allow)
}

/** 作废当前待确认导航（新导航开始时旧导航已被 vue-router 取消，确认横幅必须随之撤下） */
function invalidatePending(): void {
  const current = resolver
  if (!current) return
  resolver = undefined
  guardPending.value = null
  current(false)
}

export function installGuard(router: Router): void {
  // 守卫只拦截本会话内发起的导航：首跳（含整页刷新的深链恢复）不弹人工确认——
  // 与 react-host 的 useBlocker 语义对齐（blocker 随组件挂载生效，初始导航天然不在拦截面），
  // 也与 README 操作 15「整页刷新后子应用直接恢复」的承诺一致。beforeEach 先于初始导航
  // 注册，用 isReady 解除首跳武装；isReady 落定后的任何导航（含 POP 回 locked）照常拦截。
  let armed = false
  void router.isReady().then(() => { armed = true })
  router.beforeEach(async (to) => {
    if (!armed) return true
    // 任何新导航开始都作废旧待确认（含非 locked 目标，如守卫等待期间的 go(1)）
    invalidatePending()
    if (!to.path.startsWith(`${BRIDGE_BASE_PATH}/locked`)) return true
    guardPending.value = { to: to.fullPath }
    logNav('宿主守卫', `拦截 → ${to.fullPath}（等待确认）`)
    const allow = await new Promise<boolean>((resolve) => { resolver = resolve })
    guardPending.value = null
    logNav('宿主守卫', allow ? `继续 → ${to.fullPath}` : `取消 → ${to.fullPath}（URL/历史/子应用位置保持不变）`)
    return allow
  })
}
