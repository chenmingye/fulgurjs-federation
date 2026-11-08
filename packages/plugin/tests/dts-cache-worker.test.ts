import { expect, it, vi } from 'vitest'
import { createTypesCacheWorker } from '../src/dts-cache-worker-client'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { captureCompilerInputs, typesCachePath, validateTypesInputs } from '../src/dts-cache'

it('预热仅载入工具，不解析项目或生成声明，也不创建成功缓存', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fg-cache-warmup-'))
  const tool = path.join(root, 'node_modules/typescript')
  fs.mkdirSync(tool, { recursive: true })
  fs.writeFileSync(path.join(tool, 'package.json'), '{"name":"typescript","main":"index.js"}')
  fs.writeFileSync(path.join(tool, 'index.js'), 'Object.defineProperty(exports,"createProgram",{get(){throw Error("不得启动编译")}})')
  fs.writeFileSync(path.join(root, 'tsconfig.json'), '{ deliberately invalid config')
  const worker = createTypesCacheWorker()
  try {
    await expect(worker.warmup({ root, exposes: [], pluginVersion: 'test' })).resolves.toBeUndefined()
    expect(fs.existsSync(typesCachePath(root))).toBe(false)
  } finally { worker.dispose(); fs.rmSync(root, { recursive: true, force: true }) }
})

it('消息序列化失败不留下悬挂请求，后续请求仍可执行；关闭中任务按正常拒绝收尾', async () => {
  const worker = createTypesCacheWorker()
  const input = { root: '/__fulgurjs_missing_cache_fixture__', exposes: [], pluginVersion: 'test' }
  try {
    await expect(worker.read({ ...input, dts: () => {} })).rejects.toThrow()
    await expect(worker.capture(input)).resolves.toBeNull()
    const pending = worker.capture(input)
    const rejection = expect(pending).rejects.toThrow('类型缓存服务已关闭')
    worker.dispose()
    await rejection
    await expect(worker.read(input)).rejects.toThrow('类型缓存服务已关闭')
  } finally { worker.dispose() }
})


it('外部输入监听忽略内容未变的迟到事件，真实修改和删除仍通知', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fg-cache-notification-'))
  const file = path.join(root, 'model.ts')
  fs.writeFileSync(file, 'export interface Model { id: string }')
  const callbacks: Array<(event: string, filename: string | null) => void> = []
  const watch = vi.spyOn(fs, 'watch').mockImplementation(((_directory: string, _options: unknown, callback: (event: string, filename: string | null) => void) => {
    callbacks.push(callback)
    return { close() {} } as fs.FSWatcher
  }) as typeof fs.watch)
  const changed = vi.fn(), worker = createTypesCacheWorker()
  try {
    worker.watch({ token: 'test', externalInputs: [file] }, changed)
    callbacks[0]!('change', 'model.ts')
    fs.writeFileSync(file, 'export interface Model { id: string }')
    callbacks[0]!('change', null)
    expect(changed).not.toHaveBeenCalled()
    fs.writeFileSync(file, 'export interface Model { id: number }')
    callbacks[0]!('change', 'model.ts')
    expect(changed).toHaveBeenCalledTimes(1)
    callbacks[0]!('change', 'model.ts')
    expect(changed).toHaveBeenCalledTimes(1)
    fs.unlinkSync(file)
    callbacks[0]!('rename', 'model.ts')
    expect(changed).toHaveBeenCalledTimes(2)
  } finally { worker.dispose(); watch.mockRestore(); fs.rmSync(root, { recursive: true, force: true }) }
})

it.each([false, true])('外部符号链接换到同内容的新目标也触发重检，以便重新建立后续监听（大文件=%s）', large => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fg-cache-link-'))
  const first = path.join(root, 'first.ts'), second = path.join(root, 'second.ts'), link = path.join(root, 'model.ts')
  fs.writeFileSync(first, 'export interface Model { id: string }' + (large ? ' '.repeat(512 * 1024) : ''))
  // 同 inode 的两个路径也可能拥有不同的相对导入语义，不能仅比较 stat。
  fs.linkSync(first, second)
  fs.symlinkSync(first, link)
  let notify!: (event: string, filename: string | null) => void
  const watch = vi.spyOn(fs, 'watch').mockImplementation(((_directory: string, _options: unknown, callback: typeof notify) => {
    notify = callback
    return { close() {} } as fs.FSWatcher
  }) as typeof fs.watch)
  const changed = vi.fn(), worker = createTypesCacheWorker()
  try {
    worker.watch({ token: 'test', externalInputs: [link] }, changed)
    fs.unlinkSync(link)
    fs.symlinkSync(second, link)
    notify('rename', 'model.ts')
    expect(changed).toHaveBeenCalledTimes(1)
  } finally { worker.dispose(); watch.mockRestore(); fs.rmSync(root, { recursive: true, force: true }) }
})

it('真实合同的未入Program声明仍保留父进程读取证明，同内容生成通知不打断缓存提交', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fg-cache-parent-proof-'))
  const incrementalDir = path.join(root, 'node_modules/.fulgurjs-types-cache-test')
  fs.mkdirSync(path.join(root, 'src/types'), { recursive: true })
  fs.mkdirSync(path.join(root, 'node_modules'), { recursive: true })
  fs.symlinkSync(path.resolve(__dirname, '../node_modules/typescript'), path.join(root, 'node_modules/typescript'), 'dir')
  fs.writeFileSync(path.join(root, 'package.json'), '{"private":true}')
  fs.writeFileSync(path.join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { types: [], lib: ['ES2022'], moduleResolution: 'bundler', module: 'ESNext', skipLibCheck: true }, include: ['src'] }))
  fs.writeFileSync(path.join(root, 'src/entry.ts'), 'export const value: number = 1')
  const ambient = path.join(root, 'src/types/auto-imports.d.ts')
  const text = 'export {}; declare global { interface NotReferencedByContract { value: string } }'
  fs.writeFileSync(ambient, text)
  const input = { root, exposes: [{ name: './entry', import: './src/entry.ts' }], pluginVersion: 'test', dts: true }
  const { generateTypesBundle } = await import('../src/dts-generate')
  const result = await generateTypesBundle({ ...input, contractOnly: true, cacheCompilerReads: true, incrementalDir })
  expect(result.ok, result.ok ? '' : result.diagnostics.join('\n')).toBe(true)
  if (!result.ok || !result.cacheTraceFile) throw Error('真实编译输入记录缺失')
  const trace = JSON.parse(fs.readFileSync(result.cacheTraceFile, 'utf8'))
  const [ambientKey, stamp] = Object.entries(trace.snapshot.files).find(([name]) => name.endsWith('/src/types/auto-imports.d.ts'))! as [string, { hash: string; readHash?: string }]
  expect(stamp?.readHash).toBe(stamp?.hash)
  // 未进入Program的全局声明由父进程读取，同样必须记录链接身份；否则校验窗口
  // 内相同内容的自动重写会被当成源变更，实际Vite每次暖启动仍重新编译。
  expect(trace.snapshot.links[ambientKey]).toBe(fs.realpathSync.native(ambient))
  const snapshot = captureCompilerInputs(input, result.cacheTraceFile)!
  const readdir = fs.readdirSync
  let rewritten = false
  const spy = vi.spyOn(fs, 'readdirSync').mockImplementation(((directory: fs.PathLike, options: unknown) => {
    if (String(directory) === path.dirname(ambient) && !rewritten) {
      rewritten = true
      fs.writeFileSync(ambient, text)
    }
    return readdir(directory, options as never)
  }) as typeof fs.readdirSync)
  try {
    expect(validateTypesInputs(snapshot, root, true)).toBeNull()
    expect(rewritten).toBe(true)
  } finally { spy.mockRestore() }
  const worker = createTypesCacheWorker()
  try {
    const handle = await worker.capture(input, result.cacheTraceFile)
    expect(handle).not.toBeNull()
    fs.writeFileSync(ambient, text)
    fs.mkdirSync(path.join(root, 'public-output'))
    await new Promise(resolve => setTimeout(resolve, 100))
    await expect(worker.validate(input, handle!, true)).resolves.toBeNull()
    await expect(worker.commit(input, handle!, result)).resolves.toEqual({ reason: null })
    const cached = fs.readFileSync(typesCachePath(root))
    fs.writeFileSync(path.join(root, 'src/entry.ts'), 'export const value: string = "changed"')
    const rejected = await worker.commit(input, handle!, result)
    expect(rejected.reason).not.toBeNull()
    expect(fs.readFileSync(typesCachePath(root)).equals(cached)).toBe(true)
  } finally { worker.dispose(); fs.rmSync(root, { recursive: true, force: true }) }
}, 30000)
