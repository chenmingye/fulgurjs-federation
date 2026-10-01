/**
 * Vue 子应用桥接适配（/runtime 导出 defineBridgeApp；任务书 §3.3 D1/D2）。
 *
 * 工厂形态：接收 props 快照，返回已装配完整的 VueApp（router/pinia 等由子应用自行装配）；
 * helper 负责 app.mount(el) / app.unmount() 与按容器 el 的实例跟踪。
 *
 * 契约语义（§3.2）：
 * - 契约实例按容器 el 分键（WeakMap）：同一契约多处挂载互不干扰；
 * - 同一容器未卸载再次 mount → MFU-016（phase: mount，容器已被占用）且不覆盖原实例；
 * - Vue 的 app.mount 同步完成首次渲染，mount 成功即返回 void（首次根提交语义由 Vue 保证）；
 * - mount 抛错时清理已创建的 app（best-effort unmount），不留半挂状态；
 * - unmount 未知容器为 no-op；unmount 抛错包装为 MFU-016（phase: unmount）由宿主捕获。
 *
 * 本文件零 React：/runtime 导入图隔离由 tests/runtime-entry-graph.test.ts 守护。
 */
import type { App as VueApp } from 'vue'
import type { BridgeApp } from './bridge-core'
import { bridgeLifecycleError } from './bridge-errors'

export type { BridgeApp } from './bridge-core'

/** Vue 子应用工厂：接收挂载时 props 快照，返回装配完成的 VueApp */
export type VueBridgeAppFactory = (props: Record<string, unknown>) => VueApp

/** 按容器 el 的实例跟踪（同一契约对象被页面多处挂载时各实例互不干扰） */
const appsByEl = new WeakMap<HTMLElement, VueApp>()

/**
 * 定义 Vue 子应用的桥接契约（远程 ./bridge 模块默认导出）。
 *
 * ```ts
 * import { createApp } from 'vue'
 * import { defineBridgeApp } from '@fulgurjs/federation/runtime'
 * export default defineBridgeApp((props) => { const app = createApp(App, props); app.use(router); return app })
 * ```
 */
export function defineBridgeApp(factory: VueBridgeAppFactory): BridgeApp {
  return {
    mount(el: HTMLElement, props?: Record<string, unknown>): void {
      if (appsByEl.has(el)) {
        throw bridgeLifecycleError('mount', 'bridge', '同一容器 el 已挂载本桥接应用（容器已被占用）。', {
          reason: 'container-occupied',
        })
      }
      // 浅拷贝顶层字段（挂载时快照；嵌套对象/函数保留原引用，任务书 §4.2）
      const snapshot = { ...(props ?? {}) }
      let app: VueApp | undefined
      try {
        app = factory(snapshot)
        if (!app || typeof app.mount !== 'function' || typeof app.unmount !== 'function') {
          throw new Error(
            `defineBridgeApp 工厂返回值不是 VueApp（当前 ${app === null ? 'null' : typeof app}）；` +
              '工厂必须返回 createApp(...) 创建的应用实例。',
          )
        }
        app.mount(el)
      } catch (e) {
        // 首次挂载失败：清理已创建的 app，不留半挂状态
        if (app) {
          try {
            app.unmount()
          } catch {
            /* 清理失败以原始错误为准 */
          }
        }
        throw bridgeLifecycleError('mount', 'bridge', e instanceof Error ? e : String(e))
      }
      appsByEl.set(el, app)
    },
    unmount(el: HTMLElement): void {
      const app = appsByEl.get(el)
      if (!app) return
      appsByEl.delete(el)
      try {
        app.unmount()
      } catch (e) {
        throw bridgeLifecycleError('unmount', 'bridge', e instanceof Error ? e : String(e))
      }
    },
  }
}
