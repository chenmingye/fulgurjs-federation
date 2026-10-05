/**
 * WP3：npm tarball consumer smoke。
 *
 * 验证发布产物（而非 link: 工作区）可被真实消费：
 * 1. packages/plugin 下 npm pack 出 tarball；
 * 2. 临时 consumer 以普通依赖安装 tarball（外加 vue / vite / @vitejs/plugin-vue）；
 * 3. exports 解析面：根入口与 /config 保持 CJS，/runtime 可由 ESM 导入且类型可解析，旧入口不可解析；
 * 4. 一次真实 vite build（宿主 + exposes + remotes 最小组合）；
 * 5. 最小 dev 页面加载（dev server 起服 + 页面 200 + 容器入口端点 200）。
 *
 * 独立可运行：node e2e/scripts/pack-smoke.mjs（前置：packages/plugin 已 npm install；
 * 是否先 build 可用 SKIP_PLUGIN_BUILD=1 跳过——默认脚本自己跑 npm run build）。
 * 失败时输出 vite/rollup 版本与错误上下文后以非零码退出。
 */
import { execSync, spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(SCRIPT_DIR, '../..')
const PLUGIN_DIR = path.join(REPO, 'packages/plugin')
const PORT = process.env.PACK_SMOKE_PORT || '5599'

const log = (msg) => console.log(`[pack-smoke] ${msg}`)
const fail = (msg) => {
  console.error(`[pack-smoke] FAIL: ${msg}`)
  process.exit(1)
}

// 1. 构建插件（可跳过）+ npm pack
if (!process.env.SKIP_PLUGIN_BUILD) {
  log('building plugin (npm run build)…')
  execSync('npm run build', { cwd: PLUGIN_DIR, stdio: 'inherit' })
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fulgurjs-pack-smoke.'))
const tarballDir = path.join(tmp, 'pack')
fs.mkdirSync(tarballDir)
execSync(`npm pack --pack-destination "${tarballDir}"`, { cwd: PLUGIN_DIR, stdio: 'pipe' })
const tarball = fs.readdirSync(tarballDir).find((f) => f.endsWith('.tgz'))
if (!tarball) fail('npm pack 未产出 tarball')
const tarballPath = path.join(tarballDir, tarball)
log(`packed: ${tarball}`)

// 2. 临时 consumer 安装 tarball
const consumer = path.join(tmp, 'consumer')
fs.mkdirSync(consumer)
fs.writeFileSync(
  path.join(consumer, 'package.json'),
  JSON.stringify({ name: 'pack-smoke-consumer', private: true, type: 'module' }, null, 2),
)
const npmEnv = { ...process.env, npm_config_yes: 'true' }
execSync(`npm install "${tarballPath}" vue@^3.5.22 vite@^6.3.5 @vitejs/plugin-vue@^5.2.0 react@19.3.0 react-dom@19.3.0 @types/react@19.3.0 @types/react-dom@19.3.0 @vitejs/plugin-react@5.2.0 --no-audit --no-fund`, {
  cwd: consumer,
  stdio: 'inherit',
  env: npmEnv,
})

// 3. exports 解析面（根入口 + 子路径 + 类型文件）
const consumerRequire = createRequire(path.join(consumer, 'package.json'))
// 5.0.0：根入口 + /runtime 是公开面；/config（聚合配置链）已删除。
const entryPoints = ['@fulgurjs/federation']
for (const ep of entryPoints) {
  try {
    consumerRequire.resolve(ep)
    log(`resolve OK: ${ep}`)
  } catch (e) {
    fail(`exports 解析失败：${ep}（${e.message}）`)
  }
}
const pkgJson = JSON.parse(fs.readFileSync(path.join(consumer, 'node_modules/@fulgurjs/federation/package.json'), 'utf8'))
for (const sub of ['.', './runtime', './react']) {
  const typesFile = pkgJson.exports[sub]?.types
  if (!typesFile || !fs.existsSync(path.join(consumer, 'node_modules/@fulgurjs/federation', typesFile))) {
    fail(`类型文件缺失：exports["${sub}"].types = ${typesFile}`)
  }
}
// 历史破坏性断言：旧公开子路径必须已从 exports 删除（3.0.0：./pages ./context ./client；
// 5.0.0：./config 聚合入口、./internal/vue.js；6.0.0：/bridge 族——注意 ./vue 在 6.0.0 起是统一入口，重新成为公开导出）
for (const removed of ['./pages', './context', './client', './config', './internal/vue.js', './bridge', './bridge/vue', './bridge/react', './bridge/router/vue', './bridge/router/react']) {
  if (pkgJson.exports[removed] !== undefined) {
    fail(`破坏性收敛未落实：exports 仍暴露 ${removed}`)
  }
}
for (const removedDist of ['dist/config.js', 'dist/config.cjs', 'dist/config.d.ts']) {
  if (fs.existsSync(path.join(consumer, 'node_modules/@fulgurjs/federation', removedDist))) {
    fail(`已删除入口的产物仍随包发布：${removedDist}`)
  }
}
if (pkgJson.exports['./runtime']?.require) fail('/runtime 必须只有 ESM import 条件')
if (pkgJson.exports['./react']?.require) fail('/react 必须只有 ESM import 条件')
if (pkgJson.exports['./vue']?.require) fail('/vue 必须只有 ESM import 条件（6.0.0 统一入口）')
for (const required of ['./vue']) {
  if (!pkgJson.exports[required]) fail(`6.0.0 统一入口缺失：exports["${required}"]`)
}
// D08：可选 peer 三件套核对（vue/react/react-dom 均声明且 optional）
{
  const peers = pkgJson.peerDependencies ?? {}
  const meta = pkgJson.peerDependenciesMeta ?? {}
  for (const dep of ['vue', 'react', 'react-dom']) {
    if (!peers[dep]) fail(`peerDependencies 缺少 ${dep}`)
    if (meta[dep]?.optional !== true) fail(`${dep} 未声明 optional（纯框架消费者会被强制安装另一框架）`)
  }
  if (!/^>=18\.0\.0 <20$/.test(peers.react)) fail(`react peer 范围异常：${peers.react}`)
  if (!/^>=18\.0\.0 <20$/.test(peers['react-dom'])) fail(`react-dom peer 范围异常：${peers['react-dom']}`)
  log('peers OK: vue/react/react-dom 均 optional；react 范围 >=18.0.0 <20')
}
fs.writeFileSync(path.join(consumer, 'check-runtime.mjs'), `import * as runtimeEntry from '@fulgurjs/federation/runtime'\nimport * as pluginEntry from '@fulgurjs/federation'\nimport * as reactEntry from '@fulgurjs/federation/react'\nif (!('loadRemote' in runtimeEntry && 'remoteComponent' in runtimeEntry && 'remoteSchema' in runtimeEntry)) process.exit(2)\nif ('loadRemote' in pluginEntry) process.exit(3)\nif (!('remoteComponent' in reactEntry && 'useLoadRemote' in reactEntry && 'RemoteErrorBoundary' in reactEntry && 'createReactHostPages' in reactEntry && 'remoteSchema' in reactEntry)) process.exit(4)\nif ('createHostPages' in reactEntry || 'keepAliveNames' in reactEntry) process.exit(5)\n`)
const esmCheck = spawnSync(process.execPath, ['check-runtime.mjs'], { cwd: consumer, encoding: 'utf8' })
if (esmCheck.status !== 0) fail(`ESM 包路径导入失败：${esmCheck.stderr}`)
let requireRejected = false
try { consumerRequire('@fulgurjs/federation/runtime') } catch { requireRejected = true }
if (!requireRejected) fail('/runtime 不应能由 CommonJS require 加载')
let clientRejected = false
try { consumerRequire.resolve('@fulgurjs/federation/client') } catch { clientRejected = true }
if (!clientRejected) fail('已删除的 /client 子路径仍可解析')
let configRejected = false
try { consumerRequire.resolve('@fulgurjs/federation/config') } catch { configRejected = true }
if (!configRejected) fail('已删除的 /config 子路径（5.0.0 聚合配置链）仍可解析')
const runtimeEntry = await import(pathToFileURL(path.join(consumer, 'node_modules/@fulgurjs/federation/dist/runtime-entry.js')).href)
for (const name of ['loadRemote', 'remoteComponent', 'remoteSchema', 'clearAppContext', 'createHostPages']) {
  if (!(name in runtimeEntry)) fail(`/runtime 缺少 ${name}`)
}
log('types OK: . ./runtime；旧子路径（含 /config）已删除 ✓')

const tsc = path.join(PLUGIN_DIR, 'node_modules/.bin/tsc')
fs.writeFileSync(path.join(consumer, 'check-types.ts'), `import { loadRemote, definePages, remoteSchema } from '@fulgurjs/federation/runtime'\nimport type { RemoteInput } from '@fulgurjs/federation/runtime'\nimport { remoteComponent, useLoadRemote, RemoteErrorBoundary, createReactHostPages } from '@fulgurjs/federation/react'\nimport type { ReactRemoteComponentOptions, UseLoadRemoteResult } from '@fulgurjs/federation/react'\nimport { createElement } from 'react'\nconst remote: RemoteInput = { name: 'demo', entry: '/remoteEntry.js' }\ndefinePages([{ route: '/demo/list' }], { schema: remoteSchema })\nconst RC = remoteComponent<{ label: string }>('demo/Button', { fallback: createElement('p', null, 'loading') })\nconst hp = createReactHostPages({ pages: [], remotePrefixes: {} })\nconst opts: ReactRemoteComponentOptions = { retries: 1, timeout: 5000 }\nfunction useProbe(): UseLoadRemoteResult<{ v: number }> { return useLoadRemote('demo/utils') }\nvoid loadRemote; void remote; void RC; void hp; void opts; void useProbe; void RemoteErrorBoundary\n`)
for (const [name, module, moduleResolution] of [['bundler', 'esnext', 'bundler'], ['node10', 'commonjs', 'node10']]) {
  const config = `tsconfig.${name}.json`
  fs.writeFileSync(path.join(consumer, config), JSON.stringify({ compilerOptions: { target: 'es2022', module, moduleResolution, strict: true, noEmit: true, skipLibCheck: true, types: [] }, files: ['check-types.ts'] }))
  const checked = spawnSync(tsc, ['-p', config], { cwd: consumer, encoding: 'utf8' })
  if (checked.status !== 0) fail(`${name} tarball 类型解析失败：${checked.stdout}${checked.stderr}`)
}
log('ESM import + bundler/node10 类型解析 OK')

// 4. 最小联邦工程（宿主 + exposes + remotes）
fs.writeFileSync(
  path.join(consumer, 'index.html'),
  `<!doctype html><html><body><div id="app"></div><script type="module" src="/src/main.ts"></script></body></html>`,
)
fs.mkdirSync(path.join(consumer, 'src'), { recursive: true })
fs.writeFileSync(
  path.join(consumer, 'src/main.ts'),
  `import { loadRemote, version, remoteSchema } from '@fulgurjs/federation/runtime'\nexport const v = version\nexport const schema = remoteSchema\nexport const load = () => loadRemote('smoke-r/Widget')\n`,
)
fs.writeFileSync(
  path.join(consumer, 'src/exposed.ts'),
  `import { version, remoteComponent } from '@fulgurjs/federation/runtime'\nexport const exposedRuntimeVersion = version\nexport const Widget = remoteComponent('smoke-r/Widget')\n`,
)
fs.writeFileSync(
  path.join(consumer, 'vite.config.ts'),
  `import { defineConfig } from 'vite'\nimport vue from '@vitejs/plugin-vue'\nimport { federation } from '@fulgurjs/federation'\n\nexport default defineConfig({\n  plugins: [\n    vue(),\n    federation({\n      name: 'pack-smoke',\n      exposes: { './Widget': './src/exposed.ts' },\n      remotes: { 'smoke-r': { dev: 'http://localhost:${PORT}', prod: '/smoke-r' } },\n      shared: { vue: { singleton: true } },\n    }),\n  ],\n})\n`,
)

const viteBin = path.join(consumer, 'node_modules/.bin/vite')
const vitePkg = JSON.parse(fs.readFileSync(path.join(consumer, 'node_modules/vite/package.json'), 'utf8'))
const rollupPkgPath = path.join(consumer, 'node_modules', 'rollup', 'package.json')
const rolldownPkgPath = path.join(consumer, 'node_modules', 'rolldown', 'package.json')
const bundlerVersion = fs.existsSync(rollupPkgPath)
  ? `rollup ${JSON.parse(fs.readFileSync(rollupPkgPath, 'utf8')).version}`
  : fs.existsSync(rolldownPkgPath)
    ? `rolldown ${JSON.parse(fs.readFileSync(rolldownPkgPath, 'utf8')).version}`
    : 'unknown'
log(`consumer vite ${vitePkg.version} / bundler: ${bundlerVersion}`)

// 5. 真实 vite build
const buildRes = spawnSync(viteBin, ['build'], { cwd: consumer, encoding: 'utf8' })
if (buildRes.status !== 0) {
  console.error(buildRes.stdout)
  console.error(buildRes.stderr)
  fail(`vite build 失败（vite ${vitePkg.version} / ${bundlerVersion}）`)
}
const dist = path.join(consumer, 'dist')
for (const f of ['fulgurjs-remoteEntry.js', 'fulgurjs-manifest.json']) {
  if (!fs.existsSync(path.join(dist, f))) fail(`build 产物缺失：dist/${f}`)
}
log(`vite build OK（fulgurjs-remoteEntry.js + fulgurjs-manifest.json 产出）`)

// 6. 最小 dev 页面加载
const dev = spawn(viteBin, ['--port', PORT, '--strictPort'], {
  cwd: consumer,
  stdio: 'ignore',
  detached: false,
  env: { ...process.env },
})
let devOk = false
try {
  const deadline = Date.now() + 60_000
  const get = async (u) => await fetch(u, { signal: AbortSignal.timeout(3000) })
  while (Date.now() < deadline) {
    try {
      const [page, entry, mainMod, exposedMod] = await Promise.all([
        get(`http://localhost:${PORT}/`),
        get(`http://localhost:${PORT}/@fulgurjs-entry.js`),
        get(`http://localhost:${PORT}/src/main.ts`),
        get(`http://localhost:${PORT}/src/exposed.ts`),
      ])
      const mainText = await mainMod.text().catch(() => '')
      const exposedText = await exposedMod.text().catch(() => '')
      if (page.ok && entry.ok && mainMod.ok && exposedMod.ok &&
          mainText.includes('virtual:fulgurjs-remote-schema') &&
          exposedText.includes('virtual:fulgurjs-api-facade')) {
        devOk = true
        break
      }
    } catch {
      /* dev server 尚未就绪，继续轮询 */
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  if (!devOk) fail(`dev server 探测失败（/ 或 /@fulgurjs-entry.js 未就绪，vite ${vitePkg.version}）`)
  log('dev page load OK（宿主 schema 导入拆分 + expose 内部门面）')
} finally {
  dev.kill('SIGTERM')
}

// ── 7. React consumer：tarball 的 /react 入口真实工程（build + dev 门面探测） ──
const reactApp = path.join(tmp, 'react-app')
fs.mkdirSync(path.join(reactApp, 'src'), { recursive: true })
fs.writeFileSync(
  path.join(reactApp, 'package.json'),
  JSON.stringify({ name: 'pack-smoke-react', private: true, type: 'module' }, null, 2),
)
execSync(`npm install "${tarballPath}" react@19.3.0 react-dom@19.3.0 @vitejs/plugin-react@5.2.0 vite@^6.3.5 --no-audit --no-fund`, {
  cwd: reactApp,
  stdio: 'inherit',
  env: npmEnv,
})
fs.writeFileSync(path.join(reactApp, 'index.html'), `<!doctype html><html><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>`)
fs.writeFileSync(
  path.join(reactApp, 'src/main.tsx'),
  `import { createElement } from 'react'\nimport { createRoot } from 'react-dom/client'\nimport { remoteComponent, remoteSchema, version } from '@fulgurjs/federation/react'\nconst RC = remoteComponent('r/Widget')\nexport const v = version\nexport const schema = remoteSchema\ncreateRoot(document.getElementById('root')!).render(createElement(RC))\n`,
)
fs.writeFileSync(
  path.join(reactApp, 'src/exposed.tsx'),
  `import { remoteComponent, provideAppContext } from '@fulgurjs/federation/react'\nexport const Widget = remoteComponent('r/Widget')\nexport const provide = provideAppContext\n`,
)
fs.writeFileSync(
  path.join(reactApp, 'vite.config.ts'),
  `import { defineConfig } from 'vite'\nimport react from '@vitejs/plugin-react'\nimport federation from '@fulgurjs/federation'\n\nexport default defineConfig({\n  plugins: [\n    react(),\n    federation({\n      name: 'pack-smoke-react',\n      exposes: { './Widget': './src/exposed.tsx' },\n      remotes: { 'r': { dev: 'http://localhost:${PORT}', prod: '/r' } },\n      shared: { react: { singleton: true }, 'react-dom': { singleton: true } },\n    }),\n  ],\n})\n`,
)
const reactVite = path.join(reactApp, 'node_modules/.bin/vite')
const reactBuild = spawnSync(reactVite, ['build'], { cwd: reactApp, encoding: 'utf8' })
if (reactBuild.status !== 0) {
  console.error(reactBuild.stdout)
  console.error(reactBuild.stderr)
  fail('React consumer vite build 失败')
}
for (const f of ['fulgurjs-remoteEntry.js', 'fulgurjs-manifest.json']) {
  if (!fs.existsSync(path.join(reactApp, 'dist', f))) fail(`React build 产物缺失：dist/${f}`)
}
log('React consumer vite build OK')

const REACT_PORT = '5598'
const reactDev = spawn(reactVite, ['--port', REACT_PORT, '--strictPort'], { cwd: reactApp, stdio: 'ignore', detached: false })
let reactDevOk = false
try {
  const deadline = Date.now() + 60_000
  const get = async (u) => await fetch(u, { signal: AbortSignal.timeout(3000) })
  while (Date.now() < deadline) {
    try {
      const [page, entry, mainMod, exposedMod] = await Promise.all([
        get(`http://localhost:${REACT_PORT}/`),
        get(`http://localhost:${REACT_PORT}/@fulgurjs-entry.js`),
        get(`http://localhost:${REACT_PORT}/src/main.tsx`),
        get(`http://localhost:${REACT_PORT}/src/exposed.tsx`),
      ])
      const mainText = await mainMod.text().catch(() => '')
      const exposedText = await exposedMod.text().catch(() => '')
      if (page.ok && entry.ok && mainMod.ok && exposedMod.ok &&
          mainText.includes('virtual:fulgurjs-remote-schema') &&
          exposedText.includes('virtual:fulgurjs-api-facade-react')) {
        reactDevOk = true
        break
      }
    } catch {
      /* dev server 尚未就绪，继续轮询 */
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  if (!reactDevOk) fail('React dev server 探测失败（/react 门面未接入 expose 转换）')
  log('React dev page load OK（/react schema 拆分 + react 门面）')
} finally {
  reactDev.kill('SIGTERM')
}

fs.rmSync(tmp, { recursive: true, force: true })
log(`PASS: tarball ${tarball} — exports 解析（./react）/ 类型文件 / vite build（Vue+React）/ dev 页面加载（Vue+React）全部通过`)
