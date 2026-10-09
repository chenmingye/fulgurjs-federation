// 自动生成：远程类型注册表（remote: vue-remote，revision: da7f5b888debf1d7）。
// 向插件共享注册表（internal/registry.js 的 FgRemoteTypes）登记本远程全部公开入口；
// loadRemote / remoteComponent / createVueBridgeApp / createReactBridgeApp 共享该注册表。
import '@fulgurjs/federation/internal/registry.js'

declare module '@fulgurjs/federation/internal/registry.js' {
  interface FgRemoteTypes {
    "vue-remote/ClickButton": typeof import("vue-remote/ClickButton")
    "vue-remote/utils": typeof import("vue-remote/utils")
    "vue-remote/pages/HomePage": typeof import("vue-remote/pages/HomePage")
    "vue-remote/pages/DetailPage": typeof import("vue-remote/pages/DetailPage")
  }
}
