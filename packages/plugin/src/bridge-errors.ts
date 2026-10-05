/**
 * 桥接层错误码表（MFU-015/016/017 + 路由同步 MFU-030~033，任务书 D3 / URL 同步 §6）。
 *
 * 与 runtime.js 解耦：桥接专用分支不进内核 bundle（runtime 内核零改动为首选目标）；
 * 码值登记于 src/diagnostics.ts 的 CODE_REGISTRY，由 scripts/check-manual-codes.mjs
 * 做「源码定义 ⊆ 登记表 = README 错误码总表」三方一致性校验。
 * 三段式口径与 runtime/context 一致：现象 → 根因 → 修法。
 */
import { FgError } from './runtime/errors'

export const BridgeErrorCodes = {
  /** 桥接契约非法（./bridge 默认导出缺 mount/unmount 或不是函数） */
  BRIDGE_INVALID_CONTRACT: 'MFU-015',
  /** 桥接准备或生命周期失败（details.phase = getContext | mount | unmount） */
  BRIDGE_LIFECYCLE_FAILED: 'MFU-016',
  /** 桥接会话参数与 AppContext 不一致（受控 sessionKey 与全局会话矛盾） */
  BRIDGE_SESSION_MISMATCH: 'MFU-017',
  /** 路由同步配置/前缀冲突（basePath 非法、同页前缀冲突或重叠） */
  ROUTING_CONFIG_INVALID: 'MFU-030',
  /** 路由协议缺失/通道失效（子应用未声明 routing 协议，或已销毁通道被再次使用） */
  ROUTING_PROTOCOL_MISSING: 'MFU-031',
  /** 非法导航（目标越界前缀、非法 go 参数、失效实例的请求） */
  ROUTING_NAVIGATION_INVALID: 'MFU-032',
  /** 路由准备/同步失败（重定向循环、子应用路由准备失败且已阻止错误页面显示） */
  ROUTING_SYNC_FAILED: 'MFU-033',
} as const

/** 桥接生命周期阶段（MFU-016 details.phase 取值） */
export type BridgePhase = 'getContext' | 'mount' | 'unmount'

/** MFU-015：远程 ./bridge 默认导出不是合法契约对象 */
export function invalidBridgeContractError(spec: string, mod: unknown): FgError {
  const actual = mod === null ? 'null' : typeof mod
  const missing: string[] = []
  if (typeof (mod as any)?.mount !== 'function') missing.push('mount')
  if (typeof (mod as any)?.unmount !== 'function') missing.push('unmount')
  return new FgError(
    BridgeErrorCodes.BRIDGE_INVALID_CONTRACT,
    `现象：远程模块 "${spec}" 的默认导出不是合法的桥接契约（BridgeApp）。\n` +
      `  根因: 导出值为 ${actual}` +
      (missing.length ? `，缺少函数类型的 ${missing.map((m) => `"${m}"`).join(' / ')} 导出。` : '。') +
      '\n' +
      `  修法: 远程侧用 defineBridgeApp(...) 创建契约并作为模块默认导出——\n` +
      `        Vue 子应用: import { defineBridgeApp } from '@fulgurjs/federation/vue'；\n` +
      `        React 子应用: import { defineBridgeApp } from '@fulgurjs/federation/react'。\n` +
      `        契约必须包含 mount(el, props?) 与 unmount(el) 两个函数。`,
    { spec, missing, actual },
  )
}

/** MFU-016：桥接准备（getContext）或生命周期（mount/unmount）失败；cause 保留原始错误 */
export function bridgeLifecycleError(
  phase: BridgePhase,
  spec: string,
  cause: unknown,
  extra?: Record<string, unknown>,
): FgError {
  const raw = cause instanceof Error ? cause.message : String(cause ?? 'unknown')
  const fixes: Record<BridgePhase, string> = {
    getContext:
      '修法: ① getContext 必须是同步、无副作用的 getter（不得返回 Promise/thenable）；\n' +
      '        ② 返回值须是包含本次会话快照的对象（受控 sessionKey 时须含相同 sessionKey）；\n' +
      '        ③ 异步获取用户资料请在宿主完成后再让桥接组件进入可挂载状态。',
    mount:
      '修法: ① 查看根因中子应用 mount 的原始错误（工厂抛错或首次渲染失败）；\n' +
      '        ② 同一容器未卸载前重复 mount 是契约违例——先 unmount 再 mount；\n' +
      '        ③ 修复后点击「重试加载」在同页重建挂载。',
    unmount:
      '修法: ① 根因来自子应用 unmount 实现（app.unmount/root.unmount 抛错）；\n' +
      '        ② 该容器清理状态不确定，插件已持久封锁该容器——同页「重试加载」与\n' +
      '        换会话都不会在此容器重新挂载；\n' +
      '        ③ 只能整页刷新恢复（「刷新页面重试」）；残留资源（事件订阅/定时器/全局副作用）请如实排查。',
  }
  return new FgError(
    BridgeErrorCodes.BRIDGE_LIFECYCLE_FAILED,
    `现象：桥接应用 "${spec}" 的 ${phase} 阶段失败。\n` +
      `  根因: ${raw}\n` +
      fixes[phase],
    { phase, spec, cause: String(raw), ...extra },
    { cause } as ErrorOptions,
  )
}

/**
 * 宿主适配器的 MFU-016 单点包装（5.5.0 起）：
 * 子应用适配器（defineBridgeApp）原样抛出 mount/unmount 的原始错误——此前子侧预包装
 * spec 只能是占位 'bridge'，宿主再包一次造成「spec 失真 + cause 双重包装」的误导诊断。
 * 宿主在生命周期边界统一包装：真实 spec + phase + 原始 cause 只包装一次；
 * 已是本插件诊断（FgError）的错误原样保留，不重复包装。
 */
export function bridgeHostError(phase: BridgePhase, spec: string, cause: unknown): FgError {
  if (cause instanceof FgError) return cause
  return bridgeLifecycleError(phase, spec, cause instanceof Error ? cause : String(cause))
}

/** MFU-017：受控 sessionKey 与当前 AppContext / 活跃桥接会话不一致 */
export function bridgeSessionMismatchError(
  spec: string,
  controlled: string,
  actual: unknown,
  extra?: Record<string, unknown>,
): FgError {
  const actualText =
    actual === undefined ? 'undefined（页面尚无 AppContext）' : typeof actual === 'string' ? `"${actual}"` : String(actual)
  return new FgError(
    BridgeErrorCodes.BRIDGE_SESSION_MISMATCH,
    `现象：桥接应用 "${spec}" 的受控 sessionKey（"${controlled}"）与当前会话不一致（当前 ${actualText}）。\n` +
      `  根因: AppContext 是页面级单例，同页所有桥接实例必须使用同一登录代次；\n` +
      `        getContext 快照的 sessionKey（或现有 AppContext 的 sessionKey）与受控值不同。\n` +
      `  修法: ① 换账号时先让受控 prop 置 null 并等待卸载，再 clearAppContext() 清旧账号、\n` +
      `        准备新账号完整快照后更新受控 prop；\n` +
      `        ② 无 getContext 时，先由宿主桥 provideAppContext({...新会话, sessionKey}) 再挂载；\n` +
      `        ③ 同页不要同时挂载不同账号的桥接实例（页面级单会话约束）。`,
    { spec, controlled, actual: String(actual), ...extra },
  )
}

/** MFU-017：受控 sessionKey 值本身非法（空字符串/数字等，非 undefined/null/非空字符串） */
export function invalidSessionKeyError(spec: string, value: unknown): FgError {
  return new FgError(
    BridgeErrorCodes.BRIDGE_SESSION_MISMATCH,
    `现象：桥接应用 "${spec}" 收到非法的受控 sessionKey：${typeof value === 'string' ? '空字符串 ""' : `${typeof value}（${String(value)}）`}。\n` +
      `  根因: sessionKey 只接受 undefined（不启用受控会话）、null（登出态）或非空字符串（登录代次 ID）。\n` +
      `  修法: 登出传 null 而不是空字符串；登录代次用非空字符串；不要传数字/布尔等其他类型。`,
    { spec, value: String(value) },
  )
}

// ── 路由同步（URL 同步功能，任务书 §6）────────────────────────────

/** MFU-030：路由同步配置非法或前缀冲突（basePath 校验失败、同页重叠前缀登记） */
export function routingConfigError(spec: string, reason: string): FgError {
  return new FgError(
    BridgeErrorCodes.ROUTING_CONFIG_INVALID,
    `现象：桥接应用 "${spec}" 的 URL 同步配置无法启用。\n原因：${reason}\n修法：修正 routing.basePath 为宿主路由视角的静态绝对路径（如 "/approval"），并保证同页各同步实例前缀互不重叠；宿主路由需声明对应的后缀匹配（Vue "/approval/:pathMatch(.*)*"、React "/approval/*"）。`,
    { spec },
  )
}

/** MFU-031：路由协议缺失/通道失效（子应用未以 { routing: true } 声明协议，或通道已销毁仍被使用） */
export function routingProtocolError(spec: string, reason: string): FgError {
  return new FgError(
    BridgeErrorCodes.ROUTING_PROTOCOL_MISSING,
    `现象：桥接应用 "${spec}" 的 URL 同步通道不可用。\n原因：${reason}\n修法：子应用以 defineBridgeApp(工厂, { routing: true }) 声明路由协议并在工厂第二参数接收 { signal, routing } 接线受控路由；通道随挂载生命周期创建，销毁后不得复用（重挂会得到新通道）。`,
    { spec },
  )
}

/** MFU-032：非法导航（越界目标、非法 go 参数、失效通道请求被拒绝） */
export function routingNavigationError(spec: string, reason: string): FgError {
  return new FgError(
    BridgeErrorCodes.ROUTING_NAVIGATION_INVALID,
    `现象：桥接应用 "${spec}" 的一次导航请求被拒绝。\n原因：${reason}\n修法：子应用导航目标必须位于自身 basePath 前缀内（跨前缀请用宿主菜单/宿主能力）；go 参数为有限整数且 |delta| ≤ 50。`,
    { spec },
  )
}

/** MFU-033：路由准备/同步失败（重定向循环等；不伪装成功也不静默回退 memory） */
export function routingSyncError(spec: string, reason: string, chain: string[], cause?: unknown): FgError {
  return new FgError(
    BridgeErrorCodes.ROUTING_SYNC_FAILED,
    `现象：桥接应用 "${spec}" 的 URL 同步失败。\n原因：${reason}\n修法：检查路由守卫、加载器与导航异常；重定向链不应成环。目标链：${chain.join(' → ')}。`,
    { spec, chain: [...chain] },
    { cause },
  )
}
