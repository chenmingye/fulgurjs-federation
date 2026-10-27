import { afterEach, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { typesCachePath } from '../src/dts-cache'
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
    await vi.waitFor(() => expect(calls).toHaveLength(1))
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

const ownedRoots: string[] = []
const ownedServers: Array<ReturnType<typeof createDevTypesServer>> = []
afterEach(() => {
  for (const service of ownedServers.splice(0)) service.dispose()
  for (const root of ownedRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
  generate.mockReset()
})
function cacheProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fg-serve-cache-'))
  ownedRoots.push(root)
  fs.mkdirSync(path.join(root, 'src'))
  fs.mkdirSync(path.join(root, 'node_modules'))
  fs.symlinkSync(path.resolve(__dirname, '../node_modules/typescript'), path.join(root, 'node_modules/typescript'), 'dir')
  fs.writeFileSync(path.join(root, 'package.json'), '{"private":true}')
  fs.writeFileSync(path.join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { types: [], moduleResolution: 'bundler', module: 'ESNext' }, include: ['src'] }))
  fs.writeFileSync(path.join(root, 'src/entry.ts'), 'export const value = 1')
  const options = { root, exposes: [{ name: './entry', import: './src/entry.ts' }], pluginVersion: 'test' } as NormalizedOptions
  const text = 'export declare const value: 1;'
  const index = { schemaVersion: 1, generator: '@fulgurjs/federation', pluginVersion: 'test', revision: 'abcdef1234567890', exposes: { './entry': { declaration: 'files/entry.d.ts' } }, externals: [], files: { 'files/entry.d.ts': crypto.createHash('sha256').update(text).digest('hex') } }
  const { revision: _revision, ...body } = index
  index.revision = crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 16)
  const result: DtsGenerateResult = { ok: true, index, files: new Map([['index.json', JSON.stringify(index)], ['files/entry.d.ts', text]]), tool: 'typescript', fileCount: 1, notices: [] }
  const logs: string[] = []
  const start = () => {
    const server = createDevTypesServer(options, { log: message => logs.push(message), warn: message => logs.push(message) })
    ownedServers.push(server)
    return server
  }
  return { root, options, result, revision: index.revision, logs, start }
}

it('关闭并重启恢复成功声明；同内容触碰不编译，改动失败不服务旧缓存', async () => {
  const p = cacheProject()
  generate.mockResolvedValue(p.result)
  const first = p.start()
  await vi.waitFor(() => expect(first.revision()).toBe(p.revision), { timeout: 10000 })
  expect(generate).toHaveBeenCalledTimes(1)
  const compiled = first.servePath('/@fulgurjs-types/files/entry.d.ts')?.body
  first.dispose()
  expect(fs.existsSync(typesCachePath(p.root))).toBe(true)
  const second = p.start()
  await vi.waitFor(() => expect(second.revision()).toBe(p.revision), { timeout: 10000 })
  expect(generate).toHaveBeenCalledTimes(1)
  expect(second.servePath('/@fulgurjs-types/files/entry.d.ts')?.body).toBe(compiled)
  expect(p.logs.join('\n')).toContain('类型缓存命中')
  fs.writeFileSync(path.join(p.root, 'src/entry.ts'), 'export const value = 1')
  second.invalidate()
  await vi.waitFor(() => expect(second.isGenerating()).toBe(false), { timeout: 10000 })
  expect(generate).toHaveBeenCalledTimes(1)
  generate.mockResolvedValue({ ok: false, diagnostics: ['受控编译失败'] })
  fs.writeFileSync(path.join(p.root, 'src/entry.ts'), 'export const value = Missing')
  second.invalidate()
  await vi.waitFor(() => expect(second.revision()).toBeNull(), { timeout: 10000 })
  expect(second.servePath('/@fulgurjs-types/index.json')).toBeNull()
  expect(p.logs.join('\n')).toContain('受控编译失败')
  second.dispose()
  const third = p.start()
  await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(3), { timeout: 10000 })
  await vi.waitFor(() => expect(third.isGenerating()).toBe(false), { timeout: 10000 })
  expect(third.revision()).toBeNull()
}, 30000)

it('缓存不可写不影响声明提供，服务立即关闭不启动后台编译', async () => {
  const p = cacheProject()
  generate.mockResolvedValue(p.result)
  const stopped = p.start()
  stopped.dispose()
  await new Promise(resolve => setImmediate(resolve))
  expect(generate).not.toHaveBeenCalled()
  fs.mkdirSync(path.join(p.root, 'node_modules/.cache/fulgurjs'), { recursive: true })
  fs.writeFileSync(path.join(p.root, 'node_modules/.cache/fulgurjs/types'), '受控不可写缓存目录')
  {
    const server = p.start()
    await vi.waitFor(() => expect(server.revision()).toBe(p.revision), { timeout: 10000 })
    expect(server.servePath('/@fulgurjs-types/files/entry.d.ts')?.body).toContain('value: 1')
    expect(p.logs.join('\n')).toContain('类型缓存写入失败')
  }
}, 15000)

it('编译中输入变化时不发布或持久化中间结果，而是自动补跑', async () => {
  const p = cacheProject()
  const finish: Array<(result: DtsGenerateResult) => void> = []
  generate.mockImplementation(() => new Promise<DtsGenerateResult>(resolve => finish.push(resolve)))
  const server = p.start()
  await vi.waitFor(() => expect(finish).toHaveLength(1), { timeout: 10000 })
  fs.writeFileSync(path.join(p.root, 'src/entry.ts'), 'export const value = 2')
  finish[0]!(p.result)
  await vi.waitFor(() => expect(finish).toHaveLength(2), { timeout: 10000 })
  expect(server.revision()).toBeNull()
  expect(fs.existsSync(typesCachePath(p.root))).toBe(false)
  if (!p.result.ok) throw new Error('fixture must succeed')
  const text = 'export declare const value: 2;'
  const index = { ...p.result.index, files: { 'files/entry.d.ts': crypto.createHash('sha256').update(text).digest('hex') } }
  const { revision: _revision, ...body } = index
  index.revision = crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 16)
  finish[1]!({ ...p.result, index, files: new Map([['files/entry.d.ts', text], ['index.json', JSON.stringify(index)]]) })
  await vi.waitFor(() => expect(server.revision()).toBe(index.revision), { timeout: 10000 })
  expect(server.servePath('/@fulgurjs-types/files/entry.d.ts')?.body).toContain('value: 2')
  expect(fs.existsSync(typesCachePath(p.root))).toBe(true)
}, 15000)

it('根目录外的真实导入变更也会自动重新生成，不依赖Vite根目录事件', async () => {
  const p = cacheProject()
  const external = fs.mkdtempSync(path.join(os.tmpdir(), 'fg-serve-external-'))
  ownedRoots.push(external)
  const model = path.join(external, 'model.ts')
  fs.writeFileSync(model, 'export const value = 1')
  fs.writeFileSync(path.join(p.root, 'src/entry.ts'), `export { value } from ${JSON.stringify(model)}`)
  generate.mockResolvedValue(p.result)
  const service = p.start()
  await vi.waitFor(() => expect(service.revision()).toBe(p.revision), { timeout: 10000 })
  expect(generate).toHaveBeenCalledTimes(1)
  fs.writeFileSync(model, 'export const value = 2')
  await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(2), { timeout: 10000 })
  await vi.waitFor(() => expect(service.isGenerating()).toBe(false), { timeout: 10000 })
}, 25000)
