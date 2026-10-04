/**
 * 宿主本地兜底模块（演示卡片⑪）：loadRemote('sh-remote-a/no-such-module', { fallbackModule })。
 * 远程不存在该模块（MFU-006）时 loadRemote 返回本模块而不是抛错；
 * runtime 仍会 console.error 原始错误并发 fulgurjs:error 事件——显式兜底不是静默兜底。
 */
export const FALLBACK_SOURCE = 'sh-host/src/fallbacks/storeFallback.ts（宿主本地模块）'
export const HEADLINE = '远程模块 sh-remote-a/no-such-module 不存在，已按 fallbackModule 降级为宿主本地模块'

export function fallbackGreet(name: string): string {
  return `（兜底模块问候）你好，${name}`
}
