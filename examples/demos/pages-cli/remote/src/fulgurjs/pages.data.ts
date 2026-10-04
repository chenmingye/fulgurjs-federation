import type { PageRouteLike } from '@fulgurjs/federation/runtime'

/**
 * 同源页面数据模块（examples/demos/pages-cli「页面清单、类型与 CLI」场景的契约基准）。
 *
 * 宿主（examples/demos/pages-cli/host）与本远程各持有一份内容一致的纯数据模块：
 * - 宿主侧：fulgurjs.config.ts 以具名导出 hostPages 供 CLI explain/check-pages 读取，
 *   运行时由 createHostPages 消费同一份数据（README §4/§10 契约：唯一手工维护位置）；
 * - 远程侧：fulgurjs.config.ts 具名导出同构 hostPages，表达「远程提供的页面清单」，
 *   供两侧对照展示（演示用途；真实工程远程只需维护 exposes 键）。
 * 本模块保持纯数据（只有被擦除的类型导入），CLI 与浏览器共用。
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
