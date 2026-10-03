/**
 * demo/bridge-router/react-host/src/pages/BridgeVuePage.tsx — 桥接演示页（React 宿主 × Vue 子应用）。
 * createReactBridgeApp + routing prop（basePath=/br-vue + createReactBridgeNavigation 端口）；
 * catch-all 路由（/br-vue/* 单条记录）保证子应用内部导航不重挂本组件；
 * appProps 携带稳定回调供子应用上报事件。
 */
import { useState } from 'react'
import type { ChangeEvent, ReactElement } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { createReactBridgeApp } from '@fulgurjs/federation/bridge/react'
import { BRIDGE_BASE_PATH, getBridgeRouting } from '../routing'
import { handleChildEvent, logNav } from '../demo-log'
import ObsPanel from '../ObsPanel'

const RemoteVueBridge = createReactBridgeApp('vue-remote/bridge', { retries: 1 })
const appProps = { onChildEvent: handleChildEvent }

export default function BridgeVuePage(): ReactElement {
  // 端口在 main.tsx 的 initBridgeRouting(router) 之后才可用——必须在组件渲染期取，
  // 不能放到模块顶层（main.tsx 静态 import 本模块早于 initBridgeRouting 执行）。
  // getBridgeRouting 返回模块级单例，引用跨重渲染稳定 → routing 键不变，子应用不重挂。
  const routing = getBridgeRouting()
  const navigate = useNavigate()
  const location = useLocation()
  const [deepLink, setDeepLink] = useState(`${window.location.origin}${BRIDGE_BASE_PATH}/orders?q=网络&page=2`)
  const [deepLinkError, setDeepLinkError] = useState('')

  const handleDeepLinkChange = (event: ChangeEvent<HTMLInputElement>): void => {
    setDeepLink(event.target.value)
  }

  const handleDeepLink = (): void => {
    const raw = deepLink.trim()
    let path = raw
    if (/^https?:\/\//i.test(raw)) {
      try {
        const parsed = new URL(raw)
        path = parsed.pathname + parsed.search
      } catch {
        setDeepLinkError('URL 无法解析')
        return
      }
    }
    if (path !== BRIDGE_BASE_PATH && !path.startsWith(`${BRIDGE_BASE_PATH}/`)) {
      setDeepLinkError(`路径必须位于 ${BRIDGE_BASE_PATH} 前缀下`)
      return
    }
    setDeepLinkError('')
    logNav('深链粘贴', `push ${path}`)
    void navigate(path)
  }

  return (
    <section>
      <h2>桥接演示：React 宿主 × Vue 子应用（URL 同步）</h2>
      <p style={{ color: '#666', fontSize: 13, margin: '4px 0' }}>
        子应用挂载在宿主 <code>{BRIDGE_BASE_PATH}</code> 前缀下；当前宿主路径：
        <code>{location.pathname + location.search}</code>
      </p>
      <ObsPanel />
      <section style={{ border: '1px dashed #bbb', padding: '8px 12px', margin: '12px 0', borderRadius: 4 }}>
        <h3 style={{ margin: '6px 0' }}>深链粘贴框（push 侧「刷新直达」复现）</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input value={deepLink} onChange={handleDeepLinkChange} style={{ flex: '1 1 320px' }} aria-label="深链粘贴框" />
          <button onClick={handleDeepLink}>push 复现直达</button>
        </div>
        {deepLinkError !== '' && <p style={{ color: '#c0392b' }}>{deepLinkError}</p>}
        <p style={{ color: '#666', fontSize: 13, margin: '4px 0' }}>
          粘贴带中文 query 的完整 URL 后点击按钮 = 复制地址栏在新窗口打开前的 push 侧动作。
        </p>
      </section>
      <section data-demo-bridge-area style={{ border: '2px solid #42b883', padding: '8px 12px', margin: '12px 0', borderRadius: 4 }}>
        <RemoteVueBridge routing={routing} appProps={appProps} />
      </section>
    </section>
  )
}
