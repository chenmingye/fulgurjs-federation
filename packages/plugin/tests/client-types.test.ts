import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { genRuntimeTypesShim } from '../src/dts'

const PKG = join(__dirname, '..')

/** dist/runtime.js 的具名导出（构建产物真实面，守 client.d.ts 漂移） */
const RUNTIME_EXPORTS = [
  'default',
  'getContainer',
  'getRuntime',
  'initSharing',
  'loadRemote',
  'loadShare',
  'preloadRemote',
  'registerPlugins',
  'registerRemote',
  'registerRemotes',
  'registerShare',
  'runtime',
  'shareScopeMap',
  'unwrapDefault',
  'version',
]

describe('client.d.ts：virtual:fulgurjs-runtime 类型声明（随包发布）', () => {
  it('client.d.ts 存在且声明了虚拟模块', () => {
    const file = join(PKG, 'client.d.ts')
    expect(existsSync(file)).toBe(true)
    const text = readFileSync(file, 'utf8')
    expect(text).toContain("declare module 'virtual:fulgurjs-runtime'")
  })

  it('声明面覆盖 dist/runtime.js 的全部具名导出（守漂移）', () => {
    const text = readFileSync(join(PKG, 'client.d.ts'), 'utf8')
    const declareBlock = text.split("declare module 'virtual:fulgurjs-runtime'")[1] ?? ''
    for (const name of RUNTIME_EXPORTS) {
      // default 以 "export default" 形式声明，其余 export const/function
      const declared = name === 'default' ? /export default/.test(declareBlock) : declareBlock.includes(`export ${name}`) || new RegExp(`export (const|function) ${name}\\b`).test(declareBlock)
      expect({ name, declared: declared, snippet: declareBlock.slice(0, 200) }).toEqual({ name, declared: true, snippet: declareBlock.slice(0, 200) })
    }
  })

  it('package.json exports 暴露 ./client 子路径且 files 含 client.d.ts', () => {
    const pkg = JSON.parse(readFileSync(join(PKG, 'package.json'), 'utf8'))
    expect(pkg.exports['./client']?.types).toBe('./client.d.ts')
    expect(pkg.files).toContain('client.d.ts')
  })

  it('类型垫片用 import 式加载 client 声明（dev 自动生成进 .fulgurjs/types）', () => {
    const shim = genRuntimeTypesShim()
    expect(shim).toContain("import '@fulgurjs/federation/client'")
    expect(shim).not.toContain('reference types=')
  })
})

describe('dts 生成路径规则（skipLibCheck 静默失败回归）', () => {
  it('非 .vue 源码 re-export 去掉 .ts 扩展名（默认禁 allowImportingTsExtensions）', async () => {
    const { sourceImportPath, stripTsExtension } = await import('../src/dts')
    expect(stripTsExtension(sourceImportPath('../remote/src/SharedState.ts'))).toBe('../remote/src/SharedState')
    expect(stripTsExtension(sourceImportPath('src/x.ts'))).toBe('./src/x')
    expect(sourceImportPath('../remote/src/Button.vue')).toBe('../remote/src/Button.vue')
  })
})

describe('extractTsExportNames（环境模块显式重导出）', () => {
  it('枚举 const/function/interface/type 与 export {} 形式，忽略 default', async () => {
    const { extractTsExportNames } = await import('../src/dts')
    const text = [
      `import { ref } from 'vue'`,
      `export const sharedCount = ref(0)`,
      `export function helper() {}`,
      `export interface Props { a: number }`,
      `export type Maybe<T> = T | null`,
      `const hidden = 1`,
      `export { hidden as shown, default } from './other'`,
    ].join('\n')
    const names = extractTsExportNames(text)
    for (const name of ['sharedCount', 'helper', 'Props', 'Maybe', 'shown']) {
      expect(names).toContain(name)
    }
    expect(names).not.toContain('default')
    expect(names).not.toContain('hidden')
  })
})

describe('dts 默认目录收敛到根目录点文件夹（src 零污染）', () => {
  it('默认 .fulgurjs/types；dts.dir 可覆盖；dts:false 不生成', async () => {
    const { resolveDtsDir } = await import('../src/dts')
    expect(resolveDtsDir(undefined, true)).toBe('src/fulgurjs/types')
    expect(resolveDtsDir(true, true)).toBe('src/fulgurjs/types')
    expect(resolveDtsDir(undefined, false)).toBe('.fulgurjs/types')
    expect(resolveDtsDir(true, false)).toBe('.fulgurjs/types')
    expect(resolveDtsDir({ dir: 'types/federation' })).toBe('types/federation')
    expect(resolveDtsDir(false)).toBe('')
  })
})

/** WP7：virtual:fulgurjs-api 门面类型声明（聚合 runtime 面 + pages + remoteSchema） */
describe('WP7: virtual:fulgurjs-api 类型声明', () => {
  it('声明存在且聚合旧入口全量导出面（export *）+ pages + remoteSchema', () => {
    const text = readFileSync(join(__dirname, '../client.d.ts'), 'utf8')
    expect(text).toContain("declare module 'virtual:fulgurjs-api'")
    const block = text.split("declare module 'virtual:fulgurjs-api'")[1] ?? ''
    expect(block).toContain("export * from 'virtual:fulgurjs-runtime'")
    expect(block).toContain("export { definePages, validatePages } from '@fulgurjs/federation/pages'")
    expect(block).toContain('export const remoteSchema')
  })
})
