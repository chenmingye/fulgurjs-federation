/**
 * React 子应用桥接适配（/react 导出 defineBridgeApp；任务书 §3.3 D2）。
 *
 * 工厂形态：接收 props 快照，返回 ReactElement；helper 负责 createRoot(el).render(...) /
 * root.unmount() 与按容器 el 的实例跟踪。
 *
 * 首次根提交语义（任务书 §3.2/§3.3，BN02）：
 * - root.render() 返回不代表首次提交完成——helper 用「提交探针 + 首次渲染错误边界」兑现
 *   Promise 语义：mount 的 Promise 在探针 effect（首次提交后触发）时才 resolve；
 * - 首次提交前的渲染错误经错误边界拒绝 mount 并清理 root，宿主转 MFU-016（phase: mount）；
 * - 首次提交后的错误不再由门控吞掉（settled 后原样上抛，交回 React 原生语义），
 *   子应用内部错误由子应用自己的错误边界负责（§4.4）。
 *
 * react-dom/client 在实际 mount 时按需动态取得（BN04/BR01）：
 * 只使用 /react 既有 API 的消费者不因本文件存在而提前加载 react-dom/client 与桥接挂载逻辑。
 *
 * 本文件零 Vue：/react 导入图隔离由 tests/runtime-entry-graph.test.ts 守护。
 */
import { Component, createElement, useEffect, type ReactElement, type ReactNode } from 'react'
import type { BridgeApp } from './bridge-core'
import type { BridgeChildRoute } from './bridge-router-core'

export type { BridgeApp } from './bridge-core'

/** 工厂第二参数：挂载生命周期与路由通道（URL 同步；不混入业务 props） */
export interface ReactBridgeAppContext {
  /** 会话代次信号（登出/换代即 aborted；异步写回前必须检查） */
  signal?: AbortSignal
  /** 路由通道（宿主启用 URL 同步时存在）；配 createReactBridgeRouter 使用 */
  routing?: BridgeChildRoute
}

/** React 子应用工厂：接收挂载时 props 快照与生命周期上下文，返回 ReactElement */
export type ReactBridgeAppFactory = (props: Record<string, unknown>, ctx?: ReactBridgeAppContext) => ReactElement

export interface DefineReactBridgeAppOptions {
  /** 声明路由协议（URL 同步）：契约写入 routing: { protocol: 1 }（缺失时宿主启用同步即 MFU-031） */
  routing?: boolean
}

interface RootEntry {
  /** pending：react-dom/client 动态取得前（尚未创建 root；可被 unmount 直接作废） */
  status: 'pending' | 'live' | 'abort'
  root?: { render(node: ReactNode): void; unmount(): void }
}

/** 按容器 el 的实例跟踪（同一契约对象被页面多处挂载时各实例互不干扰） */
const entriesByEl = new WeakMap<HTMLElement, RootEntry>()

interface GateProps {
  children: ReactNode
  onError: (error: unknown) => void
  /** 首次提交标记（跨 render 读取）：提交前错误拒绝 mount，提交后错误原样重抛 */
  phaseRef: { current: 'pending' | 'committed' }
}

/**
 * 首次提交门控：错误边界只服务于「首次根提交之前」。
 * - 提交前捕获渲染错误 → onError（拒绝 mount），渲染 null 让 React 卸下失败子树；
 * - 提交后（phaseRef = committed）错误原样重抛——宿主错误边界不兜底另一个 root 的
 *   运行期错误（§4.4），此处也不冒充子应用自己的错误边界。
 */
class FirstCommitGate extends Component<GateProps, { error: unknown | null }> {
  override state: { error: unknown | null } = { error: null }

  static getDerivedStateFromError(error: unknown): { error: unknown } {
    return { error }
  }

  override componentDidCatch(error: unknown): void {
    this.props.onError(error)
    if (this.props.phaseRef.current === 'committed') throw error
  }

  override render(): ReactNode {
    if (this.props.phaseRef.current === 'committed') return this.props.children
    return this.state.error === null ? this.props.children : null
  }
}

/** 提交探针：effect 在首次提交完成后触发（StrictMode 双调用由 phase 幂等吸收） */
function CommitProbe({ children, onCommit }: { children?: ReactNode; onCommit: () => void }): ReactNode {
  useEffect(() => {
    onCommit()
    // 提交探针只在首次提交触发一次；onCommit 由 settle 幂等守卫
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return children ?? null
}

/**
 * 定义 React 子应用的桥接契约（远程 ./bridge 模块默认导出）。
 *
 * ```tsx
 * import { MemoryRouter } from 'react-router-dom'
 * import { defineBridgeApp } from '@fulgurjs/federation/react'
 * export default defineBridgeApp((props) => <MemoryRouter><App {...props} /></MemoryRouter>)
 * ```
 */
export function defineBridgeApp(factory: ReactBridgeAppFactory, options: DefineReactBridgeAppOptions = {}): BridgeApp {
  return {
    ...(options.routing ? ({ routing: { protocol: 1 } } as const) : {}),
    mount(el: HTMLElement, props?: Record<string, unknown>, mountOptions?: { signal?: AbortSignal; routing?: BridgeChildRoute }): Promise<void> {
      if (entriesByEl.has(el)) {
        throw new Error('同一容器 el 已挂载本桥接应用（容器已被占用）。同一容器未卸载前重复 mount 是契约违例——先 unmount 再 mount。')
      }
      // 浅拷贝顶层字段（挂载时快照；嵌套对象/函数保留原引用，任务书 §4.2）
      const snapshot = { ...(props ?? {}) }
      const ctx: ReactBridgeAppContext = { signal: mountOptions?.signal, routing: mountOptions?.routing }
      let element: ReactElement
      try {
        element = factory(snapshot, ctx)
      } catch (e) {
        throw e instanceof Error ? e : new Error(String(e))
      }
      if (element === null || typeof element !== 'object') {
        throw new Error(
          `defineBridgeApp 工厂返回值不是 ReactElement（当前 ${element === null ? 'null' : typeof element}）。` +
            '工厂必须返回 ReactElement（JSX/ createElement 的返回值）。',
        )
      }

      // 同步占位：dynamic import 的 await 间隙内到达的 unmount 也能立即作废本轮代次
      const entry: RootEntry = { status: 'pending' }
      entriesByEl.set(el, entry)

      const promise = (async (): Promise<void> => {
        // react-dom/client 实际 mount 时按需取得（共享子路径 singleton 由 shared 配置协商）
        // Vite 6 + React 18 的 CJS 子路径可能只提供 default 命名空间；
        // 与直接 ESM named exports 统一取同一个 renderer，不另加载本地副本。
        type CreateRoot = (el: HTMLElement) => NonNullable<RootEntry['root']>
        const reactDomClient = (await import('react-dom/client')) as {
          createRoot?: CreateRoot; default?: { createRoot?: CreateRoot }
        }
        const createRoot = reactDomClient.createRoot ?? reactDomClient.default?.createRoot
        // dynamic import 期间已被作废：不创建 root（迟到的挂载不得复活，BN06）
        if (entry.status === 'abort' || entriesByEl.get(el) !== entry) return
        if (typeof createRoot !== 'function') throw new Error(
          'react-dom/client 未导出 createRoot。请核对 React 与 renderer 版本及共享子路径配置。',
        )
        const root = createRoot(el)
        entry.root = root
        entry.status = 'live'

        const phaseRef = { current: 'pending' as 'pending' | 'committed' }
        await new Promise<void>((resolve, reject) => {
          let settled = false
          const onError = (e: unknown): void => {
            if (settled) return
            settled = true
            reject(e instanceof Error ? e : new Error(String(e)))
          }
          const onCommit = (): void => {
            if (settled) return
            settled = true
            phaseRef.current = 'committed'
            resolve()
          }
          root.render(
            createElement(
              FirstCommitGate,
              { onError, phaseRef } as GateProps,
              createElement(CommitProbe, { onCommit, children: element }),
            ),
          )
        })
      })()

      return promise.then(
        undefined,
        (e: unknown) => {
          // 首次提交前失败：清理已创建的 root，不留半挂状态；登记解除后原始错误继续向外抛
          if (entry.root && entry.status === 'live') {
            try {
              entry.root.unmount()
            } catch {
              /* 清理失败以原始错误为准 */
            }
          }
          if (entriesByEl.get(el) === entry) entriesByEl.delete(el)
          throw e
        },
      ).then(() => undefined)
      // 说明：调用方（宿主工厂）会 await 本 Promise；上面的 catch-and-rethrow 同时保证
      // 宿主未 await 时（作废后迟到的失败）不会产生未处理拒绝——失败分支已由本链处理。
      // （promise 链最终 resolve 为 void；拒绝路径在宿主 await 处转为占位错误态。）
    },
    unmount(el: HTMLElement): void {
      const entry = entriesByEl.get(el)
      if (!entry) return
      entriesByEl.delete(el)
      // react-dom/client 尚未取得：直接作废，本轮代次不再创建 root
      if (entry.status === 'pending' || !entry.root) {
        entry.status = 'abort'
        return
      }
      entry.status = 'abort'
      try {
        entry.root.unmount()
      } catch (e) {
        throw e instanceof Error ? e : new Error(String(e))
      }
    },
  }
}
