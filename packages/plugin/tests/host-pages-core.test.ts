/**
 * host-pages-core 纯解析单测（Vue/React 共用核心）。
 * 5.1.0 从 vue-adapter 提取后的回归锚：解析行为（base/最长前缀/参数解码/R1–R5/
 * 会话代次判定）必须与提取前完全一致——Vue 侧行为由 host-pages.test.ts 的既有断言守护，
 * 这里补纯函数面的直接覆盖与 React 侧共用性验证。
 */
import { describe, expect, it } from 'vitest'
import {
  cleanCompName,
  createHostPagesCore,
  defaultDeriveSpec,
  noRenderableExportError,
  readSessionKey,
  shouldResetSessionCache,
} from '../src/host-pages-core'

const PAGES = [
  { route: '/remote-x/home', name: 'Home' },
  { route: '/remote-x/detail/:id', spec: 'detail-view', name: 'Detail' },
  { route: '/shared/team', spec: 'shared/team', name: 'Team' },
]

describe('createHostPagesCore 解析', () => {
  const core = createHostPagesCore({
    pages: PAGES,
    remotePrefixes: { '/remote-x': 'remote-x', '/shared/': 'remote-y' },
  })

  it('静态路由命中并推导 spec（去首段前缀）', () => {
    const r = core.resolve('/remote-x/home')
    expect(r).toMatchObject({ remote: 'remote-x', spec: 'remote-x/home', params: {} })
  })

  it('带参路由解码参数；显式 spec 生效', () => {
    const r = core.resolve('/remote-x/detail/%E4%BA%A7%E5%93%81123')
    expect(r).toMatchObject({ spec: 'remote-x/detail-view', params: { id: '产品123' } })
  })

  it('最长前缀优先（/shared/ 命中 remote-y 而非更短前缀）', () => {
    const r = core.resolve('/shared/team')
    expect(r?.remote).toBe('remote-y')
    expect(r?.spec).toBe('remote-y/shared/team')
  })

  it('base 前缀剥离；base 根本身无匹配返回 null', () => {
    const withBase = createHostPagesCore({
      pages: [{ route: '/remote-x/home' }],
      remotePrefixes: { '/remote-x': 'remote-x' },
      base: '/main',
    })
    expect(withBase.resolve('/main/remote-x/home')?.spec).toBe('remote-x/home')
    expect(withBase.resolve('/main')).toBeNull() // base 根剥成 '/' 后无页面匹配
  })

  it('query/hash 剥离；尾斜杠归一；无匹配返回 null', () => {
    expect(core.resolve('/remote-x/home?tab=2#sec')?.page.route).toBe('/remote-x/home')
    expect(core.resolve('/remote-x/home/')?.page.route).toBe('/remote-x/home')
    expect(core.resolve('/unknown/path')).toBeNull()
  })

  it('坏 % 序列参数解码失败只让该次匹配失败，不崩溃', () => {
    expect(core.resolve('/remote-x/detail/%E4%BD')).toBeNull()
  })

  it('页面路由不在任何前缀下时创建期即抛错', () => {
    expect(() =>
      createHostPagesCore({ pages: [{ route: '/other/thing' }], remotePrefixes: { '/remote-x': 'remote-x' } }),
    ).toThrow(/未匹配任何 remotePrefixes/)
  })

  it('definePages 校验照常执行（R1 冲突 throw）', () => {
    expect(() =>
      createHostPagesCore({
        pages: [
          { route: '/remote-x/item' },        // 推导 spec = item
          { route: '/remote-x/item/:id' },    // 剥 :id 段推导 = item → R1 收敛
        ],
        remotePrefixes: { '/remote-x': 'remote-x' },
      }),
    ).toThrow(/\[R1\]/)
  })

  it('strict:false 时 R1 降级不抛错', () => {
    expect(() =>
      createHostPagesCore({
        pages: [
          { route: '/remote-x/item' },
          { route: '/remote-x/item/:id' },
        ],
        remotePrefixes: { '/remote-x': 'remote-x' },
        strict: false,
      }),
    ).not.toThrow()
  })
})

describe('会话代次判定', () => {
  it('readSessionKey 读页面级镜像，无 context 时 undefined', () => {
    const g = globalThis as any
    const prev = g.__FULGURJS_APP_CONFIG__
    delete g.__FULGURJS_APP_CONFIG__
    expect(readSessionKey()).toBeUndefined()
    g.__FULGURJS_APP_CONFIG__ = { sessionKey: 's1' }
    expect(readSessionKey()).toBe('s1')
    g.__FULGURJS_APP_CONFIG__ = { sessionKey: '' }
    expect(readSessionKey()).toBeUndefined()
    if (prev === undefined) delete g.__FULGURJS_APP_CONFIG__
    else g.__FULGURJS_APP_CONFIG__ = prev
  })

  it('shouldResetSessionCache：仅新的非空 sessionKey 重置（登出 undefined 不重置）', () => {
    expect(shouldResetSessionCache('s2', 's1')).toBe(true)   // 换账号
    expect(shouldResetSessionCache('s1', 's1')).toBe(false)  // 同代次
    expect(shouldResetSessionCache(undefined, 's1')).toBe(false) // 登出：不重置（KeepAlive 语义）
    expect(shouldResetSessionCache(undefined, undefined)).toBe(false)
    expect(shouldResetSessionCache('s1', undefined)).toBe(true) // 首次登录
  })
})

describe('共用工具', () => {
  it('cleanCompName 净化非法字符', () => {
    expect(cleanCompName('remote-a/Button')).toBe('Fulgurjs_remote-a_Button')
    expect(cleanCompName('x/页面')).toBe('Fulgurjs_x___')
  })

  it('defaultDeriveSpec 去首段 + 剥 :参 段', () => {
    expect(defaultDeriveSpec('/remote-x/pages/detail/:id')).toBe('pages/detail')
    expect(defaultDeriveSpec('/remote-x')).toBe('')
  })

  it('noRenderableExportError 报出当前值类型', () => {
    expect(noRenderableExportError('r/M', 42).message).toContain('number')
    expect(noRenderableExportError('r/M', null).message).toContain('null')
    expect(noRenderableExportError('r/M', {}).message).toContain('MFU-006')
  })
})
