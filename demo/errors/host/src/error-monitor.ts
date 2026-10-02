/**
 * 未预期错误监视器（页面级单例）。
 *
 * 统计三条「未预期」通道：window.onerror、unhandledrejection、不含 fulgurjs
 * 标记的 console.error。预期故障单独登记、不进未预期计数：
 * - window 的 `fulgurjs:error` CustomEvent（运行时对全部远程/共享错误的显式出口）；
 * - `[fulgurjs` 前缀的 console.error（插件对已知故障的诊断输出，如桥接容器封锁）。
 *
 * 监视器只旁路记录，绝不吞错：所有调用原样透传给原始通道。
 */
import { reactive } from 'vue'

export interface MonitorEntry {
  id: number
  channel: 'console.error' | 'window.onerror' | 'unhandledrejection' | 'fulgurjs:error'
  text: string
  at: string
}

export const monitor = reactive({
  unexpected: [] as MonitorEntry[],
  expected: [] as MonitorEntry[],
})

const MAX_ENTRIES = 50
let nextId = 0
let installed = false

/** 组装一条日志文本：首参数若为 Error 取 message，其余参数摘要追加 */
function formatArgs(args: unknown[]): string {
  const parts = args.map((arg) => {
    if (arg instanceof Error) return arg.message
    if (typeof arg === 'string') return arg
    try {
      return JSON.stringify(arg)
    } catch {
      return String(arg)
    }
  })
  return parts.join(' ')
}

function push(list: MonitorEntry[], channel: MonitorEntry['channel'], text: string): void {
  nextId += 1
  list.push({ id: nextId, channel, text, at: new Date().toLocaleTimeString() })
  if (list.length > MAX_ENTRIES) list.splice(0, list.length - MAX_ENTRIES)
}

/** 卡 8 等面板读取「插件诊断通道」登记：按关键字过滤最近一条 */
export function findExpectedByKeyword(keyword: string): MonitorEntry | undefined {
  return [...monitor.expected].reverse().find((entry) => entry.text.includes(keyword))
}

export function installErrorMonitor(): void {
  if (installed || typeof window === 'undefined') return
  installed = true

  const originalConsoleError = console.error.bind(console)
  console.error = (...args: unknown[]) => {
    const text = formatArgs(args)
    // 判定用拼接后的全文：插件诊断既可能是字符串首参（[fulgurjs:MFU-xxx]），
    // 也可能是 Error 对象实参（如 Vue dev 对异步组件加载失败的 console.error(err)）
    if (text.includes('[fulgurjs')) {
      push(monitor.expected, 'console.error', text)
    } else {
      push(monitor.unexpected, 'console.error', text)
    }
    originalConsoleError(...args)
  }

  window.addEventListener('error', (event) => {
    const message = event instanceof ErrorEvent && event.message ? event.message : String((event as ErrorEvent).error ?? event)
    push(monitor.unexpected, 'window.onerror', message)
  })

  window.addEventListener('unhandledrejection', (event) => {
    push(monitor.unexpected, 'unhandledrejection', formatArgs([(event as PromiseRejectionEvent).reason]))
  })

  window.addEventListener('fulgurjs:error', (event) => {
    const detail = (event as CustomEvent<{ remote?: string; error?: { code?: string; message?: string } }>).detail
    const code = detail?.error?.code ?? 'UNKNOWN'
    const remote = detail?.remote ?? '-'
    const message = detail?.error?.message ?? String(detail?.error ?? 'unknown')
    const firstLine = message.split('\n')[0]
    push(monitor.expected, 'fulgurjs:error', `[${code}] remote=${remote} ${firstLine}`)
  })
}
