/** 外部输入事件只能检查该监听目录/文件，避免macOS补发事件把整份依赖表反复全读。 */
import { expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createTypesCacheWorker } from '../src/dts-cache-worker-client'

it('一个目录事件不重新读取其他监听目录的文件，且真实改动/缺失候选仍通知', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fg-watch-scope-'))
  const a = path.join(root, 'a'), b = path.join(root, 'b')
  fs.mkdirSync(a); fs.mkdirSync(b)
  const first = path.join(a, 'first.d.ts'), sibling = path.join(a, 'sibling.d.ts'), unrelated = path.join(b, 'other.d.ts')
  const missing = path.join(a, 'future.d.ts')
  for (const file of [first, sibling, unrelated]) fs.writeFileSync(file, 'export {}')
  const callbacks = new Map<string, (event: string, name: string | null) => void>()
  const fakeWatch = vi.spyOn(fs, 'watch').mockImplementation(((directory: string, _options: unknown, callback: (event: string, name: string | null) => void) => {
    callbacks.set(directory, callback)
    return { close() {} } as fs.FSWatcher
  }) as typeof fs.watch)
  const client = createTypesCacheWorker(), changed = vi.fn()
  let reads: ReturnType<typeof vi.spyOn> | undefined
  try {
    client.watch({ token: 'observed', externalInputs: [first, sibling, unrelated, missing] }, changed)
    reads = vi.spyOn(fs, 'readFileSync')
    fs.writeFileSync(first, 'export declare const changed: true')
    callbacks.get(a)!('change', 'first.d.ts')
    expect(changed).toHaveBeenCalledTimes(1)
    expect(reads.mock.calls.some(([file]) => String(file) === first)).toBe(true)
    expect(reads.mock.calls.some(([file]) => String(file) === unrelated || String(file) === sibling)).toBe(false)
    reads.mockClear()
    callbacks.get(a)!('change', null)
    expect(reads.mock.calls.some(([file]) => String(file) === unrelated)).toBe(false)
    expect(changed).toHaveBeenCalledTimes(1)
    fs.writeFileSync(missing, 'export {}')
    callbacks.get(a)!('rename', 'future.d.ts')
    expect(changed).toHaveBeenCalledTimes(2)
  } finally {
    client.dispose(); reads?.mockRestore(); fakeWatch.mockRestore()
    fs.rmSync(root, { recursive: true, force: true })
  }
})
