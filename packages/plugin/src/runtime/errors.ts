/** 统一错误码体系（对齐 webpack ScriptExternalLoadError 等运行时错误的可诊断性） */
export class FgError extends Error {
  code: string
  details?: Record<string, unknown>

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(`[fulgurjs:${code}] ${message}`)
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
} as const
