import { provideAppContext, clearAppContext, getAppContext } from '@fulgurjs/federation/vue'

/**
 * 宿主桥的演示实现（真实工程见 README §9 的 bridge.ts 形态）：
 * 登录态经 provideAppContext 写入页面级单例（幂等 merge，可多次调用）；
 * 退出/清空走 clearAppContext（同时作废远程会话信号与 onSession 去重状态）。
 * 演示只提供远程页面真实消费的键（README §9：只传有真实消费的键），
 * token 是标注清楚的假值，不是真实凭证。
 */
function buildDemoContext(sessionKey: string): Record<string, unknown> {
  return {
    user: { id: 'u-1001', name: '演示用户' },
    getToken: () => 'demo-not-a-real-token',
    locale: 'zh-CN',
    sessionKey,
    events: {
      main: {
        getDictItems: (code: string) => [{ label: `演示字典项（${code}）`, value: 'demo' }],
      },
    },
  }
}

/** 提供演示 context；缺省生成新的登录代次（真实工程由登录流程生成，非敏感、禁止用 token 充当） */
export function provideDemoContext(sessionKey = `s-demo-${Date.now().toString(36)}`): string {
  provideAppContext(buildDemoContext(sessionKey))
  return sessionKey
}

export function clearDemoContext(): void {
  clearAppContext()
}

export function currentSessionKey(): string | undefined {
  return getAppContext().sessionKey
}
