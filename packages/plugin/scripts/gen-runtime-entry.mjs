import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist')
if (!fs.existsSync(path.join(dist, 'runtime.js'))) throw new Error('runtime.js must be built first')
// 显式具名再导出（内核唯一：dist/runtime.js 是唯一运行时实体，本文件不得内联内核）。
// 导出名必须与 src/runtime-entry.ts / src/vue.ts / src/react.ts / src/bridge*.ts 的公开导出面
// 一致——漂移由 tests/client-types.test.ts（d.ts 批准清单）、tests/runtime-entry-graph.test.ts
// （导入图）与 e2e（浏览器真实导入）双向守护。
fs.writeFileSync(path.join(dist, 'vue.js'), [
  'import { loadRemote } from "./runtime.js";',
  'import { createRemoteComponent, createHostPages as createHostPagesWithLoader } from "./vue-adapter.js";',
  'import { defineBridgeApp as defineVueBridgeApp } from "./bridge-app-vue.js";',
  'export const remoteComponent = createRemoteComponent(loadRemote);',
  'export const createHostPages = (options) => createHostPagesWithLoader(options, loadRemote);',
  'export const defineBridgeApp = defineVueBridgeApp;',
  '',
].join('\n'))
fs.writeFileSync(path.join(dist, 'runtime-entry.js'), [
  'export { initSharing, registerShare, registerRemotes, registerRemote, registerPlugins, loadShare, loadRemote, getLoadedShare, pinLoadedShare, getContainer, preloadRemote, parseSpec, getRuntime, shareScopeMap, unwrapDefault, version, clearSessionState } from "./runtime.js";',
  'export { provideAppContext, getAppContext, requireAppContext, clearAppContext } from "./context.js";',
  'export { definePages, validatePages } from "./pages.js";',
  'export { remoteComponent, createHostPages, defineBridgeApp } from "./vue.js";',
  'export const remoteSchema = {};',
  '',
].join('\n'))
// React 浏览器入口：同一 runtime 内核 + context/pages + react-adapter（与 /runtime 同构，
// 但组件适配面换为 React，且不带 Vue 适配导出）。类型面 = src/react.ts（tsup 产 dist/react.d.ts）。
// defineBridgeApp 来自 bridge-app-react（react-dom/client 在实际 mount 时动态取得，零 Vue）。
fs.writeFileSync(path.join(dist, 'react.js'), [
  'export { initSharing, registerShare, registerRemotes, registerRemote, registerPlugins, loadShare, loadRemote, getLoadedShare, pinLoadedShare, getContainer, preloadRemote, parseSpec, getRuntime, shareScopeMap, unwrapDefault, version, clearSessionState } from "./runtime.js";',
  'export { provideAppContext, getAppContext, requireAppContext, clearAppContext } from "./context.js";',
  'export { definePages, validatePages } from "./pages.js";',
  'import { loadRemote } from "./runtime.js";',
  'import { createRemoteComponent, createUseLoadRemote, RemoteErrorBoundary, createReactHostPages as createReactHostPagesWithLoader } from "./react-adapter.js";',
  'import { defineBridgeApp as defineReactBridgeApp } from "./bridge-app-react.js";',
  'export const remoteComponent = createRemoteComponent(loadRemote);',
  'export const useLoadRemote = createUseLoadRemote(loadRemote);',
  'export { RemoteErrorBoundary };',
  'export const createReactHostPages = (options) => createReactHostPagesWithLoader(options, loadRemote);',
  'export const defineBridgeApp = defineReactBridgeApp;',
  'export const remoteSchema = {};',
  '',
].join('\n'))
// 桥接宿主入口（任务书 §3.1/D2）：/bridge/vue 与 /bridge/react 为按宿主框架分离的推荐入口
// （dev 原生 ESM 与生产摇树都不提前执行对向适配器，BR01/BR12）；/bridge 为聚合兼容入口，
// dev 下会同时执行两个宿主适配器——README 说明加载代价，推荐用法用分离入口。
fs.writeFileSync(path.join(dist, 'bridge-vue.js'), [
  'import { loadRemote } from "./runtime.js";',
  'import { createVueBridgeAppWithLoader } from "./bridge-host-vue.js";',
  'export const createVueBridgeApp = createVueBridgeAppWithLoader(loadRemote);',
  '',
].join('\n'))
fs.writeFileSync(path.join(dist, 'bridge-react.js'), [
  'import { loadRemote } from "./runtime.js";',
  'import { createReactBridgeAppWithLoader } from "./bridge-host-react.js";',
  'export const createReactBridgeApp = createReactBridgeAppWithLoader(loadRemote);',
  '',
].join('\n'))
fs.writeFileSync(path.join(dist, 'bridge.js'), [
  'import { loadRemote } from "./runtime.js";',
  'import { createVueBridgeAppWithLoader } from "./bridge-host-vue.js";',
  'import { createReactBridgeAppWithLoader } from "./bridge-host-react.js";',
  'export const createVueBridgeApp = createVueBridgeAppWithLoader(loadRemote);',
  'export const createReactBridgeApp = createReactBridgeAppWithLoader(loadRemote);',
  '',
].join('\n'))
