// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { resolveBridgeContext } from '../src/bridge-core'
import { probeRemotesAndBuildSchema } from '../src/remote-schema'
import { manifestUrlFromEntry } from '../src/manifest'
import type { NormalizedOptions } from '../src/options'

afterEach(() => {
  delete (globalThis as any).__FULGURJS_APP_CONFIG__
  vi.unstubAllGlobals()
})
describe('真实接入回归', () => {
  it('自动会话缺 getter 时保留已有凭据并拒绝不完整接线', () => {
    const snapshot = { user: { id: 'A' }, getToken: () => 'test' }
    ;(globalThis as any).__FULGURJS_APP_CONFIG__ = snapshot
    expect(() => resolveBridgeContext('a/bridge', 'A', undefined, true)).toThrow(/getContext/)
    expect((globalThis as any).__FULGURJS_APP_CONFIG__).toBe(snapshot)
  })
  it('自动会话可在空上下文创建代次，同代次复用既有上下文', () => {
    expect(resolveBridgeContext('a/bridge', 'A', undefined, true)).toEqual({ provide: { sessionKey: 'A' } })
    const snapshot = { sessionKey: 'A', user: { id: 'A' } }
    ;(globalThis as any).__FULGURJS_APP_CONFIG__ = snapshot
    expect(resolveBridgeContext('a/bridge', 'A', undefined, true)).toEqual({})
    expect((globalThis as any).__FULGURJS_APP_CONFIG__).toBe(snapshot)
  })
  it('dev 消费自定义生产入口时请求真实 JSON manifest', async () => {
    const fetcher = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetcher)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await probeRemotesAndBuildSchema({
      remotes: [{ key: 'a', devEntry: 'https://example.test/base/custom-entry.js?revision=1' }],
    } as NormalizedOptions)
    expect(String(fetcher.mock.calls[0][0])).toBe('https://example.test/base/fulgurjs-manifest.json?revision=1')
    expect(manifestUrlFromEntry('https://example.test/base/@fulgurjs-entry.js')).toBe('https://example.test/base/@fulgurjs-manifest.json')
    vi.restoreAllMocks()
  })
})
