import { reactive } from 'vue'

/**
 * 加载时序记录（宿主与远程页面共用的页面级单例）：
 * 宿主启动时经 registerTraceBridge 把 pushTrace 挂到 globalThis.__PC_TRACE_PUSH__，
 * 远程页面模块跨联邦边界调用它——面板据此展示「路由进入 → 骨架屏（如超 200ms）→
 * 远程页面 mounted」的真实 dev 时序（不做假慢速）。
 */
export interface TraceEvent {
  t: number
  source: 'host' | 'remote'
  label: string
}

export const traceEvents = reactive<TraceEvent[]>([])

export function pushTrace(event: { source: 'host' | 'remote'; label: string }): void {
  traceEvents.push({ t: Date.now(), source: event.source, label: event.label })
}

export function clearTrace(): void {
  traceEvents.splice(0, traceEvents.length)
}

/** 宿主启动时调用一次：远程页面经 globalThis 写入同一份时序记录 */
export function registerTraceBridge(): void {
  ;(globalThis as unknown as { __PC_TRACE_PUSH__?: unknown }).__PC_TRACE_PUSH__ = pushTrace
}
