/**
 * demo/bridge-router/vue-host/src/demo-log.ts — URL 同步观测台数据源（模块级单例，跨宿主页面存活）。
 * 事件来源标注：宿主菜单 / 深链粘贴 / 子应用 Link / 子应用 push·replace / 子应用 go /
 * 子应用初始化 / 浏览器前进后退 / 宿主守卫。最多保留 10 条。
 */
import { ref } from 'vue'

export interface NavLogEntry {
  id: number
  time: string
  source: string
  detail: string
}

export type DemoChildEvent =
  | { type: 'mounted'; mountCount: number }
  | { type: 'nav'; source: string; action: string; detail: string }

export const navLog = ref<NavLogEntry[]>([])
export const mountCount = ref(0)

let nextId = 1

export function logNav(source: string, detail: string): void {
  const entry: NavLogEntry = { id: nextId, time: new Date().toLocaleTimeString('zh-CN', { hour12: false }), source, detail }
  nextId += 1
  navLog.value = [...navLog.value, entry].slice(-10)
}

/** appProps 稳定回调：子应用经它上报挂载计数与导航事件 */
export function handleChildEvent(event: DemoChildEvent): void {
  if (event.type === 'mounted') {
    mountCount.value = event.mountCount
    logNav('子应用', `mount #${event.mountCount}`)
    return
  }
  logNav(event.source, `${event.action} ${event.detail}`)
}

let popInstalled = false

/** 浏览器前进后退（POP）在 main.ts 安装一次；push/replace 由各自来源显式标注 */
export function installPopStateLogger(): void {
  if (popInstalled) return
  popInstalled = true
  window.addEventListener('popstate', () => {
    logNav('浏览器前进后退', window.location.pathname + window.location.search)
  })
}
