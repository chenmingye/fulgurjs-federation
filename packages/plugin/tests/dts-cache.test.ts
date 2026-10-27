import { afterEach, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { gzipSync, gunzipSync } from 'node:zlib'
import { captureTypesInputs, readTypesCache, typesCachePath, validateTypesInputs, writeTypesCache, type TypesCacheInput } from '../src/dts-cache'
import type { DtsGenerateOk } from '../src/dts-generate'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }) })
function project() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fg-persistent-types-'))
  roots.push(root)
  fs.mkdirSync(path.join(root, 'src'))
  fs.mkdirSync(path.join(root, 'node_modules'))
  fs.symlinkSync(path.resolve(__dirname, '../node_modules/typescript'), path.join(root, 'node_modules/typescript'), 'dir')
  fs.writeFileSync(path.join(root, 'package.json'), '{"name":"cache-fixture","private":true}')
  fs.writeFileSync(path.join(root, 'base.json'), JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'bundler', types: [] } }))
  fs.writeFileSync(path.join(root, 'tsconfig.json'), JSON.stringify({ extends: './base.json', include: ['src'] }))
  fs.writeFileSync(path.join(root, 'src/entry.ts'), "export {value} from './dependency'")
  fs.writeFileSync(path.join(root, 'src/dependency.ts'), 'export const value = 1')
  const input: TypesCacheInput = { root, exposes: [{ name: './entry', import: './src/entry.ts' }], pluginVersion: 'test', dts: true }
  const text = 'export declare const value: 1;\n'
  const index = { schemaVersion: 1, generator: '@fulgurjs/federation', pluginVersion: 'test', revision: 'a123456789abcdef',
    exposes: { './entry': { declaration: 'files/entry.d.ts' } }, externals: [],
    files: { 'files/entry.d.ts': crypto.createHash('sha256').update(text).digest('hex') } }
  const { revision: _revision, ...body } = index
  index.revision = crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 16)
  const result: DtsGenerateOk = { ok: true, index, files: new Map([['files/entry.d.ts', text], ['index.json', JSON.stringify(index)]]), tool: 'typescript', fileCount: 1, notices: [] }
  return { root, input, result }
}

it('成功快照跨服务保留，校验后恢复同一声明与代次；压缩缓存只占一个文件', () => {
  const { root, input, result } = project()
  const snapshot = captureTypesInputs(input)!
  expect(snapshot).not.toBeNull()
  expect(validateTypesInputs(snapshot, root)).toBeNull()
  writeTypesCache(input, snapshot, result)
  expect(fs.existsSync(typesCachePath(root))).toBe(true)
  expect(readTypesCache(input)?.result.index.revision).toBe(result.index.revision)
  expect(readTypesCache(input)?.result.files.get('files/entry.d.ts')).toBe(result.files.get('files/entry.d.ts'))
  expect(fs.readdirSync(path.dirname(typesCachePath(root)))).toHaveLength(1)
  expect(JSON.parse(gunzipSync(fs.readFileSync(typesCachePath(root))).toString()).payload.format).toBe(1)
}, 15000)

it('同长度源码修改、继承配置、锁文件与新增include成员都失效，mtime不能掩盖内容', () => {
  const { root, input, result } = project()
  const snapshot = captureTypesInputs(input)!
  writeTypesCache(input, snapshot, result)
  const source = path.join(root, 'src/dependency.ts')
  const old = fs.statSync(source)
  fs.writeFileSync(source, 'export const value = 2')
  fs.utimesSync(source, old.atime, old.mtime)
  expect(readTypesCache(input)).toBeNull()
  fs.writeFileSync(source, 'export const value = 1')
  expect(readTypesCache(input)).not.toBeNull()
  fs.writeFileSync(path.join(root, 'base.json'), '{"compilerOptions":{"strict":true}}')
  expect(readTypesCache(input)).toBeNull()
  fs.writeFileSync(path.join(root, 'base.json'), JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'bundler', types: [] } }))
  fs.writeFileSync(path.join(root, 'pnpm-lock.yaml'), 'lockfileVersion: 9')
  expect(readTypesCache(input)).toBeNull()
  fs.unlinkSync(path.join(root, 'pnpm-lock.yaml'))
  fs.writeFileSync(path.join(root, 'src/new-global.d.ts'), 'interface AddedGlobal { id: string }')
  expect(readTypesCache(input)).toBeNull()
}, 15000)

it('暴露合同/插件版本变化和损坏缓存不能复用；缓存删除后正常退回冷路径', () => {
  const { root, input, result } = project()
  const snapshot = captureTypesInputs(input)!
  writeTypesCache(input, snapshot, result)
  expect(readTypesCache({ ...input, pluginVersion: 'new' })).toBeNull()
  expect(readTypesCache({ ...input, exposes: [{ name: './other', import: './src/entry.ts' }] })).toBeNull()
  const envelope = JSON.parse(gunzipSync(fs.readFileSync(typesCachePath(root))).toString())
  envelope.payload.files['files/entry.d.ts'] = 'export declare const wrong: any;'
  envelope.digest = crypto.createHash('sha256').update(JSON.stringify(envelope.payload)).digest('hex')
  fs.writeFileSync(typesCachePath(root), gzipSync(JSON.stringify(envelope)))
  expect(readTypesCache(input)).toBeNull()
  fs.writeFileSync(typesCachePath(root), 'broken')
  expect(readTypesCache(input)).toBeNull()
  writeTypesCache(input, snapshot, result)
  fs.unlinkSync(typesCachePath(root))
  expect(readTypesCache(input)).toBeNull()
}, 15000)

it('include外的相对依赖、链接目标与新出现的优先解析候选均受保护', () => {
  const { root, input, result } = project()
  fs.mkdirSync(path.join(root, 'external'))
  fs.writeFileSync(path.join(root, 'external/source-a.ts'), 'export const value = 1')
  fs.writeFileSync(path.join(root, 'external/source-b.ts'), 'export const value = 1')
  fs.symlinkSync('source-a.ts', path.join(root, 'external/linked.ts'))
  fs.writeFileSync(path.join(root, 'src/entry.ts'), "export { value } from '../external/linked'")
  const snapshot = captureTypesInputs(input)!
  writeTypesCache(input, snapshot, result)
  expect(readTypesCache(input)).not.toBeNull()
  fs.unlinkSync(path.join(root, 'external/linked.ts'))
  fs.symlinkSync('source-b.ts', path.join(root, 'external/linked.ts'))
  expect(readTypesCache(input)).toBeNull()
  fs.unlinkSync(path.join(root, 'external/linked.ts'))
  fs.symlinkSync('source-a.ts', path.join(root, 'external/linked.ts'))
  fs.writeFileSync(path.join(root, 'external/source-a.ts'), 'export const value = 2')
  expect(readTypesCache(input)).toBeNull()
  fs.mkdirSync(path.join(root, 'external/data'))
  fs.writeFileSync(path.join(root, 'external/data/index.ts'), 'export const value = 1')
  fs.writeFileSync(path.join(root, 'src/entry.ts'), "export { value } from '../external/data'")
  const priority = captureTypesInputs(input)!
  writeTypesCache(input, priority, result)
  expect(readTypesCache(input)).not.toBeNull()
  fs.writeFileSync(path.join(root, 'external/data.ts'), 'export const value = 2')
  expect(readTypesCache(input)).toBeNull()
}, 15000)

it('编译中修改再撤回不能把中间输出持久化，内容相同但stat变化会要求重新检查', () => {
  const { root, input } = project()
  const snapshot = captureTypesInputs(input)!
  const file = path.join(root, 'src/dependency.ts')
  fs.writeFileSync(file, 'export const value = 2')
  fs.writeFileSync(file, 'export const value = 1')
  expect(validateTypesInputs(snapshot, root)).toBeNull()
  expect(validateTypesInputs(snapshot, root, true)).not.toBeNull()
}, 15000)

it('实际工具解析目标被替换即失效，校验阶段不执行替换的编译器', () => {
  const { root, input, result } = project()
  const snapshot = captureTypesInputs(input)!
  writeTypesCache(input, snapshot, result)
  const replacement = path.join(root, 'replacement')
  const marker = path.join(root, 'executed')
  fs.mkdirSync(replacement)
  fs.writeFileSync(path.join(replacement, 'package.json'), '{"name":"typescript","main":"index.js"}')
  fs.writeFileSync(path.join(replacement, 'index.js'), `require('node:fs').writeFileSync(${JSON.stringify(marker)},'unexpected'); module.exports={};`)
  fs.unlinkSync(path.join(root, 'node_modules/typescript'))
  fs.symlinkSync(replacement, path.join(root, 'node_modules/typescript'), 'dir')
  expect(readTypesCache(input)).toBeNull()
  expect(fs.existsSync(marker)).toBe(false)
}, 15000)

it.each([
  '/** @type {import("../external/model").Model} */\nexport let model;',
  '/** @import {Model} from "../external/model" */\n/** @type {Model} */\nexport let model;',
])('JS/JSDoc的外部类型依赖变化也使缓存失效：%s', source => {
  const { root, input, result } = project()
  fs.mkdirSync(path.join(root, 'external'))
  fs.writeFileSync(path.join(root, 'external/model.d.ts'), 'export interface Model { id: number }')
  fs.writeFileSync(path.join(root, 'src/entry.js'), source)
  fs.writeFileSync(path.join(root, 'tsconfig.json'), JSON.stringify({ extends: './base.json', compilerOptions: { allowJs: true }, include: ['src/entry.js'] }))
  const jsInput = { ...input, exposes: [{ name: './entry', import: './src/entry.js' }] }
  const snapshot = captureTypesInputs(jsInput)!
  expect(snapshot.files[path.join(root, 'external/model.d.ts')]).toBeDefined()
  writeTypesCache(jsInput, snapshot, result)
  expect(readTypesCache(jsInput)).not.toBeNull()
  fs.writeFileSync(path.join(root, 'external/model.d.ts'), 'export interface Model { id: string }')
  expect(readTypesCache(jsInput)).toBeNull()
}, 15000)

it('无法建模的自定义Vue编译插件保留正常编译路径，不复用持久缓存', () => {
  const { root, input } = project()
  fs.writeFileSync(path.join(root, 'base.json'), JSON.stringify({ compilerOptions: { types: [], module: 'ESNext', moduleResolution: 'bundler' }, vueCompilerOptions: { plugins: ['./custom-transform.js'] } }))
  expect(captureTypesInputs(input)).toBeNull()
}, 15000)


it('解析候选检查后才新增高优先级文件，最终目录复检仍拒绝旧结果', () => {
  const { root, input } = project()
  const directory = path.join(root, 'external')
  fs.mkdirSync(path.join(directory, 'data'), { recursive: true })
  fs.writeFileSync(path.join(directory, 'data/index.ts'), 'export const value = 1')
  fs.writeFileSync(path.join(root, 'src/entry.ts'), "export { value } from '../external/data'")
  const snapshot = captureTypesInputs(input)!
  const original = fs.realpathSync
  let injected = false
  const spy = vi.spyOn(fs, 'realpathSync').mockImplementation(((file: fs.PathLike, options?: unknown) => {
    if (!injected) {
      injected = true
      fs.writeFileSync(path.join(directory, 'data.ts'), 'export const value = 2')
    }
    return original(file, options as never)
  }) as typeof fs.realpathSync)
  try {
    expect(validateTypesInputs(snapshot, root)).toContain('校验期间解析候选变化')
    expect(injected).toBe(true)
  } finally { spy.mockRestore() }
}, 15000)


it('不把无关业务实现和工具测试依赖纳入输入，实际导入的测试命名文件仍必须跟踪', () => {
  const { root, input } = project()
  fs.writeFileSync(path.join(root, 'src/unrelated.ts'), 'export const unrelated = 1')
  const tool = path.join(root, 'node_modules/vue-tsc')
  fs.mkdirSync(tool, { recursive: true })
  fs.writeFileSync(path.join(tool, 'package.json'), '{"name":"vue-tsc","main":"index.js"}')
  fs.writeFileSync(path.join(tool, 'index.js'), "require('./test-runtime.js')")
  fs.writeFileSync(path.join(tool, 'test-runtime.js'), 'exports.enabled = true')
  fs.writeFileSync(path.join(tool, 'test-noisy.js'), "require('not-a-real-runtime-dependency')")
  const snapshot = captureTypesInputs(input)!
  expect(snapshot.files[path.join(root, 'src/unrelated.ts')]).toBeUndefined()
  expect(snapshot.files[path.join(tool, 'test-noisy.js')]).toBeUndefined()
  expect(snapshot.files[fs.realpathSync(path.join(tool, 'test-runtime.js'))]).toBeDefined()
  fs.writeFileSync(path.join(root, 'src/unrelated.ts'), 'export const unrelated = 2')
  expect(validateTypesInputs(snapshot, root)).toBeNull()
  fs.writeFileSync(path.join(tool, 'test-runtime.js'), 'exports.enabled = false')
  expect(validateTypesInputs(snapshot, root)).not.toBeNull()
}, 15000)


it('插件同步声明仅元数据首行变化不重新编译，业务文档和类型修改仍失效',()=>{
  const {root,input,result}=project()
  const source=path.join(root,'src/modules.d.ts')
  const header=(rev:string)=>`// 自动生成：fulgurjs-federation 远程类型（remote: demo，来源: http://test/${rev}，revision: ${rev}）。\n`
  const body='/** 业务说明 */\nexport interface Model { readonly id: string }\n'
  fs.writeFileSync(source,header('old')+body)
  fs.writeFileSync(path.join(root,'src/entry.ts'),`export type {Model} from './modules'`)
  const snapshot=captureTypesInputs(input)!
  writeTypesCache(input,snapshot,result)
  fs.writeFileSync(source,header('new-and-longer')+body)
  expect(readTypesCache(input)).not.toBeNull()
  fs.writeFileSync(source,header('new-and-longer')+body.replace('业务说明','更新业务说明'))
  expect(readTypesCache(input)).toBeNull()
  fs.writeFileSync(source,header('new')+body.replace('id: string','id: number'))
  expect(readTypesCache(input)).toBeNull()
},15000)
