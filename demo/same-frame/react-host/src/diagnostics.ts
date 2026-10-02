/**
 * 宿主诊断 store（模块级，发布订阅）：mount/unmount/会话切换计数 + 事件日志。
 * 数据全部来自真实事件——子应用 onReady/onGone 回调、宿主会话操作、
 * runtime 发出的 fulgurjs:error window 事件；不硬编码任何结果。
 * 状态以不可变替换推进，getSnapshot 引用稳定（配 useSyncExternalStore）。
 */
export interface DiagLogEntry {
  /** 稳定递增序号：列表渲染 key */
  seq: number
  time: string
  kind: string
  message: string
}

export interface DiagState {
  mountCount: number
  unmountCount: number
  sessionSwitchCount: number
  logs: DiagLogEntry[]
}

let seq = 0
let state: DiagState = { mountCount: 0, unmountCount: 0, sessionSwitchCount: 0, logs: [] }
const listeners = new Set<() => void>()

function notify(): void {
  for (const fn of listeners) fn()
}

export const diagStore = {
  getSnapshot: (): DiagState => state,
  subscribe: (fn: () => void): (() => void) => {
    listeners.add(fn)
    return () => {
      listeners.delete(fn)
    }
  },
}

export function logDiag(kind: string, message: string): void {
  seq += 1
  state = {
    ...state,
    logs: [{ seq, time: new Date().toLocaleTimeString(), kind, message }, ...state.logs].slice(0, 30),
  }
  notify()
}

export function countMount(): void {
  state = { ...state, mountCount: state.mountCount + 1 }
  notify()
}

export function countUnmount(): void {
  state = { ...state, unmountCount: state.unmountCount + 1 }
  notify()
}

export function countSessionSwitch(): void {
  state = { ...state, sessionSwitchCount: state.sessionSwitchCount + 1 }
  notify()
}

/** 监听 runtime 发出的 fulgurjs:error window 事件（真实错误日志来源，main.tsx 安装一次） */
export function installFulgurjsErrorListener(): void {
  window.addEventListener('fulgurjs:error', (e) => {
    const detail = (e as CustomEvent<{ remote?: string; error?: unknown }>).detail
    const err = detail?.error as { message?: string } | undefined
    logDiag('fulgurjs:error', `${detail?.remote ?? '(unknown remote)'} ${err?.message ?? String(detail?.error ?? '')}`)
  })
}
