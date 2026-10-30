import { describe, expect, it } from 'vitest'
import { federation } from '../src/index'

/** 配置期诊断码必须真实出现在错误/警告文本中，便于用户按 CODE_REGISTRY 检索修法。 */
const first = (opts: Record<string, unknown>) => {
  const r = federation(opts as never)
  return Array.isArray(r) ? r[0] : r
}
const config = (p: ReturnType<typeof first>) => p.config.call({}, {}, { command: 'serve', mode: 'development' })

describe('配置期诊断码标签', () => {
  it('CFG-001..005 在真实配置错误文本中出现', async () => {
    const cases: Array<[string, Record<string, unknown>]> = [
      ['CFG-001', {}],
      ['CFG-002', { name: 'cfg2', exposes: 1 }],
      ['CFG-003', { name: 'cfg3', remotes: 1 }],
      ['CFG-004', { name: 'cfg4', shared: 1 }],
      ['CFG-005', { name: 'cfg5', remotes: { vue: 'http://localhost:5999' }, shared: { vue: true } }],
    ]
    for (const [code, opts] of cases) {
      await expect(config(first(opts))).rejects.toThrow(code)
    }
  })
})
