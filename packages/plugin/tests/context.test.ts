/**
 * 0.8.0 跨应用传值契约（AppContext）单测。
 * 覆盖：provide merge 幂等 / get 快照（引用共享）/ require 命中与 CC-001 三段式 /
 * CC-002 无运行时 / globalThis 守卫防多副本（模块重载仍读同一存储）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
// 先 import 真运行时：模块求值即创建单例并挂 globalThis.__FULGURJS_RUNTIME__
import { runtime } from '../src/runtime/index'
import {
  ContextErrorCodes,
  provideFulgurjsAppContext,
  getFulgurjsAppContext,
  requireFulgurjsAppContext,
  type FulgurjsAppContext,
} from '../src/context'

// 存储在运行时单例闭包内、跨用例共享——每用例前清空防状态污染
beforeEach(() => {
  const ctx = runtime.getFulgurjsAppConfig() as Record<string, any>
  for (const k of Object.keys(ctx)) delete ctx[k]
})

describe('AppContext：provide merge 幂等', () => {
  it('两次 provide 叠加，后写覆盖同键，先写键保留', () => {
    provideFulgurjsAppContext({ user: { id: '101' }, locale: 'zh-cn' })
    provideFulgurjsAppContext({ locale: 'en', baseUrl: '/demo' })
    const ctx = getFulgurjsAppContext()
    expect(ctx.user).toEqual({ id: '101' })
    expect(ctx.locale).toBe('en')
    // 扩展位：项目自定义键经 [key: string]: unknown 透传（0.8.2 起 token/formUrl/baseUrl 不在默认 provide）
    expect(ctx.baseUrl).toBe('/demo')
  })

  it('同键重复 provide 幂等（值相同不抖动）', () => {
    provideFulgurjsAppContext({ formUrl: '/flowable' })
    provideFulgurjsAppContext({ formUrl: '/flowable' })
    expect(getFulgurjsAppContext().formUrl).toBe('/flowable')
  })
})

describe('AppContext：get 快照（传输层，嵌套引用共享）', () => {
  it('嵌套对象（events）引用共享：写入方挂属性即时可见', () => {
    const mainEvents = { getDictItems: () => ['a'] }
    provideFulgurjsAppContext({ events: { main: mainEvents } })
    const ctx = getFulgurjsAppContext()
    // 同 realm 直引用语义：子应用挂属性 / 宿主改属性，双方即时可见
    ;(ctx.events as any).main.newMethod = () => 42
    expect(mainEvents.newMethod()).toBe(42)
    expect((runtime.getFulgurjsAppConfig() as any).events.main.newMethod()).toBe(42)
  })
})

describe('AppContext：require 显式校验', () => {
  it('键齐全时返回整个 context（调用方解构消费）', () => {
    provideFulgurjsAppContext({ store: { state: 1 }, user: { id: 1 }, hostApp: { use: () => {} } })
    const ctx: FulgurjsAppContext = requireFulgurjsAppContext('store', 'user', 'hostApp')
    expect(ctx.store).toEqual({ state: 1 })
    expect(ctx.user).toEqual({ id: 1 })
  })

  it('缺任一键 → CC-001 三段式（错误码 + got/expected + 修法指向宿主桥），零静默', () => {
    provideFulgurjsAppContext({ locale: 'zh-cn' })
    try {
      requireFulgurjsAppContext('store', 'user', 'hostApp')
      expect.unreachable('requireFulgurjsAppContext should have thrown')
    } catch (err: any) {
      expect(err.code).toBe('CC-001')
      expect(err.code).toBe(ContextErrorCodes.CONTEXT_MISSING_KEY)
      expect(err.message).toContain('CC-001')
      expect(err.message).toContain('"store"')
      expect(err.message).toContain('got:')
      expect(err.message).toContain('expected:')
      expect(err.message).toContain('provideFulgurjsAppContext')
      expect(err.message).toContain('bridge')
      expect(err.details).toMatchObject({ missing: ['store', 'user', 'hostApp'] })
    }
  })
})

describe('AppContext：CC-002 无运行时（独立直开远程页）', () => {
  afterEach(() => {
    ;(globalThis as any).__FULGURJS_RUNTIME__ = runtime
  })

  it('globalThis.__FULGURJS_RUNTIME__ 缺失时 provide/get/require 全部 CC-002 显式抛错', () => {
    delete (globalThis as any).__FULGURJS_RUNTIME__
    for (const fn of [
      () => provideFulgurjsAppContext({ user: {} }),
      () => getFulgurjsAppContext(),
      () => requireFulgurjsAppContext('store'),
    ]) {
      try {
        fn()
        expect.unreachable('should have thrown CC-002')
      } catch (err: any) {
        expect(err.code).toBe('CC-002')
        expect(err.message).toContain('CC-002')
        expect(err.message).toContain('__FULGURJS_RUNTIME__')
        expect(err.message).toContain('宿主')
      }
    }
  })
})

describe('AppContext：globalThis 守卫防多副本', () => {
  it('context 模块被重新实例化（多 bundle 各带一份）仍读写同一全局存储', async () => {
    provideFulgurjsAppContext({ baseUrl: '/demo' })
    vi.resetModules()
    const fresh = await import('../src/context')
    // 新副本 provide → 旧副本 get 可见；新副本 require 也命中（委托同一 runtime 单例）
    fresh.provideFulgurjsAppContext({ formUrl: '/form' })
    expect((getFulgurjsAppContext() as any).baseUrl).toBe('/demo')
    expect((getFulgurjsAppContext() as any).formUrl).toBe('/form')
    expect(fresh.requireFulgurjsAppContext('formUrl').formUrl).toBe('/form')
  })
})
