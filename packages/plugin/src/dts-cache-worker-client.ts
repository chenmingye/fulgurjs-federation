/** Node后台缓存客户端；异常只让缓存失效，不阻止正常类型生成。 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { Worker } from 'node:worker_threads'
import type { TypesCacheInput } from './dts-cache'
import type { DtsGenerateOk } from './dts-generate'

export interface TypesCacheHandle { token: string; externalInputs: string[] }
interface CacheHit extends TypesCacheHandle { result: DtsGenerateOk }
export interface TypesCacheWorker {
  read(input: TypesCacheInput): Promise<CacheHit | null>
  capture(input: TypesCacheInput, traceFile?: string): Promise<TypesCacheHandle | null>
  validate(input: TypesCacheInput, handle: TypesCacheHandle, stable: boolean): Promise<string | null>
  write(input: TypesCacheInput, handle: TypesCacheHandle, result: DtsGenerateOk): Promise<boolean>
  release(input: TypesCacheInput, handle: TypesCacheHandle): Promise<void>
  watch(handle: TypesCacheHandle, changed: () => void): void
  dispose(): void
}
export function createTypesCacheWorker(): TypesCacheWorker {
  let worker: Worker | null = null
  let disposed = false
  const pending = new Map<string, { resolve(value: unknown): void; reject(error: Error): void }>()
  const temporary = new Set<string>()
  let watches: fs.FSWatcher[] = []
  const fail = (error: Error): void => { for (const request of pending.values()) request.reject(error); pending.clear() }
  const ensure = (): Worker => {
    if (disposed) throw new Error('类型缓存服务已关闭')
    if (worker) return worker
    const self = typeof __filename === 'string' ? __filename : fileURLToPath(import.meta.url)
    const directory = path.dirname(self)
    const file = [path.join(directory, 'dts-cache-worker.cjs'), path.join(directory, '../dist/dts-cache-worker.cjs')].find(file => fs.existsSync(file))
    if (!file) throw new Error('类型缓存后台程序缺失，请重新构建或安装插件')
    const running = new Worker(file)
    worker = running
    running.on('message', (response: { id: string; ok: boolean; value?: unknown; error?: string }) => {
      const request = pending.get(response.id)
      if (!request) return
      pending.delete(response.id)
      if (pending.size === 0) running.unref()
      if (response.ok) request.resolve(response.value)
      else request.reject(new Error(response.error ?? '类型缓存后台任务失败'))
    })
    running.on('error', error => fail(error))
    running.on('exit', code => { if (worker === running) worker = null; if (!disposed) fail(new Error(`类型缓存后台程序退出（${code}）`)) })
    running.unref()
    return running
  }
  const call = (operation: string, input: TypesCacheInput, payload: Record<string, unknown> = {}): Promise<unknown> => new Promise((resolve, reject) => {
    const id = crypto.randomUUID()
    try {
      const running = ensure()
      pending.set(id, { resolve, reject })
      running.ref()
      running.postMessage({ id, operation, input: { ...input, execution: { env: Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(NODE_ENV|NODE_OPTIONS|TS_NODE_|VUE_|VOLAR_)/.test(key))), execArgv: process.execArgv } }, ...payload })
    } catch (error) { pending.delete(id); if (pending.size === 0) worker?.unref(); reject(error as Error) }
  })
  return {
    read: input => call('read', input) as Promise<CacheHit | null>,
    capture: (input, traceFile) => call('capture', input, { traceFile }) as Promise<TypesCacheHandle | null>,
    validate: (input, handle, stable) => call('validate', input, { token: handle.token, stable }) as Promise<string | null>,
    async write(input, handle, result) {
      const temporaryId = crypto.randomUUID()
      // 与writeTypesCache相同的确定路径，只清理本客户端的未完成文件。
      const digest = crypto.createHash('sha256').update(path.resolve(input.root)).digest('hex').slice(0, 12)
      const file = path.join(input.root, 'node_modules/.cache/fulgurjs/types', `provider-${digest}.json.gz.${process.pid}.${temporaryId}.tmp`)
      temporary.add(file)
      try { return await call('write', input, { token: handle.token, result, temporaryId }) as boolean }
      finally { if (!disposed) { temporary.delete(file); try { fs.rmSync(file, { force: true }) } catch { /* 缓存故障不影响类型服务 */ } } }
    },
    async release(input, handle) { if (!disposed) await call('release', input, { token: handle.token }) },
    watch(handle, changed) {
      const groups = new Map<string, Set<string>>()
      for (const file of handle.externalInputs) {
        let directory = path.dirname(file)
        for (;;) {
          try { if (fs.statSync(directory).isDirectory()) break } catch { /* 监听最近存在的父目录，捕捉新解析候选 */ }
          const parent = path.dirname(directory)
          if (parent === directory) break
          directory = parent
        }
        const name = path.relative(directory, file).split(path.sep)[0]!
        const names = groups.get(directory) ?? new Set<string>()
        names.add(name)
        groups.set(directory, names)
      }
      const next: fs.FSWatcher[] = []
      try {
        for (const [directory, names] of groups) next.push(fs.watch(directory, { persistent: false }, (_event, filename) => {
          if (!filename || names.has(filename.toString().split(path.sep)[0]!)) changed()
        }))
      } catch (error) { for (const watcher of next) watcher.close(); throw error }
      for (const watcher of watches) watcher.close()
      watches = next
    },
    dispose() {
      if (disposed) return
      disposed = true
      for (const watcher of watches) watcher.close()
      watches = []
      fail(new Error('类型缓存服务已关闭'))
      const running = worker
      worker = null
      if (running) void running.terminate().finally(() => { for (const file of temporary) { try { fs.rmSync(file, { force: true }) } catch { /* 只清理本任务临时文件 */ } } temporary.clear() })
    },
  }
}
