/** dev缓存后台任务：大输入快照留在线程中，不经过主线程反复复制。 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { parentPort } from 'node:worker_threads'
import { captureCompilerInputs, captureTypesInputs, readTypesCache, validateTypesInputs, writeTypesCache, type TypesCacheInput, type TypesInputSnapshot } from './dts-cache'
import type { DtsGenerateOk } from './dts-generate'

interface Entry { snapshot: TypesInputSnapshot; dirty: boolean; watchers: fs.FSWatcher[] }
const entries = new Map<string, Entry>()
function observe(input: TypesCacheInput): Entry {
  const entry: Entry = { snapshot: undefined as unknown as TypesInputSnapshot, dirty: false, watchers: [] }
  for (const directory of [input.root, path.join(input.root, 'node_modules')]) {
    try {
      entry.watchers.push(fs.watch(directory, { persistent: false }, (_event, filename) => {
        if (!filename) { entry.dirty = true; return }
        const name = filename.toString()
        const base = path.basename(name)
        if (base.startsWith('.fulgurjs-types-') || ['.cache', '.vite', '.vite-temp', '.git', '.svn', 'node_modules'].includes(base)
          || /\.timestamp-\d+.*\.[cm]?js$/.test(base) || /\.(?:log|md|png|jpe?g|svg|tmp)$/.test(base)) return
        entry.dirty = true
      }))
    } catch { /* 文件/目录本身仍由完整快照验证；监听缺失时不猜测成功 */ }
  }
  return entry
}
function close(entry: Entry): void { for (const watcher of entry.watchers) watcher.close() }
function externalInputs(input: TypesCacheInput, snapshot: TypesInputSnapshot): string[] {
  const outside = (file: string): boolean => {
    const relative = path.relative(input.root, file)
    return (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))
      && !file.split(path.sep).includes('node_modules')
  }
  const files = new Set(Object.keys(snapshot.files).filter(outside))
  for (const [directory, queries] of Object.entries(snapshot.fileQueries)) {
    if (!outside(directory)) continue
    for (const name of Object.keys(queries)) if (/\.(?:[cm]?[jt]sx?|vue|json|ya?ml|lock)$/.test(name)) files.add(path.join(directory, name))
  }
  return [...files]
}
parentPort?.on('message', (message: { id: string; operation: string; input: TypesCacheInput; token?: string; stable?: boolean; result?: DtsGenerateOk; temporaryId?: string; traceFile?: string }) => {
  const { id, operation, input } = message
  try {
    let value: unknown
    if (operation === 'warmup') {
      // 仅载入提供方的配置解析工具，不扫描项目、不创建快照、不运行编译。
      createRequire(path.join(input.root, 'package.json'))('typescript')
    } else if (operation === 'read' || operation === 'capture') {
      const observed = observe(input)
      const cached = operation === 'read' ? readTypesCache(input, false) : null
      const snapshot = cached?.snapshot ?? (operation === 'capture' ? (message.traceFile ? captureCompilerInputs(input, message.traceFile) : captureTypesInputs(input)) : null)
      if (!snapshot) { close(observed); value = null }
      else {
        observed.snapshot = snapshot
        entries.set(id, observed)
        value = { token: id, externalInputs: externalInputs(input, snapshot), ...(cached ? { result: cached.result } : {}) }
      }
    } else {
      const entry = entries.get(message.token!)
      if (!entry) throw new Error('类型缓存后台快照已释放')
      if (operation === 'validate') value = entry.dirty ? '输入事件已变化' : validateTypesInputs(entry.snapshot, input.root, message.stable)
      else if (operation === 'write') {
        if (entry.dirty) value = false
        else { writeTypesCache(input, entry.snapshot, message.result!, message.temporaryId); value = true }
      } else if (operation === 'release') { close(entry); entries.delete(message.token!); value = true }
      else throw new Error('未知的类型缓存后台操作')
    }
    parentPort?.postMessage({ id, ok: true, value })
  } catch (error) { parentPort?.postMessage({ id, ok: false, error: (error as Error).message }) }
})
