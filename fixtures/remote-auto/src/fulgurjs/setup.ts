/**
 * setup 生命周期 fixture（§3.3.1 契约的浏览器级验证载体）。
 *
 * 默认导出 setup：应用级，容器首次被加载业务模块前执行一次；
 * 具名导出 onSession：会话级，按宿主 AppContext.sessionKey 去重执行。
 * 调用记录写入 window.__SETUP_CALLS__（e2e 断言面），signal.aborted 检查为
 * 「await 后写状态前检查」的标准姿势示范。
 */
type Ctx = { appContext: Record<string, any>; sessionKey?: string; signal: AbortSignal }

const g = globalThis as any
g.__SETUP_CALLS__ ??= []

export default async function setup(ctx: Ctx) {
  g.__SETUP_CALLS__.push(`setup:${ctx.appContext?.sessionKey ?? 'none'}`)
}

export async function onSession(ctx: Ctx) {
  // 模拟异步初始化（字典/用户态拉取）；await 之后写状态前必须检查 signal
  await new Promise((r) => setTimeout(r, 5))
  if (ctx.signal.aborted) return
  g.__SETUP_CALLS__.push(`onSession:${ctx.sessionKey}`)
}
