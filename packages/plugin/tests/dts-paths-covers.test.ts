/**
 * D02 回归：hostPathsCovers 语义化判定（任务书 §4）。
 * 修复前：注释中的 paths、无关 tsconfig.node.json 的 paths、仅 exact 键都会误判启用精确轨。
 * 修复后：只有「实际生效的 tsconfig 上下文」中「语义解析出的 paths」覆盖 `<remote>/*` 才算启用。
 */
import { describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { generateDevTypes, hostPathsCovers } from '../src/dts'

function tmpProject(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'd02-paths-'))
}

function fakeServer(manifest: unknown) {
  return {
    config: { server: { origin: 'http://localhost:5199' } },
    resolvedUrls: { local: ['http://localhost:5199'] },
  } as never
}

const MANIFEST = {
  schemaVersion: 1,
  id: 'r',
  name: 'r',
  version: '5.1.0',
  devServer: true,
  base: '/',
  entry: '/@fulgurjs-entry.js',
  fsRoot: '/nonexistent-root-for-degradation',
  exposes: [{ name: './Button', src: './src/Button.tsx', file: '/src/Button.tsx' }],
  shared: [],
}

describe('hostPathsCovers 语义判定', () => {
  it('主 tsconfig 有效 wildcard paths → true', () => {
    const root = tmpProject()
    fs.writeFileSync(path.join(root, 'tsconfig.json'), JSON.stringify({
      compilerOptions: { baseUrl: '.', paths: { 'r/*': ['./types/r.d/*'] } },
    }))
    expect(hostPathsCovers(root, 'r')).toBe(true)
  })

  it('注释中的 paths 不误判（D02 复现用例）', () => {
    const root = tmpProject()
    fs.writeFileSync(path.join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: {} }))
    fs.writeFileSync(path.join(root, 'tsconfig.node.json'),
      '{ "compilerOptions": { /* "r/*": ["types/r.d/*"] */ } }')
    expect(hostPathsCovers(root, 'r')).toBe(false)
  })

  it('无关 tsconfig.node.json 的 paths 不影响主上下文', () => {
    const root = tmpProject()
    fs.writeFileSync(path.join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: {} }))
    fs.writeFileSync(path.join(root, 'tsconfig.node.json'), JSON.stringify({
      compilerOptions: { paths: { 'r/*': ['./types/r.d/*'] } },
    }))
    expect(hostPathsCovers(root, 'r')).toBe(false)
  })

  it('仅 exact 键（无 wildcard）不覆盖 r/Button（TS 语义：exact 只映射模块 r 本身）', () => {
    const root = tmpProject()
    fs.writeFileSync(path.join(root, 'tsconfig.json'), JSON.stringify({
      compilerOptions: { paths: { 'r': ['./types/r.d/index'] } },
    }))
    expect(hostPathsCovers(root, 'r')).toBe(false)
  })

  it('extends 继承的 paths 按声明文件位置解析生效', () => {
    const root = tmpProject()
    fs.writeFileSync(path.join(root, 'tsconfig.base.json'), JSON.stringify({
      compilerOptions: { paths: { 'r/*': ['./shared-types/r.d/*'] } },
    }))
    fs.writeFileSync(path.join(root, 'tsconfig.json'), JSON.stringify({
      extends: './tsconfig.base.json',
      compilerOptions: {},
    }))
    expect(hostPathsCovers(root, 'r')).toBe(true)
  })

  it('目标指向别处：仍跳过 ambient（避免遮蔽用户自有映射），并给出诊断', () => {
    const root = tmpProject()
    fs.writeFileSync(path.join(root, 'tsconfig.json'), JSON.stringify({
      compilerOptions: { paths: { 'r/*': ['./vendor/r/*'] } },
    }))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const hit = hostPathsCovers(root, 'r', path.join(root, 'src/fulgurjs/types', 'r.d'))
    expect(hit).toBe(true) // 跳过 ambient（ambient 会遮蔽任何 paths 命中，实测行为）
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('未指向插件生成的精确目录'))
    warnSpy.mockRestore()
  })

  it('含注释/尾逗号的 JSONC 语义解析', () => {
    const root = tmpProject()
    fs.writeFileSync(path.join(root, 'tsconfig.json'),
      '{\n  // comment\n  "compilerOptions": {\n    "paths": { "r/*": ["./types/r.d/*"], }, // trailing\n  },\n}')
    expect(hostPathsCovers(root, 'r')).toBe(true)
  })
})

describe('D02 端到端：paths 误判不再抑制 ambient', () => {
  it('注释 paths 场景下 ambient 照常生成（用户导入可解析）', async () => {
    const root = tmpProject()
    fs.mkdirSync(path.join(root, 'src'), { recursive: true })
    fs.writeFileSync(path.join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: {} }))
    fs.writeFileSync(path.join(root, 'tsconfig.node.json'),
      '{ "compilerOptions": { /* "r/*": ["types/r.d/*"] */ } }')
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'd02-e2e', private: true }))
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => MANIFEST }))
    const origFetch = globalThis.fetch
    globalThis.fetch = fetchMock as never
    const opts = {
      name: 'host', exposes: [], remotes: [{ key: 'r', name: 'r', shareScope: 'default', devEntry: 'http://localhost:5199/@fulgurjs-entry.js', prodEntry: '/r' }],
      shared: [], shareScope: 'default', filename: 'x.js', runtimePlugins: [], dts: true,
      root, pluginVersion: '5.1.0', pkgDependencies: {}, warnings: [], devSharedSelf: false,
      devCorsOrigins: undefined as never, devFsRoot: true,
    }
    try {
      await generateDevTypes(opts as never, fakeServer(MANIFEST))
    } finally {
      globalThis.fetch = origFetch
    }
    const ambient = path.join(root, 'src/fulgurjs/types/r.d.ts')
    // fsRoot 不可访问 → 降级 ambient（writeAnyModules）；不得因注释 paths 误跳过
    expect(fs.existsSync(ambient)).toBe(true)
    expect(fs.readFileSync(ambient, 'utf8')).toContain('declare module "r/Button";')
  })
})
