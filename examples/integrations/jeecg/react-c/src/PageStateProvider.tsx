/** 演示业务状态属于本次子应用实例；路由换页保留，卸载/会话换代重新创建。 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

interface PageState {
  settingsName: string
  setSettingsName: (value: string) => void
  saved: string
  setSaved: (value: string) => void
  dashboardStartedAt: string
}
const PageStateContext = createContext<PageState | null>(null)

export function PageStateProvider({ children, onReady }: { children: ReactNode; onReady?: () => void }) {
  const [settingsName, setSettingsName] = useState('默认策略')
  const [saved, setSaved] = useState('')
  const [dashboardStartedAt] = useState(() => new Date().toLocaleTimeString())
  // 页面实际提交后再报告 ready；不在桥接工厂尚未渲染时虚增挂载计数。
  useEffect(() => { onReady?.() }, [onReady])
  return <PageStateContext.Provider value={{ settingsName, setSettingsName, saved, setSaved, dashboardStartedAt }}>{children}</PageStateContext.Provider>
}
export function usePageState() {
  const state = useContext(PageStateContext)
  if (!state) throw new Error('React-C 页面需要在 PageStateProvider 中渲染')
  return state
}
