/**
 * examples/templates/showcase/vue-host/src/routing.ts — 桥接宿主导航端口（模块级单例）。
 * main.ts 组装宿主 router 后初始化一次：createVueBridgeNavigation(router)——
 * Vue Router fullPath 已剥离 history base，逻辑路径无需再处理部署前缀；
 * 端口引用保持稳定 → routing 键不变，宿主不重挂、不重复订阅。
 */
import type { Router } from 'vue-router'
import { createVueBridgeNavigation, type BridgeHostRouting } from '@fulgurjs/federation/vue'

export const BRIDGE_BASE_PATH = '/br-react'

let routing: BridgeHostRouting | undefined

export function initBridgeRouting(router: Router): void {
  routing = { basePath: BRIDGE_BASE_PATH, navigation: createVueBridgeNavigation(router) }
}

export function getBridgeRouting(): BridgeHostRouting {
  if (!routing) throw new Error('桥接路由端口未初始化：请先在 main.ts 调用 initBridgeRouting(router)')
  return routing
}
