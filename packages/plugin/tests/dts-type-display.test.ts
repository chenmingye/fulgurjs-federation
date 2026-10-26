import { describe, expect, it } from 'vitest'
import ts from 'typescript'
import path from 'node:path'
import { displayPublicDataTypes } from '../src/dts-type-display'

function project(files: Map<string, string>, input: string) {
  const root = path.resolve(__dirname, '..')
  const base = path.join(root, '.fulgurjs-types-display')
  const consumer = path.join(base, 'consumer.ts')
  const virtual = new Map([...files].map(([rel, text]) => [path.join(base, rel), text]))
  virtual.set(consumer, input)
  const options: ts.CompilerOptions = { strict: true, exactOptionalPropertyTypes: true, noEmit: true, skipLibCheck: false, types: [], target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler }
  const dirs = new Set<string>()
  for (const file of virtual.keys()) for (let d = path.dirname(file); d.startsWith(base); d = path.dirname(d)) dirs.add(d)
  const read = (file: string) => virtual.get(file) ?? ts.sys.readFile(file)
  const host: ts.LanguageServiceHost = {
    getCompilationSettings: () => options, getCurrentDirectory: () => root,
    getScriptFileNames: () => [...virtual.keys()], getScriptVersion: () => '1',
    getScriptSnapshot: file => { const text = read(file); return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text) },
    getDefaultLibFileName: ts.getDefaultLibFilePath, readFile: read,
    fileExists: file => virtual.has(file) || ts.sys.fileExists(file),
    directoryExists: dir => dirs.has(dir) || ts.sys.directoryExists(dir), getDirectories: ts.sys.getDirectories,
  }
  const service = ts.createLanguageService(host)
  return { consumer, service, quickInfo(marker: string) {
    const info = service.getQuickInfoAtPosition(consumer, input.indexOf(marker) + 2)!
    return { text: ts.displayPartsToString(info.displayParts), docs: ts.displayPartsToString(info.documentation) }
  }, errors() { return [...service.getSyntacticDiagnostics(consumer), ...service.getSemanticDiagnostics(consumer)] } }
}

describe('公开业务类型字段视图', () => {
  it('原生具名导入、普通状态与Ref都显示继承字段，保留说明和双向合同', () => {
    const files = new Map([
      ['files/contracts.d.ts', `export interface Base {
/** 单据标识 */
readonly id: string;
disabled?: boolean;
}
/** 审批参数说明 */ export interface Original extends Base { name: string; mode?: 'read' | 'write' }`],
      ['files/entry.d.ts', `import type { Original } from './contracts';
export type { Original as Params } from './contracts';
export declare const component: (props: { params: Original }) => string;`],
    ])
    displayPublicDataTypes(ts, files, ['files/entry.d.ts'], path.resolve(__dirname, '..'))
    const input = `import { ref } from 'vue';
import { component, type Params } from './files/entry';
import type { Original } from './files/contracts';
const state = ref<Params>();
const plain: Params = { id: '1', name: 'x', disabled: false };
const original: Original = plain;
const reverse: Params = original;
type Equal<A,B> = (<T>()=>T extends A?1:2) extends (<T>()=>T extends B?1:2) ? true : false;
const exact: Equal<Params,Original> = true;
component({ params: plain });
// @ts-expect-error readonly 必须保留
plain.id = '2';
// @ts-expect-error exactOptionalPropertyTypes仍不能显式传undefined
const undefinedField: Params = { id: '1', name: 'x', disabled: undefined };
// @ts-expect-error 缺少必填
const missing: Params = { id: '1' };
// @ts-expect-error 联合值不能放宽
const invalid: Params = { id: '1', name: 'x', mode: 'bad' };
plain.id;
plain.disabled;
`
    const p = project(files, input)
    try {
      expect(p.errors().map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n'))).toEqual([])
      for (const marker of ['state =', 'plain:']) {
        const info = p.quickInfo(marker).text
        expect(info).toContain('readonly id: string')
        expect(info).toContain('name: string')
        expect(info).toContain('disabled?: boolean')
      }
      expect(p.quickInfo('Params }').text).toContain('readonly id: string')
      expect(p.quickInfo('Params }').docs).toContain('审批参数说明')
      const info = p.service.getQuickInfoAtPosition(p.consumer, input.lastIndexOf('plain.id') + 7)!
      expect(ts.displayPartsToString(info.documentation)).toContain('单据标识')
    } finally { p.service.dispose() }
  })

  it('本地导出、重命名、星号转发、重复expose和标识符冲突均保持有效', () => {
    const files = new Map([
      ['files/local.d.ts', `type __FgDataView = string;
/** 本地合同 */ export interface Local { value: string }
interface Internal { readonly count?: number }
export type { Internal as Renamed };
interface Shadow { wrong: string }
export default interface DefaultData { ok: boolean }
export type { DefaultData };
export * from './barrel';`],
      ['files/barrel.d.ts', `export interface Forwarded { id: number }
export interface Shadow { right: number }`],
    ])
    displayPublicDataTypes(ts, files, ['files/local.d.ts', 'files/local.d.ts'], path.resolve(__dirname, '..'))
    expect(files.get('files/local.d.ts')).toContain('type __FgDataView2<T>')
    const p = project(files, `import type {Local, Renamed, Forwarded, Shadow, DefaultData} from './files/local';
const a: Local = {value: '1'};
const b: Renamed = {};
const c: Forwarded = {id: 1};
const shadow: Shadow = {right: 1};
const defaultData: DefaultData = {ok: true};
// @ts-expect-error 星号导出不能误用本地同名私有类型
const wrongShadow: Shadow = {wrong: '1'};
// @ts-expect-error readonly 可选成员仍只读
b.count=1;
`)
    try { expect(p.errors()).toEqual([]) } finally { p.service.dispose() }
  })

  it('泛型、联合、元组、数组、可调用/可构造、类品牌、方法与this原样保留', () => {
    const input = `export interface Generic<T> { value: T }
export type Union = { kind: 'a'; a: string } | { kind: 'b'; b: number };
export type Tuple = readonly [string, number];
export type ArrayType = readonly string[];
export interface Callable { (id: string): string; label: string }
export interface Constructor { new (id: string): {id:string}; label: string }
export declare class Branded { private secret; id: string }
export interface InheritsBrand extends Branded { extra: boolean }
export interface Fluent { next: this; label: string }
export type ReadonlyFluent = Readonly<Fluent>;
declare const brand: unique symbol;
export interface Nominal { [brand]: true; id: string }
export interface WithMethod { run(id: string): void; label: string }
export interface WithGetter { get id(): string }
export interface UnknownBase extends MissingEnvironment { id: string }
export interface Merged { id: string }
export interface Merged { (n: number): number }
`
    const files = new Map([['files/entry.d.ts', input]])
    displayPublicDataTypes(ts, files, ['files/entry.d.ts'], path.resolve(__dirname, '..'))
    expect(files.get('files/entry.d.ts')).toBe(input)
  })
})
