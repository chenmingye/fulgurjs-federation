/**
 * examples/templates/showcase/react-host/src/GuardBanner.tsx — 宿主守卫横幅（useBlocker 原生守卫）。
 * /br-vue/locked 需人工确认：blocked 时渲染「继续/取消」；proceed() 放行提交，
 * reset() 取消 → 桥接端口观察到真实 blocker 状态，返回 cancelled，URL/子应用位置保持不变。
 */
import type { ReactElement } from 'react'
import { useBlocker } from 'react-router-dom'
import { logNav } from './demo-log'
import { BRIDGE_BASE_PATH } from './routing'

export default function GuardBanner(): ReactElement | null {
  const blocker = useBlocker(({ nextLocation }) => nextLocation.pathname.startsWith(`${BRIDGE_BASE_PATH}/locked`))
  if (blocker.state !== 'blocked') return null
  const target = blocker.location?.pathname ?? ''

  const handleProceed = (): void => {
    logNav('宿主守卫', `继续 → ${target}`)
    blocker.proceed?.()
  }

  const handleReset = (): void => {
    logNav('宿主守卫', `取消 → ${target}（URL/历史/子应用位置保持不变）`)
    blocker.reset?.()
  }

  return (
    <div role="alertdialog" aria-label="宿主守卫确认" style={{ display: 'flex', gap: 12, alignItems: 'center', background: '#fff7e6', border: '1px solid #f0c36d', padding: '8px 12px', marginBottom: 12, borderRadius: 4 }}>
      <span>宿主守卫（useBlocker）：是否允许前往 <code>{target}</code>？</span>
      <button onClick={handleProceed}>继续</button>
      <button onClick={handleReset}>取消</button>
    </div>
  )
}
