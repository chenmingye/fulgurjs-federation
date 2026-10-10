// 自动生成：远程类型注册表（remote: bridge-react-remote，revision: 7cb1ce5d915a85e6）。
// 向插件共享注册表（internal/registry.js 的 FgRemoteTypes）登记本远程全部公开入口；
// loadRemote / remoteComponent / createVueBridgeApp / createReactBridgeApp 共享该注册表。
import '@fulgurjs/federation/internal/registry.js'

declare module '@fulgurjs/federation/internal/registry.js' {
  interface FgRemoteTypes {
    "bridge-react-remote/bridge": typeof import("bridge-react-remote/bridge")
  }
}
