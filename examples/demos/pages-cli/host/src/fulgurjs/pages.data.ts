import type { PageRouteLike } from '@fulgurjs/federation/runtime'

/**
 * 宿主页面数据模块（唯一手工维护位置）：fulgurjs.config.ts 的 hostPages 具名导出与
 * 运行时 createHostPages（src/fulgurjs/host/pages.ts）消费这里同一份数据。
 * 与远程 examples/demos/pages-cli/remote 的同名模块内容一致——「宿主页面表 ↔ 远程页面清单」
 * 的同源契约（CLI check-pages 核对的正是这层对应关系）。
 */
export const pages: PageRouteLike[] = [
  { route: '/pc/orders', spec: 'pages/orders', name: 'PcOrders', title: '订单列表' },
  // 带参路由显式 spec：缺省推导（剥 :id 段）会与列表页收敛为同一 spec，触发 R1 校验
  // （README 路径② 的真实事故场景；validatePages 面板的「注入违规演示」会复现它）。
  { route: '/pc/orders/:id', spec: 'pages/orders-detail', name: 'PcOrdersDetail', title: '订单详情' },
  { route: '/pc/dashboard', spec: 'pages/dashboard', name: 'PcDashboard', title: '数据看板', keepAlive: true },
]

/** 路由前缀 → 远程容器名（createHostPages 最长前缀匹配；CLI check-pages 据此归属远程） */
export const remotePrefixes: Record<string, string> = {
  '/pc': 'pc-remote',
}
