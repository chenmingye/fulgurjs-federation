/**
 * D04 回归：prod 重试 helper 语义（任务书 §6）。
 * 修复前：__fgR 按调用次数 cache-bust——第二次成功调用也被改写成 retry URL（模块重复
 * 求值、Context/store 身份分裂）。修复后：per-URL promise 状态机——成功缓存定型
 * Promise（单实例、零额外请求）；失败才推进代次；并发共享同一 Promise，每代次只推进
 * 一次（并发失败不会互相覆盖出多个代次 URL → 模块实例分裂）。
 *
 * 两层验证：
 * 1. 黑盒（Node 真实动态 import + data: URL）：成功身份保持、跨 URL 隔离。
 * 2. 白盒（stub import 捕获请求 URL 序列）：完整状态机——失败才 bust、单调递增、
 *    bust 成功后稳定、已有 query 用 & 拼接、并发失败单代推进。
 */
import { describe, expect, it } from 'vitest'
import { genProdRetryHelper } from '../src/virtual'

/** 黑盒：真实动态 import（data: URL 模块可读自身 import.meta.url） */
function makeRealHelper(): (u: string) => Promise<any> {
  const body = genProdRetryHelper().replace('import(url)', '__import(url)')
  const factory = new Function('__import', `${body}\nreturn __fgR;`)
  const realImport = (u: string) => import(/* @vite-ignore */ u)
  return factory(realImport) as (u: string) => Promise<any>
}

/** 白盒：stub import 捕获每次实际请求的 URL；失败集合可编程；同 URL 单实例（模拟 module map） */
function makeCaptureHelper(failSet: Set<string>, delayUrls: Set<string> = new Set()) {
  const requested: string[] = []
  const body = genProdRetryHelper().replace('import(url)', '__import(url)')
  const factory = new Function('__import', `${body}\nreturn { __fgR, __fgS };`)
  const cache = new Map<string, { marker: string }>()
  const api = factory((u: string) => {
    requested.push(u)
    if (failSet.has(u)) return Promise.reject(new Error('injected-fail'))
    if (!cache.has(u)) cache.set(u, { marker: u })
    const hit = cache.get(u)
    if (delayUrls.has(u)) {
      return new Promise((resolve) => setTimeout(() => resolve(hit), 30))
    }
    return Promise.resolve(hit)
  }) as { __fgR: (u: string) => Promise<any>; __fgS: Record<string, { n: number; p: unknown }> }
  return { ...api, requested }
}

const mod = (name: string) => `data:text/javascript,export const marker=${JSON.stringify(name)};export const self=import.meta.url`
const badMod = `data:text/javascript,throw new Error("injected-fail")`

describe('D04: prod 重试 helper（per-URL promise 状态机）', () => {
  it('黑盒：成功模块重复访问＝同一实例、原始 URL（零 bust、零重复 import）', async () => {
    const __fgR = makeRealHelper()
    const url = mod('ctx-a')
    const m1 = await __fgR(url)
    const m2 = await __fgR(url)
    const m3 = await __fgR(url)
    expect(m2).toBe(m1)
    expect(m3).toBe(m1)
    expect(m1.self).toBe(url)
  })

  it('黑盒：一个 URL 的失败不影响其他 URL 的成功身份', async () => {
    const __fgR = makeRealHelper()
    const good = mod('ctx-good')
    const m1 = await __fgR(good)
    await expect(__fgR(badMod)).rejects.toThrow()
    const m2 = await __fgR(good)
    expect(m2).toBe(m1)
    expect(m2.self).toBe(good)
  })

  it('白盒：成功路径只 import 一次（修复前第二次起被改写为 retry URL）', async () => {
    const h = makeCaptureHelper(new Set())
    const m1 = await h.__fgR('/assets/Context.js')
    const m2 = await h.__fgR('/assets/Context.js')
    const m3 = await h.__fgR('/assets/Context.js')
    expect(h.requested).toEqual(['/assets/Context.js'])
    expect(m2).toBe(m1)
    expect(m3).toBe(m1)
  })

  it('白盒：失败序列 x → retry=1 → retry=2；成功后定型（后续零请求）', async () => {
    const h = makeCaptureHelper(new Set(['/assets/x.js', '/assets/x.js?fulgurjs_retry=1']))
    await expect(h.__fgR('/assets/x.js')).rejects.toThrow('injected-fail')
    await expect(h.__fgR('/assets/x.js')).rejects.toThrow('injected-fail')
    const ok = await h.__fgR('/assets/x.js')
    const again = await h.__fgR('/assets/x.js')
    expect(h.requested).toEqual([
      '/assets/x.js',
      '/assets/x.js?fulgurjs_retry=1',
      '/assets/x.js?fulgurjs_retry=2',
    ])
    expect(again).toBe(ok)
  })

  it('白盒：已有 query 的 URL 用 & 拼接', async () => {
    const h = makeCaptureHelper(new Set(['/assets/x.js?v=1']))
    await expect(h.__fgR('/assets/x.js?v=1')).rejects.toThrow('injected-fail')
    const ok = await h.__fgR('/assets/x.js?v=1')
    const again = await h.__fgR('/assets/x.js?v=1')
    expect(h.requested).toEqual(['/assets/x.js?v=1', '/assets/x.js?v=1&fulgurjs_retry=1'])
    expect(again).toBe(ok)
  })

  it('白盒：并发失败只推进一代（修复前各失败各自递增 → 代次覆盖、实例分裂）', async () => {
    const failSet = new Set(['/assets/x.js'])
    const h = makeCaptureHelper(failSet)
    // 并发三个调用共享同一 Promise：一次失败 → n 只加 1
    const results = await Promise.allSettled([
      h.__fgR('/assets/x.js'),
      h.__fgR('/assets/x.js'),
      h.__fgR('/assets/x.js'),
    ])
    expect(results.every((r) => r.status === 'rejected')).toBe(true)
    expect(h.requested).toEqual(['/assets/x.js'])
    expect(h.__fgS['/assets/x.js'].n).toBe(1)
    // 解除故障后下一次调用恰好用 retry=1，不存在被覆盖出来的 retry=2/retry=3
    failSet.clear()
    const ok = await h.__fgR('/assets/x.js')
    expect(h.requested).toEqual(['/assets/x.js', '/assets/x.js?fulgurjs_retry=1'])
    const again = await h.__fgR('/assets/x.js')
    expect(again).toBe(ok)
  })

  it('白盒：并发首调共享同一在途 Promise（单请求、同实例）', async () => {
    const h = makeCaptureHelper(new Set(), new Set(['/assets/Context.js']))
    const [a, b, c] = await Promise.all([
      h.__fgR('/assets/Context.js'),
      h.__fgR('/assets/Context.js'),
      h.__fgR('/assets/Context.js'),
    ])
    expect(h.requested).toEqual(['/assets/Context.js'])
    expect(b).toBe(a)
    expect(c).toBe(a)
  })

  it('白盒：慢失败者不能把已成功的代次拉回失败（失败代次与成功代次隔离）', async () => {
    // 第一代失败后，retry=1 成功；再无机制会让 retry=1 的成功被旧失败影响
    const h = makeCaptureHelper(new Set(['/assets/x.js']))
    await expect(h.__fgR('/assets/x.js')).rejects.toThrow('injected-fail')
    const ok = await h.__fgR('/assets/x.js')
    expect(h.__fgS['/assets/x.js'].n).toBe(1)
    const again = await h.__fgR('/assets/x.js')
    expect(again).toBe(ok)
    expect(h.requested.filter((u) => u.endsWith('fulgurjs_retry=2'))).toEqual([])
  })

  it('集成：包装后的产物代码（helper + __fgR(url) 调用形态）可真实加载模块', async () => {
    // 复现 5.1.1 首发回归守卫：产物层把 import('url') 改写为 __fgR('url')。若把调用
    // 形态误改回 import(__fgR(url))（helper 返回 Promise → import(Promise)）此用例即失败
    const { genProdRetryHelper } = await import('../src/virtual')
    const helper = genProdRetryHelper()
    const wrapped = 'import("./target.js")'.replace(
      /import\((['"])([^'")]+)\1\)/,
      (_m, q, u) => `__fgR(${q}${u}${q})`,
    )
    const body = helper.replace('import(url)', '__import(url)')
    const factory = new Function('__import', body + '\nreturn { __fgR, run: () => ' + wrapped + ' };')
    const cache = new Map()
    const requested: string[] = []
    const api = factory((u: string) => {
      requested.push(u)
      if (!cache.has(u)) cache.set(u, { from: u })
      return Promise.resolve(cache.get(u))
    })
    const mod = await api.run()
    expect(mod.from).toBe('./target.js')
    expect(requested).toEqual(['./target.js'])
    await expect(api.run()).resolves.toBe(mod)
  })

  it('白盒：两个 expose 别名同 chunk——一次求值、identity 一致、零 retry URL', async () => {
    const h = makeCaptureHelper(new Set())
    const a = await h.__fgR('/assets/Context.js')
    const b = await h.__fgR('/assets/Context.js')
    expect(b).toBe(a)
    expect(h.requested).toEqual(['/assets/Context.js'])
    expect(h.requested.filter((u) => u.includes('fulgurjs_retry'))).toEqual([])
  })
})
