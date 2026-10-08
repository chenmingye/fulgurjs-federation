/**
 * Vue 应用统一入口（/vue，6.0.0 入口统一合同）。
 *
 * 一个入口覆盖 Vue 应用代码需要的全部能力：
 * - 框架无关运行时（loadRemote/loadShare/上下文/页面表契约——与 /runtime 同一份单例）；
 * - Vue 组件与页面适配（remoteComponent/createHostPages）；
 * - Vue 子应用桥接契约（defineBridgeApp，远程 ./bridge 模块默认导出）；
 * - Vue 宿主桥接工厂（createVueBridgeApp）；
 * - Vue 路由同步（createVueBridgeNavigation 宿主端口 + connectVueBridgeRouter 子应用接线）。
 *
 * 可选依赖边界：vue-router 为可选——只加载 Vue 组件/模块、不用路由同步的工程不因本入口
 * 被强制安装/解析 vue-router（bridge-router-vue 仅类型导入 vue-router；
 * tests/runtime-entry-graph 守护导入图）。
 */
export {
  initSharing, registerShare, registerRemotes, registerRemote, registerPlugins,
  loadShare, loadRemote, getLoadedShare, pinLoadedShare, getContainer,
  preloadRemote, parseSpec, getRuntime, shareScopeMap, unwrapDefault, version,
  clearSessionState,
} from './runtime/index'
export type {
  ShareEntry, ShareScope, ShareScopeMap, RemoteConfig,
  LoadShareOptions, LoadRemoteOptions, PreloadRemoteOptions,
  RuntimePlugin, RuntimeHooks, RemoteDebugInfo, FgRuntime,
  RemoteSetupContext, RemoteSetupModule,
} from './runtime/index'
export { provideAppContext, getAppContext, requireAppContext, clearAppContext } from './context'
export type { AppContext } from './context'
export { definePages, validatePages } from './pages'
export type { PageRouteLike, PagesOptions, PageViolation, RemoteSchemaEntry } from './pages'

import { loadRemote } from './runtime/index'
import { createRemoteComponent, createHostPages as createHostPagesWithLoader } from './vue-adapter'
import { defineBridgeApp as defineVueBridgeApp } from './bridge-app-vue'
import { createVueBridgeAppWithLoader } from './bridge-host-vue'
import { createVueBridgeNavigation, connectVueBridgeRouter, type VueBridgeNavigationOptions, type VueBridgeRouterConnection } from './bridge-router-vue'
import type { BridgeHostRouting } from './bridge-router-core'

export type { RemoteComponentOptions, HostPagesOptions, HostPages, ResolvedHostPage } from './vue-adapter'
export type { BridgeApp, VueBridgeAppFactory } from './bridge-app-vue'
export type { VueBridgeAppOptions } from './bridge-host-vue'
export type { VueBridgeNavigationOptions, VueBridgeRouterConnection, BridgeHostRouting }

export const remoteComponent = createRemoteComponent(loadRemote)
/** 宿主页面适配器（绑定本包运行时的 loadRemote；选项与返回值类型见 vue-adapter） */
export function createHostPages(options: Parameters<typeof createHostPagesWithLoader>[0]) {
  return createHostPagesWithLoader(options, loadRemote)
}
/** Vue 子应用桥接契约（远程 ./bridge 模块默认导出） */
export const defineBridgeApp = defineVueBridgeApp
/** Vue 宿主桥接工厂：返回 `{ appProps: P; sessionKey?: string | null }` 形态的包装组件 */
export const createVueBridgeApp = createVueBridgeAppWithLoader(loadRemote)
/** 宿主导航端口（URL 同步）：包住宿主 vue-router 实例，传给桥接组件的 routing prop */
export { createVueBridgeNavigation }
/** 子应用侧 memory router 接线（await connection.ready 后再 app.use(router)） */
export { connectVueBridgeRouter }

import type { RemoteSchemaEntry } from './pages'
export type RemoteSchema = Record<string, RemoteSchemaEntry>
/** 无插件转换的场景（构建、Node 导入）如实返回空清单。 */
export const remoteSchema: RemoteSchema = {}
