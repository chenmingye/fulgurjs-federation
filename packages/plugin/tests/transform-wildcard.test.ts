/**
 * BI-FIX 回归（2026-10-22 DEMES5.5 迁移轮）：共享键的通配符转发层展开。
 *
 * 修复前事实：vue-demi 等转发包（`export * from 'vue'`）进入门面改写闭包时，
 * transformModule 直接硬报错「共享模块不支持 export * from 'vue'」——BPM 生产构建
 * 因此失败（pinia/@vueuse 的传递依赖 vue-demi 在 expose 闭包内）。
 *
 * 修复后契约：构建期从被改写模块出发解析 shared 包入口，静态收集命名导出
 * （不含 default——export * 语义本就不转出 default），把通配符改写为
 * `export { ...显式名 } from '<绑定门面>'`；收集失败才保留硬报错。
 */
import { describe, expect, it } from 'vitest'
import { transformModule } from '../src/transform'
import { normalizeOptions, type FederationOptions } from '../src/options'
import path from 'node:path'

const ROOT = process.cwd()

function ctx(opts: FederationOptions) {
  return { options: normalizeOptions(opts, ROOT, 'build'), rewriteShared: true }
}

describe('通配符转发层展开（vue-demi 形态）', () => {
  it('export * from vue → 显式命名导出的门面转发（含 ref/computed 等真实导出面）', async () => {
    // 用插件仓库自身的 node_modules 解析 vue（与业务场景同构：importer 在依赖闭包内）
    const importer = path.join(process.cwd(), 'src/index.ts')
    const result = await transformModule(
      `import * as Vue from 'vue'\nvar isVue2 = false\nexport * from 'vue'\nexport { isVue2 }\n`,
      importer,
      ctx({ name: 'wildcard-app', remotes: {}, exposes: { './bridge': './src/bridge.ts' }, shared: { vue: { singleton: true } }, devSharedSelf: false }),
    )
    expect(result?.code).toBeTruthy()
    // 通配符被展开为显式命名导出（ref/computed 属于 vue 真实导出面）
    expect(result!.code).toMatch(/export \{ [^}]*\bref\b[^}]* \} from/)
    expect(result!.code).toMatch(/\bcomputed\b/)
    // 不再残留通配符形态
    expect(result!.code).not.toMatch(/export \* from 'vue'/)
    // 原有显式导出语句保持
    expect(result!.code).toContain('isVue2')
  })

  it('收集失败（shared 包不可解析）仍硬报错，不静默交付缺导出产物', async () => {
    // 以不存在的 importer 路径触发解析失败
    await expect(
      transformModule(`export * from 'vue'\n`, '/nonexistent-dir/whatever/x.ts',
        ctx({ name: 'wildcard-app', remotes: {}, exposes: { './bridge': './src/bridge.ts' }, shared: { vue: { singleton: true } }, devSharedSelf: false })),
    ).rejects.toThrow(/export \*/)
  })
})
