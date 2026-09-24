/**
 * 发布清单一致性：exports 子路径、typesVersions 映射、磁盘 d.ts 三方对齐。
 * 背景：node10 语义（moduleResolution:"node"）不读 exports——typesVersions 是
 * 老 TS 的子路径类型解析唯一通道，漏配任意一侧即用户 IDE ts(2307)（0.7.1 实测事故）。
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const pkgRoot = path.resolve(__dirname, '..')
const pkg = JSON.parse(fs.readFileSync(path.join(pkgRoot, 'package.json'), 'utf8'))

// 4.0.0：公开带类型子路径为 ./config 与 ./runtime；内部产物不进 typesVersions。
const SUBPATHS = ['./config', './runtime'] as const

describe('发布清单：exports ↔ typesVersions ↔ 磁盘 d.ts 一致', () => {
  it('每个带 types 的 exports 子路径都有 typesVersions 映射', () => {
    for (const sub of SUBPATHS) {
      const entry = pkg.exports[sub]
      expect(entry, `exports 缺 ${sub}`).toBeTruthy()
      const typesRel = entry.types as string
      expect(typesRel, `${sub} exports.types 缺失`).toBeTruthy()
      const mapped = pkg.typesVersions?.['*']?.[sub.slice(2)]
      expect(mapped, `typesVersions 缺 ${sub} 映射（node10 语义下将 ts2307）`).toBeTruthy()
      expect(mapped[0].replace(/^\.\//, '')).toBe(typesRel.replace(/^\.\//, ''))
    }
  })

  it('映射目标 d.ts 在发布物内真实存在', () => {
    for (const sub of SUBPATHS) {
      const typesRel = pkg.exports[sub].types as string
      expect(fs.existsSync(path.join(pkgRoot, typesRel)), `${typesRel} 不存在——先 build`).toBe(true)
    }
  })

  it('typesVersions 映射的值与 exports.types 不漂移（守未来新增子路径）', () => {
    const typedSubpaths = Object.keys(pkg.exports).filter(
      (k) => k.startsWith('./') && pkg.exports[k]?.types,
    )
    for (const sub of typedSubpaths) {
      // ./internal/* 是内部门面引用面（非公开 API），node10 兼容不承诺。
      if (sub.startsWith('./internal/')) continue
      expect(
        pkg.typesVersions?.['*']?.[sub.slice(2)],
        `exports 新增带类型子路径 ${sub} 但未配 typesVersions`,
      ).toBeTruthy()
    }
  })
})

describe('3.0.0 破坏性收敛：旧公开入口已删除', () => {
  const REMOVED = ['./pages', './context', './vue'] as const
  it('exports 白名单不再包含旧子路径', () => {
    for (const sub of REMOVED) {
      expect(pkg.exports[sub], `${sub} 应已从 exports 删除`).toBeUndefined()
    }
  })
  it('typesVersions 不再映射旧子路径', () => {
    for (const sub of REMOVED) {
      expect(pkg.typesVersions?.['*']?.[sub.slice(2)], `${sub} 的 typesVersions 映射应已删除`).toBeUndefined()
    }
  })
  it('内部引用键存在（虚拟门面 build 形态的 re-export 目标）', () => {
    expect(pkg.exports['./internal/context.js']).toBeTruthy()
    expect(pkg.exports['./internal/pages.js']).toBeTruthy()
    expect(pkg.exports['./internal/vue.js']).toBeTruthy()
    expect(pkg.exports['./internal/vue-adapter.js']).toBeTruthy()
    expect(pkg.exports['./runtime'].require).toBeUndefined()
  })

  it('/runtime 的 CommonJS require 被 exports 拒绝', () => {
    const req = createRequire(path.join(pkgRoot, 'package.json'))
    expect(() => req('@fulgurjs/federation/runtime')).toThrow()
  })
})
