// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'

// errorLoadRemote 语义（社区最想要功能）：fallbackModule 在失败时返回、错误仍显式发出、
// 未传 fallback 照旧抛错。单测经运行时真实注册一个必然失败的 remote 验证。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const runtimeSrc = fs.readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/runtime/index.ts'),
  'utf8',
)

describe('loadRemote errorLoadRemote 语义', () => {
  it('签名支持 fallbackModule 与 retries 覆盖', () => {
    expect(runtimeSrc).toContain('fallbackModule?: () => any')
    expect(runtimeSrc).toContain('retries?: number')
    expect(runtimeSrc).toContain('overrides?.retries ?? remote.retries ?? DEFAULT_RETRIES')
  })
  it.each(['container', 'expose'])('%s 失败返回显式 fallback，同时通知原错误并输出脱敏日志', async (stage) => {
    vi.resetModules()
    delete (globalThis as any).__FULGURJS_RUNTIME__
    delete (globalThis as any).__FULGURJS_APP_CONFIG__
    const runtime = await import('../src/runtime/index')
    const cause = new Error('token=SYNTHETIC_TOKEN cookie=SYNTHETIC_COOKIE')
    const events: any[] = []
    const observer = (event: Event): void => { events.push((event as CustomEvent).detail) }
    window.addEventListener('fulgurjs:error', observer)
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fallback = { answer: 42 }
    try {
      runtime.registerRemote({name:'fallback-test',entry:'',retries:0,promise:async()=>{
        if(stage==='container')throw cause
        return {name:'fallback-test',init:async()=>{},get:async()=>{throw cause}}
      }})
      expect(await runtime.loadRemote('fallback-test/mod' as never, {fallbackModule:()=>fallback})).toBe(fallback)
      expect(events).toHaveLength(1)
      expect(events[0].error.cause).toBe(cause)
      expect(logged).toHaveBeenCalledOnce()
      expect(logged.mock.calls.flat().join(' ')).toContain('fallbackModule')
      expect(logged.mock.calls.flat().join(' ')).not.toContain('SYNTHETIC_')
    } finally {
      window.removeEventListener('fulgurjs:error', observer)
      logged.mockRestore()
    }
  })
})
