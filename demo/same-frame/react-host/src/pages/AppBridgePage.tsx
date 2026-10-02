import { useCallback, useRef, useState, useSyncExternalStore } from 'react'
import { clearAppContext } from '@fulgurjs/federation/react'
import { createReactBridgeApp } from '@fulgurjs/federation/bridge/react'
import IdentityBadges from '../components/IdentityBadges'
import DiagnosticsPanel from '../components/DiagnosticsPanel'
import { diagStore, countMount, countSessionSwitch, countUnmount, logDiag } from '../diagnostics'
import { currentSession, getLatestHostContext, login } from '../host-session'

// 工厂放模块顶层（不能在 render 内重复调用工厂）：
// retries 透传 loadRemote；getContext 在每次实际加载前同步取最新快照（纯 getter）
const BridgeApp = createReactBridgeApp('sf-react-remote/bridge', {
  retries: 1,
  getContext: () => getLatestHostContext(),
})

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}

let sessionSeq = 1

/**
 * 页面2 · 应用级桥接：createReactBridgeApp 挂载完整子应用（sf-react-remote/bridge）。
 * 含会话演示：
 * - provideAppContext 快照（用户名可输入，经 getContext 同步 getter 提供）；
 * - 「切换会话」受控顺序：sessionKey→null 等卸载 → clearAppContext → 新快照 → 新 sessionKey；
 * - 「卸载再挂载」：mount/unmount 计数由子应用 onReady/onGone 真实回调推进。
 */
export default function AppBridgePage() {
  const initial = currentSession()
  /** 桥接受控控制参数：非空字符串 = 登录代次；null = 登出态（空容器） */
  const [sessionKey, setSessionKey] = useState<string | null>(initial.key)
  /** 用户名输入（作为下一次快照的 user.name） */
  const [inputName, setInputName] = useState(initial.user.name)
  /** 当前会话代次 key（卸载再挂载时恢复同一 key） */
  const activeKeyRef = useRef<string>(initial.key ?? 'session-1-alice')
  const diag = useSyncExternalStore(diagStore.subscribe, diagStore.getSnapshot)

  const handleReady = useCallback((): void => {
    countMount()
    logDiag('child', '子应用 onReady：挂载完成（首次根提交）')
  }, [])

  const handleGone = useCallback((): void => {
    countUnmount()
    logDiag('child', '子应用 onGone：已卸载（容器由桥接管控）')
  }, [])

  // 换会话受控顺序（README §8.2）：sessionKey→null 等卸载 → clearAppContext → 新快照 → 新 sessionKey
  const handleSwitchSession = async (): Promise<void> => {
    logDiag('host', '切换会话开始：sessionKey → null（等待卸载）')
    setSessionKey(null)
    await nextFrame()
    clearAppContext()
    logDiag('host', 'clearAppContext 完成（旧会话快照与去重状态已清理）')
    sessionSeq += 1
    const name = inputName.trim() || '未命名用户'
    const key = `session-${sessionSeq}-${name}`
    login(key, { id: sessionSeq, name })
    activeKeyRef.current = key
    countSessionSwitch()
    logDiag('host', `新快照就绪：sessionKey=${key}，user=${name}`)
    setSessionKey(key)
    logDiag('host', 'sessionKey 更新 → 桥接按新代次重挂（getContext → provideAppContext → loadRemote → mount）')
  }

  // 卸载再挂载：null 等卸载（容器保持空）→ 恢复同一 sessionKey（模块缓存复用，不重复下载）
  const handleRemount = async (): Promise<void> => {
    logDiag('host', `卸载再挂载：sessionKey → null（当前 key=${activeKeyRef.current}）`)
    setSessionKey(null)
    await nextFrame()
    logDiag('host', '已卸载（容器保持空）；重新赋同一 sessionKey')
    setSessionKey(activeKeyRef.current)
    logDiag('host', 'sessionKey 恢复 → 桥接重挂')
  }

  return (
    <section>
      <h2>页面2 · 应用级桥接（createReactBridgeApp 挂载完整子应用）</h2>
      <IdentityBadges hostName="sf-react-host" framework="React" remoteName="sf-react-remote" remoteFramework="React" />
      <p className="sfh-note">
        子应用自带 memory 路由（工单列表/详情/编辑，createMemoryRouter）与本地状态，整站挂载/卸载；
        内部导航不写宿主 URL。受控会话：sessionKey 变化驱动卸载/重挂与 AppContext 快照写入。
        未启用 StrictMode：让 mount/unmount 计数与 Vue 宿主一一对应（桥接契约对两种模式都安全）。
      </p>
      <p className="sfh-toolbar" data-testid="demo-session">
        {'当前 sessionKey：'}
        <code>{sessionKey ?? '未登录（空容器）'}</code>
        {` · mount ${diag.mountCount} · unmount ${diag.unmountCount}`}
      </p>
      <div className="sfh-toolbar">
        <label>
          {'用户名快照 '}
          <input value={inputName} data-testid="demo-username" onChange={(e) => setInputName(e.target.value)} />
        </label>
        <button data-testid="demo-switch" onClick={() => void handleSwitchSession()}>
          切换会话（null → clearAppContext → 新快照 → 新 key）
        </button>
        <button className="sfh-btn-secondary" data-testid="demo-remount" onClick={() => void handleRemount()}>
          卸载再挂载
        </button>
      </div>
      <section className="sfh-bridge-area">
        <BridgeApp
          sessionKey={sessionKey}
          appProps={{ label: '来自 sf-react-host 的 appProps 快照', onReady: handleReady, onGone: handleGone }}
        />
      </section>
      <DiagnosticsPanel note="计数推进来源：子应用布局组件 effect/cleanup 回调（真实生命周期）；日志包含宿主会话操作与 runtime 错误事件。" />
    </section>
  )
}
