/**
 * examples/templates/showcase/react-host/src/pages/AboutPage.tsx — 关于页：场景与工程说明。
 */
import type { ReactElement } from 'react'

export default function AboutPage(): ReactElement {
  return (
    <section>
      <h2>关于</h2>
      <p>examples/templates/showcase：一个 pnpm 模板中的 4 个应用 —— react-remote(5333)、vue-host(5334)、vue-remote(5335)、react-host(5336)。</p>
      <ul>
        <li>vue-host（:5334）套 react-remote（:5333），桥接前缀 basePath=/br-react</li>
        <li>react-host（:5336）套 vue-remote（:5335），桥接前缀 basePath=/br-vue</li>
      </ul>
      <p>API 与源码对照、演示操作清单见 examples/templates/showcase/README.md。</p>
    </section>
  )
}
