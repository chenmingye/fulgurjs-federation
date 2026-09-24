import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist')
if (!fs.existsSync(path.join(dist, 'runtime.js'))) throw new Error('runtime.js must be built first')
// 显式具名再导出（内核唯一：dist/runtime.js 是唯一运行时实体，本文件不得内联内核）。
// 导出名必须与 src/runtime-entry.ts / src/vue.ts 的公开导出面一致——漂移由
// tests/client-types.test.ts（d.ts 批准清单）与 e2e/dev.spec.ts（浏览器真实导入）双向守护。
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
