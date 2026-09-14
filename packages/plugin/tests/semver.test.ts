import { describe, expect, it } from 'vitest'
import { compareVersions, satisfies } from '../src/semver'

describe('semver: satisfies 全语法矩阵（对齐 webpack requiredVersion 支持面）', () => {
  it('精确与部分版本', () => {
    expect(satisfies('1.2.3', '1.2.3')).toBe(true)
    expect(satisfies('1.2.4', '1.2.3')).toBe(false)
    expect(satisfies('1.2.9', '1.2')).toBe(true)
    expect(satisfies('1.3.0', '1.2')).toBe(false)
    expect(satisfies('1.9.9', '1')).toBe(true)
    expect(satisfies('2.0.0', '1')).toBe(false)
  })

  it('x/通配符', () => {
    expect(satisfies('1.5.2', '1.x')).toBe(true)
    expect(satisfies('2.5.2', '1.x')).toBe(false)
    expect(satisfies('1.2.5', '1.2.x')).toBe(true)
    expect(satisfies('1.3.0', '1.2.x')).toBe(false)
    expect(satisfies('9.9.9', '*')).toBe(true)
  })

  it('脱字符 ^', () => {
    expect(satisfies('1.9.0', '^1.2.3')).toBe(true)
    expect(satisfies('2.0.0', '^1.2.3')).toBe(false)
    expect(satisfies('1.2.2', '^1.2.3')).toBe(false)
    expect(satisfies('0.2.9', '^0.2.3')).toBe(true)
    expect(satisfies('0.3.0', '^0.2.3')).toBe(false)
    expect(satisfies('0.0.3', '^0.0.3')).toBe(true)
    expect(satisfies('0.0.4', '^0.0.3')).toBe(false)
  })

  it('波浪号 ~', () => {
    expect(satisfies('1.2.9', '~1.2.3')).toBe(true)
    expect(satisfies('1.3.0', '~1.2.3')).toBe(false)
    expect(satisfies('1.2.0', '~1.2')).toBe(true)
    expect(satisfies('1.9.9', '~1')).toBe(true)
    expect(satisfies('2.0.0', '~1')).toBe(false)
  })

  it('比较器组合', () => {
    expect(satisfies('1.5.0', '>=1.2.3 <2')).toBe(true)
    expect(satisfies('2.0.0', '>=1.2.3 <2')).toBe(false)
    expect(satisfies('1.2.3', '>1.2.3')).toBe(false)
    expect(satisfies('1.2.4', '>1.2.3')).toBe(true)
    expect(satisfies('1.2.3', '<=1.2.3')).toBe(true)
    expect(satisfies('1.2.3', '=1.2.3')).toBe(true)
  })

  it('连字符范围', () => {
    expect(satisfies('1.5.0', '1.2.3 - 2.3.4')).toBe(true)
    expect(satisfies('2.9.0', '1.2.3 - 2.3.4')).toBe(false)
    expect(satisfies('1.2.3', '1.2.3 - 2.3.4')).toBe(true)
  })

  it('|| 组合', () => {
    expect(satisfies('1.9.0', '^1.0.0 || ^2.0.0')).toBe(true)
    expect(satisfies('2.5.0', '^1.0.0 || ^2.0.0')).toBe(true)
    expect(satisfies('3.0.0', '^1.0.0 || ^2.0.0')).toBe(false)
  })

  it('prerelease', () => {
    expect(satisfies('3.5.0-beta.1', '^3.4.0')).toBe(false)
    expect(satisfies('3.5.0-beta.1', '^3.5.0-beta')).toBe(true)
    expect(satisfies('3.5.0', '^3.5.0-beta')).toBe(true)
  })

  it('false / 空 / URL 视为接受任意版本', () => {
    expect(satisfies('9.9.9', false)).toBe(true)
    expect(satisfies('9.9.9', undefined)).toBe(true)
    expect(satisfies('9.9.9', '')).toBe(true)
    expect(satisfies('1.0.0', 'git+ssh://git@github.com:user/repo.git#v1.0.0')).toBe(true)
  })

  it('v 前缀与 +build 元数据', () => {
    expect(satisfies('v1.2.3', '^1.2.0')).toBe(true)
    expect(satisfies('1.2.3+build.5', '1.2.3')).toBe(true)
  })
})

describe('semver: compareVersions', () => {
  it('基本排序', () => {
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0)
    expect(compareVersions('1.3.0', '1.2.9')).toBeGreaterThan(0)
    expect(compareVersions('0.9.9', '1.0.0')).toBeLessThan(0)
  })
  it('prerelease 排序', () => {
    expect(compareVersions('1.0.0', '1.0.0-beta.1')).toBeGreaterThan(0)
    expect(compareVersions('1.0.0-beta.2', '1.0.0-beta.1')).toBeGreaterThan(0)
    expect(compareVersions('1.0.0-beta.1', '1.0.0-alpha')).toBeGreaterThan(0)
    expect(compareVersions('1.0.0-1', '1.0.0-alpha')).toBeLessThan(0)
  })
})
