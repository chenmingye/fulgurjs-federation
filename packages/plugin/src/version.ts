/**
 * 运行时版本常量（与 packages/plugin/package.json 的 version 同步维护）。
 * 不直接 import package.json：运行时 bundle 有 gzip 门禁（scripts/check-gzip.mjs，≤10496B（5.7.1：共享协商屏障与旧内核兼容的必要增量）），
 * 内联整份 JSON 会挤占预算。
 * 漂移由 tests/runtime.test.ts 的「version 同源」用例拦截。
 */
export const RUNTIME_VERSION = '6.1.2'
