/**
 * 远程类型链纯函数单测：dts-shared（清单校验）、dts-ambient（ambient 变换）、
 * dts-discovery（tsconfig 发现检查）。
 */
import { describe, expect, it } from 'vitest'
import { parseDtsIndex, isSafeBundlePath, TYPES_SCHEMA_VERSION } from '../src/dts-shared'
import { buildAmbientDeclarations } from '../src/dts-ambient'
import { checkTypesDiscovery } from '../src/dts-discovery'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const okIndex = {
  schemaVersion: TYPES_SCHEMA_VERSION,
  generator: '@fulgurjs/federation',
  pluginVersion: '6.5.0',
  revision: 'a'.repeat(16),
  exposes: { './math': { declaration: 'files/src/math.d.ts' } },
  externals: ['vue'],
  files: { 'files/src/math.d.ts': 'b'.repeat(64) },
}

describe('parseDtsIndex（类型清单校验）', () => {
  it('合法清单通过并归一', () => {
    const r = parseDtsIndex(okIndex)
    expect(r.issues).toEqual([])
    expect(r.index?.revision).toBe('a'.repeat(16))
    expect(r.index?.externals).toEqual(['vue'])
  })
  it('未知协议版本拒绝消费（unsupportedVersion）', () => {
    const r = parseDtsIndex({ ...okIndex, schemaVersion: 2 })
    expect(r.unsupportedVersion).toBe(2)
    expect(r.index).toBeUndefined()
  })
  it('不安全路径拒绝（../、绝对、反斜杠）', () => {
    for (const bad of ['../escape.d.ts', '/abs.d.ts', 'a\\b.d.ts', 'a/../b.d.ts']) {
      const r = parseDtsIndex({ ...okIndex, files: { [bad]: 'c'.repeat(64) } })
      expect(r.issues.some((x) => x.field.includes('files'))).toBe(true)
    }
  })
  it('expose 声明必须在 files 登记内', () => {
    const r = parseDtsIndex({ ...okIndex, files: { 'files/other.d.ts': 'c'.repeat(64) } })
    expect(r.issues.some((x) => x.message.includes('未在 files 中登记'))).toBe(true)
  })
  it('摘要必须是 64 位 hex；revision 8-64 hex', () => {
    expect(parseDtsIndex({ ...okIndex, files: { 'files/src/math.d.ts': 'xyz' } }).index).toBeUndefined()
    expect(parseDtsIndex({ ...okIndex, revision: 'ZZZ' }).index).toBeUndefined()
  })
})

describe('isSafeBundlePath', () => {
  it('目录级中文/常规路径合法；空白/控制字符拒绝', () => {
    expect(isSafeBundlePath('files/src/组件/Btn.vue.d.ts')).toBe(true)
    expect(isSafeBundlePath('files/a b.d.ts')).toBe(false)
  })
})

describe('buildAmbientDeclarations（bundle → ambient 变换）', () => {
  const bundleFiles: Record<string, string> = {
    'files/exposes/math.d.ts': [
      'import type { Paged } from "../lib/shared";',
      'export declare function page(n: number): Paged<number>;',
      'declare const _default: { kind: "math" };',
      'export default _default;',
    ].join('\n'),
    'files/lib/shared.d.ts': 'export interface Paged<T> { items: T[]; total: number }\n',
    'files/exposes/api.d.ts': 'export * from "../internal/svc";\nexport { default as math } from "./math";\n',
    'files/internal/svc.d.ts': 'import type { Paged } from "../lib/shared";\nexport declare function list(): Paged<string>;\n',
  }
  const index = {
    schemaVersion: TYPES_SCHEMA_VERSION,
    generator: '@fulgurjs/federation',
    pluginVersion: '6.5.0',
    revision: '0123456789abcdef',
    exposes: { './math': { declaration: 'files/exposes/math.d.ts' }, './api': { declaration: 'files/exposes/api.d.ts' } },
    externals: ['vue'],
    files: Object.fromEntries(Object.keys(bundleFiles).map((k) => [k, 'f'.repeat(64)])),
  }
  const out = buildAmbientDeclarations({ alias: 'lowcode', index: index as never, readFile: (rel) => bundleFiles[rel] ?? '', source: 'http://localhost:5101' })

  it('入口用公开名、内部文件用 __internal 名；相对说明符全部改写为非相对 ambient 名', () => {
    const modules = out.files.get('modules.d.ts') ?? ''
    expect(modules).toContain('declare module "lowcode/math"')
    expect(modules).toContain('declare module "lowcode/api"')
    expect(modules).toContain('declare module "lowcode/__internal/lib/shared"')
    expect(modules).toContain('declare module "lowcode/__internal/internal/svc"')
    // 相对导入必须已被改写（残留 = 闭包断裂）
    expect(out.warnings.some((w) => w.includes('未解析'))).toBe(false)
    expect(modules).not.toMatch(/from\s+['"]\.\//)
    // 跨文件引用改写正确（math → shared ambient 名）
    expect(modules).toContain('from "lowcode/__internal/lib/shared"')
    // default 重导出（api → math）
    expect(modules).toContain('from "lowcode/math"')
  })
  it('registry 是 module 形态（含 import），目标为共享注册表子路径，登记全部公开入口', () => {
    const registry = out.files.get('registry.d.ts') ?? ''
    expect(registry).toContain("import '@fulgurjs/federation/internal/registry.js'")
    expect(registry).toContain("declare module '@fulgurjs/federation/internal/registry.js'")
    expect(registry).toContain('"lowcode/math": typeof import("lowcode/math")')
    expect(registry).toContain('"lowcode/api": typeof import("lowcode/api")')
    expect(registry).not.toContain('__internal') // 内部文件不登记
  })
  it('声明含本机绝对路径的文件被跳过并警告（不产出泄漏）', () => {
    const leaking = { ...bundleFiles, 'files/exposes/leak.d.ts': 'export const p: "/Users/someone/x" \n' }
    const idx = { ...index, files: { ...index.files, 'files/exposes/leak.d.ts': 'f'.repeat(64) } }
    const out2 = buildAmbientDeclarations({ alias: 'x', index: idx as never, readFile: (rel) => leaking[rel] ?? '', source: 's' })
    expect(out2.warnings.some((w) => w.includes('绝对路径'))).toBe(true)
    expect(out2.files.get('modules.d.ts') ?? '').not.toContain('/Users/someone/x')
  })
  it('同名内部文件冲突加序号（不覆盖）', () => {
    const files: Record<string, string> = {
      'files/math.d.ts': 'export const a = 1\n',
      'files/__internal/math.d.ts': 'export const b = 1\n',
    }
    const idx = {
      ...index,
      exposes: { './math': { declaration: 'files/math.d.ts' } },
      files: Object.fromEntries(Object.keys(files).map((k) => [k, 'f'.repeat(64)])),
    }
    const out3 = buildAmbientDeclarations({ alias: 'r', index: idx as never, readFile: (rel) => files[rel] ?? '', source: 's' })
    const modules = out3.files.get('modules.d.ts') ?? ''
    expect(modules).toContain('declare module "r/math"')
    expect(modules).toContain('declare module "r/__internal/__internal/math"')
  })
})

describe('checkTypesDiscovery（tsconfig 发现检查）', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fg-discovery-'))
  const write = (rel: string, content: string): string => {
    const abs = path.join(tmp, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, content)
    return abs
  }

  it('默认 src include 覆盖 src/fulgurjs/types', () => {
    write('tsconfig.json', JSON.stringify({ compilerOptions: {}, include: ['src/**/*'] }))
    write('src/main.ts', 'export {}\n')
    expect(checkTypesDiscovery(tmp, path.join(tmp, 'src/fulgurjs/types')).covered).toBe(true)
  })
  it('显式 exclude 生成目录 → 未覆盖 + 最小修法含 TYP-006', () => {
    write('tsconfig.json', JSON.stringify({ compilerOptions: {}, include: ['src/**/*'], exclude: ['src/fulgurjs'] }))
    const r = checkTypesDiscovery(tmp, path.join(tmp, 'src/fulgurjs/types'))
    expect(r.covered).toBe(false)
    expect(r.fixHint).toContain('TYP-006')
  })
  it('严格 files 白名单未列生成目录 → 未覆盖', () => {
    write('tsconfig.json', JSON.stringify({ compilerOptions: {}, files: ['src/main.ts'] }))
    expect(checkTypesDiscovery(tmp, path.join(tmp, 'src/fulgurjs/types')).covered).toBe(false)
  })
  it('solution 型 references：子配置覆盖即可发现', () => {
    write('tsconfig.json', JSON.stringify({ files: [], references: [{ path: './tsconfig.app.json' }] }))
    write('tsconfig.app.json', JSON.stringify({ compilerOptions: { composite: true }, include: ['src/**/*'] }))
    expect(checkTypesDiscovery(tmp, path.join(tmp, 'src/fulgurjs/types')).covered).toBe(true)
  })
  it('include 无（缺省）= 覆盖配置目录整树', () => {
    write('tsconfig.json', JSON.stringify({ compilerOptions: {} }))
    expect(checkTypesDiscovery(tmp, path.join(tmp, '.fulgurjs/types')).covered).toBe(true)
  })
  it('无 tsconfig → 未覆盖并提示先建配置', () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'fg-empty-'))
    const r = checkTypesDiscovery(empty, path.join(empty, 'src/fulgurjs/types'))
    expect(r.covered).toBe(false)
    expect(r.fixHint).toContain('没有 tsconfig')
  })
  it('extends 链继承 include（子配置无 include 也能覆盖）', () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'fg-extends-'))
    fs.writeFileSync(path.join(base, 'base.json'), JSON.stringify({ include: ['src/**/*'] }))
    fs.writeFileSync(path.join(base, 'tsconfig.json'), JSON.stringify({ extends: './base.json', compilerOptions: {} }))
    expect(checkTypesDiscovery(base, path.join(base, 'src/fulgurjs/types')).covered).toBe(true)
  })
})
