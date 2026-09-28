#!/usr/bin/env node
/**
 * React 负向验证（任务书 N08/N10/N11 的脚本化部分；N07 浏览器版在 react-fault.spec）。
 *
 * N08 React 远程真实 Vite 非法配置 → 非零退出 + 中文诊断（不新增无效字段才能跑）
 * N10 纯 React 工程不装 Vue 可用（build + dev）+ 纯 Vue 工程不装 React 可用（既有事实复核）
 * N11 缺 React 却导入 /react → 按 JS 生态解析错误失败（不提供假实现）
 *
 * 用法：SKIP_PLUGIN_BUILD=1 node e2e/scripts/react-negative-check.mjs
 */
import { execSync, spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(SCRIPT_DIR, '../..')
const PLUGIN_DIR = path.join(REPO, 'packages/plugin')
const log = (m) => console.log(`[react-neg] ${m}`)
const fail = (m) => {
  console.error(`[react-neg] FAIL: ${m}`)
  process.exit(1)
}

if (!process.env.SKIP_PLUGIN_BUILD) {
  execSync('npm run build', { cwd: PLUGIN_DIR, stdio: 'inherit' })
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fulgurjs-react-neg.'))
const pack = (app) => {
  fs.mkdirSync(path.join(tmp, app))
  execSync(`npm pack --pack-destination "${path.join(tmp, app)}"`, { cwd: PLUGIN_DIR, stdio: 'pipe' })
  const tgz = fs.readdirSync(path.join(tmp, app)).find((f) => f.endsWith('.tgz'))
  if (!tgz) fail('npm pack 未产出')
  return path.join(tmp, app, tgz)
}

// ── N08：React 远程非法配置 → vite build 非零 + 中文诊断 ──────────────────────
{
  const app = path.join(tmp, 'n08')
  fs.mkdirSync(path.join(app, 'src'), { recursive: true })
  const tgz = pack('n08-pack')
  fs.writeFileSync(path.join(app, 'package.json'), JSON.stringify({ name: 'n08', private: true, type: 'module' }))
  execSync(`npm install "${tgz}" react@19.3.0 react-dom@19.3.0 @vitejs/plugin-react@5.2.0 vite@^6.3.5 --no-audit --no-fund`, { cwd: app, stdio: 'pipe' })
  fs.writeFileSync(path.join(app, 'index.html'), '<div id="root"></div><script type="module" src="/src/main.tsx"></script>')
  fs.writeFileSync(path.join(app, 'src/main.tsx'), `import { createRoot } from 'react-dom/client'\ncreateRoot(document.getElementById('root')!).render(null)\n`)
  // 非法字段组合：timeout 负数（CFG-009）+ 已删除的 remoteType（CFG-011）
  fs.writeFileSync(path.join(app, 'vite.config.ts'), `import { defineConfig } from 'vite'\nimport react from '@vitejs/plugin-react'\nimport federation from '@fulgurjs/federation'\n\nexport default defineConfig({\n  plugins: [react(), federation({\n    name: 'n08-remote',\n    exposes: { './M': './src/main.tsx' },\n    remotes: { 'dead': { external: 'http://localhost:5999', timeout: -5 } },\n    shared: { react: { singleton: true } },\n  })],\n})\n`)
  const r = spawnSync(path.join(app, 'node_modules/.bin/vite'), ['build'], { cwd: app, encoding: 'utf8' })
  if (r.status === 0) fail('N08：非法配置的 vite build 竟然成功（timeout: -5 应配置期非零）')
  const out = `${r.stdout}${r.stderr}`
  if (!/timeout|CFG-009|无效/.test(out)) fail(`N08：诊断未指向 timeout 非法：${out.slice(0, 300)}`)
  log('N08 ✓ 非法 timeout 配置期非零 + 中文诊断')

  // 正常字段（去掉非法项）应当可构建——非法项不是必需字段
  fs.writeFileSync(path.join(app, 'vite.config.ts'), `import { defineConfig } from 'vite'\nimport react from '@vitejs/plugin-react'\nimport federation from '@fulgurjs/federation'\n\nexport default defineConfig({\n  plugins: [react(), federation({\n    name: 'n08-remote',\n    exposes: { './M': './src/main.tsx' },\n    shared: { react: { singleton: true } },\n  })],\n})\n`)
  const ok = spawnSync(path.join(app, 'node_modules/.bin/vite'), ['build'], { cwd: app, encoding: 'utf8' })
  if (ok.status !== 0) fail(`N08：正常配置构建失败：${ok.stdout}${ok.stderr}`)
  log('N08 ✓ 正常 fields（无旧无效字段）可构建')
}

// ── N10：纯 React 工程不装 Vue；静态传递图无 Vue ─────────────────────────────
{
  const app = path.join(tmp, 'n10')
  fs.mkdirSync(path.join(app, 'src'), { recursive: true })
  const tgz = pack('n10-pack')
  fs.writeFileSync(path.join(app, 'package.json'), JSON.stringify({ name: 'n10', private: true, type: 'module' }))
  execSync(`npm install "${tgz}" react@19.3.0 react-dom@19.3.0 @vitejs/plugin-react@5.2.0 vite@^6.3.5 --no-audit --no-fund`, { cwd: app, stdio: 'pipe' })
  if (fs.existsSync(path.join(app, 'node_modules/vue'))) fail('N10：纯 React consumer 不应安装 vue')
  fs.writeFileSync(path.join(app, 'index.html'), '<div id="root"></div><script type="module" src="/src/main.tsx"></script>')
  fs.writeFileSync(path.join(app, 'src/main.tsx'), `import { remoteComponent, version } from '@fulgurjs/federation/react'\nimport { createRoot } from 'react-dom/client'\nconst RC = remoteComponent('x/M')\nexport const v = version\ncreateRoot(document.getElementById('root')!).render(RC)\n`)
  fs.writeFileSync(path.join(app, 'vite.config.ts'), `import { defineConfig } from 'vite'\nimport react from '@vitejs/plugin-react'\nimport federation from '@fulgurjs/federation'\n\nexport default defineConfig({\n  plugins: [react(), federation({ name: 'n10', exposes: { './M': './src/main.tsx' }, shared: { react: { singleton: true } } })],\n})\n`)
  const build = spawnSync(path.join(app, 'node_modules/.bin/vite'), ['build'], { cwd: app, encoding: 'utf8' })
  if (build.status !== 0) fail(`N10：纯 React build 失败：${build.stdout}${build.stderr}`)
  // dev 冒烟：页面 + 容器端点 200（无 vue 依赖运行）
  const dev = spawn(path.join(app, 'node_modules/.bin/vite'), ['--port', '5597', '--strictPort'], { cwd: app, stdio: 'ignore' })
  try {
    let okPage = false
    const deadline = Date.now() + 45_000
    while (Date.now() < deadline) {
      try {
        const [p, e] = await Promise.all([
          fetch('http://localhost:5597/', { signal: AbortSignal.timeout(2000) }),
          fetch('http://localhost:5597/@fulgurjs-entry.js', { signal: AbortSignal.timeout(2000) }),
        ])
        if (p.ok && e.ok) { okPage = true; break }
      } catch { /* 未就绪 */ }
      await new Promise((r) => setTimeout(r, 500))
    }
    if (!okPage) fail('N10：纯 React dev 页面/容器端点未就绪')
    log('N10 ✓ 纯 React（零 vue 安装）build + dev 可用')
  } finally {
    dev.kill('SIGTERM')
  }
  // 反向：纯 Vue fixture（host-vue）node_modules 无 react——仓库事实复核
  if (fs.existsSync(path.join(REPO, 'fixtures/host-vue/node_modules/react'))) fail('N10：host-vue 不应安装 react')
  log('N10 ✓ 纯 Vue fixture 零 react 安装（仓库事实）')
}

// ── N11：缺 React 却导入 /react → JS 生态解析错误失败 ────────────────────────
{
  const app = path.join(tmp, 'n11')
  fs.mkdirSync(path.join(app, 'src'), { recursive: true })
  const tgz = pack('n11-pack')
  fs.writeFileSync(path.join(app, 'package.json'), JSON.stringify({ name: 'n11', private: true, type: 'module' }))
  execSync(`npm install "${tgz}" vite@^6.3.5 --no-audit --no-fund`, { cwd: app, stdio: 'pipe' }) // 故意不装 react
  fs.writeFileSync(path.join(app, 'index.html'), '<p>no react</p><script type="module" src="/src/main.ts"></script>')
  // 顶层真实使用（防 tree-shaking 摇掉未消费的导出使 react-adapter 不进模块图）
  fs.writeFileSync(path.join(app, 'src/main.ts'), `import { remoteComponent } from '@fulgurjs/federation/react'\nconsole.log(remoteComponent('x/M'))\n`)
  fs.writeFileSync(path.join(app, 'vite.config.ts'), `import { defineConfig } from 'vite'\nimport federation from '@fulgurjs/federation'\n\nexport default defineConfig({ plugins: [federation({ name: 'n11' })] })\n`)
  const build = spawnSync(path.join(app, 'node_modules/.bin/vite'), ['build'], { cwd: app, encoding: 'utf8' })
  if (build.status === 0) fail('N11：缺 react 时导入 /react 竟然构建成功（提供了假实现？）')
  const out = `${build.stdout}${build.stderr}`
  if (!/react/.test(out)) fail('N11：错误未指向 react 解析失败')
  log('N11 ✓ 缺 react 导入 /react → 生态解析错误非零（无假实现）')
}

fs.rmSync(tmp, { recursive: true, force: true })
log('PASS: N08 / N10 / N11 全部通过')
