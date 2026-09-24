/**
 * 最新 TypeScript 口径的类型回归：根治"工程内旧 vue-tsc 绿、用户 IDE（新 TS）红"的盲区。
 *
 * 机制：固定目录 .typecheck-latest/ 维护一个临时工程（typescript + vue-tsc +
 * vue@latest + element-plus@latest），把本包产物（dist）与 tests/types-repro
 * 典型消费形态样例放入其中，跑 vue-tsc --noEmit —— 任一样例报错即 exit 1。
 *
 * 用法：npm run typecheck:latest（先 build，本脚本不重复 build）
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PKG = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const DIR = path.join(PKG, '.typecheck-latest')
const REPRO = path.join(PKG, 'tests', 'types-repro')

const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { stdio: opts.capture ? 'pipe' : 'inherit', encoding: 'utf8', cwd: opts.cwd ?? DIR })
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' }
}

// 1) 临时工程初始化（存在则复用；首次需联网装最新包）
if (!fs.existsSync(path.join(DIR, 'node_modules', 'typescript'))) {
  fs.rmSync(DIR, { recursive: true, force: true })
  fs.mkdirSync(DIR, { recursive: true })
  fs.writeFileSync(path.join(DIR, 'package.json'), JSON.stringify({ private: true, type: 'module' }))
  // typescript 锁 5.x 最新线（@latest 已是 7.x Go 版，vue-tsc 尚未兼容其包导出；IDE 亦为 5.x 口径）
  const install = run('npx', ['--yes', 'pnpm@latest', 'add', 'typescript@5', 'vue-tsc@latest', 'vue@latest', 'element-plus@latest'], { capture: true })
  if (install.status !== 0) {
    console.error('[typecheck-latest] 依赖安装失败：\n' + install.stdout + install.stderr)
    process.exit(1)
  }
}

// 2) 本包产物（dist 为唯一类型面：exports/typesVersions 均指向 dist）同步进临时工程 node_modules
const pkgNameDir = path.join(DIR, 'node_modules', '@fulgurjs', 'federation')
fs.rmSync(pkgNameDir, { recursive: true, force: true })
fs.mkdirSync(pkgNameDir, { recursive: true })
for (const entry of ['dist', 'package.json']) {
  fs.cpSync(path.join(PKG, entry), path.join(pkgNameDir, entry), { recursive: true })
}

// 3) 样例与 tsconfig
fs.rmSync(path.join(DIR, 'src'), { recursive: true, force: true })
fs.cpSync(REPRO, path.join(DIR, 'src'), { recursive: true })
fs.writeFileSync(
  path.join(DIR, 'tsconfig.json'),
  JSON.stringify(
    {
      compilerOptions: {
        target: 'esnext',
        module: 'esnext',
        moduleResolution: 'bundler',
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        jsx: 'preserve',
        types: [],
      },
      include: ['src/**/*.ts'],
    },
    null,
    2,
  ),
)

// 4) 最新 vue-tsc 检查
const vueTsc = path.join(DIR, 'node_modules', '.bin', 'vue-tsc')
const result = run(vueTsc, ['--noEmit', '-p', path.join(DIR, 'tsconfig.json')])
if (result.status !== 0) {
  console.error('[typecheck-latest] 最新 TS 口径存在类型错误（样例=tests/types-repro，正是用户 IDE 视角）：')
  process.exit(1)
}
console.log('[typecheck-latest] 最新 TS 口径 0 错误 ✓（tests/types-repro 典型消费形态全过）')

// node10 模块解析不读取 exports，必须验证 typesVersions 能解析 /runtime。
fs.writeFileSync(
  path.join(DIR, 'tsconfig.node10.json'),
  JSON.stringify({
    compilerOptions: {
      target: 'esnext', module: 'commonjs', moduleResolution: 'node10',
      strict: true, noEmit: true, skipLibCheck: true, esModuleInterop: true, types: [],
    },
    include: ['src/**/*.ts'],
  }, null, 2),
)
const tsc = path.join(DIR, 'node_modules', '.bin', 'tsc')
const legacy = run(tsc, ['--noEmit', '-p', path.join(DIR, 'tsconfig.node10.json')])
if (legacy.status !== 0) {
  console.error('[typecheck-latest] node10/typesVersions 类型解析失败')
  process.exit(1)
}
console.log('[typecheck-latest] node10/typesVersions 0 错误 ✓')

fs.writeFileSync(
  path.join(DIR, 'tsconfig.removed-client.json'),
  JSON.stringify({
    compilerOptions: {
      target: 'esnext', module: 'esnext', moduleResolution: 'bundler',
      noEmit: true, skipLibCheck: true, types: ['@fulgurjs/federation/client'],
    },
    files: ['src/03-pages.ts'],
  }, null, 2),
)
const removedClient = run(tsc, ['--noEmit', '-p', path.join(DIR, 'tsconfig.removed-client.json')], { capture: true })
if (removedClient.status === 0 || !removedClient.stdout.includes("Cannot find type definition file for '@fulgurjs/federation/client'")) {
  console.error('[typecheck-latest] 已删除 client 子路径的负向类型断言未生效：\n' + removedClient.stdout + removedClient.stderr)
  process.exit(1)
}
console.log('[typecheck-latest] 旧 client types 配置按预期报可读错误 ✓')
