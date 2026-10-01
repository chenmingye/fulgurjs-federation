/** React 浏览器应用唯一公开入口（通用运行时 API + React 适配 API）。 */
export {
  initSharing, registerShare, registerRemotes, registerRemote, registerPlugins,
  loadShare, loadRemote, getContainer, preloadRemote, parseSpec,
  getRuntime, shareScopeMap, unwrapDefault, version,
} from './runtime/index'
export type {
  ShareEntry, ShareScope, ShareScopeMap, RemoteConfig, RemoteInput,
  LoadShareOptions, LoadRemoteOptions, PreloadRemoteOptions,
  RuntimePlugin, RuntimeHooks, RemoteDebugInfo, FgRuntime,
  RemoteSetupContext, RemoteSetupModule,
} from './runtime/index'
export { provideAppContext, getAppContext, requireAppContext, clearAppContext } from './context'
export type { AppContext } from './context'
export { definePages, validatePages } from './pages'
export type { PageRouteLike, PagesOptions, PageViolation, RemoteSchemaEntry } from './pages'
import { loadRemote } from './runtime/index'
import {
  RemoteErrorBoundary,
  createRemoteComponent,
  createReactHostPages as createReactHostPagesWithLoader,
  createUseLoadRemote,
} from './react-adapter'
import { defineBridgeApp as defineReactBridgeApp } from './bridge-app-react'
export { RemoteErrorBoundary }
export const remoteComponent = createRemoteComponent(loadRemote)
export const useLoadRemote = createUseLoadRemote(loadRemote)
/** React 子应用桥接契约（defineBridgeApp；远程 ./bridge 模块默认导出，任务书 §3.3） */
export const defineBridgeApp = defineReactBridgeApp
/** 宿主页面适配器（绑定本包运行时的 loadRemote；选项与返回值类型见 react-adapter） */
export function createReactHostPages(options: Parameters<typeof createReactHostPagesWithLoader>[0]) {
  return createReactHostPagesWithLoader(options, loadRemote)
}
export type {
  ReactRemoteComponentOptions, RemoteErrorFallback,
  UseLoadRemoteOptions, UseLoadRemoteResult,
  RemoteErrorBoundaryProps,
  ReactHostPagesOptions, ReactHostPages, ResolvedHostPage,
} from './react-adapter'
export type { BridgeApp, ReactBridgeAppFactory } from './bridge-app-react'
import type { RemoteSchemaEntry } from './pages'
export type RemoteSchema = Record<string, RemoteSchemaEntry>
/** 无插件转换的场景（构建、Node 导入）如实返回空清单。 */
export const remoteSchema: RemoteSchema = {}
