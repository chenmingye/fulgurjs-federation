import { createContext, useContext } from 'react'

/** appProps：宿主传入的业务 props（label + 稳定回调 onReady/onGone，供宿主诊断计数）；
 * 普通 interface 无需额外索引签名。 */
export interface BridgeChildProps {
  label?: string
  onReady?: () => void
  onGone?: () => void
}

export const BridgePropsContext = createContext<BridgeChildProps>({})

/** 子应用页面读取宿主 appProps 的唯一入口 */
export function useBridgeProps(): BridgeChildProps {
  return useContext(BridgePropsContext)
}

