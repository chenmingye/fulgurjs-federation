/**
 * Vue 子应用桥接适配（/runtime 导出 defineBridgeApp；任务书 §3.3 D1/D2）。
 *
 * 工厂形态：接收 props 快照，返回已装配完整的 VueApp（router/pinia 等由子应用自行装配）；
 * helper 负责 app.mount(el) / app.unmount() 与按容器 el 的实例跟踪。
 *
 * 契约语义（§3.2）：
 * - 契约实例按容器 el 分键（WeakMap）：同一契约多处挂载互不干扰；
 * - 同一容器未卸载再次 mount → 拒绝（容器占用，原始错误原样抛出）且不覆盖原实例；
 * - Vue 的 app.mount 同步完成首次渲染，mount 成功即返回 void（首次根提交语义由 Vue 保证）；
 * - mount 抛错时清理已创建的 app（best-effort unmount），不留半挂状态；
 * - unmount 未知容器为 no-op；mount/unmount 的原始错误**原样抛出**——MFU-016 包装
 *   （真实 spec + phase + cause）由宿主适配器在生命周期边界统一完成（见 bridgeHostError）。
 *
 * 本文件零 React：/runtime 导入图隔离由 tests/runtime-entry-graph.test.ts 守护。
 */
import type { App as VueApp } from 'vue'
import type { BridgeApp } from './bridge-core'
import type { BridgeChildRoute } from './bridge-router-core'

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
 * 允许返回 Promise<VueApp>（URL 同步子应用的初始 memory 路由准备是异步的——
 * 必须等初始 push 落定再 app.use(router)，否则 install 的初始导航会覆盖深链位置；
 * 见 /bridge/router/vue 的 connectVueBridgeRouter 与任务书 §1 原型结论 1）。
 * Promise 被作废（signal aborted / 容器已换代）时结果丢弃，不落挂。
 */
export type VueBridgeAppFactory = (
  props: Record<string, unknown>,
  ctx?: VueBridgeAppContext,
) => VueApp | Promise<VueApp>

export interface DefineVueBridgeAppOptions {
  /**
   * 声明路由协议（URL 同步）：契约写入 routing: { protocol: 1 }，宿主启用 routing 时
   * 校验；未声明而宿主启用同步 → MFU-031（不静默退回 memory 假装深链成功）。
   */
  routing?: boolean
}

/** 按容器 el 的实例跟踪（同一契约对象被页面多处挂载时各实例互不干扰） */
const appsByEl = new WeakMap<HTMLElement, VueApp>()

/** 异步工厂挂起占位：占用容器（拒绝并发重复 mount）且可被 unmount 作废 */
const PENDING_MARKER = { __fulgurjsPending: true }

/** 容器挂起态被作废（unmount 已到/标记被清除） */
function entriesAborted(el: HTMLElement): boolean {
  return appsByEl.get(el) !== (PENDING_MARKER as unknown as VueApp)
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
export function defineBridgeApp(factory: VueBridgeAppFactory, options: DefineVueBridgeAppOptions = {}): BridgeApp {
  const attach = (el: HTMLElement, app: VueApp, mountOptions?: { signal?: AbortSignal; routing?: BridgeChildRoute }): void => {
    if (!app || typeof app.mount !== 'function' || typeof app.unmount !== 'function') {
      throw new Error(
        `defineBridgeApp 工厂返回值不是 VueApp（当前 ${app === null ? 'null' : typeof app}）；` +
          '工厂必须返回 createApp(...) 创建的应用实例。',
      )
    }
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
    appsByEl.set(el, app)
    void mountOptions
  }
  return {
    ...(options.routing ? ({ routing: { protocol: 1 } } as const) : {}),
    // 同步工厂保持同步语义（容器占用/工厂抛错同步抛，BN03/BN02 口径不变）；
    // Promise 工厂（URL 同步初始路由准备）走异步续体：挂起期间作废（signal aborted）
    // 则结果丢弃不落挂（迟到初始化不得复活，BN06 同源语义）。
    mount(el: HTMLElement, props?: Record<string, unknown>, mountOptions?: { signal?: AbortSignal; routing?: BridgeChildRoute }): void | Promise<void> {
      if (appsByEl.has(el)) {
        throw new Error('同一容器 el 已挂载本桥接应用（容器已被占用）。同一容器未卸载前重复 mount 是契约违例——先 unmount 再 mount。')
      }
      // 浅拷贝顶层字段（挂载时快照；嵌套对象/函数保留原引用，任务书 §4.2）
      const snapshot = { ...(props ?? {}) }
      const ctx: VueBridgeAppContext = { signal: mountOptions?.signal, routing: mountOptions?.routing }
      let app: VueApp | undefined
      try {
        const produced = factory(snapshot, ctx)
        const thenable = (produced as { then?: unknown }).then
        if (typeof thenable === 'function') {
          // 异步工厂：注册占位防并发重复 mount；作废后结果丢弃
          appsByEl.set(el, PENDING_MARKER as unknown as VueApp)
          return (produced as Promise<VueApp>).then(
            (resolved: VueApp) => {
              if (entriesAborted(el)) return
              attach(el, resolved, mountOptions)
            },
            (e: unknown) => {
              if (entriesAborted(el)) return
              appsByEl.delete(el)
              throw e
            },
          )
        }
        app = produced as VueApp
      } catch (e) {
        // 首次挂载失败：清理已创建的 app，不留半挂状态
        if (app) {
          try {
            app.unmount()
          } catch {
            /* 清理失败以原始错误为准 */
          }
        }
        throw e
      }
      attach(el, app, mountOptions)
    },
    unmount(el: HTMLElement): void {
      const app = appsByEl.get(el)
      if (!app) return
      appsByEl.delete(el)
      if (app === (PENDING_MARKER as unknown as VueApp)) return // 异步工厂挂起中：仅作废，不触真实实例
      try {
        app.unmount()
      } catch (e) {
        throw e instanceof Error ? e : new Error(String(e))
      }
    },
  }
}
