/** 公开合同投影的独立依赖图与精度回归；不依赖私有业务项目。 */
import { afterAll, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import ts from 'typescript'
import { parse } from 'vue/compiler-sfc'
import { createContractProjection } from '../src/dts-contract'
import { generateTypesBundle } from '../src/dts-generate'

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fg-contract-'))
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }))
function project(name: string, files: Record<string,string>) {
  const root = path.join(tmp,name)
  for (const [rel,text] of Object.entries(files)) { const file=path.join(root,rel);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,text) }
  fs.mkdirSync(path.join(root,'node_modules'),{recursive:true})
  for (const pkg of ['typescript','vue','vue-tsc']) fs.symlinkSync(path.resolve(__dirname,'../node_modules',pkg),path.join(root,'node_modules',pkg),'dir')
  fs.writeFileSync(path.join(root,'package.json'),'{"private":true}')
  fs.writeFileSync(path.join(root,'tsconfig.json'),JSON.stringify({compilerOptions:{target:'ES2022',module:'ESNext',moduleResolution:'bundler',strict:true,skipLibCheck:true,types:[]},include:['src']}))
  return root
}
const projection = createContractProjection(ts,parse)
const bundle = (root:string,entry:string,contractOnly=false) => generateTypesBundle({root,exposes:[{name:'./Form',import:entry}],pluginVersion:'test',contractOnly})

describe('公开合同投影',()=>{
  it('TS精确注解擦除实现导入，复杂推导保留原文件，绝不消费孤立声明的any兜底',()=>{
    const precise=`import { run } from './engine'; export interface Props {id:string};export function call(p:Props):string{return run(p.id)}`
    expect(projection('entry.ts',precise)).not.toContain('./engine')
    const inferred=`import { run } from './engine'; export const result=run()`
    expect(projection('entry.ts',inferred)).toBe(inferred)
  })
  it.each([
    `const p=defineProps({id:String});defineEmits<{save:[]}>()`,
    `const {id='1'}=defineProps<{id?:string}>();defineEmits<{save:[]}>()`,
    `defineProps<{id:string}>();defineExpose({focus(){}})`,
    `defineProps<{id:string}>();defineModel<string>()`,
    `withDefaults(defineProps<{id?:string}>(),{id:loadDefault()})`,
  ])('不完整支持的宏整份SFC回退：%s',script=>{
    const text=`<script setup lang="ts">${script}</script><template/>`
    expect(projection('Form.vue',text)).toBe(text)
  })
  it('slots、泛型和选项式组件不重建近似合同',()=>{
    for(const text of [
      `<script setup lang="ts">defineProps<{id:string}>()</script><template><slot :id="id"/></template>`,
      `<script setup lang="ts" generic="T">defineProps<{value:T}>()</script>`,
      `<script lang="ts">export default {props:{id:String}}</script>`,
    ])expect(projection('Form.vue',text)).toBe(text)
  })
  it('TS大实现图不进入公开合同程序，输出与完整生成一致；完整检查仍拒绝实现错误',async()=>{
    const files:Record<string,string>={
      'src/entry.ts':`import {run} from './implementation';export interface Props {/** 单据编号 */readonly id:string;disabled?:boolean};export function call(p:Props):string{return run(p.id)}`,
      'src/implementation.ts':`import * as data from './barrel'; export function run(id:string):string{return id+Object.keys(data).length}`,
      'src/barrel.ts':Array.from({length:400},(_,i)=>`export {value as value${i}} from './page${i}'`).join('\n'),
    }
    for(let i=0;i<400;i++)files[`src/page${i}.ts`]=`export const value=${i}`
    const root=project('ts-large',files)
    const full=await bundle(root,'./src/entry.ts')
    expect(full.ok,full.ok?'':full.diagnostics.join('\n')).toBe(true)
    const spy=vi.spyOn(fs,'readFileSync')
    let fast:Awaited<ReturnType<typeof bundle>>
    try {fast=await bundle(root,'./src/entry.ts',true);expect(spy.mock.calls.filter(([file])=>/page\d+\.ts$/.test(String(file)))).toHaveLength(0)}finally{spy.mockRestore()}
    expect(fast!.ok,fast!.ok?'':fast!.diagnostics.join('\n')).toBe(true)
    if(full.ok&&fast!.ok)expect(new Map([...fast!.files].filter(([file])=>file!=='index.json'))).toEqual(new Map([...full.files].filter(([file])=>file!=='index.json')))
    fs.appendFileSync(path.join(root,'src/implementation.ts'),'\nconst bad:string=123;')
    const strict=await bundle(root,'./src/entry.ts')
    expect(strict.ok).toBe(false)
    expect((await bundle(root,'./src/entry.ts',true)).ok).toBe(true)
  },30000)
  it('Vue显式props和事件仍由官方工具生成，声明与完整路径一致',async()=>{
    const root=project('vue-large',{
      'src/Form.vue':`<script setup lang="ts">import {run} from './implementation';import type {Props} from './contract'; const p=defineProps<Props>();const emit=defineEmits<{save:[id:string]}>();run();</script><template><div>{{p.id}}</div></template>`,
      'src/contract.ts':`export interface Props {/** 编号 */readonly id:string; disabled?:boolean}`,
      'src/implementation.ts':`export function run():void{}`,
    })
    const full=await bundle(root,'./src/Form.vue');const fast=await bundle(root,'./src/Form.vue',true)
    expect(full.ok,full.ok?'':full.diagnostics.join('\n')).toBe(true)
    expect(fast.ok,fast.ok?'':fast.diagnostics.join('\n')).toBe(true)
    if(full.ok&&fast.ok)expect(new Map([...fast.files].filter(([file])=>file!=='index.json'))).toEqual(new Map([...full.files].filter(([file])=>file!=='index.json')))
  },30000)
  it('公开合同内的缺失类型和错误仍然拒绝，不把实现检查与合同检查混为一谈',async()=>{
    const root=project('invalid-contract',{'src/entry.ts':`import type {Missing} from './absent';export interface Props {value:Missing}`})
    const result=await bundle(root,'./src/entry.ts',true)
    expect(result.ok).toBe(false)
    if(!result.ok)expect(result.diagnostics.join('\n')).toContain('TS2307')
  },30000)
})

it('Vue具名类型导出、字面量默认值、事件重载与完整合同保持一致',async()=>{
  const root=project('vue-default-contract',{
    'src/Form.vue':`<script lang="ts">export type {Params} from './contract';</script><script setup lang="ts">import {type Params} from './contract';import {run} from './engine';const p=withDefaults(defineProps<{params:Params;disabled?:boolean}>(),{disabled:false});defineEmits<{(e:'save',id:string):void;(e:'cancel'):void}>();run();</script><template><div>{{p.params.id}}</div></template>`,
    'src/contract.ts':`export interface Params {readonly id:string;list?:ReadonlyArray<{value:number}>}`,
    'src/engine.ts':`export function run():void{}`,
  })
  const full=await bundle(root,'./src/Form.vue');const fast=await bundle(root,'./src/Form.vue',true)
  expect(full.ok,full.ok?'':full.diagnostics.join('\n')).toBe(true)
  expect(fast.ok,fast.ok?'':fast.diagnostics.join('\n')).toBe(true)
  if(full.ok&&fast.ok){
    const normalize=(text:string)=>text.replace(/import \{ type (\w+) \}/g,'import type { $1 }')
    for(const [file,text] of full.files)if(file!=='index.json')expect(normalize(fast.files.get(file)!)).toBe(normalize(text))
    expect(fast.index.check).toBe('contract')
  }
},30000)

it('SFC投影出现无法检查的类型时自动回到真实源码，不服务近似结果',async()=>{
  const root=project('vue-fallback-global',{
    'src/Form.vue':`<script setup lang="ts">const defaultId = '1' as const;defineProps<{id:typeof defaultId}>()</script><template/>`,
  })
  const full=await bundle(root,'./src/Form.vue');const fast=await bundle(root,'./src/Form.vue',true)
  expect(full.ok).toBe(true);expect(fast.ok,fast.ok?'':fast.diagnostics.join('\n')).toBe(true)
  if(full.ok&&fast.ok){expect(fast.index.check).toBeUndefined();expect(fast.notices.join('')).toContain('完整源码');expect(fast.files).toEqual(full.files)}
},30000)

it('局部同名函数不是Vue编译宏，不把它改写成另一套组件合同',()=>{
  const text=`<script setup lang="ts">function defineProps<T>():T{throw Error()};const props=defineProps<{id:string}>()</script><template/>`
  expect(projection('Form.vue',text)).toBe(text)
})

it('真实dev缓存按公开合同记录实际TS输入；400个实现模块不预扫，切换完整检查不会复用合同成功',async()=>{
  const {createDevTypesServer}=await import('../src/dts-serve')
  const {typesCachePath}=await import('../src/dts-cache')
  const {gunzipSync}=await import('node:zlib')
  const files:Record<string,string>={
    'src/entry.ts':`import {run} from './implementation';export interface Props {id:string};export function call(p:Props):string{return run(p.id)}`,
    'src/implementation.ts':`import * as data from './barrel';export function run(id:string):string{const bad:string=123;return id+Object.keys(data).length}`,
    'src/barrel.ts':Array.from({length:400},(_,i)=>`export {value as value${i}} from './page${i}'`).join('\n'),
  }
  for(let i=0;i<400;i++)files[`src/page${i}.ts`]=`export const value=${i}`
  const root=project('dev-large',files)
  // 纯TS提供方不需要安装Vue/vue-tsc，也必须使用隔离编译和真实输入记录。
  fs.unlinkSync(path.join(root,'node_modules/vue'));fs.unlinkSync(path.join(root,'node_modules/vue-tsc'))
  const options={root,exposes:[{name:'./api',import:'./src/entry.ts'}],pluginVersion:'test',dts:true} as import('../src/options').NormalizedOptions
  const logs:string[]=[]
  const services:Array<ReturnType<typeof createDevTypesServer>>=[]
  const start=(opts=options)=>{const service=createDevTypesServer(opts,{log:s=>logs.push(s),warn:s=>logs.push(s)});services.push(service);return service}
  try {
    const first=start();await vi.waitFor(()=>expect(first.revision()).not.toBeNull(),{timeout:15000})
    const payload=JSON.parse(gunzipSync(fs.readFileSync(typesCachePath(root))).toString()).payload
    expect(Object.keys(payload.snapshot.files).filter(p=>/src\/(?:page\d+|barrel|implementation)\.ts$/.test(p))).toEqual([])
    expect(JSON.parse(first.servePath('/@fulgurjs-types/index.json')!.body).check).toBe('contract')
    first.dispose();logs.length=0
    const second=start();await vi.waitFor(()=>expect(logs.join('\n')).toContain('类型缓存命中'),{timeout:15000});second.dispose();logs.length=0
    const strict=start({...options,dts:{devCheck:'implementation'}})
    await vi.waitFor(()=>expect(logs.join('\n')).toContain('TS2322'),{timeout:15000});expect(strict.revision()).toBeNull()
  } finally {for(const service of services)service.dispose()}
},45000)

it('React TSX显式组件合同可独立生成，推导组件自动保留原路径，消费方仍拒绝错误props',async()=>{
  const {buildAmbientDeclarations}=await import('../src/dts-ambient')
  for (const inferred of [false,true]) {
    const root=project(`react-${inferred}`,{
      'src/Card.tsx':`import type {FC} from 'react';import {run} from './engine';export interface Props {readonly id:string;disabled?:boolean}\n${inferred?"export function Card(p:Props){return <span>{run(p.id)}</span>}":"export const Card:FC<Props> = p => <span>{run(p.id)}</span>"}`,
      'src/engine.ts':`export function run(value:string):string{return value}`,
    })
    fs.symlinkSync(path.resolve(__dirname,'../node_modules/react'),path.join(root,'node_modules/react'),'dir')
    fs.symlinkSync(path.resolve(__dirname,'../node_modules/@types'),path.join(root,'node_modules/@types'),'dir')
    const cfg=JSON.parse(fs.readFileSync(path.join(root,'tsconfig.json'),'utf8'));cfg.compilerOptions.jsx='react-jsx';fs.writeFileSync(path.join(root,'tsconfig.json'),JSON.stringify(cfg))
    const full=await bundle(root,'./src/Card.tsx');const fast=await bundle(root,'./src/Card.tsx',true)
    expect(full.ok,full.ok?'':full.diagnostics.join('\n')).toBe(true);expect(fast.ok,fast.ok?'':fast.diagnostics.join('\n')).toBe(true)
    if(!full.ok||!fast.ok)continue
    for(const [file,text]of full.files)if(file!=='index.json')expect(fast.files.get(file)).toBe(text)
    const ambient=buildAmbientDeclarations({alias:'remote',index:fast.index,source:'test',readFile:file=>fast.files.get(file)!})
    const declaration=path.join(root,'remote.d.ts');fs.writeFileSync(declaration,ambient.files.get('modules.d.ts')!)
    const consumer=path.join(root,'consumer.ts');fs.writeFileSync(consumer,`import {Card} from 'remote/Form';type Props=Parameters<typeof Card>[0];const valid:Props={id:'1',disabled:false};\n// @ts-expect-error 必填id\nconst missing:Props={};\n// @ts-expect-error 精确boolean\nconst wrong:Props={id:'1',disabled:'false'};`)
    const program=ts.createProgram([consumer,declaration],{strict:true,noEmit:true,skipLibCheck:true,types:[],target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler})
    expect(ts.getPreEmitDiagnostics(program).map(d=>ts.flattenDiagnosticMessageText(d.messageText,'\n'))).toEqual([])
  }
},30000)

it('显式副作用导入的全局增强仍进入公开合同，不能作为无用实现删掉',async()=>{
  const root=project('side-effect-contract',{
    'src/Form.vue':`<script setup lang="ts">import './augment';defineProps<{id:BusinessId}>()</script><template/>`,
    'src/augment.ts':`export {};declare global {type BusinessId = string}`,
  })
  const full=await bundle(root,'./src/Form.vue');const fast=await bundle(root,'./src/Form.vue',true)
  expect(full.ok).toBe(true);expect(fast.ok,fast.ok?'':fast.diagnostics.join('\n')).toBe(true)
  if(full.ok&&fast.ok){
    expect(fast.index.check).toBe('contract')
    const {buildAmbientDeclarations}=await import('../src/dts-ambient')
    const ambient=buildAmbientDeclarations({alias:'remote',index:fast.index,source:'test',readFile:file=>fast.files.get(file)!})
    const declaration=path.join(root,'remote.d.ts');fs.writeFileSync(declaration,ambient.files.get('modules.d.ts')!)
    const consumer=path.join(root,'consumer.ts');fs.writeFileSync(consumer,`import Form from 'remote/Form';type Props=InstanceType<typeof Form>['$props'];const valid:Props={id:'1'};
// @ts-expect-error 全局增强实际为string
const wrong:Props={id:123};
// @ts-expect-error 必填id
const missing:Props={};`)
    const program=ts.createProgram([consumer,declaration],{strict:true,noEmit:true,skipLibCheck:true,types:[],target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler})
    expect(ts.getPreEmitDiagnostics(program).map(d=>ts.flattenDiagnosticMessageText(d.messageText,'\n'))).toEqual([])
  }
},30000)
