/** URL formatting shared by runtime errors and display adapters; never mutates the raw cause. */
export function diagnosticUrl(text: string): string {
  return text
    .replace(/(https?:\/\/)(?:[^\s/@]+@)?([^\s?#"'<>，。；）)\]]+)(?:[?#][^\s"'<>，。；）)\]]*)?/g, '$1$2')
}

/** Display diagnostics without URL credentials/query/hash or explicitly labelled credentials. */
export function diagnosticMessage(error: unknown): string {
  return diagnosticUrl(String(error && typeof error === 'object' && 'message' in error ? error.message : error))
    .replace(/\b(token|password|cookie|authorization)["']?\s*[:=]\s*["']?(?:Bearer\s+)?[^\s,;"'}]+/gi, '$1=[redacted]')
}

/** 统一错误码体系（对齐 webpack ScriptExternalLoadError 等运行时错误的可诊断性） */
export class FgError extends Error {
  code: string
  details?: Record<string, unknown>

  constructor(code: string, message: string, details?: Record<string, unknown>, options?: ErrorOptions) {
    super(`[fulgurjs:${code}] ${diagnosticUrl(message)}`, options)
    this.name = 'FgError'
    this.code = code
    this.details = details
  }
}

/** 错误码一览（使用手册故障排查章节与之一一对应） */
export const ErrorCodes = {
  /** 远程容器加载失败（网络/超时/重试耗尽/熔断） */
  REMOTE_LOAD_FAILED: 'MFU-001',
  /** remoteEntry 自报名与 remotes 配置的名称不匹配 */
  REMOTE_NAME_MISMATCH: 'MFU-002',
  /** strictVersion 开启且共享版本不满足 */
  SHARE_STRICT_VERSION: 'MFU-003',
  /** 共享模块缺失且无本地 fallback（import: false） */
  SHARE_NOT_AVAILABLE: 'MFU-004',
  /** 同一容器用不同 share scope 重复 init */
  CONTAINER_REINIT_CONFLICT: 'MFU-005',
  /** 请求的模块未被该远程 exposes */
  MODULE_NOT_EXPOSED: 'MFU-006',
  /** 预加载失败 */
  PRELOAD_FAILED: 'MFU-007',
  /** 未知远程 */
  REMOTE_UNKNOWN: 'MFU-008',
  /** 加载到的模块没有任何导出（常见：exposes 指向了不导出内容的文件） */
  EMPTY_EXPORTS: 'MFU-009',
  /** singleton 共享协商版本与消费方 requiredVersion 不一致（使用作用域版本，仅告警） */
  SINGLETON_SKEW: 'MFU-010',
  /** setup 生命周期入口导出形态非法（默认导出不是函数，或具名 onSession 不是函数） */
  SETUP_INVALID_EXPORT: 'MFU-011',
  /** setup/onSession 执行抛错（该次 loadRemote 拒绝；仅清失败阶段缓存，允许重试） */
  SETUP_RUN_FAILED: 'MFU-012',
  /** 远程声明了 onSession 但宿主 AppContext 未提供 sessionKey（登录代次） */
  SETUP_SESSION_KEY_MISSING: 'MFU-013',
  /** setup/onSession 执行的同步段内递归 loadRemote 同一远程 */
  SETUP_RECURSION: 'MFU-014',
  /** 远程模块在组件消费边界导出的不是可渲染组件（适配器实测导出形态后报出） */
  COMPONENT_EXPORT_INVALID: 'MFU-018',
  /** 当前编译 SFC 的 Vue 导入引用与消费方渲染器不一致（组件证据已证实） */
  VUE_RUNTIME_IDENTITY_MISMATCH: 'MFU-019',
  /** 远程组件子树内部渲染错误（插件边界观测：setup/render/嵌套异步组件拒绝；原始异常保留在 cause） */
  REMOTE_RENDER_ERROR: 'MFU-020',
} as const

/**
 * 同一错误对象的全页面级「已报告」去重（P03 通路统一）。
 *
 * 一条失败可能流经多个边界（运行时抛出 → 适配器 UI 占位 → 业务 handler），每个边界都
 * 有理由可见，但 fulgurjs:error / onRemoteError 对同一个错误对象只应报告一次。
 * WeakSet 挂在 globalThis（惰性初始化，模块保持零顶层副作用以保住按需裁剪）：
 * 运行时、Vue/React 适配器与各入口打包副本共享同一份标记
 * （适配器 bundle 不静态引用运行时内核，经全局对象协作）。
 * 非对象拒绝值（字符串/数字等）无法按身份去重，保持每次报告（罕见路径，接受重复）。
 */
export function markRemoteErrorReported(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const g = globalThis as { __FULGURJS_REPORTED_ERRORS__?: WeakSet<object> }
  const reported = (g.__FULGURJS_REPORTED_ERRORS__ ??= new WeakSet())
  if (reported.has(error)) return true
  reported.add(error)
  return false
}
