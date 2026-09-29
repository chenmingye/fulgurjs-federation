import { createContext } from 'react'

/** 模块求值计数：两个别名指向本文件，浏览器中必须只执行一次（B 验证探针） */
const evalCounter = globalThis as unknown as { __FG_THEME_CTX_EVALS__?: number }
evalCounter.__FG_THEME_CTX_EVALS__ = (evalCounter.__FG_THEME_CTX_EVALS__ ?? 0) + 1

/**
 * 跨联邦共享的 Context 对象：宿主与远程消费方经同一 expose 实例拿到同一对象
 * （宿主 loadRemote('remote-react/theme-context') → Provider；远程组件内部
 * import 'remote-react/theme-context' → 同一缓存实例）。
 * Context 对象也可以经 AppContext 扩展字段显式传递——本 fixture 用 expose 形态。
 */
export interface ThemeContextValue {
  theme: 'light' | 'dark'
  account: string
}

const ThemeContext = createContext<ThemeContextValue>({ theme: 'light', account: 'anonymous' })

export default ThemeContext
export const ThemeConsumer = ThemeContext.Consumer
