/**
 * 宿主诊断状态（会话级单例，reactive）：mount/unmount/会话切换计数 + 事件日志。
 * 数据全部来自真实事件——子应用 onReady/onGone 回调、宿主会话操作、
 * runtime 发出的 fulgurjs:error window 事件；不硬编码任何结果。
 */
import { reactive } from 'vue'

export interface DiagLogEntry {
  /** 稳定递增序号：列表渲染 key */
  seq: number
  time: string
  kind: string
  message: string
}

let seq = 0

export const bridgeDiag = reactive({
  mountCount: 0,
  unmountCount: 0,
  sessionSwitchCount: 0,
  logs: [] as DiagLogEntry[],
})

export function logDiag(kind: string, message: string): void {
  seq += 1
  bridgeDiag.logs.unshift({ seq, time: new Date().toLocaleTimeString(), kind, message })
  if (bridgeDiag.logs.length > 30) bridgeDiag.logs.length = 30
}

export function countMount(): void {
  bridgeDiag.mountCount += 1
}

export function countUnmount(): void {
  bridgeDiag.unmountCount += 1
}

export function countSessionSwitch(): void {
  bridgeDiag.sessionSwitchCount += 1
}

/** 监听 runtime 发出的 fulgurjs:error window 事件（真实错误日志来源，main.ts 安装一次） */
export function installFulgurjsErrorListener(): void {
  window.addEventListener('fulgurjs:error', (e) => {
    const detail = (e as CustomEvent<{ remote?: string; error?: unknown }>).detail
    const err = detail?.error as { message?: string } | undefined
    logDiag('fulgurjs:error', `${detail?.remote ?? '(unknown remote)'} ${err?.message ?? String(detail?.error ?? '')}`)
  })
}
