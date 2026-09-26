/**
 * 跨应用传值契约：AppContext。
 *
 * 定位（用法见 README §9）：
 * - 物理子路径（'@fulgurjs/federation/runtime' 应用入口与 ./internal/context.js），
 *   与 runtime bundle 解耦：状态存在 globalThis 的页面级镜像对象（__FULGURJS_APP_CONFIG__）
 *   里，本模块自身零状态，多副本天然一致。
 * - 数据语义：传输层快照 + 函数引用，非响应式（与乾坤 props 同语义）；
 *   "实时"由函数引用拉取 / 宿主 pinia 共享响应式承担；同页换账号的会话同步由
 *   远程 setup 模块的 onSession（按 sessionKey 去重）承担，不依赖页面刷新。
 * - H3 零兜底：require 缺键 → CC-001 三段式；页面无运行时单例（独立直开远程页）
 *   → CC-002，绝不静默。
 */
import { FgError } from './runtime/errors'

/**
 * CC 段错误码（context 子路径自持）：与 README 错误码总表 CC 段一一对应。
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
export interface AppContext {
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
  /**
   * 非敏感登录代次 ID：宿主每次成功登录/重新登录生成新值，token 刷新但会话未变时沿用。
   * 远程 onSession 按它去重（同一代次只执行一次）。不是用户 ID、不是 token、不作为授权凭证。
   * 远程声明了 onSession 时必填（缺省即 MFU-013）。
   */
  sessionKey?: string
  /** 项目扩展位（formUrl/baseUrl 等自定义键，按需自行提供） */
  [key: string]: unknown
}

/** 上下文存储键：页面级单例镜像对象（context 的读写都落在这里；跨 bundle 副本共享同一份） */
const APP_CONTEXT_STORAGE_KEY = '__FULGURJS_APP_CONFIG__'

/**
 * 取运行时单例（globalThis 守卫：跨 bundle 副本一律读全局这一份；缺失 → CC-002 显式）。
 * 判据 = 单例存在且方法面完整（loadRemote 为运行时核心 API 的代表）——context 自身的
 * 存储不经 runtime（1.0.0 起直连 globalThis 镜像对象），此处只做"页面是否经宿主联邦加载"的守卫。
 */
function requireRuntime(): { loadRemote: (...args: any[]) => any } {
  const rt = (globalThis as any).__FULGURJS_RUNTIME__
  if (!rt || typeof rt.loadRemote !== 'function') {
    throw new FgError(
      ContextErrorCodes.CONTEXT_NO_RUNTIME,
      '现象：当前页面找不到 fulgurjs 运行时单例（globalThis.__FULGURJS_RUNTIME__ 未定义）。\n' +
        '  根因: 当前页面没有经宿主的联邦运行时加载（独立直开远程页，或宿主桥晚于本调用执行）。\n' +
        '  修法: ① 从宿主应用的联邦路由打开本页面（宿主桥会先加载运行时并提供 context）；\n' +
        '        ② 若你是宿主桥作者：把 provideAppContext 放在桥初始化尾部（时序契约 bridge → 远程 setup → 页面模块）。',
      { runtime: false },
    )
  }
  return rt
}

/**
 * 宿主写入跨应用上下文（merge 语义，幂等可多次调用，后写覆盖同键）。
 *
 * 宿主桥（host/src/fulgurjs/host/bridge.ts）在登录完成后调用：
 * provideAppContext({ user, getToken, store, hostApp, locale, sessionKey, events: { main: mainEvents }, ... })
 * 登录态变化（换账号/token 刷新）时再次调用即以最新值覆盖同键——不要用布尔闩锁把桥封成只跑一次。
 */
export function provideAppContext(config: Partial<AppContext> & Record<string, unknown>): void {
  requireRuntime()
  const g = globalThis as any
  g[APP_CONTEXT_STORAGE_KEY] = { ...(g[APP_CONTEXT_STORAGE_KEY] ?? {}), ...config }
}

/**
 * 宿主退出登录时清理：删除整个 context 对象（旧 user/getToken 引用一并失效），并通知
 * 运行时单例作废全部远程的会话信号与 onSession 去重状态（下次登录必须重新执行 onSession）。
 *
 * 边界（契约）：只清 AppContext 与会话初始化状态；不重置远程模块缓存、共享模块图与
 * 应用级 setup 注册（同一页面内组件与共享实例继续复用）。页面无运行时单例时静默幂等
 * （退出动作不依赖联邦形态，不得因缺运行时而打断登出流程）。
 */
export function clearAppContext(): void {
  const g = globalThis as any
  delete g[APP_CONTEXT_STORAGE_KEY]
  try {
    g.__FULGURJS_RUNTIME__?.clearSessionState?.()
  } catch {
    /* 清理会话状态失败不阻断登出 */
  }
}

/**
 * 读上下文快照（传输层快照：顶层 merge 结果 + 嵌套对象引用共享）。
 * 页面无运行时单例（独立直开远程页）→ CC-002 显式抛错，不静默回空。
 */
export function getAppContext(): AppContext {
  requireRuntime()
  return ((globalThis as any)[APP_CONTEXT_STORAGE_KEY] ?? {}) as AppContext
}

/**
 * 显式校验读取（远程 setup/boot 消费入口）：任一键缺失 → CC-001 三段式。
 *
 * 用法：const { store, user, hostApp } = requireAppContext('store', 'user', 'hostApp')
 * 时序契约：宿主桥先 provide，远程 setup/onSession 后 require——违反即在初始化处显式失败。
 */
export function requireAppContext(...keys: string[]): AppContext {
  const ctx = getAppContext()
  const missing = keys.filter((k) => ctx[k] === undefined)
  if (missing.length === 0) return ctx

  const got = Object.keys(ctx)
  const err = new FgError(
    ContextErrorCodes.CONTEXT_MISSING_KEY,
    `现象：AppContext 缺少必需字段 ${missing.map((k) => `"${k}"`).join('、')}。\n` +
      `当前字段：${got.length ? got.map((k) => `"${k}"`).join('、') : '空（宿主桥可能尚未调用 provideAppContext）'}。\n` +
      `预期：宿主桥应在远程页面加载前提供 ${missing.map((k) => `"${k}"`).join('、')}。\n` +
      `示例：host/src/fulgurjs/host/bridge.ts → provideAppContext({ ${keys.join(', ')}, ... })\n` +
      `  修法: 检查宿主应用的 fulgurjs 桥是否在 loadRemote 页面前完成 context provide（时序契约 bridge → 远程 setup → 页面模块）`,
    { missing, got },
  )
  throw err
}
