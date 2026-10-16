import { expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { NormalizedOptions } from '../src/options'
import type { DtsGenerateInput, DtsGenerateResult } from '../src/dts-generate'

const generate = vi.hoisted(() => vi.fn())
vi.mock('../src/dts-generate', () => ({ generateTypesBundle: generate }))
import { createDevTypesServer } from '../src/dts-serve'

it('服务串行复用独占缓存，关闭时取消任务且等待编译器退出后清理', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fg-types-serve-'))
  const calls: DtsGenerateInput[] = []
  let finish!: (result: DtsGenerateResult) => void
  generate.mockImplementation((input: DtsGenerateInput) => {
    calls.push(input)
    return new Promise<DtsGenerateResult>(resolve => { finish = resolve })
  })
  const server = createDevTypesServer({ root, exposes: [{ name: './entry', import: './entry.vue' }], pluginVersion: 'test' } as NormalizedOptions, { warn: () => {}, log: () => {} })
  try {
    expect(calls).toHaveLength(1)
    const cache = calls[0].incrementalDir!
    expect(fs.existsSync(cache)).toBe(true)
    server.invalidate()
    server.invalidate()
    expect(calls).toHaveLength(1)
    finish({ ok: false, diagnostics: ['第一轮受控失败'] })
    await vi.waitFor(() => expect(calls).toHaveLength(2))
    expect(calls[1].incrementalDir).toBe(cache)
    server.invalidate()
    server.dispose()
    expect(calls[1].signal?.aborted).toBe(true)
    expect(fs.existsSync(cache)).toBe(true)
    finish({ ok: false, diagnostics: ['编译器已退出'] })
    await vi.waitFor(() => expect(server.isGenerating()).toBe(false))
    expect(fs.existsSync(cache)).toBe(false)
    expect(calls).toHaveLength(2)
    server.invalidate()
    expect(calls).toHaveLength(2)
  } finally {
    server.dispose()
    fs.rmSync(root, { recursive: true, force: true })
    generate.mockReset()
  }
})
