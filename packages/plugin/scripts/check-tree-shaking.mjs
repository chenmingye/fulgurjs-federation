/**
 * 真实 dist 按需裁剪门禁：可观察的 API 引用，框架外置，ESM/minify/gzip level 9。
 * 不只测空入口：保存 metafile 贡献，并用未压缩符号检查专属桥接实现是否残留。
 * node scripts/check-tree-shaking.mjs [--json]；build 末尾执行，不生成业务文件。
 */
import { build, version as esbuildVersion } from 'esbuild'
import { gzipSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import assert from 'node:assert/strict'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const external = ['vue', 'vue-router', 'react', 'react-dom', 'react-dom/client', 'react-router-dom']
const cases = [
  ['runtime-entry.js', 'loadRemote'], ['vue.js', 'loadRemote'], ['react.js', 'loadRemote'],
  ['vue.js', 'remoteComponent'], ['react.js', 'remoteComponent'],
  ['vue.js', 'createVueBridgeApp'], ['react.js', 'createReactBridgeApp'],
]
const rows = []
for (const [entry, api] of cases) {
  const options = {
    stdin: { contents: `import { ${api} } from './dist/${entry}'; globalThis.__probe = ${api};`, resolveDir: root, sourcefile: 'probe.js' },
    bundle: true, format: 'esm', write: false, metafile: true, external,
  }
  const result = await build({ ...options, minify: true })
  const debug = await build({ ...options, minify: false, charset: 'utf8' })
  const bytes = result.outputFiles[0].contents
  const code = debug.outputFiles[0].text
  const inputs = Object.values(result.metafile.outputs)[0].inputs
  if (api === 'loadRemote' || api === 'remoteComponent') {
    assert(!/function create(?:Vue|React)BridgeAppWithLoader\b/.test(code), `${entry}/${api} 带入了未使用的完整桥接宿主实现`)
    assert(!/(?:class RoutingChannel|RoutingChannel = class)\b|function createRoutingChannel\b|function createReactBridgeRouter\b|function connectVueBridgeRouter\b/.test(code), `${entry}/${api} 带入了未使用的路由同步实现`)
    assert(!code.includes('该容器已封锁（同页无法安全重挂）'), `${entry}/${api} 保留了桥接专用诊断和生命周期实现`)
  }
  if (api === 'loadRemote') assert(!/function (?:sessionComponent|buildRemoteComponent|createRemoteComponent)\b/.test(code), `${entry} 纯模块消费仍带组件实现`)
  if (api.startsWith('create')) {
    assert(code.includes('容器已封锁'), `${entry} 完整桥接正向探针被过度裁剪`)
    assert(code.includes('unmount'), `${entry} 丢失卸载实现`)
  }
  rows.push({ entry, api, raw: bytes.length, gzip: gzipSync(bytes, { level: 9 }).length, inputs })
}
const core = rows[0].gzip
for (const row of rows.filter(r => r.api === 'loadRemote')) assert(row.gzip <= core + 1024, `${row.entry} 相比 /runtime 增量超过 1KiB gzip`)
for (const row of rows.filter(r => r.api === 'remoteComponent')) {
  const limit = row.entry === 'vue.js' ? 17535 : 17836
  assert(row.gzip <= limit, `${row.entry} 纯组件 gzip ${row.gzip} 超过预算 ${limit}`)
}
if (process.argv.includes('--json')) console.log(JSON.stringify({ tool: 'esbuild', esbuildVersion, node: process.version, format: 'esm', minify: true, external, gzipLevel: 9, rows }, null, 2))
else for (const { entry, api, raw, gzip } of rows) console.log(`[tree-shaking] ${entry} / ${api}: raw ${raw}B, gzip ${gzip}B ✓`)
