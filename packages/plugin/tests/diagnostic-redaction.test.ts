import { describe, expect, it } from 'vitest'
import { diagnosticMessage, FgError } from '../src/runtime/errors'

describe('诊断展示脱敏与原始异常分别保留', () => {
  it('URL 凭据/query/hash 不进入包装消息，原对象及堆栈仍在 cause', () => {
    const original = new Error('fetch https://user:pass@example.test/chunk.js?token=SYNTHETIC_TOKEN#SYNTHETIC_HASH。请检查部署。')
    const error = new FgError('MFU-001', original.message, { stage: 'expose' }, { cause: original })
    expect(error.message).toBe('[fulgurjs:MFU-001] fetch https://example.test/chunk.js。请检查部署。')
    expect(error.cause).toBe(original)
    expect(original.message).toContain('SYNTHETIC_TOKEN')
    expect(original.stack).toContain('diagnostic-redaction.test.ts')
    expect(error.details).toEqual({ stage: 'expose' })
  })

  it('保留跨 realm/结构化错误消息，不把合法错误变成 object Object', () => {
    expect(diagnosticMessage({ message: '错误来自 https://x.test/a.js?key=SYNTHETIC_QUERY' }))
      .toBe('错误来自 https://x.test/a.js')
    expect(diagnosticMessage('token=SYNTHETIC_TOKEN cookie=SYNTHETIC_COOKIE'))
      .toBe('token=[redacted] cookie=[redacted]')
    expect(diagnosticMessage('Authorization: Bearer SYNTHETIC_AUTH'))
      .toBe('Authorization=[redacted]')
    expect(diagnosticMessage('合法空数据，不应推断错误')).toBe('合法空数据，不应推断错误')
  })
})
