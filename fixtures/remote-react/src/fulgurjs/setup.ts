/**
 * 远程初始化（federation({ setup })）：应用级 setup 一次 + 会话级 onSession 按登录代次去重。
 * 计数挂 window 供 e2e 断言（R06/R07/N06）：setup 必须恰好 1 次；onSession 每代次 1 次。
 */
const g = globalThis as {
  __REMOTE_REACT_SETUP__?: number
  __REMOTE_REACT_ON_SESSION__?: number
  __REMOTE_REACT_LAST_SESSION__?: string
  __REMOTE_REACT_SESSION_ABORTED__?: number
  __FG_FAIL_PHASE__?: 'setup' | 'onSession' | null
  __FG_ONSESSION_DELAY_MS__?: number
} & typeof globalThis

export default async function setup(): Promise<void> {
  g.__REMOTE_REACT_SETUP__ = (g.__REMOTE_REACT_SETUP__ ?? 0) + 1
  if (g.__FG_FAIL_PHASE__ === 'setup') throw new Error('验收注入：setup 原始异常')
}

export async function onSession(ctx: { appContext?: unknown; sessionKey?: string; signal?: AbortSignal }): Promise<void> {
  g.__REMOTE_REACT_ON_SESSION__ = (g.__REMOTE_REACT_ON_SESSION__ ?? 0) + 1
  if (g.__FG_FAIL_PHASE__ === 'onSession') throw new Error('验收注入：onSession 原始异常')
  // 5.3.0 桥接轮（BN07）：注入真实延迟（g.__FG_ONSESSION_DELAY_MS__，默认 0，既有用例不受
  // 影响）；异步等待后按 signal.aborted 拒绝写回——旧会话迟到回写计入 SESSION_ABORTED，
  // 私有状态 LAST_SESSION 不被旧代次覆盖。
  const delay = Number(g.__FG_ONSESSION_DELAY_MS__ ?? 0)
  if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay))
  if (ctx.signal?.aborted) {
    g.__REMOTE_REACT_SESSION_ABORTED__ = (g.__REMOTE_REACT_SESSION_ABORTED__ ?? 0) + 1
    return
  }
  g.__REMOTE_REACT_LAST_SESSION__ = ctx.sessionKey
}
