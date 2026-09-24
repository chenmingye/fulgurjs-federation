import { describe, expect, it } from 'vitest'
import { rewriteRuntimeEntryImports } from '../src/transform'

describe('开发态 /runtime 静态导入改写', () => {
  it('宿主仅拆出 remoteSchema，其余 API 仍走物理入口', async () => {
    const code = `import { loadRemote, remoteSchema as schema, type RemoteConfig } from '@fulgurjs/federation/runtime'`
    const result = await rewriteRuntimeEntryImports(code, false)
    expect(result).toContain('import { loadRemote, type RemoteConfig } from "@fulgurjs/federation/runtime"')
    expect(result).toContain('import { remoteSchema as schema } from "virtual:fulgurjs-remote-schema"')
  })

  it('expose 的其他 API 改走内部代理，remoteComponent 保持静态绑定', async () => {
    const code = `import { remoteComponent, remoteSchema } from '@fulgurjs/federation/runtime'`
    const result = await rewriteRuntimeEntryImports(code, true)
    expect(result).toContain('import { remoteComponent } from "virtual:fulgurjs-api-facade"')
    expect(result).toContain('import { remoteSchema } from "virtual:fulgurjs-remote-schema"')
  })

  it('类型导入与动态导入不改写', async () => {
    const code = `import type { RemoteConfig } from '@fulgurjs/federation/runtime'; const x = import('@fulgurjs/federation/runtime')`
    expect(await rewriteRuntimeEntryImports(code, true)).toBeNull()
  })

  it('多行、注释和同文件多条导入仍保留绑定', async () => {
    const code = `import { /* route, with comma */ remoteSchema as schema,\n loadRemote } from '@fulgurjs/federation/runtime';\nimport { remoteComponent } from '@fulgurjs/federation/runtime'`
    const result = await rewriteRuntimeEntryImports(code, true)
    expect(result).toContain('remoteSchema as schema } from "virtual:fulgurjs-remote-schema"')
    expect(result).toContain('loadRemote } from "virtual:fulgurjs-api-facade"')
    expect(result).toContain('remoteComponent } from \'virtual:fulgurjs-api-facade\'')
    expect(result).not.toContain(';;')
  })
})
