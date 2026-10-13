import { describe, expect, it } from 'vitest'
import { checklistFor } from '../src/init'

describe('init 接入说明与组件 props 合同一致', () => {
  it.each(['vue', 'react'] as const)('%s 提供方不错误要求所有必填 props 都有默认值', (framework) => {
    const text = checklistFor({ framework, role: 'provider' }).join('\n')
    expect(text).toContain('必填 props 在消费处传入')
    expect(text).toContain('不是自动构建限制')
    expect(text).not.toContain('组件必填 props 给默认值（BLD-003）')
  })
})
