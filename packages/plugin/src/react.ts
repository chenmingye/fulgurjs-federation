/**
 * React 应用统一入口（/react，6.0.0 入口统一合同）。
 *
 * 一个入口覆盖 React 应用代码需要的全部能力：
 * - 框架无关运行时（loadRemote/loadShare/上下文/页面表契约——与 /runtime 同一份单例）；
 * - React 组件与页面适配（remoteComponent/useLoadRemote/RemoteErrorBoundary/createReactHostPages）；
 * - React 子应用桥接契约（defineBridgeApp，远程 ./bridge 模块默认导出）；
 * - React 宿主桥接工厂（createReactBridgeApp）；
 * - React 路由同步（createReactBridgeNavigation 宿主端口 + createReactBridgeRouter 子应用接线）。
 *
 * 可选依赖边界：react-router-dom 为可选——只加载 React 组件/模块、不用路由同步的工程
 * 不因本入口被强制安装/解析 react-router-dom（bridge-router-react 对 react-router-dom
 * 仅类型导入 + 模块级按需预热；tests/runtime-entry-graph 守护导入图）。
 */
export {
  initSharing, registerShare, registerRemotes, registerRemote, registerPlugins,
  loadShare, loadRemote, getLoadedShare, pinLoadedShare, getContainer,
  preloadRemote, parseSpec, getRuntime, shareScopeMap, unwrapDefault, version,
  clearSessionState,
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
import { createReactBridgeAppWithLoader } from './bridge-host-react'
import { createReactBridgeNavigation, createReactBridgeRouter, type ReactBridgeCancelPolicy, type ReactBridgeRouterConnection, type BridgeHostRouting } from './bridge-router-react'

export { RemoteErrorBoundary }
export const remoteComponent = createRemoteComponent(loadRemote)
export const useLoadRemote = createUseLoadRemote(loadRemote)
/** React 子应用桥接契约（远程 ./bridge 模块默认导出） */
export const defineBridgeApp = defineReactBridgeApp
/** React 宿主桥接工厂：返回 `ComponentType<{ appProps: P; sessionKey?: string | null }>` */
export const createReactBridgeApp = createReactBridgeAppWithLoader(loadRemote)
/** 宿主导航端口（URL 同步）：包住宿主 data router，传给桥接组件的 routing prop */
export { createReactBridgeNavigation }
/** 子应用侧受控 memory data router（返回 { element, dispose }，element 直接作为工厂返回值） */
export { createReactBridgeRouter }
/** 宿主桥接组件 routing prop 的类型（宿主启用 URL 同步时传入） */
export type { BridgeHostRouting }
/** 宿主导航可取消预判 */
export type { ReactBridgeCancelPolicy }
export type { ReactBridgeRouterConnection }
/** 宿主桥接工厂选项与宿主入口 */
export type { ReactBridgeAppOptions, BridgeErrorFallback } from './bridge-host-react'
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
