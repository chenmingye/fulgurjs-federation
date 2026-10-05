/**
 * examples/templates/showcase/react-host/src/routing.ts — 桥接宿主导航端口（模块级单例）。
 * createReactBridgeNavigation 仅支持 data router 模式（createBrowserRouter/createHashRouter）；
 * dev 下 Vite base 为 '/' 无需 basename；子目录部署时与 createBrowserRouter 同源传 basename。
 * 端口引用保持稳定 → routing 键不变，宿主不重挂、不重复订阅。
 */
import { createReactBridgeNavigation } from '@fulgurjs/federation/react'

export const BRIDGE_BASE_PATH = '/br-vue'

/**
 * 宿主 routing prop 结构（BridgeHostRouting）。
 * 注：5.4.1 发布包未从 /bridge/router/react 导出 BridgeHostRouting 类型（README §8.3 示例
 * 与发布包类型面不一致，已知问题），这里用端口函数返回值结构化等价替代。
 */
interface BridgeHostRoutingLike {
  basePath: string
  navigation: ReturnType<typeof createReactBridgeNavigation>
}

let routing: BridgeHostRoutingLike | undefined

export function initBridgeRouting(router: Parameters<typeof createReactBridgeNavigation>[0]): void {
  routing = { basePath: BRIDGE_BASE_PATH, navigation: createReactBridgeNavigation(router) }
}

export function getBridgeRouting(): BridgeHostRoutingLike {
  if (!routing) throw new Error('桥接路由端口未初始化：请先在 main.tsx 调用 initBridgeRouting(router)')
  return routing
}
