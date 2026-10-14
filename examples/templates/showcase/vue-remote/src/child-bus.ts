/** 应用实例自己的观测回调，通过原生 provide/Context 传给实际消费树。 */
import { inject, type InjectionKey } from 'vue'

export type DemoChildNavAction = 'push' | 'replace' | 'go' | 'init'
export type DemoChildEvent =
  | { type: 'mounted'; mountCount: number }
  | { type: 'nav'; source: string; action: DemoChildNavAction; detail: string }
export type DemoChildReporter = (event: DemoChildEvent) => void
export interface ChildReporter {
  reportNav(source: string, action: DemoChildNavAction, detail: string): void
  getMountCount(): number
}
export interface ChildProps { onChildEvent?: DemoChildReporter }
// 仅观测编号跨挂载累加；回调和所属实例不放在模块全局。
let nextMount = 0
export function createChildReporter(props: ChildProps, signal: AbortSignal): ChildReporter {
  const mountCount = ++nextMount
  if (!signal.aborted) props.onChildEvent?.({ type: 'mounted', mountCount })
  return {
    getMountCount: () => mountCount,
    reportNav(source, action, detail) {
      if (!signal.aborted) props.onChildEvent?.({ type: 'nav', source, action, detail })
    },
  }
}

export const childReporterKey: InjectionKey<ChildReporter> = Symbol('child-reporter')
export function useChildReporter(): ChildReporter {
  const reporter = inject(childReporterKey)
  if (!reporter) throw new Error('子应用观测台未装配；从 application 工厂启动本应用。')
  return reporter
}
