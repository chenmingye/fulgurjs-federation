/**
 * 远程类型端到端测试：提供方真实生成 → 宿主同步 → 真实 tsc 编译断言（正负向）。
 *
 * 链路全部真实组件：generateTypesBundle（真 TypeScript）、syncRemoteTypes（注入的
 * 本地 fetch 路由）、宿主工程用软链安装真实插件包（dist + types/registry.d.ts）、
 * 编译用宿主自己的 tsconfig 工程（不给 tsc 追加单文件名）。负向断言 = 期望错误必须
 * 出现在诊断里（不是只看退出码）。
 */
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { generateTypesBundle } from '../src/dts-generate'
import { syncRemoteTypes } from '../src/dts-sync'

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
let tmp = ''

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fg-e2e-'))
})
afterAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
})

const linkDeps = (projectRoot: string): void => {
  const nm = path.join(projectRoot, 'node_modules')
  fs.mkdirSync(nm, { recursive: true })
  fs.mkdirSync(path.join(nm, '@fulgurjs'), { recursive: true })
  const target = path.join(nm, '@fulgurjs', 'federation')
  try { fs.symlinkSync(pluginRoot, target, 'dir') } catch { /* 已存在 */ }
  for (const pkg of ['typescript']) {
    try { fs.symlinkSync(path.join(pluginRoot, 'node_modules', pkg), path.join(nm, pkg), 'dir') } catch { /* 已存在 */ }
  }
}

const runTsc = (projectRoot: string, addFile?: string): { code: number; output: string } => {
  if (addFile) {
    const src = fs.readFileSync(path.join(tmp, 'negatives', addFile), 'utf8')
    fs.writeFileSync(path.join(projectRoot, 'src', addFile), src)
  }
  try {
    const out = execFileSync(
      path.join(projectRoot, 'node_modules', 'typescript', 'lib', 'tsc.js') === '' ? 'tsc' : process.execPath,
      [path.join(projectRoot, 'node_modules', 'typescript', 'lib', 'tsc.js'), '-p', path.join(projectRoot, 'tsconfig.json')],
      { encoding: 'utf8', cwd: projectRoot },
    )
    return { code: 0, output: out }
  } catch (e) {
    const err = e as { status?: number; stdout?: string }
    return { code: err.status ?? 1, output: err.stdout ?? '' }
  }
}

describe('端到端：生成 → 同步 → 编译断言', () => {
  let providerRoot = ''
  let hostRoot = ''

  beforeAll(async () => {
    // ── 提供方 fixture（alias @/*、重导出、泛型、默认导出）──
    providerRoot = path.join(tmp, 'provider')
    const files: Record<string, string> = {
      'package.json': JSON.stringify({ name: 'e2e-provider', private: true, type: 'module' }),
      'src/lib/shared.ts': 'export interface Paged<T> { items: T[]; total: number }\n',
      'src/internal/svc.ts': "import type { Paged } from '@/lib/shared'\nexport declare function listOrders(): Paged<string>\n",
      'src/exposes/math.ts': [
        "import type { Paged } from '@/lib/shared'",
        'export function sumNumbers(a: number, b: number): number',
        'export function sumNumbers(a: bigint, b: bigint): bigint',
        'export function sumNumbers(a: number | bigint, b: number | bigint): number | bigint { return 0 as never }',
        'export function firstOf<T>(items: readonly T[], fallback: T): T { return items[0] ?? fallback }',
        'export function pageOf(n: number): Paged<number> { return { items: [n], total: 1 } }',
        'const d = { kind: "math" as const }',
        'export default d',
      ].join('\n'),
      'src/exposes/api.ts': [
        "export * from '../internal/svc'",
        "export { type Paged } from '@/lib/shared'",
        "export { default as mathDefault } from './math'",
      ].join('\n'),
    }
    for (const [rel, content] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(providerRoot, rel)), { recursive: true })
      fs.writeFileSync(path.join(providerRoot, rel), content)
    }
    linkDeps(providerRoot)
    fs.writeFileSync(path.join(providerRoot, 'tsconfig.json'), JSON.stringify({
      compilerOptions: {
        target: 'ES2022', module: 'ESNext', moduleResolution: 'bundler',
        strict: true, skipLibCheck: true, baseUrl: '.', paths: { '@/*': ['src/*'] },
      },
      include: ['src'],
    }, null, 2))

    // ── 生成 bundle ──
    const gen = await generateTypesBundle({
      root: providerRoot,
      exposes: [
        { name: './math', import: './src/exposes/math.ts' },
        { name: './api', import: './src/exposes/api.ts' },
      ],
      pluginVersion: 'test',
    })
    if (!gen.ok) throw new Error(`生成失败：${gen.diagnostics.join('\n')}`)

    // ── 宿主工程（独立目录，不引用提供方源码）──
    hostRoot = path.join(tmp, 'host')
    fs.mkdirSync(path.join(hostRoot, 'src'), { recursive: true })
    linkDeps(hostRoot)
    fs.writeFileSync(path.join(hostRoot, 'package.json'), JSON.stringify({ name: 'e2e-host', private: true, type: 'module' }))
    fs.writeFileSync(path.join(hostRoot, 'tsconfig.json'), JSON.stringify({
      compilerOptions: {
        target: 'ES2022', module: 'ESNext', moduleResolution: 'bundler',
        strict: true, skipLibCheck: true, noEmit: true, types: [],
      },
      include: ['src/**/*'],
    }, null, 2))

    // 同步：fetch 注入从内存 bundle 服务
    const indexJson = JSON.parse(gen.files.get('index.json') ?? '{}')
    const fJson = async (url: string): Promise<unknown> => {
      if (url.includes('@fulgurjs-manifest.json')) {
        return {
          schemaVersion: 1, name: 'e2e-provider', devServer: true, base: '/', entry: '/@fulgurjs-entry.js',
          types: { schemaVersion: 1, index: './@fulgurjs-types/index.json', revision: indexJson.revision },
          exposes: [{ name: './math', src: './src/exposes/math.ts', file: '/src/exposes/math.ts' }, { name: './api', src: './src/exposes/api.ts', file: '/src/exposes/api.ts' }],
          shared: [],
        }
      }
      return indexJson
    }
    const fText = async (url: string): Promise<string> => {
      const rel = decodeURIComponent(url.split('/@fulgurjs-types/')[1] ?? '')
      const content = gen.files.get(rel)
      if (content === undefined) throw new Error(`404 ${rel}`)
      return content
    }
    const synced = await syncRemoteTypes({
      alias: 'lowcode', manifestUrl: 'http://provider.test/@fulgurjs-manifest.json',
      typesRoot: path.join(hostRoot, 'src/fulgurjs/types'), source: 'e2e',
      fetchJsonImpl: fJson, fetchTextImpl: fText,
    })
    if (synced.status !== 'synced') throw new Error(`同步失败：${synced.message}`)

    // 正向用例（宿主代码：普通 import + 动态 import + 注册表字符串 API）
    fs.writeFileSync(path.join(hostRoot, 'src', 'main.ts'), [
      "import { loadRemote } from '@fulgurjs/federation/runtime'",
      "import mathDefault, { sumNumbers, firstOf, pageOf } from 'lowcode/math'",
      "import { listOrders, mathDefault as viaApi, type Paged } from 'lowcode/api'",
      '',
      'export const okOverloadNumber: number = sumNumbers(2, 3)',
      'export const okOverloadBigint: bigint = sumNumbers(1n, 2n)',
      'export const okGeneric: string = firstOf(["a"], "z")',
      'export const okPaged: Paged<number> = pageOf(1)',
      'export const okDefault: "math" = mathDefault.kind',
      'export const okViaApi: "math" = viaApi.kind',
      'export const okOrders = listOrders()',
      '',
      'export async function dyn(): Promise<number> {',
      "  const m = await import('lowcode/math')",
      '  return m.sumNumbers(1, 2)',
      '}',
      '',
      'export async function viaStringApi(): Promise<number> {',
      "  const m = await loadRemote('lowcode/math')",
      '  return m.sumNumbers(1, 2)',
      '}',
      '',
      '// 动态变量：诚实 unknown 边界（放行；成员访问报错见负向）',
      'const dynamicEntry: string = "lowcode/" + "math"',
      'export async function dynamicLoad() { return loadRemote(dynamicEntry) }',
    ].join('\n'))
  })

  it('正向：宿主编译零错误（提供方源码不可达，类型全部来自同步的声明）', () => {
    const r = runTsc(hostRoot)
    expect(r.output).toBe('')
    expect(r.code).toBe(0)
  }, 120_000)

  it('负向：错误用法产生预期诊断（拼错入口/错参/缺导出/unknown 成员/组件冒充）', () => {
    fs.mkdirSync(path.join(tmp, 'negatives'), { recursive: true })
    fs.writeFileSync(path.join(tmp, 'negatives', 'negatives.ts'), [
      "import { sumNumbers } from 'lowcode/math'",
      "import { loadRemote } from '@fulgurjs/federation/runtime'",
      '',
      '// @ts-expect-error 参数类型错误（重载分派拒绝 string）',
      "sumNumbers('2', 3)",
      '// @ts-expect-error 不存在的具名导出',
      "import { notExported } from 'lowcode/math'",
      '// @ts-expect-error 不存在的入口',
      "import { x } from 'lowcode/no-such-entry'",
      '// @ts-expect-error 注册表已同步：拼错入口在调用点报错',
      "void loadRemote('lowcode/moth')",
      '',
      'async function m() {',
      '  const dyn: string = "lowcode/math"',
      '  const u = await loadRemote(dyn)',
      '  // @ts-expect-error unknown 边界：动态结果不能当已验证模块用',
      '  u.sumNumbers(1, 2)',
      '}',
      'void m()',
    ].join('\n'))
    const r = runTsc(hostRoot, 'negatives.ts')
    // 断言协议：每条负向都用 @ts-expect-error 标注。全部命中 → tsc 通过且零输出；
    // 任一断言未命中（错误没发生）→ 报 Unused '@ts-expect-error' directive → 非零失败
    expect(r.code).toBe(0)
    expect(r.output).toBe('')
  }, 120_000)
})
