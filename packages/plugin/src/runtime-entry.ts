/**
 * 框架无关浏览器运行时入口（/runtime）。
 *
 * 定位（6.0.0 入口统一合同）：只依赖浏览器与 Module Federation 内核的能力——
 * 共享协商（initSharing/loadShare/…）、远程加载（registerRemotes/loadRemote/…）、
 * 上下文（AppContext）、页面表契约（definePages/validatePages）。
 * 本入口静态导入图**不含 Vue/React/任何框架 router**（tests/runtime-entry-graph 守护），
 * 纯 JS/TS 模块消费方不需要安装任何框架。
 *
 * Vue 应用代码用 @fulgurjs/federation/vue，React 用 /react——两个框架入口
 * 再导出本入口全部导出，语义一致、运行时单例同一份（页面级 globalThis 单例）。
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
import type { RemoteSchemaEntry } from './pages'
export type RemoteSchema = Record<string, RemoteSchemaEntry>
/** 无插件转换的场景（构建、Node 导入）如实返回空清单。 */
export const remoteSchema: RemoteSchema = {}
