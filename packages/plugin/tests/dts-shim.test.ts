/**
 * dts shim 形态单测（0.9.0）：shim 模式产物不引用跨工程源文件（IDE 红波浪线根治），
 * source 模式行为不变。
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { buildShimModule, resolveDtsMode, resolveDtsDir } from '../src/dts'

describe('resolveDtsMode', () => {
  it('默认 source；显式 shim 生效；false 亦回 source（无生成即无形态）', () => {
    expect(resolveDtsMode(undefined)).toBe('source')
    expect(resolveDtsMode(true)).toBe('source')
    expect(resolveDtsMode({ dir: 'x' })).toBe('source')
    expect(resolveDtsMode({ dir: 'x', mode: 'shim' })).toBe('shim')
    expect(resolveDtsMode(false)).toBe('source')
  })

  it('resolveDtsDir 兼容新 mode 字段（不破坏 dir 语义）', () => {
    expect(resolveDtsDir({ dir: 'x', mode: 'shim' }, true)).toBe('x')
    expect(resolveDtsDir(true, true)).toBe('src/fulgurjs/types')
  })
})

describe('buildShimModule', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dts-shim-'))

  it('TS 源码：枚举具名导出为宽松 any 占位，零跨工程相对路径引用', () => {
    const abs = path.join(tmp, 'api.ts')
    fs.writeFileSync(abs, 'export function getDictItems(code: string) { return [] }\nexport const VERSION = 1\nexport interface Foo { a: number }\n')
    const block = buildShimModule(abs, 'demo-host/api')
    expect(block).toContain("declare module "demo-host/api"")
    expect(block).toContain('export const getDictItems: any')
    expect(block).toContain('export const VERSION: any')
    expect(block).toContain('export const Foo: any')
    // 关键：shim 产物不引用源文件路径（IDE 不跟进跨工程源码）
    expect(block).not.toContain('from ')
    expect(block).not.toContain('api.ts')
  })

  it('Vue SFC：DefineComponent 默认导出占位', () => {
    const abs = path.join(tmp, 'Card.vue')
    fs.writeFileSync(abs, '<template><div /></template>')
    const block = buildShimModule(abs, 'mes-bpm/Card')
    expect(block).toContain("declare module 'mes-bpm/Card'")
    expect(block).toContain('DefineComponent')
    expect(block).toContain('export default component')
    // 关键语义：不引用跨工程源文件（import vue 类型合法；'..' 相对路径与源文件名不允许）
    expect(block).not.toMatch(/from ['"]\.\./)
    expect(block).not.toContain('Card.vue')
  })

  it('含 default 导出的 TS 模块：生成 default 占位', () => {
    const abs = path.join(tmp, 'with-default.ts')
    fs.writeFileSync(abs, 'export default function main() {}\nexport const helper = 1\n')
    const block = buildShimModule(abs, 'remote-a/with-default')
    expect(block).toContain('export default _default')
  })
})
