/**
 * examples/templates/showcase/react-host/src/pages/HomePage.tsx — 宿主首页。
 */
import type { ReactElement } from 'react'

export default function HomePage(): ReactElement {
  return (
    <section>
      <h2>首页</h2>
      <p>双向桥接 URL 同步演示：宿主页级路由（首页 / 关于 / 桥接演示页）+ 子应用受控 memory 路由。</p>
      <p>顶部菜单「桥接演示页 / 工单列表 / 设置」经宿主 navigate 直达子应用深链。</p>
    </section>
  )
}
