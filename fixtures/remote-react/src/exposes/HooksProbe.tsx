import { useEffect, useState } from 'react'

let effectCount = 0

/**
 * StrictMode / 双 effect 行为探针：
 * - 实例号由宿主 props 指定（不用模块级计数——StrictMode dev 会双执行 useState
 *   初始化器，带副作用的计数器会让多实例断言不稳定）
 * - effect 计数每轮 effect +1（StrictMode dev 下 setup→cleanup→setup 应为 2）
 */
export default function HooksProbe({ tag = 'default', instance = 1 }: { tag?: string; instance?: number }) {
  const [clicks, setClicks] = useState(0)
  const [effects, setEffects] = useState(0)
  useEffect(() => {
    effectCount += 1
    setEffects((e) => e + 1)
    return () => {
      // cleanup：无状态写入（StrictMode 安全性验证点）
    }
  }, [])
  return (
    <div data-testid="hooks-probe">
      <button data-testid="probe-click" onClick={() => setClicks((n) => n + 1)}>实例点击</button>
      <span data-testid="probe-clicks">clicks:{clicks}</span>
      <span data-testid="probe-instance">{tag}#{instance}</span>
      <span data-testid="probe-effects">effects:{effects}</span>
      <span data-testid="probe-global">global-effects:{effectCount}</span>
    </div>
  )
}
