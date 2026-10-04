/**
 * 远程 exposes 的类型桩（模拟插件 dev dts 生成物 dts mode:'shim' 的形状，README §8.1「React 的
 * dev 类型」/ §9.1.5）：tsconfig paths 把 'pc-remote/*' 映射到这里。
 *
 * 桩里只声明远程真实存在的页面（pc-remote/pages/orders）——
 * src/negative.ts 会引用不存在的远程模块与不存在的导出，预期编译失败。
 */
export interface OrderRow {
  id: string
  amount: string
  status: string
}

declare const OrdersPage: { new (): { $props: { id?: string } } }

export default OrdersPage
export function fetchOrders(): Promise<OrderRow[]>
