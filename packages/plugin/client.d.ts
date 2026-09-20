/**
 * virtual:fulgurjs-runtime 客户端类型声明。
 *
 * 用法（二选一）：
 * 1. dev 启动后插件自动在 src/fulgurjs-types/fulgurjs-runtime.d.ts 生成加载垫片——
 *    只要 tsconfig include 了该目录（远程模块类型直连本就要求），运行时类型零配置生效；
 * 2. tsconfig.json → compilerOptions.types 加 "@fulgurjs/federation/client"（对齐 vite/client 模式）。
 *
 * ⚠️ 本文件必须是 script 形态（顶层不得出现 import/export）——环境模块声明
 * （declare module）住在 module 文件里会退化为 augmentation 被静默忽略。
 * 与 dist/runtime.js 的导出面一一对应（tests/client-types.test.ts 守漂移）。
 * 对外类型（LoadRemoteOptions 等）经 'virtual:fulgurjs-runtime' 模块本身导出，
 * 用法：import type { LoadRemoteOptions } from 'virtual:fulgurjs-runtime'。
 */
declare module 'virtual:fulgurjs-runtime' {
  /** shared 协商条目（window.__FULGURJS_SCOPE__ 内的形态） */
  export interface ShareEntry {
    version: string
    get: () => Promise<any>
    from: string
    eager: boolean
    loaded?: boolean
  }

  /** 远程注册配置（federation({ remotes }) 对象形态的运行时等价物） */
  export interface RemoteInput {
    name: string
    entry: string
    shareScope?: string
    timeout?: number
    retries?: number
    fallback?: string[]
    breaker?: { threshold: number; resetMs: number }
    manifestUrl?: string
    container?: unknown
    containerPromise?: Promise<unknown>
  }

  export interface LoadRemoteOptions {
    /** 单次调用级重试覆盖（缺省用远程注册值，默认 2） */
    retries?: number
    /** 显式降级：加载失败时返回该模块（错误事件仍显式发出，绝不静默兜底） */
    fallbackModule?: () => Promise<any> | any
  }

  export interface PreloadRemoteOptions {
    /** preload = 立即高优先级；prefetch = 空闲时低优先级 */
    mode?: 'preload' | 'prefetch'
  }

  export interface LoadShareOptions {
    shareScope?: string
    shareKey?: string
    requiredVersion?: string | false
    singleton?: boolean
    strictVersion?: boolean
    fallback?: () => Promise<any>
  }

  /** 运行时单例（与 globalThis.__FULGURJS_RUNTIME__ 同一实例，方法面冻结） */
  export interface FulgurjsRuntime {
    shareScopeMap: Record<string, Record<string, Record<string, ShareEntry>>>
    initSharing(scopeName?: string): FulgurjsRuntime['shareScopeMap']
    registerShare(
      scopeName: string,
      name: string,
      version: string,
      get: () => Promise<any>,
      opts?: { from?: string; eager?: boolean; loaded?: boolean },
    ): void
    registerRemotes(remotes: RemoteInput[]): void
    registerRemote(remote: RemoteInput): void
    registerPlugins(plugins: unknown[]): void
    loadShare<T = any>(name: string, opts?: LoadShareOptions): Promise<T>
    loadRemote<T = Record<string, any>>(spec: string, opts?: LoadRemoteOptions): Promise<T>
    getContainer(name: string): Promise<{ name: string; init: (scope: unknown) => void | Promise<void>; get: (module: string) => Promise<any> }>
    preloadRemote(spec: string, opts?: PreloadRemoteOptions): Promise<void>
    parseSpec(spec: string): { remote: string; module: string }
    provideFulgurjsAppConfig(config: Record<string, any>): void
    getFulgurjsAppConfig(): Record<string, any>
  }

  export const version: string
  export const runtime: FulgurjsRuntime
  export const shareScopeMap: FulgurjsRuntime['shareScopeMap']
  export function getRuntime(): FulgurjsRuntime
  export function initSharing(scopeName?: string): FulgurjsRuntime['shareScopeMap']
  export function registerShare(
    scopeName: string,
    name: string,
    version: string,
    get: () => Promise<any>,
    opts?: { from?: string; eager?: boolean; loaded?: boolean },
  ): void
  export function registerRemotes(remotes: RemoteInput[]): void
  export function registerRemote(remote: RemoteInput): void
  export function registerPlugins(plugins: unknown[]): void
  export function loadShare<T = any>(name: string, opts?: LoadShareOptions): Promise<T>
  export function loadRemote<T = Record<string, any>>(spec: string, opts?: LoadRemoteOptions): Promise<T>
  export function getContainer(
    name: string,
  ): Promise<{ name: string; init: (scope: unknown) => void | Promise<void>; get: (module: string) => Promise<any> }>
  export function preloadRemote(spec: string, opts?: PreloadRemoteOptions): Promise<void>
  export function parseSpec(spec: string): { remote: string; module: string }
  export function provideFulgurjsAppConfig(config: Record<string, any>): void
  export function getFulgurjsAppConfig(): Record<string, any>
  /** 兜底解包：命名空间有 default 取 default，否则原样返回 */
  export function unwrapDefault<T>(ns: { default?: T } | T): T
  /** 与 globalThis.__FULGURJS_RUNTIME__ 同一实例（方法面冻结） */
  const runtimeDefault: FulgurjsRuntime
  export default runtimeDefault
}
