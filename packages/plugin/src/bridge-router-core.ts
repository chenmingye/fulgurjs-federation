/**
 * 跨框架桥接 URL 同步——路由通道内核（URL 同步任务书 §2/§3/§5，/bridge/router/* 共用）。
 *
 * 职责与不变量：
 * - 宿主 Router 是浏览器历史唯一写入方；通道只做逻辑位置换算与仲裁，不触碰 history。
 * - BridgeLocation 三段全等比较；search/hash 原样保留（不 decode/encode，不丢重复键）。
 * - 前缀按路径段匹配：/approval 命中 /approval 与 /approval/...，不命中 /approval-old。
 * - 子应用导航请求串行化 + 请求编号 + 代次校验；宿主取消/外部变化作废在飞请求；
 *   已确认同位置 no-op；内部 replace 有界（MFU-033 超限诊断）。
 * - dispose 后一切订阅/导航失效（迟到通知不作废 URL、不复活子应用）。
 * - KeepAlive：deactivate 置 inactive——暂停广播与写入，不销毁通道（激活后重同步）。
 *
 * 本文件零框架依赖（vue/react/vue-router/react-router 均不得 import，BR12 断言）。
 */
import {
  routingConfigError,
  routingNavigationError,
  routingProtocolError,
  routingSyncError,
} from './bridge-errors'

/** 统一逻辑位置：pathname 以 / 开头；search 空串或 ? 开头；hash 空串或 # 开头 */
export interface BridgeLocation {
  pathname: string
  search: string
  hash: string
}

export type BridgeNavigationResult =
  | { status: 'committed'; location: BridgeLocation }
  | { status: 'cancelled'; location: BridgeLocation }

/** 宿主导航端口（宿主适配器把 Router 包装成本接口；逻辑路径不含部署 base） */
export interface BridgeHostNavigation {
  getLocation(): BridgeLocation
  subscribe(listener: (location: BridgeLocation) => void): () => void
  navigate(target: BridgeLocation, action: 'push' | 'replace'): Promise<BridgeNavigationResult>
  go(delta: number): void
}

/** 子应用路由通道（桥接宿主按挂载代次创建，随 mount 第三参数交给子应用） */
export interface BridgeChildRoute {
  getLocation(): BridgeLocation
  subscribe(listener: (location: BridgeLocation) => void): () => void
  navigate(target: BridgeLocation, action: 'push' | 'replace'): Promise<BridgeNavigationResult>
  go(delta: number): void
}

/** 挂载控制参数（mount 第三参数；不混入业务 props） */
export interface BridgeMountOptions {
  signal?: AbortSignal
  routing?: BridgeChildRoute
}

/** 子应用路由协议声明（defineBridgeApp(工厂, { routing: true }) 时写入） */
export interface BridgeRoutingProtocol {
  protocol: 1
}

/** 宿主组件 routing prop（独立控制通道，不进 appProps/Context） */
export interface BridgeHostRouting {
  /** 宿主路由视角的静态绝对路径，如 "/approval"；同页各同步实例不得相同或重叠 */
  basePath: string
  navigation: BridgeHostNavigation
}

/** 重定向上限（同一通道连续内部 replace 的有界检测） */
export const MAX_REDIRECT_PER_REQUEST = 5

/** go 参数绝对值上限（防御性；超大 delta 无业务意义） */
const MAX_GO_DELTA = 50

/** 规范化 basePath：拒绝空/根/query/hash/协议/通配符；统一去尾斜杠（MFU-030） */
export function normalizeBasePath(basePath: string, spec: string): string {
  const bad = (reason: string): Error => routingConfigError(spec, reason)
  if (typeof basePath !== 'string' || basePath === '') throw bad('basePath 不能为空。')
  if (basePath === '/') throw bad('basePath 不能是根 "/"——根路径属于宿主自身页面，请为同步实例分配独立前缀。')
  if (!basePath.startsWith('/')) throw bad(`basePath 必须以 "/" 开头：当前为 "${basePath}"。`)
  if (/[?#]/.test(basePath) || basePath.includes('://')) throw bad(`basePath 不能包含 query/hash/协议：当前为 "${basePath}"。`)
  if (basePath.includes('*') || basePath.includes(':')) throw bad(`basePath 不接受通配符或参数模板：当前为 "${basePath}"。请使用静态绝对路径。`)
  return basePath.endsWith('/') ? basePath.slice(0, -1) : basePath
}

/** 路径段级前缀匹配：/approval 命中 /approval、/approval/x；不命中 /approval-old */
export function matchesBasePath(hostPathname: string, basePath: string): boolean {
  return hostPathname === basePath || hostPathname.startsWith(basePath + '/')
}

/** 前缀重叠判定（同页登记互斥）：相等或一方为另一方的前缀段 */
export function overlapsBasePath(a: string, b: string): boolean {
  return a === b || a.startsWith(b + '/') || b.startsWith(a + '/')
}

/** 宿主位置 → 子应用位置（去前缀；空段归一为 /） */
export function toChildLocation(host: BridgeLocation, basePath: string): BridgeLocation {
  const rest = host.pathname === basePath ? '/' : host.pathname.slice(basePath.length)
  return { pathname: rest || '/', search: host.search, hash: host.hash }
}

/** 子应用位置 → 宿主位置（拼前缀；/ 归一为 basePath 本身） */
export function toHostLocation(child: BridgeLocation, basePath: string, spec: string): BridgeLocation {
  const childPath = child.pathname === '/' ? '' : child.pathname
  if (childPath !== '' && !childPath.startsWith('/')) {
    throw routingNavigationError(spec, `导航目标 pathname 必须以 "/" 开头：当前为 "${child.pathname}"。`)
  }
  return { pathname: basePath + childPath, search: child.search, hash: child.hash }
}

/** 位置全等（规范化三部分） */
export function sameLocation(a: BridgeLocation, b: BridgeLocation): boolean {
  return a.pathname === b.pathname && a.search === b.search && a.hash === b.hash
}

/** 子应用目标越界守卫（MFU-032）：pathname 不得含 \0、.. 段；换算后必须仍命中前缀 */
export function assertChildTargetInScope(target: BridgeLocation, basePath: string, spec: string): void {
  if (target.pathname.includes('\0') || target.pathname.split('/').includes('..')) {
    throw routingNavigationError(spec, `导航目标试图逃逸自身前缀：pathname "${target.pathname}"。跨前缀导航请通过宿主菜单等宿主能力完成。`)
  }
  const host = toHostLocation(target, basePath, spec)
  if (!matchesBasePath(host.pathname, basePath)) {
    throw routingNavigationError(spec, `导航目标 ${host.pathname} 不在前缀 ${basePath} 下。`)
  }
}

/** 页面级前缀登记（活跃同步实例互斥；dispose 释放）——普通 memory 小部件不受限 */
const activeRoutingPrefixes = new Map<string, number>()

/** 登记前缀（MFU-030：同页已有相同或重叠前缀的活跃通道时拒绝）；返回释放函数 */
export function acquireRoutingPrefix(basePath: string, spec: string): () => void {
  for (const [active] of activeRoutingPrefixes) {
    if ((activeRoutingPrefixes.get(active) ?? 0) > 0 && overlapsBasePath(active, basePath)) {
      throw routingConfigError(spec, `同页已有占用前缀 "${active}" 的同步实例，新实例 "${spec}" 的 basePath "${basePath}" 与其重叠。`)
    }
  }
  activeRoutingPrefixes.set(basePath, (activeRoutingPrefixes.get(basePath) ?? 0) + 1)
  let released = false
  return () => {
    if (released) return
    released = true
    activeRoutingPrefixes.set(basePath, Math.max(0, (activeRoutingPrefixes.get(basePath) ?? 1) - 1))
  }
}

/** 子应用契约的路由协议校验（宿主启用 routing 时必须声明 { routing: { protocol: 1 } }；MFU-031） */
export function assertBridgeRoutingProtocol(spec: string, contract: unknown): void {
  const r = (contract as { routing?: { protocol?: unknown } } | null | undefined)?.routing
  if (!r || r.protocol !== 1) {
    throw routingProtocolError(
      spec,
      `远程契约未声明路由协议（期望 routing: { protocol: 1 }，实际 ${r === undefined ? '缺失' : `protocol=${String(r?.protocol)}`}）。开启 URL 同步不能静默退回 memory 模式。`,
    )
  }
}

/**
 * 路由通道实例：一个已挂载同步实例一条。见文件头不变量。
 */
export class RoutingChannel implements BridgeChildRoute {
  readonly id: string
  readonly basePath: string
  private readonly spec: string
  private readonly host: BridgeHostNavigation
  private readonly listeners = new Set<(loc: BridgeLocation) => void>()
  private current: BridgeLocation
  private lastConfirmed: BridgeLocation
  private seq = 0
  private inflight: { seq: number; target: BridgeLocation; resolve: (r: BridgeNavigationResult) => void } | null = null
  private disposed = false
  private active = true
  private readonly releasePrefix: () => void
  private readonly unsubHost: () => void
  /** 连续内部 replace 计数（有界重定向检测） */
  private redirectChain: string[] = []
  private redirectTimer: ReturnType<typeof setTimeout> | undefined
  /** 诊断观测钩子（测试断言/诊断用） */
  onEvent?: (e: { type: string; [k: string]: unknown }) => void

  constructor(id: string, basePath: string, host: BridgeHostNavigation, spec: string) {
    this.id = id
    this.spec = spec
    this.basePath = normalizeBasePath(basePath, spec)
    this.host = host
    this.current = toChildLocation(host.getLocation(), this.basePath)
    this.lastConfirmed = { ...this.current }
    this.releasePrefix = acquireRoutingPrefix(this.basePath, spec)
    this.unsubHost = host.subscribe((loc) => this.handleHostLocation(loc))
  }

  private emit(loc: BridgeLocation): void {
    this.current = { ...loc }
    for (const l of [...this.listeners]) {
      try {
        l(this.current)
      } catch (e) {
        console.error('[fulgurjs] 子应用路由订阅者异常（已隔离，不影响宿主）：', e)
      }
    }
  }

  private handleHostLocation(hostLoc: BridgeLocation): void {
    if (this.disposed) return
    // 未命中自身前缀：不抢占 URL、不回推默认路径（宿主决定卸载/离页）
    if (!matchesBasePath(hostLoc.pathname, this.basePath)) {
      this.onEvent?.({ type: 'prefix-miss', pathname: hostLoc.pathname })
      return
    }
    // KeepAlive 非当前实例：暂停写入（不广播、不仲裁），激活时重同步
    if (!this.active) {
      this.onEvent?.({ type: 'paused-host-loc' })
      return
    }
    const child = toChildLocation(hostLoc, this.basePath)
    if (this.inflight && sameLocation(child, this.inflight.target)) {
      const { seq, resolve } = this.inflight
      this.inflight = null
      this.lastConfirmed = child
      this.emit(child)
      this.onEvent?.({ type: 'request-confirmed', seq })
      resolve({ status: 'committed', location: { ...child } })
      return
    }
    if (this.inflight) {
      // 外部导航（宿主菜单/地址栏/POP/另一实例）：作废在飞请求，广播权威位置
      const { seq, resolve } = this.inflight
      this.inflight = null
      this.lastConfirmed = child
      this.emit(child)
      this.onEvent?.({ type: 'request-superseded', seq })
      resolve({ status: 'cancelled', location: { ...child } })
      return
    }
    this.lastConfirmed = child
    this.emit(child)
    this.onEvent?.({ type: 'host-broadcast' })
  }

  getLocation(): BridgeLocation {
    return { ...this.current }
  }

  subscribe(listener: (loc: BridgeLocation) => void): () => void {
    if (this.disposed) {
      throw routingProtocolError(this.spec, `通道 ${this.id} 已销毁，不能再订阅（旧实例的迟到订阅必须失效；重挂会得到新通道）。`)
    }
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  async navigate(target: BridgeLocation, action: 'push' | 'replace'): Promise<BridgeNavigationResult> {
    if (this.disposed || !this.active) {
      // 失效通道/暂停实例：拒绝写入，不改 URL（§4.3）
      this.onEvent?.({ type: this.disposed ? 'rejected-disposed' : 'rejected-inactive' })
      return { status: 'cancelled', location: { ...this.lastConfirmed } }
    }
    assertChildTargetInScope(target, this.basePath, this.spec)
    if (sameLocation(target, this.lastConfirmed)) {
      this.onEvent?.({ type: 'noop' })
      return { status: 'committed', location: { ...this.lastConfirmed } }
    }
    // 有界重定向检测：连续内部 replace 超限（MFU-033，附目标链）
    if (action === 'replace') {
      this.redirectChain.push(target.pathname + target.search + target.hash)
    } else {
      this.redirectChain = []
    }
    if (this.redirectTimer) clearTimeout(this.redirectTimer)
    this.redirectTimer = setTimeout(() => {
      this.redirectChain = []
    }, 1000)
    if (this.redirectChain.length > MAX_REDIRECT_PER_REQUEST) {
      const chain = [...this.redirectChain]
      this.redirectChain = []
      throw routingSyncError(this.spec, '同一通道的连续 replace 重定向超过上限（疑似子应用路由互相成环）。', chain)
    }
    // 串行：同实例在飞请求落定后再发（真实时序：排队方承担排队结果）
    if (this.inflight) {
      const prev = this.inflight
      await new Promise<void>((resolve) => {
        const timer = setInterval(() => {
          if (this.inflight !== prev) {
            clearInterval(timer)
            resolve()
          }
        }, 0)
      })
      if (this.disposed || !this.active) {
        return { status: 'cancelled', location: { ...this.lastConfirmed } }
      }
      if (sameLocation(target, this.lastConfirmed)) {
        return { status: 'committed', location: { ...this.lastConfirmed } }
      }
    }
    const seq = ++this.seq
    this.onEvent?.({ type: 'request-start', seq, target: { ...target }, action })
    return new Promise<BridgeNavigationResult>((resolve) => {
      this.inflight = { seq, target: { ...target }, resolve }
      this.host
        .navigate(toHostLocation(target, this.basePath, this.spec), action)
        .then((result) => {
          if (!this.inflight || this.inflight.seq !== seq) return // 广播路径已仲裁
          if (this.disposed || !this.active) {
            this.inflight = null
            resolve({ status: 'cancelled', location: { ...this.lastConfirmed } })
            return
          }
          this.inflight = null
          if (result.status === 'committed') {
            const child = toChildLocation(result.location, this.basePath)
            this.lastConfirmed = child
            this.emit(child)
          } else {
            // 宿主取消：恢复最后确认位置，绝不改写 URL、不自动重试（§5.4）
            this.emit({ ...this.lastConfirmed })
          }
          this.onEvent?.({ type: 'host-verdict', seq, status: result.status })
          resolve(
            result.status === 'committed'
              ? { status: 'committed', location: { ...this.lastConfirmed } }
              : { status: 'cancelled', location: { ...this.lastConfirmed } },
          )
        })
        .catch(() => {
          if (this.inflight?.seq === seq) {
            this.inflight = null
            this.onEvent?.({ type: 'host-error', seq })
            this.emit({ ...this.lastConfirmed })
            resolve({ status: 'cancelled', location: { ...this.lastConfirmed } })
          }
        })
    })
  }

  /** 委托宿主历史（有限整数）；不创建第二条独立历史 */
  go(delta: number): void {
    if (this.disposed || !this.active) return
    if (typeof delta !== 'number' || !Number.isInteger(delta) || Math.abs(delta) > MAX_GO_DELTA) {
      throw routingNavigationError(this.spec, `go 参数必须是有限整数（|delta| ≤ ${MAX_GO_DELTA}）：当前为 ${String(delta)}。`)
    }
    this.host.go(delta)
  }

  /** KeepAlive deactivate：暂停广播与写入；通道与订阅保留（activate 后 resync） */
  setActive(active: boolean): void {
    if (this.disposed) return
    this.active = active
    this.onEvent?.({ type: active ? 'resumed' : 'paused' })
    if (active) this.handleHostLocation(this.host.getLocation())
  }

  /** 挂载生命周期结束：清理订阅/登记/在飞请求；此后一切写入失效 */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    if (this.redirectTimer) clearTimeout(this.redirectTimer)
    this.unsubHost()
    this.releasePrefix()
    if (this.inflight) {
      const { resolve } = this.inflight
      this.inflight = null
      resolve({ status: 'cancelled', location: { ...this.lastConfirmed } })
    }
    this.listeners.clear()
    this.onEvent?.({ type: 'disposed' })
  }
}
