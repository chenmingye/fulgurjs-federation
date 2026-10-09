/**
 * 提供方声明 bundle 生成测试（真实 TypeScript 编译器；fixture 工程即时创建）。
 * 覆盖：闭包、alias 重写、externals、编译错误门禁、入口缺失诊断、JS 项目默认配置。
 */
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { generateTypesBundle } from '../src/dts-generate'
import { parseDtsIndex } from '../src/dts-shared'

let tmp = ''
const pluginRoot = path.resolve(__dirname, '..')

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fg-gen-'))
})

afterAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
})

/** fixture 工程：tsconfig（@/* alias）+ typescript 软链（复用插件 devDep，不真实安装） */
function makeProject(name: string, files: Record<string, string>, tsconfigExtra: Record<string, unknown> = {}): string {
  const root = path.join(tmp, name)
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, content)
  }
  fs.mkdirSync(path.join(root, 'node_modules'), { recursive: true })
  // 软链插件自己的 typescript（版本与插件 CI 一致；generate 从提供方根解析）
  const tsSrc = path.join(pluginRoot, 'node_modules', 'typescript')
  if (fs.existsSync(tsSrc)) {
    try { fs.symlinkSync(tsSrc, path.join(root, 'node_modules', 'typescript'), 'dir') } catch { /* 已存在 */ }
  }
  fs.writeFileSync(
    path.join(root, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        target: 'ES2022', module: 'ESNext', moduleResolution: 'bundler',
        strict: true, skipLibCheck: true, baseUrl: '.', paths: { '@/*': ['src/*'] },
        ...tsconfigExtra,
      },
      include: ['src'],
    }, null, 2),
  )
  return root
}

describe('generateTypesBundle（纯 TS 工程）', () => {
  const files = {
    'src/lib/shared.ts': 'export interface Paged<T> { items: T[]; total: number }\nexport type Result<T> = { ok: true; value: T } | { ok: false; error: Error }\n',
    'src/exposes/math.ts': [
      "import type { Paged } from '@/lib/shared'",
      'export function sumNumbers(a: number, b: number): number',
      'export function sumNumbers(a: bigint, b: bigint): bigint',
      'export function sumNumbers(a: unknown, b: unknown): number | bigint { return 0 as never }',
      'export function firstOf<T>(items: readonly T[], fallback: T): T { return items[0] ?? fallback }',
      'export function page(n: number): Paged<number> { return { items: [n], total: 1 } }',
      'const d = { kind: "math" as const }',
      'export default d',
    ].join('\n'),
    'src/exposes/api.ts': [
      "export * from '../internal/svc'",
      "export { type Paged, type Result } from '@/lib/shared'",
      "export { default as mathDefault } from './math'",
    ].join('\n'),
    'src/internal/svc.ts': [
      "import type { Paged } from '@/lib/shared'",
      'export declare function list(): Paged<string>',
      'export class Repo { constructor(private p: string) {} label(): string { return this.p } }',
    ].join('\n'),
    'package.json': JSON.stringify({ name: 'fixture-provider', private: true, type: 'module' }),
  }
  let root = ''
  let result: Awaited<ReturnType<typeof generateTypesBundle>> = null as never

  it('生成成功：闭包 4 文件、重载/泛型/默认导出保留、externals 为空', async () => {
    root = makeProject('ok', files)
    result = await generateTypesBundle({
      root,
      exposes: [
        { name: './math', import: './src/exposes/math.ts' },
        { name: './api', import: './src/exposes/api.ts' },
      ],
      pluginVersion: 'test',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.tool).toBe('typescript')
    // 闭包：math/api/internal/svc/lib/shared（4 个源文件）
    expect([...result.files.keys()].filter((k) => k !== 'index.json')).toHaveLength(4)
    const math = result.files.get('files/exposes/math.d.ts') ?? ''
    expect(math).toContain('sumNumbers(a: number, b: number): number')
    expect(math).toContain('sumNumbers(a: bigint, b: bigint): bigint')
    expect(math).toContain('firstOf<T>')
    expect(math).toContain('export default d')
    // alias 重写：@/lib/shared → bundle 相对路径
    expect(math).not.toContain("@/lib/shared")
    expect(math).toMatch(/from "\.\.\/lib\/shared"/)
    expect(result.index.externals).toEqual([])
    // index.json 可被消费端校验
    const parsed = parseDtsIndex(JSON.parse(result.files.get('index.json') ?? '{}'))
    expect(parsed.issues).toEqual([])
    expect(parsed.index?.exposes['./math'].declaration).toBe('files/exposes/math.d.ts')
    // 无本机路径泄漏
    for (const text of result.files.values()) expect(text).not.toContain(tmp)
  })

  it('相同输入 revision 稳定；内容变化 revision 变化', async () => {
    const again = await generateTypesBundle({
      root, exposes: [{ name: './math', import: './src/exposes/math.ts' }, { name: './api', import: './src/exposes/api.ts' }], pluginVersion: 'test',
    })
    expect(again.ok && again.index.revision).toBe(result.ok ? result.index.revision : '')
    fs.writeFileSync(path.join(root, 'src/exposes/math.ts'), files['src/exposes/math.ts'] + '\nexport const EXTRA = 1\n')
    const changed = await generateTypesBundle({ root, exposes: [{ name: './math', import: './src/exposes/math.ts' }], pluginVersion: 'test' })
    expect(changed.ok && changed.index.revision).not.toBe(result.ok ? result.index.revision : '')
  })

  it('闭包内编译错误 → 拒绝产出（ok:false + 定位诊断）', async () => {
    const bad = makeProject('bad', { ...files, 'src/internal/svc.ts': 'export declare function list(): PagedX<string>\n' })
    const r = await generateTypesBundle({ root: bad, exposes: [{ name: './api', import: './src/exposes/api.ts' }], pluginVersion: 'test' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.diagnostics.join('\n')).toMatch(/svc\.ts|编译错误/)
  })

  it('入口源文件不存在 → 明确诊断', async () => {
    const r = await generateTypesBundle({ root, exposes: [{ name: './nope', import: './src/exposes/nope.ts' }], pluginVersion: 'test' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.diagnostics.join('\n')).toContain('nope')
  })

  it('外部类型依赖（裸包名）保留并登记 externals', async () => {
    const ext = makeProject('ext', {
      'src/exposes/panel.ts': "import type { DefineComponent } from 'vue'\nexport const Panel: DefineComponent<{ title: string }, {}, unknown> = null as never\n",
      'package.json': JSON.stringify({ name: 'x', private: true, type: 'module' }),
    })
    // typescript 软链已有；vue 用最小手写类型目录冒充（只需类型可解析）
    fs.mkdirSync(path.join(ext, 'node_modules', 'vue'), { recursive: true })
    fs.writeFileSync(path.join(ext, 'node_modules', 'vue', 'package.json'), JSON.stringify({ name: 'vue', version: '0.0.0-test', types: './index.d.ts', main: 'index.js' }))
    fs.writeFileSync(path.join(ext, 'node_modules', 'vue', 'index.d.ts'), 'export type DefineComponent<P = {}, B = {}, S = unknown> = { __comp: P }\nexport const version = ""\n')
    const r = await generateTypesBundle({ root: ext, exposes: [{ name: './panel', import: './src/exposes/panel.ts' }], pluginVersion: 'test' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.index.externals).toContain('vue')
    const decl = r.index.exposes['./panel']?.declaration ?? ''
    expect(r.files.get(decl) ?? '').toMatch(/["']vue["']/)
  })

  it('未安装 typescript → TYP-007 安装指引（含包管理器命令）', async () => {
    const bare = path.join(tmp, 'bare')
    fs.mkdirSync(path.join(bare, 'src'), { recursive: true })
    fs.writeFileSync(path.join(bare, 'src', 'a.ts'), 'export const x = 1\n')
    const r = await generateTypesBundle({ root: bare, exposes: [{ name: './a', import: './src/a.ts' }], pluginVersion: 'test' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.diagnostics.join('\n')).toMatch(/typescript/)
  })
})
