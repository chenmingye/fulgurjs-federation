import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist')
if (!fs.existsSync(path.join(dist, 'runtime.js'))) throw new Error('runtime.js must be built first')
// 显式具名再导出（内核唯一：dist/runtime.js 是唯一运行时实体，本文件不得内联内核）。
// 导出名必须与 src/runtime-entry.ts / src/vue.ts / src/react.ts 的公开导出面一致——
// 漂移由 tests/client-types.test.ts（d.ts 批准清单）、tests/runtime-entry-graph.test.ts
// （导入图）与 e2e（浏览器真实导入）双向守护。
//
// 6.0.0 入口统一：公共入口收敛为四类——包根（Vite 配置）/ /vue / /react / /runtime。
// 旧 /bridge、/bridge/vue、/bridge/react、/bridge/router/vue、/bridge/router/react
// 已移除（迁移指南见 docs/迁移指南.md）；桥接宿主与路由同步实现继续以 /internal/* 提供，
// 由 /vue、/react 统一入口（及 dev 门面）绑定。

/** 框架无关运行时 + 上下文 + 页面契约（/runtime；导入图零 Vue/React/router，graph 测试守护） */
fs.writeFileSync(path.join(dist, 'runtime-entry.js'), [
  'export { initSharing, registerShare, registerRemotes, registerRemote, registerPlugins, loadShare, loadRemote, getLoadedShare, pinLoadedShare, getContainer, preloadRemote, parseSpec, getRuntime, shareScopeMap, unwrapDefault, version, clearSessionState } from "./runtime.js";',
  'export { provideAppContext, getAppContext, requireAppContext, clearAppContext } from "./context.js";',
  'export { definePages, validatePages } from "./pages.js";',
  'export const remoteSchema = {};',
  '',
].join('\n'))

// Vue 统一入口：同一 runtime 内核 + context/pages + vue-adapter + Vue 桥接/宿主/路由同步。
// bridge-router-vue.js 仅类型导入 vue-router（未安装 vue-router 的纯组件工程不解析它）。
fs.writeFileSync(path.join(dist, 'vue.js'), [
  'export { initSharing, registerShare, registerRemotes, registerRemote, registerPlugins, loadShare, loadRemote, getLoadedShare, pinLoadedShare, getContainer, preloadRemote, parseSpec, getRuntime, shareScopeMap, unwrapDefault, version, clearSessionState } from "./runtime.js";',
  'export { provideAppContext, getAppContext, requireAppContext, clearAppContext } from "./context.js";',
  'export { definePages, validatePages } from "./pages.js";',
  'import { loadRemote } from "./runtime.js";',
  'import { createRemoteComponent, createHostPages as createHostPagesWithLoader } from "./vue-adapter.js";',
  'import { defineBridgeApp as defineVueBridgeApp } from "./bridge-app-vue.js";',
  'import { createVueBridgeAppWithLoader } from "./bridge-host-vue.js";',
  'import { createVueBridgeNavigation, connectVueBridgeRouter } from "./bridge-router-vue.js";',
  'export const remoteComponent = createRemoteComponent(loadRemote);',
  'export const createHostPages = (options) => createHostPagesWithLoader(options, loadRemote);',
  'export const defineBridgeApp = defineVueBridgeApp;',
  'export const createVueBridgeApp = createVueBridgeAppWithLoader(loadRemote);',
  'export { createVueBridgeNavigation, connectVueBridgeRouter };',
  'export const remoteSchema = {};',
  '',
].join('\n'))

// React 统一入口：同一 runtime 内核 + context/pages + react-adapter + React 桥接/宿主/路由同步。
// bridge-router-react.js 对 react-router-dom 仅类型导入 + 模块级按需预热（缺依赖零噪声，
// 未用路由同步的纯 React 工程不解析它）；react-dom/client 在实际 mount 时动态取得。
fs.writeFileSync(path.join(dist, 'react.js'), [
  'export { initSharing, registerShare, registerRemotes, registerRemote, registerPlugins, loadShare, loadRemote, getLoadedShare, pinLoadedShare, getContainer, preloadRemote, parseSpec, getRuntime, shareScopeMap, unwrapDefault, version, clearSessionState } from "./runtime.js";',
  'export { provideAppContext, getAppContext, requireAppContext, clearAppContext } from "./context.js";',
  'export { definePages, validatePages } from "./pages.js";',
  'import { loadRemote } from "./runtime.js";',
  'import { createRemoteComponent, createUseLoadRemote, RemoteErrorBoundary, createReactHostPages as createReactHostPagesWithLoader } from "./react-adapter.js";',
  'import { defineBridgeApp as defineReactBridgeApp } from "./bridge-app-react.js";',
  'import { createReactBridgeAppWithLoader } from "./bridge-host-react.js";',
  'import { createReactBridgeNavigation, createReactBridgeRouter } from "./bridge-router-react.js";',
  'export const remoteComponent = createRemoteComponent(loadRemote);',
  'export const useLoadRemote = createUseLoadRemote(loadRemote);',
  'export { RemoteErrorBoundary };',
  'export const createReactHostPages = (options) => createReactHostPagesWithLoader(options, loadRemote);',
  'export const defineBridgeApp = defineReactBridgeApp;',
  'export const createReactBridgeApp = createReactBridgeAppWithLoader(loadRemote);',
  'export { createReactBridgeNavigation, createReactBridgeRouter };',
  'export const remoteSchema = {};',
  '',
].join('\n'))
