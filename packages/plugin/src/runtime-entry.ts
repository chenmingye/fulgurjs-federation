/** 浏览器应用唯一公开入口。 */
export {
  initSharing, registerShare, registerRemotes, registerRemote, registerPlugins,
  loadShare, loadRemote, getContainer, preloadRemote, parseSpec,
  getRuntime, shareScopeMap, unwrapDefault, version,
} from './runtime/index'
export type {
  ShareEntry, ShareScope, ShareScopeMap, RemoteConfig, RemoteInput,
  LoadShareOptions, LoadRemoteOptions, PreloadRemoteOptions,
  RuntimePlugin, RuntimeHooks, RemoteDebugInfo, FgRuntime,
} from './runtime/index'
export { provideAppContext, getAppContext, requireAppContext } from './context'
export type { AppContext } from './context'
export { definePages, validatePages } from './pages'
export type { PageRouteLike, PagesOptions, PageViolation, RemoteSchemaEntry } from './pages'
export { remoteComponent } from './vue'
export type { RemoteComponentOptions } from './vue-adapter'
import type { RemoteSchemaEntry } from './pages'
export type RemoteSchema = Record<string, RemoteSchemaEntry>
/** 无插件转换的场景（构建、Node 导入）如实返回空清单。 */
export const remoteSchema: RemoteSchema = {}
