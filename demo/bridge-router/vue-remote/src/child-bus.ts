/**
 * demo/bridge-router/vue-remote/src/child-bus.ts — 子应用 → 宿主观测台上报总线。
 * 宿主经 appProps 传入稳定回调 onChildEvent；本模块持有该引用并维护挂载计数。
 * 单页单实例假设：同一宿主页同时只挂一个本子应用实例（路由同步前缀互斥的常规形态）。
 */
export type DemoChildNavAction = 'push' | 'replace' | 'go' | 'init'

export type DemoChildEvent =
  | { type: 'mounted'; mountCount: number }
  | { type: 'nav'; source: string; action: DemoChildNavAction; detail: string }

export type DemoChildReporter = (event: DemoChildEvent) => void

const bus: { report: DemoChildReporter | undefined } = { report: undefined }
let mountCount = 0

/** 桥接工厂内调用：从 props 快照中取出宿主回调，并上报本次挂载计数 */
export function bindReporter(props: Record<string, unknown> | undefined): void {
  const candidate = (props as { onChildEvent?: DemoChildReporter } | undefined)?.onChildEvent
  bus.report = typeof candidate === 'function' ? candidate : undefined
  mountCount += 1
  bus.report?.({ type: 'mounted', mountCount })
}

/** 导航来源上报（子应用 Link / 子应用 push·replace / 子应用 go / 子应用初始化） */
export function reportNav(source: string, action: DemoChildNavAction, detail: string): void {
  bus.report?.({ type: 'nav', source, action, detail })
}

export function getMountCount(): number {
  return mountCount
}
