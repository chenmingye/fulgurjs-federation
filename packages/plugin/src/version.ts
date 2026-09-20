/**
 * 运行时版本常量（与 packages/plugin/package.json 的 version 同步维护）。
 * 不直接 import package.json：运行时 bundle 有 gzip ≤5120 红线（CI 守卫），
 * 内联整份 JSON 会超预算。漂移由 tests/runtime.test.ts 的「version 同源」用例拦截。
 */
export const RUNTIME_VERSION = '0.7.0'
