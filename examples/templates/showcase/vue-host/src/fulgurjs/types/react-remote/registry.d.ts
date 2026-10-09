// 自动生成：远程类型注册表（remote: react-remote，revision: 523c8878ed5fc586）。
// 向插件共享注册表（internal/registry.js 的 FgRemoteTypes）登记本远程全部公开入口；
// loadRemote / remoteComponent / createVueBridgeApp / createReactBridgeApp 共享该注册表。
import '@fulgurjs/federation/internal/registry.js'

declare module '@fulgurjs/federation/internal/registry.js' {
  interface FgRemoteTypes {
    "react-remote/bridge": typeof import("react-remote/bridge")
  }
}
