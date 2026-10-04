/**
 * examples/templates/showcase/react-host/src/ObsPanel.tsx — URL 同步观测台（实时更新）。
 * 展示：宿主当前 URL（location.href）、子应用逻辑位置、history.length、
 * 子应用挂载计数、最近 10 条导航事件（带来源标注）。
 */
import { useEffect, useState, useSyncExternalStore } from 'react'
import type { ReactElement } from 'react'
import { useLocation } from 'react-router-dom'
import { demoLog } from './demo-log'
import { BRIDGE_BASE_PATH } from './routing'

export default function ObsPanel(): ReactElement {
  const snapshot = useSyncExternalStore(demoLog.subscribe, demoLog.getSnapshot)
  const location = useLocation()
  const [historyLength, setHistoryLength] = useState(window.history.length)

  useEffect(() => {
    setHistoryLength(window.history.length)
  }, [location.key, snapshot])

  const inPrefix = location.pathname === BRIDGE_BASE_PATH || location.pathname.startsWith(`${BRIDGE_BASE_PATH}/`)
  const childLocation = inPrefix
    ? (location.pathname.slice(BRIDGE_BASE_PATH.length) || '/') + location.search + location.hash
    : location.pathname + location.search

  return (
    <section style={{ border: '1px solid #d0e7ff', background: '#f5faff', padding: '8px 12px', margin: '12px 0', borderRadius: 4 }}>
      <h3 style={{ margin: '6px 0' }}>URL 同步观测台</h3>
      <p style={{ margin: '4px 0' }}>宿主当前 URL：<code data-demo-host-url>{window.location.href}</code></p>
      <p style={{ margin: '4px 0' }}>子应用逻辑位置：<code data-demo-child-location>{childLocation}</code></p>
      <p style={{ margin: '4px 0' }}>
        history.length：<code data-demo-history-length>{historyLength}</code>
        ｜子应用 mount 次数：<code data-demo-mount-count>{snapshot.mountCount}</code>（路由切换应恒为 1）
      </p>
      <h4 style={{ margin: '6px 0 2px' }}>最近导航事件（≤10 条，新在下）</h4>
      <ol style={{ margin: '4px 0', paddingLeft: 20, fontSize: 13 }}>
        {snapshot.entries.map((entry) => (
          <li key={entry.id}>[{entry.time}] {entry.source} — {entry.detail}</li>
        ))}
        {snapshot.entries.length === 0 && <li style={{ color: '#666' }}>（暂无事件）</li>}
      </ol>
    </section>
  )
}
