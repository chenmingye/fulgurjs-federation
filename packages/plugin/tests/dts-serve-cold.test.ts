/**
 * dev 类型服务冷启动路径：没有成功快照文件时，不能被后台缓存线程的往返阻塞。
 * 这里用永不返回的 read 模拟慢缓存线程；冷启动必须在它之前就开始真实生成。
 */
import { expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { typesCachePath } from '../src/dts-cache'
import type { NormalizedOptions } from '../src/options'
import type { DtsGenerateResult } from '../src/dts-generate'

const state = vi.hoisted(() => ({
  read: vi.fn<() => Promise<never>>(),
  generate: vi.fn<(input: unknown) => Promise<DtsGenerateResult>>(),
}))
vi.mock('../src/dts-cache-worker-client', () => ({
  createTypesCacheWorker: () => ({
    read: state.read,
    capture: vi.fn(async () => null),
    validate: vi.fn(async () => null),
    commit: vi.fn(async () => ({ reason: null })),
    release: vi.fn(async () => {}),
    watch: vi.fn(),
    dispose: vi.fn(),
  }),
}))
vi.mock('../src/dts-generate', () => ({ generateTypesBundle: state.generate }))
import { createDevTypesServer } from '../src/dts-serve'

function project(): { root: string; options: NormalizedOptions } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fg-serve-cold-'))
  fs.mkdirSync(path.join(root, 'src'))
  fs.writeFileSync(path.join(root, 'package.json'), '{"private":true}')
  fs.writeFileSync(path.join(root, 'src/entry.vue'), '<template><div /></template>')
  return { root, options: { root, exposes: [{ name: './entry', import: './src/entry.vue' }], pluginVersion: 'test' } as NormalizedOptions }
}

it('没有缓存文件时不等缓存线程，直接开始生成', async () => {
  const { root, options } = project()
  state.read.mockImplementation(() => new Promise<never>(() => {}))
  state.generate.mockImplementation(() => new Promise<DtsGenerateResult>(() => {}))
  const server = createDevTypesServer(options, { warn: () => {}, log: () => {} })
  try {
    await vi.waitFor(() => expect(state.generate).toHaveBeenCalledTimes(1))
    expect(state.read).not.toHaveBeenCalled()
  } finally {
    server.dispose()
    state.read.mockReset()
    state.generate.mockReset()
    fs.rmSync(root, { recursive: true, force: true })
  }
})

it('已有缓存文件时先读取并校验缓存', async () => {
  const { root, options } = project()
  fs.mkdirSync(path.dirname(typesCachePath(root)), { recursive: true })
  fs.writeFileSync(typesCachePath(root), '{}')
  state.read.mockResolvedValue(null as never)
  state.generate.mockImplementation(() => new Promise<DtsGenerateResult>(() => {}))
  const server = createDevTypesServer(options, { warn: () => {}, log: () => {} })
  try {
    await vi.waitFor(() => expect(state.read).toHaveBeenCalledTimes(1))
    await vi.waitFor(() => expect(state.generate).toHaveBeenCalledTimes(1))
  } finally {
    server.dispose()
    state.read.mockReset()
    state.generate.mockReset()
    fs.rmSync(root, { recursive: true, force: true })
  }
})

it('缓存检查期间输入已失效时先重检，不启动已知过期的编译', async () => {
  const { root, options } = project()
  fs.mkdirSync(path.dirname(typesCachePath(root)), { recursive: true })
  fs.writeFileSync(typesCachePath(root), '{}')
  let completeRead!: (value: never) => void
  state.read.mockImplementationOnce(() => new Promise<never>(resolve => { completeRead = resolve }))
    .mockResolvedValue({ result: { files: new Map([['index.json', '{}']]), index: { revision: 'restored' }, fileCount: 1 } } as never)
  state.generate.mockImplementation(() => new Promise<DtsGenerateResult>(() => {}))
  const service = createDevTypesServer(options, { warn: () => {}, log: () => {} })
  try {
    await vi.waitFor(() => expect(state.read).toHaveBeenCalledTimes(1))
    // 模拟自动声明写入时短暂截断；原内容恢复后第二次快照校验允许复用缓存。
    service.markInputChanged()
    completeRead(null as never)
    await vi.waitFor(() => expect(service.revision()).toBe('restored'), { timeout: 2000 })
    expect(state.read).toHaveBeenCalledTimes(2)
    expect(state.generate).not.toHaveBeenCalled()
  } finally {
    service.dispose()
    state.read.mockReset()
    state.generate.mockReset()
    fs.rmSync(root, { recursive: true, force: true })
  }
})
