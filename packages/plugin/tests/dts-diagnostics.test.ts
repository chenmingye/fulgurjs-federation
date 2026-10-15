import { describe, expect, it } from 'vitest'
import path from 'node:path'
import { formatDeclarationDiagnostics } from '../src/dts-diagnostics'

describe('公开声明错误定位', () => {
  const root = path.resolve('provider with spaces')
  const closure = new Set([path.join(root, 'src/exposed.vue')])
  it('业务诊断的长续行不能挤掉公开入口的文件与错误码', () => {
    const stdout = [
      'src/exposed.vue(9,31): error TS2322: Wrong props',
      "  Property 'name' is required.",
      'src/business.vue(1,1): error TS2742: Unrelated',
      ...Array(100).fill('  unrelated business detail'),
    ].join('\n')
    const message = formatDeclarationDiagnostics(stdout, '', 'exec failed', root, closure)
    expect(message).toContain('src/exposed.vue(9,31): error TS2322')
    expect(message).toContain("Property 'name'")
    expect(message).not.toMatch(/business|exec failed/)
  })
  it('保留无文件的配置错误，并处理强制颜色', () => {
    const message = formatDeclarationDiagnostics('\u001b[91merror TS2688: Cannot find types\u001b[0m', '', '', root, closure)
    expect(message).toBe('error TS2688: Cannot find types')
  })
  it('编译器未产出诊断时保留原始进程失败原因', () => {
    expect(formatDeclarationDiagnostics('', '', 'spawn ENOENT', root, closure)).toBe('spawn ENOENT')
  })
})
