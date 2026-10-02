import { useSyncExternalStore } from 'react'
import { getAppContext } from '@fulgurjs/federation/react'
import { diagStore } from '../diagnostics'

/**
 * 折叠诊断面板：mount/unmount/会话切换计数 + 最近事件日志 + 当前 AppContext 快照 JSON。
 * 全部真实数据：计数由子应用 onReady/onGone 回调与会话操作推进；日志由宿主动作与
 * runtime 的 fulgurjs:error window 事件写入；快照实时读取页面级 AppContext 单例。
 */
export default function DiagnosticsPanel({ note }: { note?: string }) {
  const diag = useSyncExternalStore(diagStore.subscribe, diagStore.getSnapshot)

  let contextJson: string
  try {
    const ctx = getAppContext() as Record<string, unknown>
    contextJson = JSON.stringify(
      ctx,
      (_key: string, value: unknown) => (typeof value === 'function' ? `ƒ ${(value as { name?: string }).name || 'anonymous'}()` : value),
      2,
    )
  } catch (e) {
    contextJson = `读取失败：${e instanceof Error ? e.message : String(e)}`
  }

  return (
    <details className="sfh-details">
      <summary>诊断面板（真实数据：计数 / 事件日志 / AppContext 快照）</summary>
      <p className="sfh-diag-counts">
        {'mount 计数：'}
        <b data-testid="diag-mount-count">{diag.mountCount}</b>
        {' · unmount 计数：'}
        <b data-testid="diag-unmount-count">{diag.unmountCount}</b>
        {' · 会话切换计数：'}
        <b data-testid="diag-session-count">{diag.sessionSwitchCount}</b>
      </p>
      {note ? <p className="sfh-diag-note">{note}</p> : null}
      <h4>最近事件日志（新 → 旧）</h4>
      <ol className="sfh-diag-logs">
        {diag.logs.length === 0 ? <li>（暂无事件）</li> : null}
        {diag.logs.map((entry) => (
          <li key={entry.seq}>
            <span className="sfh-diag-time">{entry.time}</span>
            <span className="sfh-diag-kind">[{entry.kind}]</span>
            {entry.message}
          </li>
        ))}
      </ol>
      <h4>当前 AppContext 快照 JSON（getAppContext 实时读取）</h4>
      <pre className="sfh-diag-json" data-testid="diag-context-json">{contextJson}</pre>
    </details>
  )
}
