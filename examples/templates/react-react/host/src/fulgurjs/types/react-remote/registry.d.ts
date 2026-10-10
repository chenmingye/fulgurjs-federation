// 自动生成：远程类型注册表（remote: react-remote，revision: 1de0ea3432903a8c）。
// 向插件共享注册表（internal/registry.js 的 FgRemoteTypes）登记本远程全部公开入口；
// loadRemote / remoteComponent / createVueBridgeApp / createReactBridgeApp 共享该注册表。
import '@fulgurjs/federation/internal/registry.js'

declare module '@fulgurjs/federation/internal/registry.js' {
  interface FgRemoteTypes {
    "react-remote/ClickButton": typeof import("react-remote/ClickButton")
    "react-remote/utils": typeof import("react-remote/utils")
    "react-remote/pages/HomePage": typeof import("react-remote/pages/HomePage")
    "react-remote/pages/DetailPage": typeof import("react-remote/pages/DetailPage")
  }
}
