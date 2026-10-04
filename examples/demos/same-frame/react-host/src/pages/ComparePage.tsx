import IdentityBadges from '../components/IdentityBadges'
import DiagnosticsPanel from '../components/DiagnosticsPanel'

interface CompareRow {
  dim: string
  component: string
  app: string
}

const rows: CompareRow[] = [
  {
    dim: '交付单元',
    component: '单个组件 / 模块（exposes 键 → remoteComponent）',
    app: '完整子应用（自带路由 + 状态 + 页面栈，defineBridgeApp 契约）',
  },
  {
    dim: '路由',
    component: '无——URL 完全由宿主接管',
    app: '子应用自持 memory 路由（本 demo：列表/详情/编辑），内部导航不写宿主 URL',
  },
  {
    dim: '宿主传值',
    component: '组件 props（渲染期传入）',
    app: 'appProps 挂载快照 + AppContext（provideAppContext / clearAppContext / 受控 sessionKey）',
  },
  {
    dim: '会话协议',
    component: '无——宿主自行处理登录态',
    app: '受控 sessionKey：A→null 等卸载 → clearAppContext → 新快照 → 新代次重挂（本 demo 页面2）',
  },
  {
    dim: '生命周期',
    component: '组件挂载/卸载（React 组件树内）',
    app: 'mount/unmount 契约：按容器 el 分键、代次作废、登出空容器、失败占位与恢复',
  },
  {
    dim: '状态边界',
    component: '与宿主同组件树，状态随宿主页面',
    app: '跨 root 独立组件树：模块级状态在卸载再挂载后仍存活（不随容器销毁）',
  },
  {
    dim: '适用场景',
    component: '在宿主页面嵌一块业务部件（卡片/表格/表单），轻、快、共享宿主上下文',
    app: '嵌一整块带内部导航的业务系统（工单中心/审批中心），整站挂卸、会话受控',
  },
]

const docLinks: Array<{ label: string; href: string }> = [
  {
    label: 'README §8.1 React 适配 API（remoteComponent/useLoadRemote）',
    href: 'https://github.com/chenmingye/fulgurjs-federation#81-react-%E9%80%82%E9%85%8D-api--fulgurjsfederationreact',
  },
  {
    label: 'README §8.2 跨框架桥接 API — /bridge（应用级）',
    href: 'https://github.com/chenmingye/fulgurjs-federation#82-%E8%B7%A8%E6%A1%86%E6%9E%B6%E6%A1%A5%E6%8E%A5-api--bridge',
  },
  {
    label: 'README §9 AppContext（跨应用传值与方法引用）',
    href: 'https://github.com/chenmingye/fulgurjs-federation#9-appcontext--%E8%B7%A8%E5%BA%94%E7%94%A8%E4%BC%A0%E5%80%BC%E4%B8%8E%E6%96%B9%E6%B3%95%E5%BC%95%E7%94%A8-fulgurjsfederationruntime',
  },
]

/**
 * 页面3 · 对比说明：组件级（remoteComponent）vs 应用级（/bridge）各自适用场景。
 * 静态说明页 + API 文档锚点链接。
 */
export default function ComparePage() {
  return (
    <section>
      <h2>页面3 · 对比说明：组件级 vs 应用级</h2>
      <IdentityBadges hostName="sf-react-host" framework="React" />
      <table className="sfh-compare-table">
        <thead>
          <tr><th>维度</th><th>组件级（remoteComponent）</th><th>应用级（/bridge 桥接）</th></tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.dim}>
              <td><b>{row.dim}</b></td>
              <td>{row.component}</td>
              <td>{row.app}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="sfh-doc-links">
        {'API 文档锚点（README 为唯一权威文档）：'}
        {docLinks.map((link, i) => (
          <span key={link.href}>
            <a href={link.href} target="_blank" rel="noreferrer">{link.label}</a>
            {i < docLinks.length - 1 ? ' · ' : ''}
          </span>
        ))}
      </p>
      <p className="sfh-note">
        本场景（examples/demos/same-frame）是「同框架」版：Vue 宿主套 Vue 子应用、React 宿主套 React 子应用，
        shared 只协商自己框架的单例；跨框架双向互嵌（Vue 宿主 × React 子应用等）见 examples/templates，
        两者共用同一套 /bridge 契约与受控会话语义。
      </p>
      <DiagnosticsPanel note="静态说明页：诊断数据为会话级真实累计值。" />
    </section>
  )
}
