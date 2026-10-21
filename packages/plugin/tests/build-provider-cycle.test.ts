/**
 * BLD-007 回归：多 shared 键本地副本闭包交错 → provider chunk 静态环必须在构建期
 * 被确定性拦截（附环路与改法），而不是产出运行期 undefined/TDZ 的随机崩溃产物。
 * 用临时 node_modules 里两个互相静态依赖的小包构造确定性环；单键场景必须照常构建成功。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'
import { expect, it } from 'vitest'
import { federation } from '../src/index'

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function scaffold(root: string): void {
  fs.mkdirSync(path.join(root, 'node_modules'), { recursive: true })
  fs.symlinkSync(path.join(pluginRoot, 'node_modules', 'vite'), path.join(root, 'node_modules', 'vite'), 'dir')
  for (const name of ['dep-a', 'dep-b']) {
    const dir = path.join(root, 'node_modules', name)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name, version: '1.0.0', main: 'index.js', type: 'module' }))
  }
  // 互相静态依赖：provider chunk 之间必然互为静态边
  fs.writeFileSync(path.join(root, 'node_modules/dep-a/index.js'), "import { b } from 'dep-b'\nexport const a = 'a' + b\n")
  fs.writeFileSync(path.join(root, 'node_modules/dep-b/index.js'), "import { a } from 'dep-a'\nexport const b = 'b' + a\n")
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'cycle-consumer', type: 'module' }))
  fs.writeFileSync(path.join(root, 'index.html'), '<!doctype html><html><body><script type="module" src="/src/main.js"></script></body></html>')
  fs.mkdirSync(path.join(root, 'src'), { recursive: true })
  fs.writeFileSync(path.join(root, 'src/main.js'), "console.log('entry')")
}

it('双 shared 键互为静态依赖 → 构建拒绝并报 BLD-007（附环路与改法）', { timeout: 60_000 }, async () => {
  const root = fs.mkdtempSync(path.join(pluginRoot, '..', '.provider-cycle-'))
  try {
    scaffold(root)
    await expect(build({
      root, configFile: false, logLevel: 'error',
      plugins: [federation({
        name: 'cycle-consumer',
        remotes: { other: '/other' },
        shared: { 'dep-a': { singleton: true }, 'dep-b': { singleton: true } },
        dts: false,
      })],
      build: { target: 'es2022', minify: false, outDir: 'dist', write: false },
    })).rejects.toThrow(/BLD-007[\s\S]*dep-a[\s\S]*dep-b/)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

it('单 shared 键（无环）照常构建成功——拦截不误伤正常多键/单键场景', { timeout: 60_000 }, async () => {
  const root = fs.mkdtempSync(path.join(pluginRoot, '..', '.provider-cycle-'))
  try {
    scaffold(root)
    const bundle = await build({
      root, configFile: false, logLevel: 'error',
      plugins: [federation({
        name: 'cycle-consumer',
        remotes: { other: '/other' },
        shared: { 'dep-a': { singleton: true } },
        dts: false,
      })],
      build: { target: 'es2022', minify: false, outDir: 'dist', write: false },
    })
    const output = ((bundle as unknown as { output?: unknown[] }).output ?? (bundle as unknown as unknown[])) as Array<{ type?: string; fileName?: string }>
    const chunks = output.filter((f) => f.type === 'chunk').map((f) => String(f.fileName))
    expect(chunks.some((c) => c.includes('fulgurjs-provider-dep-a'))).toBe(true)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
