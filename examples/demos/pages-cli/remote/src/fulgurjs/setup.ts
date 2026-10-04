import type { RemoteSetupContext } from '@fulgurjs/federation/runtime'

/**
 * 远程初始化生命周期入口（fulgurjs.config.ts 的 setup 选项声明，README §10）。
 *
 * 演示约定：不写 console——setup/onSession 的每次调用都记录进页面级
 * globalThis.__PC_SETUP_LOG__，由宿主「AppContext 与会话」面板读取展示：
 * - 默认导出 setup：应用级初始化，同一容器只执行一次；
 * - 具名导出 onSession：会话级初始化，按宿主 sessionKey 去重
 *   （宿主切换会话/清空上下文后重新提供 sessionKey 时重跑）。
 */
interface PcSetupLogEntry {
  at: string
  kind: 'setup' | 'onSession'
  sessionKey?: string
  user?: string
}

function appendSetupLog(entry: PcSetupLogEntry): void {
  const g = globalThis as unknown as { __PC_SETUP_LOG__?: PcSetupLogEntry[] }
  g.__PC_SETUP_LOG__ = g.__PC_SETUP_LOG__ ?? []
  g.__PC_SETUP_LOG__.push(entry)
}

/** 默认导出：应用级初始化——全局组件/样式/locale 等真实落点；这里只记录调用事实 */
export default async function setup(context: RemoteSetupContext): Promise<void> {
  appendSetupLog({
    at: new Date().toISOString(),
    kind: 'setup',
    sessionKey: context.sessionKey ?? context.appContext.sessionKey,
    user: typeof context.appContext.user?.name === 'string' ? context.appContext.user.name : undefined,
  })
}

/** 可选具名导出：会话级初始化——真实工程在这里同步用户/权限/字典（await 后先查 signal.aborted） */
export async function onSession(context: RemoteSetupContext): Promise<void> {
  appendSetupLog({
    at: new Date().toISOString(),
    kind: 'onSession',
    sessionKey: context.sessionKey ?? context.appContext.sessionKey,
    user: typeof context.appContext.user?.name === 'string' ? context.appContext.user.name : undefined,
  })
}
