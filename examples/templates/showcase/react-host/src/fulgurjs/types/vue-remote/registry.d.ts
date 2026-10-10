// 自动生成：远程类型注册表（remote: vue-remote，revision: a0d86b51277569ca）。
// 向插件共享注册表（internal/registry.js 的 FgRemoteTypes）登记本远程全部公开入口；
// loadRemote / remoteComponent / createVueBridgeApp / createReactBridgeApp 共享该注册表。
import '@fulgurjs/federation/internal/registry.js'

declare module '@fulgurjs/federation/internal/registry.js' {
  interface FgRemoteTypes {
    "vue-remote/bridge": typeof import("vue-remote/bridge")
  }
}
