/**
 * 开发态 API 门面绑定防回归（6.0.0 统一入口）：
 * 门面生成的每一条具名导入，必须真实存在于被导入的 dist 模块导出面。
 * 背景：5.9.x 旧桥接门面误写 { createVueBridgeApp }（internal/bridge-host-vue.js 实际只导出
 * createVueBridgeAppWithLoader——绑定发生在 dist 生成壳）；expose 目标不导宿主工厂所以
 * 从未触发，6.0.0 /vue 门面承载完整入口面后被 dev 预构建放大为 MFU-001（20261005 实测）。
 * 本测试以磁盘 dist 文件的真实 export 语句为准逐名核对，防止门面再写出不存在的绑定。
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { genApiFacade } from '../src/virtual'

const dist = path.resolve(__dirname, '../dist')

/** 解析 dist 文件末尾的 export { ... } 具名导出清单 */
function distExports(file: string): Set<string> {
  const src = fs.readFileSync(path.join(dist, file), 'utf8')
  const names = new Set<string>()
  for (const m of src.matchAll(/export\s*\{([^}]*)\}/gs)) {
    for (const raw of m[1].split(',')) {
      const name = raw.trim().replace(/^as\s+/, '').split(/\s+as\s+/)[0].trim()
      if (name) names.add(name)
    }
  }
  return names
}

/** 从门面代码抽取 `import { a, b as c } from '@fulgurjs/federation/internal/<file>'` 的导入名 */
function facadeInternalImports(code: string): Array<{ file: string; names: string[] }> {
  const out: Array<{ file: string; names: string[] }> = []
  for (const m of code.matchAll(/import\s*\{([^}]*)\}\s*from\s*'@fulgurjs\/federation\/internal\/([^']+)';/g)) {
    const names = m[1]
      .split(',')
      .map((x) => x.trim().split(/\s+as\s+/)[0].trim())
      .filter(Boolean)
    out.push({ file: m[2], names })
  }
  return out
}

for (const framework of ['vue', 'react'] as const) {
  describe(`genApiFacade('${framework}') 绑定防回归`, () => {
    it('每条 internal 具名导入都真实存在于 dist 模块导出面', () => {
      const code = genApiFacade(framework)
      const imports = facadeInternalImports(code)
      expect(imports.length).toBeGreaterThan(0)
      for (const { file, names } of imports) {
        const real = distExports(file)
        for (const n of names) {
          expect(real, `${file} 未导出 ${n}——门面绑定漂移（MFU-001 隐患）`).toContain(n)
        }
      }
    })
  })
}

describe('门面导出面与统一入口合同一致', () => {
  it('vue 门面导出 createVueBridgeApp（绑定后导出，而非 WithLoader 名）', () => {
    const code = genApiFacade('vue')
    expect(code).toContain('createVueBridgeAppWithLoader as __fulgurjs_cvb')
    expect(code).toContain('export const createVueBridgeApp = __fulgurjs_cvb(__fulgurjs_loadRemote);')
    expect(code).not.toMatch(/import\s*\{\s*createVueBridgeApp[\s,}]/)
  })
  it('react 门面导出 createReactBridgeApp（绑定后导出）', () => {
    const code = genApiFacade('react')
    expect(code).toContain('createReactBridgeAppWithLoader as __fulgurjs_crb')
    expect(code).toContain('export const createReactBridgeApp = __fulgurjs_crb(__fulgurjs_loadRemote);')
    expect(code).not.toMatch(/import\s*\{\s*createReactBridgeApp[\s,}]/)
  })
})
