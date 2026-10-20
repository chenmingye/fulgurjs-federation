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

  it('手写本地声明依赖保留在可独立分发的 bundle 中', async () => {
    const project = makeProject('local-declaration', {
      'src/entry.ts': "export type { User } from './model'",
      'src/model.d.ts': 'export interface User { id: string }',
    })
    const result = await generateTypesBundle({ root: project, exposes: [{ name: './entry', import: './src/entry.ts' }], pluginVersion: 'test' })
    expect(result.ok, result.ok ? '' : result.diagnostics.join('\n')).toBe(true)
    if (result.ok) expect(result.files.get('files/model.d.ts')).toContain('interface User')
  })

  it('import 类型只改写语法节点，不将注释和字符串字面量登记为外部依赖', async () => {
    const project = makeProject('type-import-syntax-only', {
      'src/entry.ts': [
        '/** 示例：typeof import("<远程名>/types")，不是声明依赖。 */',
        'export interface Packet {',
        "  user: import('./model').User;",
        '  example: "import(\'not-a-package\')";',
        '}',
      ].join('\n'),
      'src/model.ts': 'export interface User { id: string }',
    })
    const result = await generateTypesBundle({ root: project, exposes: [{ name: './entry', import: './src/entry.ts' }], pluginVersion: 'test' })
    expect(result.ok, result.ok ? '' : result.diagnostics.join('\n')).toBe(true)
    if (!result.ok) return
    expect(result.index.externals).toEqual([])
    const declaration = result.files.get('files/entry.d.ts')!
    expect(declaration).toContain('import("<远程名>/types")')
    expect(declaration).toContain("import('not-a-package')")
    expect(declaration).toMatch(/import\(["']\.\/model["']\)\.User/)
  })

  it('声明移除样式副作用导入，但缺失代码依赖仍失败', async () => {
    const project = makeProject('style-import', {
      'src/entry.ts': "import './theme.less'; export const title: string = 'demo'",
      'src/styles.d.ts': "declare module '*.less'",
    })
    const result = await generateTypesBundle({ root: project, exposes: [{ name: './entry', import: './src/entry.ts' }], pluginVersion: 'test' })
    expect(result.ok, result.ok ? '' : result.diagnostics.join('\n')).toBe(true)
    if (result.ok) expect([...result.files.values()].join('\n')).not.toContain('theme.less')
    fs.writeFileSync(path.join(project, 'src/entry.ts'), "export { missing } from './missing'")
    expect((await generateTypesBundle({ root: project, exposes: [{ name: './entry', import: './src/entry.ts' }], pluginVersion: 'test' })).ok).toBe(false)
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

  it('自定义 alias 的声明依赖必须入闭包，错误不能被忽略', async () => {
    const root = makeProject('custom-alias-error', {
      'src/entry.ts': "export type { User } from '#models/user'",
      'src/models/user.ts': 'export type User = MissingUserType',
    }, { paths: { '#models/*': ['src/models/*'] } })
    const result = await generateTypesBundle({ root, exposes: [{ name: './entry', import: './src/entry.ts' }], pluginVersion: 'test' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.diagnostics.join('\n')).toContain('MissingUserType')
  })

  it('自定义 alias 声明可独立分发，不保留源码别名', async () => {
    const root = makeProject('custom-alias-ok', {
      'src/entry.ts': "export type { User } from '#models/user'",
      'src/models/user.ts': 'export interface User { id: string }',
    }, { paths: { '#models/*': ['src/models/*'] } })
    const result = await generateTypesBundle({ root, exposes: [{ name: './entry', import: './src/entry.ts' }], pluginVersion: 'test' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect([...result.files.values()].join('\n')).not.toContain('#models/user')
      expect([...result.files.values()].join('\n')).toContain('id: string')
    }
  })

  it('公共 import 类型引用进入声明闭包，运行时动态装配不进入', async () => {
    const root = makeProject('type-import', {
      'src/entry.ts': "export type User = import('./model').User; export async function mount(): Promise<void> { await import('./assembly') }",
      'src/model.ts': 'export interface User { id: string }',
      'src/assembly.ts': 'const invalid: string = 123; export default invalid',
    })
    const result = await generateTypesBundle({ root, exposes: [{ name: './entry', import: './src/entry.ts' }], pluginVersion: 'test' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect([...result.files.keys()].some(x => x.endsWith('model.d.ts'))).toBe(true)
      expect([...result.files.keys()].some(x => x.endsWith('assembly.d.ts'))).toBe(false)
    }
  })

  it('Vue 声明保留被工程 exclude 排除的显式全局类型依赖', async () => {
    const root = makeProject('vue-excluded-types', {
      'src/entry.vue': '<script setup lang="ts">const value: string = ClientRuntimeValue; defineProps<{ label: string }>();</script><template>{{ label }}{{ value }}</template>',
      'node_modules/local/client.d.ts': 'declare const ClientRuntimeValue: string;',
    }, { types: ['local/client'], typeRoots: ['./node_modules'] })
    const configPath = path.join(root, 'tsconfig.json')
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    config.exclude = ['node_modules', 'dist']
    fs.writeFileSync(configPath, JSON.stringify(config))
    for (const pkg of ['vue', 'vue-tsc']) fs.symlinkSync(path.join(pluginRoot, 'node_modules', pkg), path.join(root, 'node_modules', pkg), 'dir')
    const result = await generateTypesBundle({ root, exposes: [{ name: './entry', import: './src/entry.vue' }], pluginVersion: 'test' })
    expect(result.ok, result.ok ? '' : result.diagnostics.join('\n')).toBe(true)
    if (result.ok) expect([...result.files.values()].join('\n')).toContain('label: string')
  })

  it('Vue SFC 自定义 alias 和公共类型依赖通过真实 vue-tsc 生成', async () => {
    const root = makeProject('vue-alias', {
      'src/entry.vue': `<script setup lang="ts">import Child from '#ui/Child.vue'; import type { User } from '#models/user'; defineProps<{ user: User }>(); const clientValue: string = ClientRuntimeValue;</script><template><Child :name="user.id + clientValue" /></template>`,
      'src/ui/Child.vue': '<script setup lang="ts">defineProps<{ name: string }>();</script><template>{{ name }}</template>',
      'src/models/user.ts': 'export interface User { id: string }',
      'node_modules/local/client.d.ts': 'declare const ClientRuntimeValue: string;',
      'node_modules/untyped/package.json': '{"name":"untyped"}',
    }, { types: ['local/client'], typeRoots: ['./node_modules'], paths: { '#ui/*': ['src/ui/*'], '#models/*': ['src/models/*'] } })
    for (const pkg of ['vue', 'vue-tsc']) fs.symlinkSync(path.join(pluginRoot, 'node_modules', pkg), path.join(root, 'node_modules', pkg), 'dir')
    const result = await generateTypesBundle({ root, exposes: [{ name: './entry', import: './src/entry.vue' }], pluginVersion: 'test' })
    expect(result.ok, result.ok ? '' : result.diagnostics.join('\n')).toBe(true)
    if (result.ok) {
      expect(result.tool).toBe('vue-tsc')
      expect([...result.files.keys()].some(x => x.endsWith('Child.vue.d.ts'))).toBe(true)
      expect([...result.files.values()].join('\n')).not.toMatch(/#ui\/|#models\//)
    }
    fs.writeFileSync(path.join(root, 'src/ui/Child.vue'), '<script setup lang="ts">defineProps<{ name: MissingName }>();</script><template />')
    const invalid = await generateTypesBundle({ root, exposes: [{ name: './entry', import: './src/entry.vue' }], pluginVersion: 'test' })
    expect(invalid.ok).toBe(false)
    if (!invalid.ok) expect(invalid.diagnostics.join('\n')).toContain('MissingName')
  }, 30000)

  it('Vue 增量生成保留未变化的声明，更新 props 后重新检查且错误不能沿用旧成功', async () => {
    const root = makeProject('vue-incremental', {
      'src/entry.vue': '<script setup lang="ts">defineProps<{ title: string }>();</script><template>{{ title }}</template>',
    })
    for (const pkg of ['vue', 'vue-tsc']) fs.symlinkSync(path.join(pluginRoot, 'node_modules', pkg), path.join(root, 'node_modules', pkg), 'dir')
    const incrementalDir = path.join(root, 'node_modules', '.fulgurjs-types-cache-test')
    const input = { root, exposes: [{ name: './entry', import: './src/entry.vue' }], pluginVersion: 'test', incrementalDir }
    const first = await generateTypesBundle(input)
    const unchanged = await generateTypesBundle(input)
    expect(first.ok, first.ok ? "" : first.diagnostics.join("\n")).toBe(true)
    expect(unchanged.ok, unchanged.ok ? "" : unchanged.diagnostics.join("\n")).toBe(true)
    if (first.ok && unchanged.ok) expect(unchanged.index.revision).toBe(first.index.revision)
    expect(fs.existsSync(path.join(incrementalDir, 'state.tsbuildinfo'))).toBe(true)
    fs.writeFileSync(path.join(root, 'src/entry.vue'), '<script setup lang="ts">defineProps<{ title: number }>();</script><template>{{ title }}</template>')
    const changed = await generateTypesBundle(input)
    expect(changed.ok).toBe(true)
    if (first.ok && changed.ok) {
      expect(changed.index.revision).not.toBe(first.index.revision)
      expect([...changed.files.values()].join('\n')).toContain('title: number')
    }
    fs.writeFileSync(path.join(root, 'src/entry.vue'), '<script setup lang="ts">defineProps<{ title: MissingType }>();</script><template />')
    const invalid = await generateTypesBundle(input)
    expect(invalid.ok).toBe(false)
    if (!invalid.ok) expect(invalid.diagnostics.join('\n')).toContain('MissingType')
    fs.writeFileSync(path.join(root, 'src/entry.vue'), '<script setup lang="ts">defineProps<{ title: boolean }>();</script><template />')
    const recovered = await generateTypesBundle(input)
    expect(recovered.ok).toBe(true)
    if (recovered.ok) expect([...recovered.files.values()].join('\n')).toContain('title: boolean')
    expect(fs.readdirSync(root).some(name => name.startsWith('.fulgurjs-types-tsconfig-'))).toBe(false)
  }, 60000)

  it('Vue 增量重跑不会把动态业务模块的既有错误变成无位置的全局错误', async () => {
    const root = makeProject('vue-incremental-business-errors', {
      'src/entry.vue': '<script setup lang="ts">defineProps<{ title: string }>(); void import("./runtime");</script><template>{{ title }}</template>',
      'src/runtime.ts': 'export const unrelated: string = 123;',
    })
    for (const pkg of ['vue', 'vue-tsc']) fs.symlinkSync(path.join(pluginRoot, 'node_modules', pkg), path.join(root, 'node_modules', pkg), 'dir')
    const input = { root, exposes: [{ name: './entry', import: './src/entry.vue' }], pluginVersion: 'test', incrementalDir: path.join(root, 'node_modules', '.fulgurjs-types-cache-test') }
    for (let run = 0; run < 2; run++) {
      const result = await generateTypesBundle(input)
      expect(result.ok, result.ok ? '' : result.diagnostics.join('\n')).toBe(true)
    }
  }, 30000)

  it('createProgram 工具路径只检查暴露闭包，保留真实推导和重复检查的错误定位', async () => {
    const root = makeProject('vue-program-scope', {
      'src/entry.ts': 'export const value = 42; void import("./runtime")',
      'src/runtime.ts': 'export const bad: string = 123;',
      'src/marker.vue': '<template />',
    })
    const tool = path.join(root, 'node_modules/vue-tsc')
    fs.mkdirSync(path.join(tool, 'bin'), { recursive: true })
    fs.writeFileSync(path.join(tool, 'package.json'), JSON.stringify({ version: '1.8.27', main: 'index.cjs', bin: { 'vue-tsc': 'bin/vue-tsc.cjs' } }))
    // 真实 TS Program 验证按文件诊断/emit 协议；SFC 映射另由真实提供方工具验收。
    fs.writeFileSync(path.join(tool, 'index.cjs'), 'exports.createProgram = require("typescript").createProgram')
    fs.writeFileSync(path.join(tool, 'bin/vue-tsc.cjs'), 'throw Error("不应调用全程序 CLI")')
    const input = { root, exposes: [{ name: './entry', import: './src/entry.ts' }], pluginVersion: 'test', incrementalDir: path.join(root, 'node_modules', '.fulgurjs-types-cache-test') }
    for (let run = 0; run < 2; run++) {
      const result = await generateTypesBundle(input)
      expect(result.ok, result.ok ? '' : result.diagnostics.join('\n')).toBe(true)
      if (result.ok) expect([...result.files.values()].join('\n')).toContain('value = 42')
    }
    fs.writeFileSync(path.join(root, 'src/entry.ts'), 'export const value: string = 42;')
    const invalid = await generateTypesBundle(input)
    expect(invalid.ok).toBe(false)
    if (!invalid.ok) expect(invalid.diagnostics.join('\n')).toMatch(/entry\.ts.*TS2322/s)
  }, 30000)

  it('同进程并发 Vue 声明生成各自使用独立配置且清理不互相干扰', async () => {
    const root = makeProject('vue-concurrent', {
      'src/anchor.ts': 'export {}',
      'src/first.vue': '<script setup lang="ts">defineProps<{ first: string }>();</script><template />',
      'src/second.vue': '<script setup lang="ts">defineProps<{ second: number }>();</script><template />',
    })
    for (const pkg of ['vue', 'vue-tsc']) fs.symlinkSync(path.join(pluginRoot, 'node_modules', pkg), path.join(root, 'node_modules', pkg), 'dir')
    const results = await Promise.all(['first', 'second'].map(name => generateTypesBundle({
      root, exposes: [{ name: `./${name}`, import: `./src/${name}.vue` }], pluginVersion: 'test',
    })))
    results.forEach((result, i) => {
      expect(result.ok, result.ok ? '' : result.diagnostics.join('\n')).toBe(true)
      if (result.ok) expect([...result.files.values()].join('\n')).toContain(i === 0 ? 'first: string' : 'second: number')
    })
    expect(fs.readdirSync(root).filter(name => name.startsWith('.fulgurjs-types-tsconfig-'))).toEqual([])
    expect(fs.readdirSync(path.join(root, 'node_modules')).filter(name => name.startsWith('.fulgurjs-types-emit-'))).toEqual([])
  }, 30000)

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

describe('generateTypesBundle（vue-tsc 子进程 OOM 提堆重试）', () => {
  /** 桩 vue-tsc：默认堆形态下打印 V8 OOM 并非零退出；带 --max-old-space-size 参数的
   * 重试轮次按真实 emit 语义产出声明（把 entry.d.ts 写入 tsconfig 的 outDir）。 */
  function makeOomStubVueTsc(root: string, mode: 'retry-ok' | 'always-oom'): void {
    // SFC 闭包解析需要真实 vue（compiler-sfc）；vue-tsc 用桩替换
    try { fs.symlinkSync(path.join(pluginRoot, 'node_modules', 'vue'), path.join(root, 'node_modules', 'vue'), 'dir') } catch { /* 已存在 */ }
    const binDir = path.join(root, 'node_modules', 'vue-tsc', 'bin')
    fs.mkdirSync(binDir, { recursive: true })
    fs.writeFileSync(path.join(root, 'node_modules', 'vue-tsc', 'package.json'), JSON.stringify({
      name: 'vue-tsc', version: '0.0.0-stub', bin: { 'vue-tsc': 'bin/vue-tsc.js' },
    }))
    const script = [
      "const fs = require('node:fs')",
      "const path = require('node:path')",
      "fs.appendFileSync(path.join(__dirname, 'argv.log'), JSON.stringify({ argv: process.argv, execArgv: process.execArgv }) + '\\n')",
      // 提堆参数由 node 自身消费，不出现在 process.argv——用 execArgv 判定重试轮次
      "const raised = process.execArgv.some((a) => a.startsWith('--max-old-space-size='))",
      `if (!raised) {`,
      "  console.error('FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory')",
      "  process.exit(3)",
      "}",
      mode === 'always-oom' ? "console.error('FATAL ERROR: heap out of memory'); process.exit(3)" : [
        "const cfgIdx = process.argv.indexOf('-p')",
        "const cfg = JSON.parse(fs.readFileSync(process.argv[cfgIdx + 1], 'utf8'))",
        "const outDir = cfg.compilerOptions.outDir",
        "fs.mkdirSync(outDir, { recursive: true })",
        // entry.vue → entry.vue.d.ts 形态（collectEmitted 按相对 rootDir 归位）
        "fs.writeFileSync(path.join(outDir, 'entry.vue.d.ts'), 'export default { props: { user: { type: Object as () => { id: string } } } }\\n')",
        "process.exit(0)",
      ].join('\n'),
    ].join('\n')
    fs.writeFileSync(path.join(binDir, 'vue-tsc.js'), script)
  }

  it('系统级终止（SIGKILL/无诊断输出）与编译错误区分，重试后给出环境修法', async () => {
    const root = makeProject('sigkill', {
      'src/entry.vue': '<script setup lang="ts">defineProps<{ user: { id: string } }>();</script><template>{{ user.id }}</template>',
      "src/env.d.ts": "declare module '*.vue' { const component: object; export default component }",
    })
    // 桩：直接自我 SIGKILL（模拟 OS 内存压力终止；stderr 无 V8 横幅与 TS 诊断）
    try { fs.symlinkSync(path.join(pluginRoot, 'node_modules', 'vue'), path.join(root, 'node_modules', 'vue'), 'dir') } catch { /* 已存在 */ }
    const binDir = path.join(root, 'node_modules', 'vue-tsc', 'bin')
    fs.mkdirSync(binDir, { recursive: true })
    fs.writeFileSync(path.join(root, 'node_modules', 'vue-tsc', 'package.json'), JSON.stringify({
      name: 'vue-tsc', version: '0.0.0-stub', bin: { 'vue-tsc': 'bin/vue-tsc.js' },
    }))
    fs.writeFileSync(path.join(binDir, 'vue-tsc.js'), [
      "const fs = require('node:fs')",
      "const path = require('node:path')",
      "fs.appendFileSync(path.join(__dirname, 'attempts.log'), '1')",
      "process.kill(process.pid, 'SIGKILL')",
    ].join('\n'))
    const result = await generateTypesBundle({ root, exposes: [{ name: './entry', import: './src/entry.vue' }], pluginVersion: 'test' })
    const attempts = fs.readFileSync(path.join(binDir, 'attempts.log'), 'utf8')
    expect(attempts.length).toBe(2) // 被终止 → 重试一次
    expect(result.ok).toBe(false)
    if (!result.ok) {
      const text = result.diagnostics.join('\n')
      expect(text).toContain('被系统终止')
      expect(text).not.toContain('暴露闭包内存在编译错误')
    }
  }, 30000)

  it('单次生成超时强杀与编译错误区分：给出 FG_DTS_TIMEOUT_MS 修法并重试', async () => {
    const root = makeProject('timeout-kill', {
      'src/entry.vue': '<script setup lang="ts">defineProps<{ user: { id: string } }>();</script><template>{{ user.id }}</template>',
      "src/env.d.ts": "declare module '*.vue' { const component: object; export default component }",
    })
    try { fs.symlinkSync(path.join(pluginRoot, 'node_modules', 'vue'), path.join(root, 'node_modules', 'vue'), 'dir') } catch { /* 已存在 */ }
    const binDir = path.join(root, 'node_modules', 'vue-tsc', 'bin')
    fs.mkdirSync(binDir, { recursive: true })
    fs.writeFileSync(path.join(root, 'node_modules', 'vue-tsc', 'package.json'), JSON.stringify({
      name: 'vue-tsc', version: '0.0.0-stub', bin: { 'vue-tsc': 'bin/vue-tsc.js' },
    }))
    // 桩：睡眠远大于测试设定的超时上限（FG_DTS_TIMEOUT_MS=400）→ 被 execFile 强杀两次
    fs.writeFileSync(path.join(binDir, 'vue-tsc.js'), [
      "const fs = require('node:fs')",
      "const path = require('node:path')",
      "fs.appendFileSync(path.join(__dirname, 'attempts.log'), '1')",
      "setTimeout(() => {}, 5000)",
    ].join('\n'))
    const prev = process.env.FG_DTS_TIMEOUT_MS
    process.env.FG_DTS_TIMEOUT_MS = '400'
    try {
      const result = await generateTypesBundle({ root, exposes: [{ name: './entry', import: './src/entry.vue' }], pluginVersion: 'test' })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        const text = result.diagnostics.join('\n')
        expect(text).toContain('FG_DTS_TIMEOUT_MS')
        expect(text).not.toContain('暴露闭包内存在编译错误')
      }
    } finally {
      if (prev === undefined) delete process.env.FG_DTS_TIMEOUT_MS
      else process.env.FG_DTS_TIMEOUT_MS = prev
    }
  }, 30000)

  it('默认堆 OOM 后以提堆参数重试并采纳成功结果', async () => {
    const root = makeProject('oom-retry', {
      'src/entry.vue': '<script setup lang="ts">defineProps<{ user: { id: string } }>();</script><template>{{ user.id }}</template>',
      // 纯 .vue 工程会被 tsconfig include 判为「无输入」，补一个类型文件避免该解析错误
      "src/env.d.ts": "declare module '*.vue' { const component: object; export default component }",
    })
    makeOomStubVueTsc(root, 'retry-ok')
    const result = await generateTypesBundle({ root, exposes: [{ name: './entry', import: './src/entry.vue' }], pluginVersion: 'test' })
    const argvLog = fs.readFileSync(path.join(root, 'node_modules', 'vue-tsc', 'bin', 'argv.log'), 'utf8')
    const attempts = argvLog.trim().split('\n').map((line) => JSON.parse(line) as { argv: string[]; execArgv: string[] })
    expect(attempts).toHaveLength(2)
    expect(attempts[0].execArgv).toEqual([])
    // 提堆参数由 node 自身消费（不进 argv），经 execArgv 验证已传给重试子进程
    expect(attempts[1].execArgv).toContain('--max-old-space-size=8192')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.notices.join('\\n')).toContain('--max-old-space-size=8192MB 重试')
  }, 30000)

  it('提堆后仍 OOM 时给出明确内存修法而非「编译错误」误报', async () => {
    const root = makeProject('oom-forever', {
      'src/entry.vue': '<script setup lang="ts">defineProps<{ user: { id: string } }>();</script><template>{{ user.id }}</template>',
      "src/env.d.ts": "declare module '*.vue' { const component: object; export default component }",
    })
    makeOomStubVueTsc(root, 'always-oom')
    const result = await generateTypesBundle({ root, exposes: [{ name: './entry', import: './src/entry.vue' }], pluginVersion: 'test' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      const text = result.diagnostics.join('\\n')
      expect(text).toContain('FG_DTS_MAX_OLD_SPACE')
      expect(text).not.toContain('暴露闭包内存在编译错误')
    }
  }, 30000)
})
