/**
 * WP4：manifest 契约测试。
 *
 * 覆盖：生成器 round-trip（genDevManifest/genProdManifest 产物必须通过 parseManifest）、
 * dev/prod 双形态结构、缺字段、错误类型、未知主版本拒绝、2.0.x 无 schemaVersion 兼容、
 * 坏 URL（凭证/空白）、规范化统一 expose map、运行时内联消费逻辑的契约对齐
 * （runtime-preload.test.ts 按 schemaVersion 拒绝规则对齐）。
 */
import { describe, expect, it } from 'vitest'
import { genDevManifest, genProdManifest } from '../src/virtual'
import { normalizeOptions } from '../src/options'
import {
  MANIFEST_SCHEMA_VERSION,
  parseManifest,
  normalizeExposes,
  isDevManifest,
} from '../src/manifest'

const ROOT = process.cwd()

function hostOptions() {
  return normalizeOptions(
    {
      name: 'contract-app',
      exposes: { './Boot': './src/exposes/boot.ts' },
      remotes: { child: { dev: 'http://localhost:5177', prod: '/child' } },
      shared: { vue: { singleton: true, requiredVersion: '^3.4.0' } },
    },
    ROOT,
    'build',
  )
}

describe('WP4: 生成器 round-trip', () => {
  it('genDevManifest 产物通过契约校验，含 schemaVersion=1', () => {
    const m = genDevManifest(hostOptions(), '/')
    expect(m.schemaVersion).toBe(MANIFEST_SCHEMA_VERSION)
    const parsed = parseManifest(m)
    expect(parsed.issues).toEqual([])
    expect(parsed.manifest).toBeDefined()
    expect(isDevManifest(parsed.manifest!)).toBe(true)
  })

  it('genProdManifest 产物通过契约校验，含 schemaVersion=1', () => {
    const m = genProdManifest(hostOptions(), { './Boot': { file: 'assets/Boot-abc.js', css: ['assets/Boot-abc.css'] } }, 'fulgurjs-remoteEntry.js')
    expect(m.schemaVersion).toBe(MANIFEST_SCHEMA_VERSION)
    const parsed = parseManifest(m)
    expect(parsed.issues).toEqual([])
    expect(isDevManifest(parsed.manifest!)).toBe(false)
  })
})

describe('WP4: parseManifest 契约规则', () => {
  const devBase = {
    schemaVersion: 1,
    id: 'r',
    name: 'r',
    devServer: true,
    base: '/lowcode/',
    entry: '/lowcode/@fulgurjs-entry.js',
    fsRoot: '/tmp/r',
    exposes: [{ name: './Boot', src: './src/boot.ts', file: '/lowcode/src/boot.ts' }],
    shared: [{ name: 'vue', version: '3.5.0' }],
  }
  const prodBase = {
    schemaVersion: 1,
    id: 'r',
    name: 'r',
    entry: 'fulgurjs-remoteEntry.js',
    exposes: { './Boot': { file: 'assets/Boot-abc.js', css: ['assets/Boot-abc.css'] } },
    shared: [{ name: 'vue', version: '3.5.0' }],
  }

  it('dev 与 prod 基线形态均通过', () => {
    expect(parseManifest(devBase).issues).toEqual([])
    expect(parseManifest(prodBase).issues).toEqual([])
  })

  it('缺 schemaVersion 按 2.0.x 历史形态兼容解析（v1）', () => {
    const legacy = { ...prodBase } as Record<string, unknown>
    delete legacy.schemaVersion
    const parsed = parseManifest(legacy)
    expect(parsed.issues).toEqual([])
    expect(parsed.unsupportedVersion).toBeUndefined()
    expect(parsed.manifest).toBeDefined()
  })

  it('未知主版本（2）拒绝消费并携带 unsupportedVersion，不静默当空 manifest', () => {
    const parsed = parseManifest({ ...prodBase, schemaVersion: 2 })
    expect(parsed.manifest).toBeUndefined()
    expect(parsed.unsupportedVersion).toBe(2)
    expect(parsed.issues[0]!.field).toBe('schemaVersion')
  })

  it('schemaVersion 非整数报 issue', () => {
    const parsed = parseManifest({ ...prodBase, schemaVersion: '1' })
    expect(parsed.issues.some((x) => x.field === 'schemaVersion')).toBe(true)
  })

  it('缺 name / 错误 exposes 类型 / shared 缺 version 逐字段报错', () => {
    expect(parseManifest({ ...prodBase, name: '' }).issues.some((x) => x.field === 'name')).toBe(true)
    expect(parseManifest({ ...prodBase, exposes: 'nope' }).issues.some((x) => x.field === 'exposes')).toBe(true)
    expect(parseManifest({ ...prodBase, shared: [{ name: 'vue' }] }).issues.some((x) => x.field === 'shared[0].version')).toBe(true)
  })

  it('坏 URL：凭证形态与含空白字符的资源引用被拒绝', () => {
    expect(
      parseManifest({ ...prodBase, exposes: { './Boot': { file: 'https://u:p@evil/x.js' } } }).issues.some(
        (x) => x.field === 'exposes["./Boot"].file',
      ),
    ).toBe(true)
    expect(
      parseManifest({ ...prodBase, exposes: { './Boot': { file: 'assets/Bo ot.js' } } }).issues.some(
        (x) => x.field === 'exposes["./Boot"].file',
      ),
    ).toBe(true)
    expect(parseManifest({ ...devBase, entry: '/low code/@fulgurjs-entry.js' }).issues.some((x) => x.field === 'entry')).toBe(true)
  })

  it('坏 expose 名（不带 ./ 前缀）与数组元素非对象被拒绝', () => {
    expect(
      parseManifest({ ...prodBase, exposes: { Boot: { file: 'a.js' } } }).issues.some(
        (x) => x.field === 'exposes["Boot"]',
      ),
    ).toBe(true)
    expect(
      parseManifest({ ...devBase, exposes: ['nope'] }).issues.some((x) => x.field === 'exposes[0]'),
    ).toBe(true)
  })

  it('dev 形态缺 devServer / 坏 base 被拒绝', () => {
    expect(parseManifest({ ...devBase, devServer: false }).issues.some((x) => x.field === 'devServer')).toBe(true)
    expect(parseManifest({ ...devBase, base: 'lowcode' }).issues.some((x) => x.field === 'base')).toBe(true)
  })
})

describe('WP4: normalizeExposes 统一 expose map', () => {
  it('dev 数组与 prod 对象规范化为同形 map', () => {
    const dev = parseManifest({
      schemaVersion: 1,
      name: 'r',
      devServer: true,
      base: '/r/',
      entry: '/r/@fulgurjs-entry.js',
      exposes: [{ name: './Boot', src: './src/boot.ts', file: '/r/src/boot.ts' }],
      shared: [],
    })!.manifest!
    const prod = parseManifest({
      schemaVersion: 1,
      name: 'r',
      entry: 'fulgurjs-remoteEntry.js',
      exposes: { './Boot': { file: 'assets/Boot-abc.js', css: ['assets/Boot-abc.css'] } },
      shared: [],
    })!.manifest!

    const devMap = normalizeExposes(dev)
    const prodMap = normalizeExposes(prod)
    expect(devMap.get('./Boot')).toMatchObject({ name: './Boot', file: '/r/src/boot.ts', css: [], src: './src/boot.ts' })
    expect(prodMap.get('./Boot')).toMatchObject({ name: './Boot', file: 'assets/Boot-abc.js', css: ['assets/Boot-abc.css'] })
    // 键集合一致（preloadRemote 按 expose 选择消费的就是这个 map 的键）
    expect([...devMap.keys()]).toEqual([...prodMap.keys()])
  })
})
