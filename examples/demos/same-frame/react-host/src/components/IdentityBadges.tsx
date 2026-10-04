import { version } from '@fulgurjs/federation/react'

/**
 * 身份徽标行：宿主（容器名 + 框架 + 角色）、可选远程（容器名 + 框架 + 角色）、
 * runtime version 徽标（@fulgurjs/federation/react 的 version 导出，真实运行时值）。
 */
export default function IdentityBadges(props: {
  hostName: string
  framework: string
  remoteName?: string
  remoteFramework?: string
}) {
  return (
    <p className="sfh-badges">
      <span className="sfh-badge sfh-badge-host">宿主 {props.hostName} · {props.framework} · 宿主角色</span>
      {props.remoteName ? (
        <span className="sfh-badge sfh-badge-remote">远程 {props.remoteName} · {props.remoteFramework} · 子应用</span>
      ) : null}
      <span className="sfh-badge sfh-badge-version" data-testid="runtime-version">@fulgurjs/federation/runtime v{version}</span>
    </p>
  )
}
