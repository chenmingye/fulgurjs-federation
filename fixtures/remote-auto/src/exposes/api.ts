/** 普通 TS 方法模块 fixture（T2：expose 允许加载，loadRemote 返回导出，调用由业务决定） */
const g = globalThis as any
g.__API_CALLS__ ??= []

export function probeApiValue(): string {
  g.__API_CALLS__.push(1)
  return 'api-ok'
}
