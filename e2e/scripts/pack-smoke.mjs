/**
 * WP3：npm tarball consumer smoke。
 *
 * 验证发布产物（而非 link: 工作区）可被真实消费：
 * 1. packages/plugin 下 npm pack 出 tarball；
 * 2. 临时 consumer 以普通依赖安装 tarball（外加 vue / vite / @vitejs/plugin-vue）；
 * 3. exports 解析面：根入口、/pages、/vue、/context 与对应 .d.ts 全部可解析；
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
execSync(`npm install "${tarballPath}" vue@^3.5.22 vite@^6.3.5 @vitejs/plugin-vue@^5.2.0 --no-audit --no-fund`, {
  cwd: consumer,
  stdio: 'inherit',
  env: npmEnv,
})

// 3. exports 解析面（根入口 + 子路径 + 类型文件）
const consumerRequire = createRequire(path.join(consumer, 'package.json'))
// 3.0.0：唯一运行时入口 virtual:fulgurjs-api（旧子路径已删除，见 exports 负向断言）
const entryPoints = ['@fulgurjs/federation', '@fulgurjs/federation/config']
for (const ep of entryPoints) {
  try {
    consumerRequire.resolve(ep)
    log(`resolve OK: ${ep}`)
  } catch (e) {
    fail(`exports 解析失败：${ep}（${e.message}）`)
  }
}
const pkgJson = JSON.parse(fs.readFileSync(path.join(consumer, 'node_modules/@fulgurjs/federation/package.json'), 'utf8'))
for (const sub of ['.', './config']) {
  const typesFile = pkgJson.exports[sub]?.types
  if (!typesFile || !fs.existsSync(path.join(consumer, 'node_modules/@fulgurjs/federation', typesFile))) {
    fail(`类型文件缺失：exports["${sub}"].types = ${typesFile}`)
  }
}
// 3.0.0 破坏性断言：旧公开子路径必须已从 exports 删除
for (const removed of ['./pages', './context', './vue']) {
  if (pkgJson.exports[removed] !== undefined) {
    fail(`3.0.0 破坏性收敛未落实：exports 仍暴露 ${removed}`)
  }
}
log('types OK: ./ ./config；旧子路径已删除 ✓')

// 4. 最小联邦工程（宿主 + exposes + remotes）
fs.writeFileSync(
  path.join(consumer, 'index.html'),
  `<!doctype html><html><body><div id="app"></div><script type="module" src="/src/main.ts"></script></body></html>`,
)
fs.mkdirSync(path.join(consumer, 'src'), { recursive: true })
fs.writeFileSync(
  path.join(consumer, 'src/main.ts'),
  `import { loadRemote, version } from 'virtual:fulgurjs-runtime'\nexport const v = version\nexport const load = () => loadRemote('smoke-r/Widget')\n`,
)
fs.writeFileSync(
  path.join(consumer, 'src/exposed.ts'),
  `import { version } from 'virtual:fulgurjs-runtime'\nexport const exposedRuntimeVersion = version\n`,
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
      const [page, entry, apiMod] = await Promise.all([
        get(`http://localhost:${PORT}/`),
        get(`http://localhost:${PORT}/@fulgurjs-entry.js`),
        get(`http://localhost:${PORT}/@id/virtual:fulgurjs-api`),
      ])
      const apiText = await apiMod.text().catch(() => '')
      if (page.ok && entry.ok && apiMod.ok && apiText.includes('virtual:fulgurjs-runtime-proxy')) {
        devOk = true
        break
      }
    } catch {
      /* dev server 尚未就绪，继续轮询 */
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  if (!devOk) fail(`dev server 探测失败（/ 或 /@fulgurjs-entry.js 未就绪，vite ${vitePkg.version}）`)
  log('dev page load OK（/ 200 + /@fulgurjs-entry.js 200 + api 门面 serve 形态 200）')
} finally {
  dev.kill('SIGTERM')
}

fs.rmSync(tmp, { recursive: true, force: true })
log(`PASS: tarball ${tarball} — exports 解析 / 类型文件 / vite build / dev 页面加载 全部通过`)
