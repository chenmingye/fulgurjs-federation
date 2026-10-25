import { describe, expect, it } from 'vitest'
import ts from 'typescript'
import path from 'node:path'
import { nameVueDeclaration } from '../src/dts-vue-display'

const source = `
interface Params { id: string; disabled?: boolean }
type __VLS_Props = { /** 审批参数 */ params: Params; onSave?: (id: string) => void };
declare const __VLS_export: import('vue').DefineComponent<__VLS_Props, { focus: (index: number) => string }>;
declare const _default: typeof __VLS_export;
export default _default;
`

function languageProject(declaration: string, customInput?: string) {
  const directory = path.resolve(__dirname, '..')
  const file = path.join(directory, '__display-component.d.ts')
  const consumer = path.join(directory, '__display-consumer.ts')
  const input = customInput ?? `
import Named from './__display-component'
import type { DefineComponent } from 'vue'
interface Params { id: string; disabled?: boolean }
type Original = DefineComponent<{ params: Params; onSave?: (id: string) => void }, { focus: (index: number) => string }>;
declare const original: Original
const named: typeof Named = original
const reverse: Original = Named
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
const exact: Equal<InstanceType<typeof Named>, InstanceType<Original>> = true
const props: InstanceType<typeof Named>['$props'] = { params: { id: 'x', disabled: false } }
// @ts-expect-error boolean 字段仍然严格
const wrong: InstanceType<typeof Named>['$props'] = { params: { id: 'x', disabled: 'false' } }
// @ts-expect-error 必填字段仍然严格
const missing: InstanceType<typeof Named>['$props'] = {}
// @ts-expect-error 事件参数仍然严格
const event: InstanceType<typeof Named>['$props'] = { params: { id: 'x' }, onSave: (id: number) => {} }
declare const instance: InstanceType<typeof Named>
const result: string = instance.focus(1)
// @ts-expect-error expose 参数仍然严格
instance.focus('x')
`
  const sources = new Map([[file, declaration], [consumer, input]])
  const options: ts.CompilerOptions = { strict: true, noEmit: true, skipLibCheck: false, types: [], target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler }
  const host: ts.LanguageServiceHost = {
    getScriptFileNames: () => [...sources.keys()], getScriptVersion: () => '0',
    getScriptSnapshot: f => { const text = sources.get(f) ?? ts.sys.readFile(f); return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text) },
    getCurrentDirectory: () => directory, getCompilationSettings: () => options,
    getDefaultLibFileName: ts.getDefaultLibFilePath, fileExists: f => sources.has(f) || ts.sys.fileExists(f),
    readFile: f => sources.get(f) ?? ts.sys.readFile(f), readDirectory: ts.sys.readDirectory,
    directoryExists: ts.sys.directoryExists, getDirectories: ts.sys.getDirectories,
  }
  const service = ts.createLanguageService(host)
  return { service, file, consumer, input }
}

describe('Vue 声明命名展示', () => {
  it('真实 Vue 签名不变，quickInfo 保留组件名且业务错误仍被拒绝', () => {
    const named = nameVueDeclaration(ts, source, './approval-form')
    expect(named).toContain('interface ApprovalForm extends')
    expect(named).toContain('Props: { params: Params; onSave?: (id: string) => void; }')
    const { service, file, consumer, input } = languageProject(named)
    try {
      const diagnostics = [...service.getSemanticDiagnostics(file), ...service.getSemanticDiagnostics(consumer)]
      expect(diagnostics.map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n'))).toEqual([])
      const info = service.getQuickInfoAtPosition(consumer, input.indexOf('named:') + 2)
      expect(ts.displayPartsToString(info?.displayParts)).toBe('const named: ApprovalForm')
    } finally { service.dispose() }
  })

  it('联合 props 的具体 SFC 仍生成有效声明', () => {
    const original = `type Props = { id: string } | { title: string }; declare const _default: import('vue').DefineComponent<Props>; export default _default;`
    const { service, file, consumer } = languageProject(nameVueDeclaration(ts, original, './UnionForm'), `
import Named from './__display-component';
import type { DefineComponent } from 'vue';
type Props = InstanceType<typeof Named>['$props'];
type Original = InstanceType<DefineComponent<{ id: string } | { title: string }>>;
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
const exact: Equal<InstanceType<typeof Named>, Original> = true;
declare const original: Original['$props'];
const value: Props = original;
`)
    try {
      expect([...service.getSemanticDiagnostics(file), ...service.getSemanticDiagnostics(consumer)]
        .map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n'))).toEqual([])
    } finally { service.dispose() }
  })

  it('不重写泛型函数、普通模块、非 Vue 类型或未知导出', () => {
    for (const text of [
      'declare const _default: <T>(props: {value:T}) => T; export default _default;',
      'export default function run(x: string): number;',
      'declare const _default: import("other").DefineComponent<{}>; export default _default;',
      'export { Component as default } from "./other";',
    ]) expect(nameVueDeclaration(ts, text, './entry')).toBe(text)
  })

  it('避免源标识符冲突，支持非标识符 expose，重复处理保持幂等', () => {
    const named = nameVueDeclaration(ts, 'interface ApprovalForm {}\n' + source, './approval-form')
    expect(named).toContain('interface ApprovalForm2 extends')
    expect(nameVueDeclaration(ts, named, './approval-form')).toBe(named)
    expect(nameVueDeclaration(ts, source, './123-form')).toContain('interface Remote123Form extends')
  })
})
