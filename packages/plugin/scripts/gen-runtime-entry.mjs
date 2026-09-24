import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist')
if (!fs.existsSync(path.join(dist, 'runtime.js'))) throw new Error('runtime.js must be built first')
fs.writeFileSync(path.join(dist, 'vue.js'), [
  'import { loadRemote } from "./runtime.js";',
  'import { createRemoteComponent } from "./vue-adapter.js";',
  'export const remoteComponent = createRemoteComponent(loadRemote);',
  '',
].join('\n'))
fs.writeFileSync(path.join(dist, 'runtime-entry.js'), [
  'export { initSharing, registerShare, registerRemotes, registerRemote, registerPlugins, loadShare, loadRemote, getContainer, preloadRemote, parseSpec, getRuntime, shareScopeMap, unwrapDefault, version } from "./runtime.js";',
  'export { provideAppContext, getAppContext, requireAppContext } from "./context.js";',
  'export { definePages, validatePages } from "./pages.js";',
  'export { remoteComponent } from "./vue.js";',
  'export const remoteSchema = {};',
  '',
].join('\n'))
