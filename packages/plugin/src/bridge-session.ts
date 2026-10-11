/**
 * 宿主侧 sessionKey 生命周期（/vue 导出 createBridgeSession）。
 *
 * sessionKey 是插件 AppContext 的契约字段：非敏感登录代次 ID（禁止用 token 充当）、
 * 同一会话内（含 token 刷新、页面刷新）保持不变、退出登录置 null。此前每个宿主手写
 * ref + sessionStorage + renew/clear，值形态与持久化语义全靠自觉——本助手把契约语义
 * 收进插件，宿主只决定「何时」renew/clear（登录成功/退出登录）。
 *
 * 持久化（sessionStorage）：刷新页面后代次不变（同会话重进不重复初始化），关闭标签页
 * 自然作废。存储不可用（隐私模式等）时静默退化为纯内存——登出/换号不受影响，刷新后
 * 回到未登录态，不抛错。
 */
import { ref, type Ref } from 'vue'

/** createBridgeSession 返回的会话代次管理器 */
export interface BridgeSession {
  /** 当前登录代次（null = 未登录/已退出）；绑定给桥接组件的 :session-key */
  sessionKey: Ref<string | null>
  /**
   * 生成新的登录代次并持久化。登录成功后调用；已登录代次上再次调用 = 强制换号
   * （桥接组件换值重走完整加载链）。返回新代次值。
   */
  renew(): string
  /** 清除登录代次（退出登录）。桥接组件收到 null 立即卸载子应用并停止加载。 */
  clear(): void
}

/** 默认存储键；嵌套宿主（B 同时是子应用与宿主）同页并存时各传不同 storageKey */
const DEFAULT_STORAGE_KEY = 'fulgurjs-bridge-session'

/** 生成非敏感代次 ID（时间戳 36 进制 + 随机段；与用户/token 无任何派生关系） */
function newSessionId(): string {
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * 创建宿主会话代次管理器（模块级创建一次，登录流程调用 renew/clear）。
 *
 * @param options.storageKey sessionStorage 键名（默认 'fulgurjs-bridge-session'）；
 *   同页多宿主（嵌套桥接）必须各传不同键，避免刷新恢复时互相覆盖。
 */
export function createBridgeSession(options: { storageKey?: string } = {}): BridgeSession {
  const storageKey = options.storageKey ?? DEFAULT_STORAGE_KEY
  const readStored = (): string | null => {
    try {
      return sessionStorage.getItem(storageKey)
    } catch {
      return null
    }
  }
  const persist = (id: string | null): void => {
    try {
      if (id === null) sessionStorage.removeItem(storageKey)
      else sessionStorage.setItem(storageKey, id)
    } catch {
      /* 存储不可用：退化为纯内存（见文件头说明） */
    }
  }
  const sessionKey = ref<string | null>(readStored())
  return {
    sessionKey,
    renew() {
      const id = newSessionId()
      sessionKey.value = id
      persist(id)
      return id
    },
    clear() {
      sessionKey.value = null
      persist(null)
    },
  }
}
