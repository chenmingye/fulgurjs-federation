/**
 * 跨应用传值契约：FulgurjsAppContext（0.8.0）。
 *
 * 定位（docs/跨应用传值与方法引用设计方案-2026-09-20.md §四）：
 * - runtime.js 逻辑零改动（gzip 红线）：本子路径独立成文件，内部经
 *   globalThis.__FULGURJS_RUNTIME__ 单例读写——provide/get 委托运行时既有的
 *   provideFulgurjsAppConfig/getFulgurjsAppConfig（旧 W4 存储即 context 存储，
 *   旧名后续版本删除）；状态在运行时单例内，本模块自身零状态，多副本天然一致。
 * - 数据语义：传输层快照 + 函数引用，非响应式（与乾坤 props 同语义）；
 *   "实时"由函数引用拉取 / 宿主 pinia 共享响应式 / 登录刷新三条正规通道承担。
 * - H3 零兜底：require 缺键 → CC-001 三段式；页面无运行时单例（独立直开远程页）
 *   → CC-002，绝不静默。
 */
import { FulgurjsError } from './runtime/errors'

/**
 * CC 段错误码（context 子路径自持）：src/runtime/ 对 v0.7.1 零 diff 红线，
 * 不回填 runtime/errors.ts 的 ErrorCodes 总表（README 错误码总表同步 CC 段）。
 */
export const ContextErrorCodes = {
  /** context 必需字段缺失（三段式，修法指向宿主桥） */
  CONTEXT_MISSING_KEY: 'CC-001',
  /** 运行时单例不可用（独立直开远程页，修法=经宿主联邦加载） */
  CONTEXT_NO_RUNTIME: 'CC-002',
} as const

/**
 * 跨应用上下文标准字段表（§4.3，0.8.2 精简后）。
 *
 * 读写约定：宿主桥先写标准字段；远程 boot 只增不改宿主键；
 * 嵌套对象（如 events）是引用共享，子应用挂属性即时可见（同 realm 直引用）。
 *
 * 精简记录（0.8.2）：`token` 快照与 `formUrl`/`baseUrl` 从默认 provide 集合移除——
 * token 快照与 getToken 函数引用重复（快照会过期），formUrl/baseUrl 自 0.7.0
 * remoteComponent 直渲染后无消费点；项目如需可经扩展位自行提供。
 */
export interface FulgurjsAppContext {
  /** 宿主登录用户原始形态（只读约定） */
  user: Record<string, any>
  /** 取最新 token（拉取式防过期；0.8.2 起 bridge 不再传一次性 token 快照，用本函数取值） */
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

/** 取运行时单例（globalThis 守卫：跨 bundle 副本一律读全局这一份；缺失 → CC-002 显式） */
function requireRuntime(): {
  provideFulgurjsAppConfig: (config: Record<string, any>) => void
  getFulgurjsAppConfig: () => Record<string, any>
} {
  const rt = (globalThis as any).__FULGURJS_RUNTIME__
  if (!rt || typeof rt.provideFulgurjsAppConfig !== 'function') {
    throw new FulgurjsError(
      ContextErrorCodes.CONTEXT_NO_RUNTIME,
      'fulgurjs runtime singleton not found on this page (globalThis.__FULGURJS_RUNTIME__ is undefined).\n' +
        '  根因: 当前页面没有经宿主的联邦运行时加载（独立直开远程页，或宿主桥晚于本调用执行）。\n' +
        '  修法: ① 从宿主应用的联邦路由打开本页面（宿主 bridge 会先加载运行时并提供 context）；\n' +
        '        ② 若你是宿主桥作者：把 provideFulgurjsAppContext 放在 bridge 初始化尾部（时序契约 bridge → federatedBoot → loadRemote）。',
      { runtime: false },
    )
  }
  return rt
}

/**
 * 宿主写入跨应用上下文（merge 语义，幂等可多次调用，后写覆盖同键）。
 *
 * 宿主桥（host/src/fulgurjs/host/bridge.ts）在登录完成后调用一次：
 * provideFulgurjsAppContext({ user, token, getToken, store, hostApp, locale, events: { main: mainEvents }, ... })
 */
export function provideFulgurjsAppContext(config: Partial<FulgurjsAppContext> & Record<string, unknown>): void {
  requireRuntime().provideFulgurjsAppConfig(config)
}

/**
 * 读上下文快照（传输层快照：顶层 merge 结果 + 嵌套对象引用共享）。
 * 页面无运行时单例（独立直开远程页）→ CC-002 显式抛错，不静默回空。
 */
export function getFulgurjsAppContext(): FulgurjsAppContext {
  return requireRuntime().getFulgurjsAppConfig() as FulgurjsAppContext
}

/**
 * 显式校验读取（远程 boot 消费入口）：任一键缺失 → CC-001 三段式。
 *
 * 用法：const { store, user, hostApp } = requireFulgurjsAppContext('store', 'user', 'hostApp')
 * 时序契约：宿主 bridge 先 provide，远程 federatedBoot 后 require——违反即在 boot 处显式失败。
 */
export function requireFulgurjsAppContext(...keys: string[]): FulgurjsAppContext {
  const ctx = getFulgurjsAppContext()
  const missing = keys.filter((k) => ctx[k] === undefined)
  if (missing.length === 0) return ctx

  const got = Object.keys(ctx)
  const err = new FulgurjsError(
    ContextErrorCodes.CONTEXT_MISSING_KEY,
    `AppContext missing required key(s): ${missing.map((k) => `"${k}"`).join(', ')}\n` +
      `  got: ${got.length ? got.map((k) => `"${k}"`).join(', ') : '(empty — 宿主桥从未调用 provideFulgurjsAppContext?)'}\n` +
      `  expected: 宿主桥必须在任何远程页面加载前提供 ${missing.map((k) => `"${k}"`).join(' / ')}\n` +
      `  example: host/src/fulgurjs/host/bridge.ts → provideFulgurjsAppContext({ ${keys.join(', ')}, ... })\n` +
      `  修法: 检查宿主应用 fulgurjs bridge 是否升级到 0.8.0 context 形态（时序契约 bridge → federatedBoot → loadRemote）`,
    { missing, got },
  )
  throw err
}
