/** Shared start/stop bookkeeping; framework contracts retain their own rendering semantics. */
import type { BridgeApp } from './bridge-core'

export interface ApplicationHandle {
  element: HTMLElement
  /** Only disposes this start generation; an old handle cannot stop a replacement. */
  unmount(): void
}

export type Application<P extends object> = BridgeApp & { __fgBridgeProps?: P } & {
  start(target: string | HTMLElement, ...props: {} extends P ? [props?: P] : [props: P]): Promise<ApplicationHandle>
}

function waitForStart(result: void | Promise<void>, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (failed: boolean, error?: unknown) => {
      if (settled) return
      settled = true
      signal.removeEventListener('abort', abort)
      if (failed) reject(error)
      else resolve()
    }
    const abort = () => {
      const error = new Error('应用启动已取消。')
      error.name = 'AbortError'
      finish(true, error)
    }
    // Attach the rejection continuation even when already aborted.
    Promise.resolve(result).then(() => finish(false), error => finish(true, error))
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
  })
}

export function createApplication<P extends object>(bridge: BridgeApp, standalone: BridgeApp): Application<P> {
  const entries = new WeakMap<HTMLElement, { controller: AbortController; blocked: boolean }>()
  const blocked = new WeakSet<HTMLElement>()
  const stop = (el: HTMLElement): void => {
    const entry = entries.get(el)
    if (!entry) {
      try { bridge.unmount(el) } catch (error) { blocked.add(el); throw error }
      return
    }
    entry.controller.abort()
    try {
      standalone.unmount(el)
      entries.delete(el)
    } catch (error) {
      entry.blocked = true
      blocked.add(el)
      throw error
    }
  }
  return {
    ...(bridge.routing ? { routing: bridge.routing } : {}),
    mount(el, props, options) {
      if (entries.has(el) || blocked.has(el)) throw new Error('该容器已有独立应用或卸载失败的实例；先正常卸载，卸载失败时整页刷新。')
      return bridge.mount(el, props, options)
    },
    unmount: stop,
    async start(target, ...args) {
      const el = typeof target === 'string' ? document.querySelector(target) : target
      const ElementClass = el?.ownerDocument.defaultView?.HTMLElement
      if (!ElementClass || !(el instanceof ElementClass)) throw new Error(`应用挂载容器不存在或不是 HTMLElement：${typeof target === 'string' ? target : 'target'}`)
      if (entries.has(el) || blocked.has(el)) throw new Error('该容器已有独立应用或卸载失败的实例；不能重复 start。')
      const entry = { controller: new AbortController(), blocked: false }
      entries.set(el, entry)
      try {
        await waitForStart(standalone.mount(el, { ...(args[0] ?? {}) }, { signal: entry.controller.signal }), entry.controller.signal)
        if (entry.controller.signal.aborted || entries.get(el) !== entry) {
          const error = new Error('应用启动已取消，迟到的初始化结果不会重新挂载。')
          error.name = 'AbortError'
          throw error
        }
      } catch (error) {
        if (entries.get(el) === entry && !entry.blocked) entries.delete(el)
        entry.controller.abort()
        throw error
      }
      return { element: el, unmount() { if (entries.get(el) === entry) stop(el) } }
    },
  }
}
