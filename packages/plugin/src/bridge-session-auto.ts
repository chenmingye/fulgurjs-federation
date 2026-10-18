/**
 * @author Jason.chen
 * Vue 桥接的自动登录代次。调用方只提供响应式的业务身份，生成、恢复、换号和登出由插件管理。
 *
 * 不观察 token：同一用户的 token 轮换不应重挂。身份只能是非敏感业务标识，不能传凭据。
 * 同页多个远程共用一个命名空间的记录；存储不可用时仍通过页面镜像保持相同代次。
 * 观察器按身份getter/命名空间复用，生命周期属于宿主页面而非远程视图：离开远程页后登出
 * 也必须清理上下文。业务应提供稳定的store getter，不捕获只在已卸载组件中更新的局部状态。
 */
import { effectScope, ref, shallowRef, watch, type Ref, type ShallowRef } from 'vue'
import { clearAppContext } from './context'

export type BridgeSessionIdentity = string | number | null | undefined
interface SessionRecord { identity: string; sessionKey: string }
const PAGE_RECORDS = /*#__PURE__*/ Symbol.for('@fulgurjs/federation/automatic-sessions')
interface AutomaticSession { sessionKey: Ref<string | null>; error: ShallowRef<unknown> }
const sessions = /*#__PURE__*/ new WeakMap<() => BridgeSessionIdentity, Map<string, AutomaticSession>>()

function records(): Map<string, SessionRecord> {
  const page = globalThis as typeof globalThis & { [key: symbol]: Map<string, SessionRecord> | undefined }
  return page[PAGE_RECORDS] ??= new Map()
}

function normalize(value: BridgeSessionIdentity): string | null | undefined {
  if (value === null || value === undefined) return value
  if ((typeof value !== 'string' && typeof value !== 'number') ||
      (typeof value === 'number' && !Number.isFinite(value)) || !String(value).trim()) {
    throw new TypeError('session 必须同步返回非空用户标识（string/number）、null（已退出）或 undefined（身份初始化中）；不要返回 token、对象或 Promise。')
  }
  return String(value)
}

/** 内部使用；不增加公共导入入口，不要求应用新建 session.ts。 */
export function createAutomaticBridgeSession(getIdentity: () => BridgeSessionIdentity, namespace: string): AutomaticSession {
  const key = `${namespace}:auto`
  const cached = sessions.get(getIdentity)?.get(key)
  if (cached) return cached
  const sessionKey = ref<string | null>(null)
  const error = shallowRef<unknown>()
  const state = { sessionKey, error }
  const entries = sessions.get(getIdentity) ?? new Map<string, AutomaticSession>()
  entries.set(key, state)
  sessions.set(getIdentity, entries)
  const read = (): SessionRecord | undefined => {
    const memory = records().get(key)
    if (memory) return memory
    try {
      const saved: unknown = JSON.parse(sessionStorage.getItem(key) ?? 'null')
      if (saved && typeof saved === 'object' && 'identity' in saved && 'sessionKey' in saved &&
          typeof saved.identity === 'string' && typeof saved.sessionKey === 'string' && saved.sessionKey) {
        const record = { identity: saved.identity, sessionKey: saved.sessionKey }
        records().set(key, record)
        return record
      }
    } catch { /* 隐私模式或损坏缓存不阻断登录；接下来创建新代次。 */ }
  }
  const save = (record: SessionRecord | undefined): void => {
    if (record) records().set(key, record)
    else records().delete(key)
    try {
      if (record) sessionStorage.setItem(key, JSON.stringify(record))
      else sessionStorage.removeItem(key)
    } catch { /* 内存镜像仍保证同页多个远程一致。 */ }
  }
  const clearOwnedContext = (record: SessionRecord | undefined): void => {
    // 不清其他认证命名空间的上下文；clearAppContext 同时取消旧onSession任务。
    const context = (globalThis as { __FULGURJS_APP_CONFIG__?: { sessionKey?: string } }).__FULGURJS_APP_CONFIG__
    if (record && context?.sessionKey === record.sessionKey) clearAppContext()
  }
  effectScope(true).run(() => watch(() => {
    try { return { identity: normalize(getIdentity()), error: undefined } }
    catch (cause) { return { identity: undefined, error: cause ?? new Error('session getter 抛出了空错误值。') } }
  }, (snapshot) => {
    const saved = read()
    error.value = snapshot.error
    if (snapshot.identity === undefined) {
      // 尚未恢复用户资料时不挂载，也不抹掉刷新前保存的合法身份记录。
      sessionKey.value = null
      clearOwnedContext(saved)
      return
    }
    if (snapshot.identity === null) {
      save(undefined)
      sessionKey.value = null
      clearOwnedContext(saved)
      return
    }
    const record = saved?.identity === snapshot.identity ? saved : {
      identity: snapshot.identity,
      sessionKey: `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    }
    if (record !== saved) save(record)
    sessionKey.value = record.sessionKey
  }, { immediate: true, flush: 'sync' }))
  return state
}
