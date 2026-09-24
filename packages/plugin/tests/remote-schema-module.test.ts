import { describe, expect, it } from 'vitest'
import { genRemoteSchemaModule } from '../src/remote-schema'

describe('dev schema 模块生成', () => {
  it('预热与按需路径都提供具名及默认导出', () => {
    const source = genRemoteSchemaModule({ demo: { exists: true, exposes: ['./Page'] } })
    expect(source).toContain('export const remoteSchema = {"demo"')
    expect(source).toContain('export default remoteSchema')
  })
})
