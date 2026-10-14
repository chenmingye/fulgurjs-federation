/**
 * Vue 子应用桥接适配（/vue 导出 defineBridgeApp 与 defineApplication）。
 *
 * 工厂返回 VueApp，或已装配业务插件与守卫的 { app, router }；后者自动接线 memory
 * router、等待初始导航再安装。helper 管理挂载/卸载及每容器每代次的路由释放。
 *
 * 契约语义（§3.2）：
 * - 契约实例按容器 el 分键（WeakMap）：同一契约多处挂载互不干扰；
 * - 同一容器未卸载再次 mount → 拒绝（容器占用，原始错误原样抛出）且不覆盖原实例；
 * - Vue 的 app.mount 同步完成首次渲染，mount 成功即返回 void（首次根提交语义由 Vue 保证）；
 * - mount 抛错时清理已创建的 app（best-effort unmount），不留半挂状态；
 * - unmount 未知容器为 no-op；mount/unmount 的原始错误**原样抛出**——MFU-016 包装
 *   （真实 spec + phase + cause）由宿主适配器在生命周期边界统一完成（见 bridgeHostError）。
 *
 * 本文件零 React：/vue 导入图隔离由 tests/runtime-entry-graph.test.ts 守护。
 */
import type { App as VueApp } from 'vue'
import { markBridgeMount } from './bridge-core'
import type { BridgeApp } from './bridge-core'
import type { BridgeChildRoute, VueRouterLike } from './bridge-router-core'
import { installVueBridgeRouter, type VueBridgeRouterConnection } from './bridge-router-vue'
import { createApplication, type Application } from './application-core'

export type { BridgeApp } from './bridge-core'

/** 工厂第二参数：挂载生命周期与路由通道（URL 同步；不混入业务 props） */
export interface VueBridgeAppContext {
  /** 会话代次信号（登出/换代即 aborted；异步写回前必须检查） */
  signal?: AbortSignal
  /** 路由通道（宿主启用 URL 同步时存在）；配 connectVueBridgeRouter 使用 */
  routing?: BridgeChildRoute
}

/**
 * Vue 子应用工厂：接收挂载时 props 快照与生命周期上下文，返回装配完成的 VueApp。
 * 可异步返回；{ app, router } 形态由插件保证初始位置落定后才安装 router。
 * Promise 被作废（signal aborted / 容器已换代）时结果丢弃，不落挂。
 */
/** 已装配业务插件与守卫的 app + 尚未 app.use 的 memory router；插件负责接线及释放。 */
export interface VueBridgeAppSetup {
  app: VueApp
  router: VueRouterLike
}

export type VueBridgeAppFactory<P = Record<string, unknown>> = (
  props: P,
  ctx?: VueBridgeAppContext,
) => VueApp | VueBridgeAppSetup | Promise<VueApp | VueBridgeAppSetup>

/**
 * 桥接 props 的类型标记（phantom）：defineBridgeApp<P> 把工厂声明的 props 类型
 * 附加到返回契约的类型面上（运行时对象不带该字段）。宿主侧 createVueBridgeApp
 * 经注册表提取为包装组件的 appProps 类型；未声明具体 P 的远程保持
 * Record<string, unknown>（诚实通用面，绝不凭空推导业务字段）。
 */
export type FgBridgePropsMarker<P extends object> = { __fgBridgeProps?: P }

export interface DefineVueBridgeAppOptions {
  /**
   * 声明路由协议（URL 同步）：契约写入 routing: { protocol: 1 }，宿主启用 routing 时
   * 校验；未声明而宿主启用同步 → MFU-031（不静默退回 memory 假装深链成功）。
   */
  routing?: boolean
}

/** 按容器 el 的实例跟踪（同一契约对象被页面多处挂载时各实例互不干扰） */
interface VueBridgeInstance {
  owner: symbol
  app?: VueApp
  mounted: boolean
  controller: AbortController
  connection?: VueBridgeRouterConnection
  cleanupPending?: () => void
  cleanupFailure?: { error: unknown }
  removeAbortListener(): void
}
// 每次挂载都有独立对象；不能用同一个 pending 标志，否则旧工厂可能覆盖新代次。
const appsByEl = new WeakMap<HTMLElement, VueBridgeInstance>()

function isAppSetup(result: unknown): result is VueBridgeAppSetup {
  return !!result && typeof result === 'object' && 'app' in result && 'router' in result
}

/**
 * 定义 Vue 子应用的桥接契约（远程 ./bridge 模块默认导出）。
 *
 * ```ts
 * import { createApp } from 'vue'
 * import { defineBridgeApp } from '@fulgurjs/federation/vue'
 * export default defineBridgeApp((props) => { const app = createApp(App, props); app.use(router); return app })
 * ```
 */
export function defineBridgeApp<P extends object = Record<string, unknown>>(
  factory: VueBridgeAppFactory<P>,
  options: DefineVueBridgeAppOptions = {},
): BridgeApp & FgBridgePropsMarker<P> {
  return createVueAppContract(factory, options, 'bridge')
}

export interface VueApplicationContext extends VueBridgeAppContext {
  mode: 'standalone' | 'bridge'
  /** Always present; aborts when this application instance is stopped. */
  signal: AbortSignal
}

export interface VueApplicationSetup extends VueBridgeAppSetup {
  router: VueRouterLike & { install(app: VueApp): void; isReady(): Promise<void> }
}

export type VueApplicationFactory<P = Record<string, unknown>> = (
  props: P, context: VueApplicationContext,
) => VueApp | VueApplicationSetup | Promise<VueApp | VueApplicationSetup>

/** One assembly function for the standalone entry and the exposed application. */
export function defineApplication<P extends object = Record<string, unknown>>(
  factory: VueApplicationFactory<P>,
  options: DefineVueBridgeAppOptions = {},
): Application<P> {
  const contract = (mode: VueApplicationContext['mode']) => createVueAppContract<P>((props, ctx) => {
    const context: VueApplicationContext = { ...ctx, mode, signal: ctx!.signal! }
    if (mode === 'bridge') markBridgeMount(context)
    return factory(props, context)
  }, options, mode, true)
  return createApplication<P>(contract('bridge'), contract('standalone'))
}

function createVueAppContract<P extends object>(
  factory: VueBridgeAppFactory<P>, options: DefineVueBridgeAppOptions,
  mode: 'standalone' | 'bridge',
  localRouter = false,
): BridgeApp & FgBridgePropsMarker<P> {
  const owner = Symbol('vue-application')
  const attach = (el: HTMLElement, app: VueApp, instance: VueBridgeInstance): void => {
    if (!app || typeof app.mount !== 'function' || typeof app.unmount !== 'function') {
      throw new Error(
        `defineBridgeApp 工厂返回值不是 VueApp（当前 ${app === null ? 'null' : typeof app}）；` +
          '工厂必须返回 createApp(...) 创建的应用实例。',
      )
    }
    instance.app = app
    if (mode === 'bridge') markBridgeMount(app)
    try {
      app.mount(el)
    } catch (e) {
      try {
        app.unmount()
      } catch {
        /* 清理失败以原始错误为准 */
      }
      throw e
    }
    instance.mounted = true
  }
  return {
    ...(mode === 'bridge' && options.routing ? ({ routing: { protocol: 1 } } as const) : {}),
    // 同步工厂保持同步语义（容器占用/工厂抛错同步抛，BN03/BN02 口径不变）；
    // Promise 工厂（URL 同步初始路由准备）走异步续体：挂起期间作废（signal aborted）
    // 则结果丢弃不落挂（迟到初始化不得复活，BN06 同源语义）。
    mount(el: HTMLElement, props?: Record<string, unknown>, mountOptions?: { signal?: AbortSignal; routing?: BridgeChildRoute }): void | Promise<void> {
      if (appsByEl.has(el)) {
        throw new Error('同一容器 el 已挂载本桥接应用（容器已被占用）。同一容器未卸载前重复 mount 是契约违例——先 unmount 再 mount。')
      }
      // 浅拷贝顶层字段（挂载时快照；嵌套对象/函数保留原引用，任务书 §4.2）
      const snapshot = { ...(props ?? {}) }
      const controller = new AbortController()
      const ctx: VueBridgeAppContext = { signal: controller.signal, routing: mountOptions?.routing }
      if (mode === 'bridge') markBridgeMount(ctx)
      const abort = () => controller.abort()
      mountOptions?.signal?.addEventListener('abort', abort, { once: true })
      if (mountOptions?.signal?.aborted) controller.abort()
      const instance: VueBridgeInstance = {
        owner, mounted: false, controller,
        removeAbortListener: () => mountOptions?.signal?.removeEventListener('abort', abort),
      }
      controller.signal.addEventListener('abort', () => {
        if (!instance.mounted) instance.cleanupPending?.()
      }, { once: true })
      appsByEl.set(el, instance)
      const active = () => appsByEl.get(el) === instance && !controller.signal.aborted
      const fail = (error: unknown): void => {
        instance.connection?.dispose()
        instance.cleanupPending?.()
        instance.cleanupPending = undefined
        instance.removeAbortListener()
        controller.abort()
        if (appsByEl.get(el) === instance) appsByEl.delete(el)
        throw error
      }
      const prepare = async (result: VueApp | VueBridgeAppSetup): Promise<void> => {
        if (!active()) return
        try {
          if (isAppSetup(result)) {
            if (mode === 'bridge' && !options.routing && !localRouter) {
              throw new Error('defineBridgeApp 返回 { app, router } 时必须声明 { routing: true }；router 应使用 createMemoryHistory()，不要提前 app.use(router)。')
            }
            if (mode === 'bridge' && options.routing) {
              markBridgeMount(result.app)
              instance.connection = await installVueBridgeRouter(result.app, result.router, {
                routing: ctx.routing, signal: controller.signal,
              })
            } else {
              const router = result.router as VueRouterLike & { install?: unknown; isReady?: () => Promise<void> }
              if (typeof router.install !== 'function' || typeof router.isReady !== 'function') {
                throw new Error('本地路由装配必须返回实际 vue-router 实例；不要返回导航端口或已安装到其他 app 的 router。')
              }
              result.app.use(result.router as Parameters<VueApp['use']>[0])
              const history = (router as { options?: { history?: { destroy?: () => void } } }).options?.history
              let cleaned = false
              instance.cleanupPending = () => {
                if (cleaned) return
                cleaned = true
                try { history?.destroy?.() } catch (error) { instance.cleanupFailure = { error } }
              }
              await router.isReady()
            }
            if (!active()) { instance.connection?.dispose(); instance.cleanupPending?.(); return }
            attach(el, result.app, instance)
            instance.cleanupPending = undefined
          } else {
            attach(el, result as VueApp, instance)
          }
        } catch (error) {
          if (!active()) return
          fail(error)
        }
      }
      try {
        if (controller.signal.aborted) {
          instance.removeAbortListener()
          if (appsByEl.get(el) === instance) appsByEl.delete(el)
          return
        }
        const produced = factory(snapshot as P, ctx)
        const thenable = (produced as { then?: unknown } | null)?.then
        if (typeof thenable === 'function') {
          // 异步工厂：注册占位防并发重复 mount；作废后结果丢弃
          return Promise.resolve(produced).then(
            (resolved) => prepare(resolved),
            (e: unknown) => {
              if (!active()) return
              fail(e)
            },
          )
        }
        if (isAppSetup(produced)) return prepare(produced)
        if (active()) attach(el, produced as VueApp, instance)
      } catch (e) {
        // 首次挂载失败：清理已创建的 app，不留半挂状态
        fail(e)
      }
    },
    unmount(el: HTMLElement): void {
      const instance = appsByEl.get(el)
      if (!instance || instance.owner !== owner) return
      appsByEl.delete(el)
      instance.controller.abort()
      instance.removeAbortListener()
      instance.connection?.dispose()
      if (instance.cleanupFailure) throw instance.cleanupFailure.error
      if (!instance.mounted) return
      try {
        instance.app!.unmount()
      } catch (e) {
        throw e instanceof Error ? e : new Error(String(e))
      }
    },
  }
}
