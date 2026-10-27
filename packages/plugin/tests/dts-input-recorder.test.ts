import { afterEach, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { genTypesInputRecorder } from '../src/dts-input-recorder'

const roots: string[] = []
afterEach(() => {
  vi.restoreAllMocks()
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
})

function recorder() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fg-input-recorder-'))
  roots.push(root)
  const fileExists = vi.fn((file: string) => fs.existsSync(file) && fs.statSync(file).isFile())
  const directoryExists = vi.fn((file: string) => fs.existsSync(file) && fs.statSync(file).isDirectory())
  const ts = { sys: { useCaseSensitiveFileNames: true, fileExists, directoryExists } }
  const req = createRequire(import.meta.url)
  const inspect = new Function('require', 'ts', 'fs', 'path', 'generationInput', 'req',
    genTypesInputRecorder() + '\nreturn {snapshot, changed:()=>inputChanged};')(
    req, ts, fs, path, { traceFile: path.join(root, 'inputs.json'), started: Date.now(), ambientInputs: [] }, req,
  ) as { snapshot: { probes: Record<string, boolean>; fileQueries: Record<string, Record<string, boolean>> }; changed(): boolean }
  return { root, sys: ts.sys, fileExists, directoryExists, inspect }
}

it('重复缺失目录只记录一次存在父级，文件存在查询仍逐次执行', () => {
  const { root, sys, fileExists, inspect } = recorder()
  const parent = path.join(root, 'missing', 'nested')
  const file = path.join(parent, 'model.ts')
  const stat = vi.spyOn(fs, 'statSync')
  for (let i = 0; i < 1000; i++) expect(sys.fileExists(file)).toBe(false)
  expect(fileExists).toHaveBeenCalledTimes(1000)
  // 不再每次为缺失目录递归stat，实际解析查询及其快照并未省略。
  expect(stat.mock.calls.length).toBeLessThan(10)
  expect(inspect.snapshot.fileQueries[parent]['model.ts']).toBe(false)
  expect(inspect.changed()).toBe(false)
})

it('记录去重不隐藏同一轮中新建目录和优先解析文件', () => {
  const { root, sys, inspect, directoryExists } = recorder()
  const directory = path.join(root, 'new-model')
  const file = path.join(directory, 'index.ts')
  expect(sys.directoryExists(directory)).toBe(false)
  expect(sys.fileExists(file)).toBe(false)
  fs.mkdirSync(directory)
  fs.writeFileSync(file, 'export const value = 1')
  expect(sys.directoryExists(directory)).toBe(true)
  expect(sys.fileExists(file)).toBe(true)
  expect(directoryExists).toHaveBeenCalledTimes(2)
  expect(inspect.snapshot.probes['d:' + directory]).toBe(true)
  expect(inspect.snapshot.fileQueries[directory]['index.ts']).toBe(true)
  expect(inspect.changed()).toBe(true)
})
