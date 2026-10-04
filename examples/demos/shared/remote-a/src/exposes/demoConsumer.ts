/**
 * 共享消费探针（exposes['./demo-consumer']）：在 remote-a 的模块里用 loadShare
 * 消费宿主注册的共享键（演示卡片⑦ lib-alias 与卡片⑨ demo-share）。
 * loadShare 经页面级运行时单例执行——找到的正是宿主 registerShare 写入的条目。
 */
import { loadShare } from '@fulgurjs/federation/runtime'

export interface ShareConsumeResult {
  ok: boolean
  shareKey: string
  data?: unknown
  error?: string
}

/** 消费宿主以 shareKey 'lib-alias' 注册的本地模块（host/src/main.ts registerShare） */
export async function consumeLibAlias(): Promise<ShareConsumeResult> {
  try {
    const ns = (await loadShare('lib-alias')) as {
      LIB_ALIAS_VERSION?: string
      PROVIDED_BY?: string
      greet?: (name: string) => string
    }
    return {
      ok: true,
      shareKey: 'lib-alias',
      data: {
        LIB_ALIAS_VERSION: ns.LIB_ALIAS_VERSION,
        PROVIDED_BY: ns.PROVIDED_BY,
        greet: ns.greet?.('sh-remote-a 消费方'),
      },
    }
  } catch (err) {
    return { ok: false, shareKey: 'lib-alias', error: String((err as Error)?.message ?? err) }
  }
}

/** 消费宿主页面在卡片⑨运行时注册的 demo-share（registerShare + 动态 get） */
export async function consumeDemoShare(): Promise<ShareConsumeResult> {
  try {
    const value = await loadShare('demo-share')
    return { ok: true, shareKey: 'demo-share', data: value }
  } catch (err) {
    return { ok: false, shareKey: 'demo-share', error: String((err as Error)?.message ?? err) }
  }
}
