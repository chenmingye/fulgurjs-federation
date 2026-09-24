import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const PKG = join(__dirname, '..')

describe('runtime 物理入口类型', () => {
  it('声明文件与公开类型真实存在', () => {
    const file = join(PKG, 'dist/runtime-entry.d.ts')
    expect(existsSync(file)).toBe(true)
    const text = readFileSync(file, 'utf8')
    for (const name of ['loadRemote', 'provideAppContext', 'definePages', 'remoteComponent', 'remoteSchema', 'RemoteInput', 'LoadRemoteOptions']) {
      expect(text).toContain(name)
    }
  })

  it('package.json 不再导出 client 虚拟类型垫片', () => {
    const pkg = JSON.parse(readFileSync(join(PKG, 'package.json'), 'utf8'))
    expect(pkg.exports['./client']).toBeUndefined()
    expect(pkg.files).not.toContain('client.d.ts')
  })

  it('type-only 导出面与批准清单相同', () => {
    const text = readFileSync(join(PKG, 'dist/runtime-entry.d.ts'), 'utf8')
    const exports = text.match(/^export \{([^\n]+)\};$/m)?.[1] ?? ''
    const names = [...exports.matchAll(/\btype ([A-Za-z_$][\w$]*)/g)].map((m) => m[1]).sort()
    expect(names).toEqual([
      'AppContext', 'FgRuntime', 'HostPages', 'HostPagesOptions', 'LoadRemoteOptions', 'LoadShareOptions',
      'PageRouteLike', 'PageViolation', 'PagesOptions', 'PreloadRemoteOptions',
      'RemoteComponentOptions', 'RemoteConfig', 'RemoteDebugInfo', 'RemoteInput',
      'RemoteSchema', 'RemoteSchemaEntry', 'RemoteSetupContext', 'RemoteSetupModule',
      'ResolvedHostPage', 'RuntimeHooks', 'RuntimePlugin',
      'ShareEntry', 'ShareScope', 'ShareScopeMap',
    ].sort())
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
