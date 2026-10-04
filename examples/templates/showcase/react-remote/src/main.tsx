/**
 * examples/templates/showcase/react-remote/src/main.tsx — 独立运行入口（仅 dev 占位）。
 * 子应用真实能力经 exposes './bridge' 被宿主加载；直开本页仅作 dev server 健康检查。
 */
import { createRoot } from 'react-dom/client'
import type { ReactElement } from 'react'

function Standalone(): ReactElement {
  return (
    <div style={{ fontFamily: "'PingFang SC', 'Microsoft YaHei', sans-serif", padding: 24 }}>
      <h1>react-remote（联邦子应用，5333）</h1>
      <p>本应用通过 expose ./bridge（defineBridgeApp + routing 协议）被宿主加载。</p>
      <p>请打开 Vue 宿主桥接页：<a href="http://localhost:5334/br-react/orders">http://localhost:5334/br-react/orders</a></p>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<Standalone />)
