import { describe, expect, it } from 'vitest'

// errorLoadRemote 语义（社区最想要功能）：fallbackModule 在失败时返回、错误仍显式发出、
// 未传 fallback 照旧抛错。单测经运行时真实注册一个必然失败的 remote 验证。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const runtimeSrc = fs.readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/runtime/index.ts'),
  'utf8',
)

describe('loadRemote errorLoadRemote 语义（源码契约）', () => {
  it('签名支持 fallbackModule 与 retries 覆盖', () => {
    expect(runtimeSrc).toContain('fallbackModule?: () => any')
    expect(runtimeSrc).toContain('retries?: number')
    expect(runtimeSrc).toContain('overrides?.retries ?? remote.retries ?? DEFAULT_RETRIES')
  })
  it('fallback 生效时错误仍显式发出（不静默）', () => {
    expect(runtimeSrc.match(/returning fallbackModule \(显式降级，错误已透出\)/g)?.length).toBe(2)
    expect(runtimeSrc).toContain('emitError({ remote: name, error: err as Error })')
  })
})
