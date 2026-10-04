/**
 * 演示常量与工具：全部故障卡的地址口径集中在这里，与 README 的端口表一一对应。
 */

/** remote-good 正确的容器入口（各故障卡的恢复目标） */
export const ERR_GOOD_ENTRY = 'http://localhost:5352/err-good/@fulgurjs-entry.js'

/** 卡 1：连接拒绝地址（5999 端口无任何监听） */
export const UNREACHABLE_ENTRY = 'http://localhost:5999/err-unreachable/@fulgurjs-entry.js'

/** 卡 3：宿主自身 vite 挂起中间件地址（TCP 可达、响应永不到达） */
export const HANG_ENTRY = 'http://localhost:5353/fulgurjs-hang-entry.js'

/** 卡 5 恢复用本地副本的值（与远程 utils.DEMO_ANSWER 同值，演示 fallback 本地副本） */
export const DEMO_ANSWER = 42

/** err-good/src/exposes/utils.ts 的模块形状（恢复验证的真实调用目标） */
export interface UtilsModule {
  DEMO_ANSWER: number
  sumNumbers: (...numbers: number[]) => number
  formatPrice: (yuan: number) => string
}

export interface DescribedError {
  code: string
  name: string
  message: string
  details?: string
}

/** 读取错误对象的可展示摘要（真实错误原样取出，不做加工改写） */
export function describeError(e: unknown): DescribedError {
  const err = e as { code?: string; name?: string; message?: string; details?: Record<string, unknown> } | null | undefined
  return {
    code: err?.code ?? 'UNKNOWN',
    name: err?.name ?? typeof e,
    message: err?.message ?? String(e ?? 'unknown'),
    details: err?.details === undefined ? undefined : JSON.stringify(err.details, null, 2),
  }
}
