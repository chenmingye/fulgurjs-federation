import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist')
if (!fs.existsSync(path.join(dist, 'runtime.js'))) throw new Error('runtime.js must be built first')
// 显式具名再导出（内核唯一：dist/runtime.js 是唯一运行时实体，本文件不得内联内核）。
// 导出名必须与 src/runtime-entry.ts / src/vue.ts / src/react.ts 的公开导出面一致——漂移由
// tests/client-types.test.ts（d.ts 批准清单）、tests/runtime-entry-graph.test.ts（导入图）
// 与 e2e（浏览器真实导入）双向守护。
fs.writeFileSync(path.join(dist, 'vue.js'), [
  'import { loadRemote } from "./runtime.js";',
  'import { createRemoteComponent, createHostPages as createHostPagesWithLoader } from "./vue-adapter.js";',
  'export const remoteComponent = createRemoteComponent(loadRemote);',
  'export const createHostPages = (options) => createHostPagesWithLoader(options, loadRemote);',
  '',
].join('\n'))
fs.writeFileSync(path.join(dist, 'runtime-entry.js'), [
  'export { initSharing, registerShare, registerRemotes, registerRemote, registerPlugins, loadShare, loadRemote, getContainer, preloadRemote, parseSpec, getRuntime, shareScopeMap, unwrapDefault, version, clearSessionState } from "./runtime.js";',
  'export { provideAppContext, getAppContext, requireAppContext, clearAppContext } from "./context.js";',
  'export { definePages, validatePages } from "./pages.js";',
  'export { remoteComponent, createHostPages } from "./vue.js";',
  'export const remoteSchema = {};',
  '',
].join('\n'))
// React 浏览器入口：同一 runtime 内核 + context/pages + react-adapter（与 /runtime 同构，
// 但组件适配面换为 React，且不带 Vue 适配导出）。类型面 = src/react.ts（tsup 产 dist/react.d.ts）。
fs.writeFileSync(path.join(dist, 'react.js'), [
  'export { initSharing, registerShare, registerRemotes, registerRemote, registerPlugins, loadShare, loadRemote, getContainer, preloadRemote, parseSpec, getRuntime, shareScopeMap, unwrapDefault, version } from "./runtime.js";',
  'export { provideAppContext, getAppContext, requireAppContext, clearAppContext } from "./context.js";',
  'export { definePages, validatePages } from "./pages.js";',
  'import { loadRemote } from "./runtime.js";',
  'import { createRemoteComponent, createUseLoadRemote, RemoteErrorBoundary, createReactHostPages as createReactHostPagesWithLoader } from "./react-adapter.js";',
  'export const remoteComponent = createRemoteComponent(loadRemote);',
  'export const useLoadRemote = createUseLoadRemote(loadRemote);',
  'export { RemoteErrorBoundary };',
  'export const createReactHostPages = (options) => createReactHostPagesWithLoader(options, loadRemote);',
  'export const remoteSchema = {};',
  '',
].join('\n'))
