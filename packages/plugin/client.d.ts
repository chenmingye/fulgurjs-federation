/**
 * virtual:fulgurjs-runtime 客户端类型声明。
 *
 * 用法（二选一）：
 * 1. dev 启动后插件自动在类型目录（默认 src/fulgurjs/types/，无 src 布局回退 .fulgurjs/types/）
 *    生成 fulgurjs-runtime.d.ts 加载垫片——只要 tsconfig include 了该目录
 *    （远程模块类型直连本就要求），运行时类型零配置生效；
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

  /**
   * 跨应用上下文标准字段表（0.8.0，docs/跨应用传值与方法引用设计方案-2026-09-20.md §4.3；
   * 0.8.2 精简：token 快照 / formUrl / baseUrl 移出默认 provide，用 getToken 拉取、扩展位自定）。
   * 值 API 在 '@fulgurjs/federation/context' 子路径（runtime.js 不导出 context 函数，
   * 此处仅类型随虚拟模块声明供 type-only import）；读写约定：宿主桥先写标准字段，
   * 远程 boot 只增不改宿主键；嵌套对象（如 events）引用共享。
   */
  export interface AppContext {
    /** 宿主登录用户原始形态（只读约定） */
    user: Record<string, any>
    /** 取最新 token（拉取式防过期；0.8.2 起 bridge 不再传一次性 token 快照） */
    getToken?: () => string | undefined
    /** 宿主 pinia 实例：子应用 useUserStore(ctx.store) 拿共享响应式状态 */
    store?: unknown
    /** 宿主 Vue App 实例（同 realm 直引用）：全局组件/指令注册目标 */
    hostApp?: unknown
    /** EP locale 等 UI 配置（原 W4 字段） */
    locale?: unknown
    /** 事件/方法池：events.main.* 宿主提供、events.bpm.* / events.lowcode.* 子应用反向注册 */
    events?: Record<string, any>
    /** 项目扩展位（formUrl/baseUrl 等自定义键，按需自行提供） */
    [key: string]: unknown
  }

  /** 运行时单例（与 globalThis.__FULGURJS_RUNTIME__ 同一实例，方法面冻结） */
  export interface FgRuntime {
    shareScopeMap: Record<string, Record<string, Record<string, ShareEntry>>>
    initSharing(scopeName?: string): FgRuntime['shareScopeMap']
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
  }

  export const version: string
  export const runtime: FgRuntime
  export const shareScopeMap: FgRuntime['shareScopeMap']
  export function getRuntime(): FgRuntime
  export function initSharing(scopeName?: string): FgRuntime['shareScopeMap']
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
  /** 兜底解包：命名空间有 default 取 default，否则原样返回 */
  export function unwrapDefault<T>(ns: { default?: T } | T): T
  /** 与 globalThis.__FULGURJS_RUNTIME__ 同一实例（方法面冻结） */
  const runtimeDefault: FgRuntime
  export default runtimeDefault
}
