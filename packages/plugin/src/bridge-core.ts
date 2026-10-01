/**
 * 桥接核心（框架无关）：契约类型、契约校验（MFU-015）、页面级会话登记与
 * AppContext 生成代次校验（MFU-016/017）。
 *
 * 两个宿主适配器（bridge-host-vue/react）与两个子应用适配器（bridge-app-vue/react）
 * 共用本模块；本文件不得 import vue/react/react-dom（导入图隔离，BR12 断言），
 * 也不 import 运行时内核——宿主适配器只接收注入的 loadRemote。
 */
import { clearAppContext } from './context'
import type { AppContext } from './context'
import {
  bridgeLifecycleError,
  bridgeSessionMismatchError,
  invalidBridgeContractError,
  invalidSessionKeyError,
} from './bridge-errors'

/** 子应用桥接契约（远程 ./bridge 模块的默认导出；任务书 §3.2） */
export interface BridgeApp {
  /** 首次根提交完成时才算挂载成功；同一容器未卸载前重复 mount 是契约违例 */
  mount(el: HTMLElement, props?: Record<string, unknown>): void | Promise<void>
  /** 同步使当前挂载代次失效并清理已创建的 root；未知容器为 no-op */
  unmount(el: HTMLElement): void
}

/** 远程模块 → 契约校验（默认导出须含函数类型的 mount/unmount，否则 MFU-015） */
export function assertBridgeContract(spec: string, mod: unknown): BridgeApp {
  const contract = (mod as { default?: unknown } | null | undefined)?.default ?? mod
  if (
    contract === null ||
    typeof contract !== 'object' ||
    typeof (contract as BridgeApp).mount !== 'function' ||
    typeof (contract as BridgeApp).unmount !== 'function'
  ) {
    throw invalidBridgeContractError(spec, mod)
  }
  return contract as BridgeApp
}

// ── 页面级桥接会话登记（同页多实例单会话约束，任务书 §4.5）──────────────────────

/** 活跃桥接实例按受控 sessionKey 计数（attempt 开始登记、unmount/失效释放） */
const activeBridgeSessions = new Map<string, number>()

/**
 * 登记一个受控会话代次；页面已有不同 sessionKey 的活跃桥接实例时拒绝（MFU-017）。
 * 同一会话的多实例并存合法（计数递增）。
 */
export function acquireBridgeSession(spec: string, sessionKey: string): void {
  for (const [active] of activeBridgeSessions) {
    if (active !== sessionKey && (activeBridgeSessions.get(active) ?? 0) > 0) {
      throw bridgeSessionMismatchError(spec, sessionKey, active, { reason: 'active-instance' })
    }
  }
  activeBridgeSessions.set(sessionKey, (activeBridgeSessions.get(sessionKey) ?? 0) + 1)
}

/** 释放一个受控会话代次（unmount/换代/失败清理时调用；幂等） */
export function releaseBridgeSession(sessionKey: string): void {
  const n = activeBridgeSessions.get(sessionKey) ?? 0
  if (n <= 1) activeBridgeSessions.delete(sessionKey)
  else activeBridgeSessions.set(sessionKey, n - 1)
}

// ── 会话与 AppContext 代次校验（任务书 §4.3）────────────────────────────────────

export interface BridgeContextResolution {
  /** 校验通过后需要由桥接层写入全局的快照；undefined = 复用现有 AppContext，无需写入 */
  provide?: Partial<AppContext> & Record<string, unknown>
}

/**
 * 挂载前校验会话与上下文快照（同步、无副作用；只在全部通过后由调用方 provide）。
 *
 * - getter 抛错/返回非对象/thenable → MFU-016（phase: getContext）；
 * - 受控 sessionKey 与快照或现有 AppContext 不一致 → MFU-017（不写任何全局状态）；
 * - 新会话（与全局当前 sessionKey 不同）先 clearAppContext 清旧账号残留，
 *   避免 provideAppContext 顶层 merge 留下旧账号独有字段（BR06）。
 *
 * 会话登记（acquireBridgeSession/releaseBridgeSession）由宿主适配器在代次边界管理，
 * 本函数不重复登记——重试同会话不得叠加计数。
 *
 * controlled 语义：非空字符串 = 受控校验；undefined = 不启用受控校验（快照照常提供，
 * 远程 onSession 由 runtime 按 AppContext.sessionKey 判定）；null 由调用方先行短路。
 */
export function resolveBridgeContext(
  spec: string,
  controlled: string | undefined,
  getContext: (() => Partial<AppContext> & Record<string, unknown>) | undefined,
): BridgeContextResolution {
  if (getContext) {
    let snapshot: Partial<AppContext> & Record<string, unknown>
    try {
      snapshot = getContext()
    } catch (e) {
      throw bridgeLifecycleError('getContext', spec, e)
    }
    if (snapshot === null || typeof snapshot !== 'object' || typeof (snapshot as { then?: unknown }).then === 'function') {
      throw bridgeLifecycleError('getContext', spec, describeContextValue(snapshot))
    }
    if (controlled !== undefined && snapshot.sessionKey !== controlled) {
      throw bridgeSessionMismatchError(spec, controlled, snapshot.sessionKey, { reason: 'getter-snapshot' })
    }
    // 快照会话与全局当前会话不同 = 换代：先清旧账号独有字段（clear 同时作废旧会话信号），
    // 再写新快照；同会话重复 provide 幂等 merge 即可。
    const current = currentSessionKey()
    if (snapshot.sessionKey !== undefined && snapshot.sessionKey !== current) {
      clearAppContext()
    }
    return { provide: snapshot }
  }
  if (controlled !== undefined) {
    // 无 getter：校验现有 AppContext（宿主桥已 provide 过当前会话）
    const current = currentSessionKey()
    if (current !== controlled) {
      throw bridgeSessionMismatchError(spec, controlled, current, { reason: 'app-context' })
    }
  }
  return {}
}

/** 页面级 AppContext 镜像上的当前登录代次（无则 undefined；不经运行时单例） */
function currentSessionKey(): string | undefined {
  const sk = ((globalThis as any).__FULGURJS_APP_CONFIG__ ?? {}).sessionKey
  return typeof sk === 'string' && sk !== '' ? sk : undefined
}

/** getContext 非法返回值的安全描述：诊断分支不得再次触发空值访问（null/undefined 读属性即 TypeError） */
function describeContextValue(snapshot: unknown): string {
  if (snapshot === null) {
    return 'getContext 返回了 null。它必须是同步返回快照对象的纯 getter：返回值应为包含本次会话快照的对象' +
      '（受控 sessionKey 时须含相同 sessionKey），不能返回 null。'
  }
  if (snapshot === undefined) {
    return 'getContext 返回了 undefined。它必须是同步返回快照对象的纯 getter：返回值应为包含本次会话快照的对象，' +
      '请检查 getter 是否漏写 return 或返回了未初始化的变量。'
  }
  if (typeof (snapshot as { then?: unknown }).then === 'function') {
    return 'getContext 返回了 Promise/thenable。它必须是同步 getter，不得返回 Promise：异步获取用户资料请在宿主完成后再让桥接组件进入可挂载状态。'
  }
  return `getContext 返回了非对象值（${typeof snapshot}："${String(snapshot)}"）。它必须是同步返回快照对象的纯 getter，返回值应为对象而不是原始值。`
}

/** 受控 sessionKey 受控值合法性：只接受 undefined / null / 非空字符串（任务书 BN10） */
export function assertControlledSessionKey(spec: string, value: unknown): void {
  if (value === undefined || value === null) return
  if (typeof value === 'string' && value !== '') return
  throw invalidSessionKeyError(spec, value)
}

/** 适配层参数校验（与 vue/react 适配器同口径：retries 0-10 整数、timeout 正有限数） */
export function assertBridgeOptions(source: string, opts: { retries?: number; timeout?: number }): void {
  if (opts.retries !== undefined && (typeof opts.retries !== 'number' || !Number.isInteger(opts.retries) || opts.retries < 0 || opts.retries > 10)) {
    throw new Error(
      `[fulgurjs] ${source} 的 retries 配置无效：当前为 ${String(opts.retries)}，应为 0 到 10 的整数。请修正选项。`,
    )
  }
  if (opts.timeout !== undefined && (typeof opts.timeout !== 'number' || !Number.isFinite(opts.timeout) || opts.timeout <= 0)) {
    throw new Error(
      `[fulgurjs] ${source} 的 timeout 配置无效：当前为 ${String(opts.timeout)}，应为大于 0 的有限毫秒数。请修正选项。`,
    )
  }
}

/**
 * 桥接加载等待上限（与 React remoteComponent.timeout 同语义）：
 * 只结束本次等待，不取消已发出的共享 loadRemote 请求；迟到的成功/失败一律丢弃。
 */
export function withBridgeTimeout<T>(p: Promise<T>, ms: number, spec: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(
        `[fulgurjs] 桥接应用 "${spec}" 加载等待超过 ${ms} 毫秒（适配层 timeout）。` +
          '该超时只结束本次等待，不取消已发出的共享请求；可点击「重试加载」建立新的尝试。',
      ))
    }, ms)
    p.then(
      (v) => { clearTimeout(timer); resolve(v) },
      (e) => { clearTimeout(timer); reject(e) },
    )
  })
}
