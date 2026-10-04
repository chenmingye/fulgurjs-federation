import { remoteComponent } from '@fulgurjs/federation/react'
import IdentityBadges from '../components/IdentityBadges'
import DiagnosticsPanel from '../components/DiagnosticsPanel'

// 工厂放模块顶层（不能在 render 内重复调用工厂）；首次渲染才 loadRemote
const RemoteTicketSummary = remoteComponent<{ title?: string }>('sf-react-remote/components/TicketSummary', {
  retries: 1,
  fallback: <p>远程组件加载中…</p>,
})

/**
 * 页面1 · 组件级联邦（对比项）：remoteComponent 直渲染远程单个组件。
 * 无路由、无会话协议、无整站挂载——这是与页面2「应用级桥接」的对照项。
 */
export default function ComponentLevelPage() {
  return (
    <section>
      <h2>页面1 · 组件级联邦（remoteComponent 直渲染）</h2>
      <IdentityBadges hostName="sf-react-host" framework="React" remoteName="sf-react-remote" remoteFramework="React" />
      <p className="sfh-note">
        把远程暴露的单个组件（sf-react-remote/components/TicketSummary）当普通组件渲染：
        加载失败有内置错误占位（错误码 + 根因 + 修法 + 重试），但没有子应用路由、
        没有 AppContext 会话协议——这是与页面2「应用级桥接」的对照项。
        远程组件自身数据来自子应用模块内的工单内存数据。
      </p>
      <RemoteTicketSummary title="组件级：来自 sf-react-remote 的工单概览" />
      <DiagnosticsPanel note="组件级渲染没有桥接 mount/unmount 契约——本页不推进计数；AppContext 仅由页面2 的桥接流程写入。" />
    </section>
  )
}
