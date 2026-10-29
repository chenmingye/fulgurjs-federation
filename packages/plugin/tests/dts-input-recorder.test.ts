import { afterEach, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { genTypesInputRecorder } from '../src/dts-input-recorder'
import { validateTypesInputs, type TypesInputSnapshot } from '../src/dts-cache'

const roots: string[] = []
afterEach(() => {
  vi.restoreAllMocks()
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
})

function recorder(cacheCompilerReads = false) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fg-input-recorder-'))
  roots.push(root)
  const fileExists = vi.fn((file: string) => fs.existsSync(file) && fs.statSync(file).isFile())
  const directoryExists = vi.fn((file: string) => fs.existsSync(file) && fs.statSync(file).isDirectory())
  const ts = { sys: { useCaseSensitiveFileNames: true, fileExists, directoryExists, readFile: (file:string)=>{try{return fs.readFileSync(file,'utf8')}catch{return undefined}} } }
  const req = createRequire(import.meta.url)
  const inspect = new Function('require', 'ts', 'fs', 'path', 'generationInput', 'req',
    genTypesInputRecorder() + '\nreturn {snapshot, changed:()=>inputChanged};')(
    req, ts, fs, path, { traceFile: path.join(root, 'inputs.json'), started: Date.now(), ambientInputs: [], cacheCompilerReads }, req,
  ) as { snapshot: TypesInputSnapshot; changed(): boolean }
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

it('当轮读取视图复用解析查询，但发布前校验仍拒绝新出现的候选文件', () => {
  const { root, sys, fileExists, inspect } = recorder(true)
  fs.mkdirSync(path.join(root, 'node_modules'))
  fs.symlinkSync(path.resolve(__dirname, '../node_modules/typescript'), path.join(root, 'node_modules/typescript'), 'dir')
  const file = path.join(root, 'model.ts')
  for (let i = 0; i < 1000; i++) expect(sys.fileExists(file)).toBe(false)
  expect(fileExists).toHaveBeenCalledTimes(1)
  expect(validateTypesInputs(inspect.snapshot, root, true)).toBeNull()
  fs.writeFileSync(file, 'export const value = 1')
  expect(sys.fileExists(file)).toBe(false)
  expect(validateTypesInputs(inspect.snapshot, root, true)).toContain('依赖解析候选变化')
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

it('编译器实际读取过的声明允许相同文本重写，工具及未证明输入仍保留stat门禁',()=>{
  const {root,sys,inspect}=recorder();fs.mkdirSync(path.join(root,'node_modules'));fs.symlinkSync(path.resolve(__dirname,'../node_modules/typescript'),path.join(root,'node_modules/typescript'),'dir')
  const file=path.join(root,'auto-imports.d.ts'),text='declare const GeneratedValue:string';fs.writeFileSync(file,text);expect(sys.readFile(file)).toBe(text);const before=fs.statSync(file);fs.writeFileSync(file,text);fs.utimesSync(file,before.atime,new Date(before.mtimeMs+2000))
  expect(inspect.snapshot.files[file].readHash).toBe(inspect.snapshot.files[file].hash);expect(validateTypesInputs(inspect.snapshot,root,true)).toBeNull()
  inspect.snapshot.runtimeTools.push(file);expect(validateTypesInputs(inspect.snapshot,root,true)).toContain('输入文件变化')
})

it('声明在同轮被读到不同内容，即使最后恢复也拒绝；最终文本变化同样拒绝',()=>{
  const {root,sys,inspect}=recorder();fs.mkdirSync(path.join(root,'node_modules'));fs.symlinkSync(path.resolve(__dirname,'../node_modules/typescript'),path.join(root,'node_modules/typescript'),'dir')
  const file=path.join(root,'auto-imports.d.ts'),a='declare const GeneratedValue:string',b='declare const GeneratedValue:number';fs.writeFileSync(file,a);sys.readFile(file);fs.writeFileSync(file,b);sys.readFile(file);fs.writeFileSync(file,a);expect(inspect.changed()).toBe(true)
  expect(validateTypesInputs(inspect.snapshot,root,true)).not.toBeNull()
})
