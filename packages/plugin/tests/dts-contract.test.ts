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

it('SFC合同检查失败时停止，不自动回到完整源码',async()=>{
  const root=project('vue-fallback-global',{
    'src/Form.vue':`<script setup lang="ts">const defaultId = '1' as const;defineProps<{id:typeof defaultId}>()</script><template/>`,
  })
  const full=await bundle(root,'./src/Form.vue');const fast=await bundle(root,'./src/Form.vue',true)
  expect(full.ok).toBe(true);expect(fast.ok).toBe(false)
  if(!fast.ok){expect(fast.diagnostics.join('\n')).toContain('TS2304');expect(fast.diagnostics.join('\n')).toContain('未自动重试完整源码')}
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

it('React TSX显式组件合同可独立生成，推导组件停止，消费方仍拒绝错误props',async()=>{
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
    expect(full.ok,full.ok?'':full.diagnostics.join('\n')).toBe(true)
    if(inferred){expect(fast.ok).toBe(false);if(!fast.ok)expect(fast.diagnostics.join('\n')).toContain('未自动重试完整源码');continue}
    expect(fast.ok,fast.ok?'':fast.diagnostics.join('\n')).toBe(true)
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

it('无props的script-setup及字面量name选项不牵入实现，保留原组件合同',async()=>{
  for(const options of ['',`defineOptions({name:'ClosedView',inheritAttrs:false});`]){
    const root=project('closed-view-'+(options?'named':'plain'),{
      'src/View.vue':`<script setup lang="ts">import {run} from './engine';${options}const value=run();</script><template><div>{{value}}</div></template>`,
      'src/engine.ts':`export function run():string{return 'value'}`,
    })
    const text=fs.readFileSync(path.join(root,'src/View.vue'),'utf8');expect(projection('View.vue',text)).not.toContain('./engine')
    const full=await bundle(root,'./src/View.vue');const fast=await bundle(root,'./src/View.vue',true)
    expect(full.ok).toBe(true);expect(fast.ok,fast.ok?'':fast.diagnostics.join('\n')).toBe(true)
    if(full.ok&&fast.ok){expect(fast.index.check).toBe('contract');for(const [file,text]of full.files)if(file!=='index.json')expect(fast.files.get(file)!.replace(/^export \{\};\n/, '')).toBe(text.replace(/^export \{\};\n/, ''))}
  }
},30000)

it('name、运行时事件数组和暴露的void方法保留真实参数/返回值，不跟随方法实现依赖',async()=>{
  const root=project('exposed-void',{
    'src/View.vue':`<script setup lang="ts">import {run} from './engine';defineOptions({name:'Editor'});defineProps<{id:string}>();defineEmits(['cancel']);const init=async(row:any)=>{const state={};if(row.kind===1){await run()}else if(row.kind===2||row.path){await run()}};defineExpose({init});</script><template><div/></template>`,
    'src/engine.ts':`export async function run():Promise<void>{}`,
  })
  const source=fs.readFileSync(path.join(root,'src/View.vue'),'utf8');const projected=projection('View.vue',source)!;expect(projected).not.toContain('./engine');expect(projected).toContain('Promise<void>')
  const full=await bundle(root,'./src/View.vue');const fast=await bundle(root,'./src/View.vue',true)
  expect(full.ok).toBe(true);expect(fast.ok,fast.ok?'':fast.diagnostics.join('\n')).toBe(true)
  if(full.ok&&fast.ok){
    expect(fast.index.check).toBe('contract')
    const normalize=(s:string)=>s.replace(/globalThis\.Promise/g,'Promise')
    for(const [file,text]of full.files)if(file!=='index.json')expect(normalize(fast.files.get(file)!)).toBe(normalize(text))
  }
},30000)

it.each([
 `const init=async()=>{throw Error()};defineExpose({init})`,
 `declare function fatal():never;const init=async()=>{fatal()};defineExpose({init})`,
 `const init=async()=>{while(true){}};defineExpose({init})`,
 `const init=async()=>{return load()};defineExpose({init})`,
 `const init=(x:string):string=>x;init.extra=1;defineExpose({init})`,
 `const init:((x:string)=>string)|undefined=x=>x;defineExpose({init})`,
])('复杂返回或流类型不强行改成void：%s',body=>{
  const text=`<script setup lang="ts">${body}</script><template/>`;expect(projection('View.vue',text)).toBe(text)
})

it('桥接工厂合同从SDK真实签名取得：默认、显式和参数推导props保持一致，400模块初始化不进入类型程序',async()=>{
  const {buildAmbientDeclarations}=await import('../src/dts-ambient')
  for(const factory of ['defineBridgeApp','defineApplication'])for(const framework of ['vue','react'])for(const kind of ['default','explicit','parameter']){
    const call=kind==='explicit'?`makeBridge<Props>(()=>boot())`:kind==='parameter'?`makeBridge((props:Props)=>{props.id;return boot()})`:`makeBridge((_props)=>boot())`
    const files:Record<string,string>={
      'src/entry.ts':`import {${factory} as makeBridge} from '@fulgurjs/federation/${framework}';import {boot} from './engine';export interface Props {readonly id:string;disabled?:boolean};export default ${call}`,
      'src/engine.ts':`import type {${framework==='vue'?'App':'ReactElement'}} from '${framework}';import * as pages from './barrel';export function boot():${framework==='vue'?'App':'ReactElement'}{if(Object.keys(pages).length)throw Error();throw Error()}`,
      'src/barrel.ts':Array.from({length:400},(_,i)=>`export {value as value${i}} from './page${i}'`).join('\n'),
    }
    for(let i=0;i<400;i++)files[`src/page${i}.ts`]=`export const value=${i}`
    const root=project('bridge-contract-'+factory+'-'+framework+'-'+kind,files)
    if(framework==='react'){fs.symlinkSync(path.resolve(__dirname,'../node_modules/react'),path.join(root,'node_modules/react'),'dir');fs.symlinkSync(path.resolve(__dirname,'../node_modules/@types'),path.join(root,'node_modules/@types'),'dir')}
    fs.mkdirSync(path.join(root,'node_modules/@fulgurjs'));fs.symlinkSync(path.resolve(__dirname,'..'),path.join(root,'node_modules/@fulgurjs/federation'),'dir')
    const full=await bundle(root,'./src/entry.ts');expect(full.ok,full.ok?'':full.diagnostics.join('\n')).toBe(true)
    const spy=vi.spyOn(fs,'readFileSync');let fast:Awaited<ReturnType<typeof bundle>>
    try {fast=await bundle(root,'./src/entry.ts',true);expect(spy.mock.calls.filter(([file])=>/src\/page\d+\.ts$/.test(String(file)))).toHaveLength(0)}finally{spy.mockRestore()}
    expect(fast!.ok,fast!.ok?'':fast!.diagnostics.join('\n')).toBe(true)
    if(!full.ok||!fast!.ok)continue
    expect(fast!.index.check).toBe('contract')
    for(const [alias,result]of [['before',full],['after',fast!]] as const){const ambient=buildAmbientDeclarations({alias,index:result.index,source:'test',readFile:file=>result.files.get(file)!});fs.writeFileSync(path.join(root,alias+'.d.ts'),ambient.files.get('modules.d.ts')!)}
    const consumer=path.join(root,'consumer.ts');fs.writeFileSync(consumer,`import before from 'before/Form';import after from 'after/Form';const a:typeof before=after;const b:typeof after=before;type A=NonNullable<typeof before.__fgBridgeProps>;type B=NonNullable<typeof after.__fgBridgeProps>;type Eq<X,Y>=(<T>()=>T extends X?1:2) extends (<T>()=>T extends Y?1:2)?true:false;const same:Eq<A,B>=true;${kind==='default'?'':`const ok:B={id:'1'};\n// @ts-expect-error 必填字段\nconst missing:B={};\n// @ts-expect-error boolean保持精确\nconst wrong:B={id:'1',disabled:'false'};`}`)
    const program=ts.createProgram([consumer,path.join(root,'before.d.ts'),path.join(root,'after.d.ts')],{strict:true,noEmit:true,skipLibCheck:true,types:[],target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler})
    expect(ts.getPreEmitDiagnostics(program).map(d=>ts.flattenDiagnosticMessageText(d.messageText,'\n'))).toEqual([])
  }
},180000)

it('投影视图不运行已被擦除用途的unused和CSS v-bind检查；真实源码配置仍严格检查',async()=>{
  const root=project('projection-usage-check',{
    'src/Form.vue':`<script setup lang="ts">const props=defineProps<{id:string}>();const height=12;</script><template><div>{{props.id}}</div></template><style scoped>.x{height:v-bind(height)}</style>`,
  })
  const file=path.join(root,'tsconfig.json');const config=JSON.parse(fs.readFileSync(file,'utf8'));config.compilerOptions.noUnusedLocals=true;config.compilerOptions.noUnusedParameters=true;fs.writeFileSync(file,JSON.stringify(config))
  const full=await bundle(root,'./src/Form.vue');const fast=await bundle(root,'./src/Form.vue',true)
  expect(full.ok,full.ok?'':full.diagnostics.join('\n')).toBe(true);expect(fast.ok,fast.ok?'':fast.diagnostics.join('\n')).toBe(true)
  if(fast.ok)expect(fast.index.check).toBe('contract')
  const source=path.join(root,'src/Form.vue');fs.writeFileSync(source,fs.readFileSync(source,'utf8').replace('const props=','const unused=1;const props='))
  expect((await bundle(root,'./src/Form.vue')).ok).toBe(false)
  expect((await bundle(root,'./src/Form.vue',true)).ok).toBe(true)
  expect(JSON.parse(fs.readFileSync(file,'utf8')).compilerOptions.noUnusedLocals).toBe(true)
},30000)

it.each(['vue-tsc-legacy','vue-tsc-v2'])('%s真实旧工具支持投影、实际输入记录、跨重启缓存及外部类型修复',async tool=>{
  const {createDevTypesServer}=await import('../src/dts-serve');const {typesCachePath}=await import('../src/dts-cache')
  const root=project('tool-'+tool,{'src/Form.vue':`<script setup lang="ts">import type {Model} from '../external';defineOptions({name:'OldToolForm'});const props=defineProps<{data:Model}>();</script><template><div>{{props.data.id}}</div></template>`,'external.ts':`export interface Model{id:string}`})
  const external=path.join(tmp,'model-'+tool+'.ts');fs.writeFileSync(external,'export interface Model{id:string}')
  const source=path.join(root,'src/Form.vue');fs.writeFileSync(source,fs.readFileSync(source,'utf8').replace("'../external'",`'../../model-${tool}'`))
  fs.unlinkSync(path.join(root,'node_modules/vue-tsc'));fs.symlinkSync(path.resolve(__dirname,'../node_modules',tool),path.join(root,'node_modules/vue-tsc'),'dir')
  const options={root,exposes:[{name:'./Form',import:'./src/Form.vue'}],pluginVersion:'matrix',dts:true} as import('../src/options').NormalizedOptions
  const logs:string[]=[];const services:Array<ReturnType<typeof createDevTypesServer>>=[];const start=()=>{const service=createDevTypesServer(options,{log:s=>logs.push(s),warn:s=>logs.push(s)});services.push(service);return service}
  try{
    const first=start();await vi.waitFor(()=>expect(first.revision(),logs.join('\n')).not.toBeNull(),{timeout:20000});const revision=first.revision();expect(fs.existsSync(typesCachePath(root))).toBe(true)
    fs.writeFileSync(external,'export interface Model{id:number}');await vi.waitFor(()=>expect(first.revision(),logs.join('\n')).not.toBe(revision),{timeout:20000});await vi.waitFor(()=>expect(first.isGenerating()).toBe(false),{timeout:20000});expect(first.revision()).not.toBeNull();const index=JSON.parse(first.servePath('/@fulgurjs-types/index.json')!.body);expect(Object.keys(index.files).map(file=>first.servePath('/@fulgurjs-types/'+file)!.body).join('\n')).toContain('id: number');first.dispose();logs.length=0
    const second=start();await vi.waitFor(()=>expect(logs.join('\n')).toContain('类型缓存命中'),{timeout:20000});expect(second.revision()).not.toBeNull()
  }finally{for(const service of services)service.dispose()}
},65000)

it('SDK桥接签名无法确认或公共工具名被遮蔽时不推测默认props',()=>{
  for(const text of [
    `import {defineBridgeApp}from './third-party';export default defineBridgeApp(()=>boot())`,
    `import {defineBridgeApp}from '@fulgurjs/federation/vue';type ReturnType<T>=number;export default defineBridgeApp(()=>boot())`,
    `import {defineBridgeApp}from '@fulgurjs/federation/vue';export default defineBridgeApp((props={id:'1'})=>boot())`,
  ])expect(projection('bridge.ts',text)).toBe(text)
})

it('从ambient组件引用进入的页面同样建立合同边界，不解析其400模块实现图',async()=>{
  const files:Record<string,string>={
    'src/Form.vue':`<script setup lang="ts">defineProps<{id:string}>()</script><template/>`,
    'src/HeavyView.vue':`<script setup lang="ts">import {run} from './engine';const value=run()</script><template><div>{{value}}</div></template>`,
    'src/components.d.ts':`import HeavyView from './HeavyView.vue';declare module 'vue'{export interface GlobalComponents{HeavyView:typeof HeavyView}}export {};`,
    'src/engine.ts':`import * as pages from './barrel';export function run():number{return Object.keys(pages).length}`,
    'src/barrel.ts':Array.from({length:400},(_,i)=>`export {value as value${i}} from './page${i}'`).join('\n'),
  };for(let i=0;i<400;i++)files[`src/page${i}.ts`]=`export const value=${i}`
  const root=project('ambient-projection',files),old=process.env.FG_DTS_TIMINGS;process.env.FG_DTS_TIMINGS='1'
  try{const full=await bundle(root,'./src/Form.vue');const fast=await bundle(root,'./src/Form.vue',true);expect(full.ok).toBe(true);expect(fast.ok,fast.ok?'':fast.diagnostics.join('\n')).toBe(true);if(full.ok&&fast.ok){expect(fast.index.check).toBe('contract');expect(fast.graph!.programFiles).toBeLessThan(full.graph!.programFiles-350)}}finally{if(old===undefined)delete process.env.FG_DTS_TIMINGS;else process.env.FG_DTS_TIMINGS=old}
},30000)

it('父进程准备投影后源码改变，Vue编译器仍从实际新读取生成，不覆盖成旧合同',async()=>{
  const original=`<script setup lang="ts">const props=defineProps<{id:string}>()</script><template>{{props.id}}</template>`
  const root=project('projection-latest-read',{'src/Form.vue':original});const file=path.join(root,'src/Form.vue');const write=fs.writeFileSync;let changed=false
  const spy=vi.spyOn(fs,'writeFileSync').mockImplementation(((target:fs.PathOrFileDescriptor,...args:unknown[])=>{
    const result=(write as (...args:unknown[])=>void)(target,...args)
    if(!changed&&String(target).endsWith('.inputs.json')){expect(String(target).startsWith(path.join(root,'node_modules'))).toBe(true);changed=true;write(file,original.replace('id:string','id:number'))}
    return result
  }) as typeof fs.writeFileSync)
  try{const result=await bundle(root,'./src/Form.vue',true);expect(changed).toBe(true);expect(result.ok,result.ok?'':result.diagnostics.join('\n')).toBe(true);if(result.ok)expect(result.files.get(result.index.exposes['./Form']!.declaration)).toContain('id: number')}finally{spy.mockRestore()}
},30000)

it('暴露函数保留重载、显式返回和内联箭头签名，真实消费方正反例通过',async()=>{
  const {buildAmbientDeclarations}=await import('../src/dts-ambient')
  const root=project('expose-overloads',{'src/Form.vue':`<script setup lang="ts">function choose(v:string):string;function choose(v:number):number;function choose(v:string|number){return v}const focus=(index:number):string=>String(index);defineExpose({choose,focus,inline:(id:string):number=>id.length});</script><template/>`})
  const result=await bundle(root,'./src/Form.vue',true);expect(result.ok,result.ok?'':result.diagnostics.join('\n')).toBe(true)
  if(!result.ok)return;expect(result.index.check).toBe('contract')
  const ambient=buildAmbientDeclarations({alias:'remote',index:result.index,source:'test',readFile:file=>result.files.get(file)!});const declaration=path.join(root,'remote.d.ts');fs.writeFileSync(declaration,ambient.files.get('modules.d.ts')!)
  const consumer=path.join(root,'consumer.ts');fs.writeFileSync(consumer,`import Form from 'remote/Form';declare const form:InstanceType<typeof Form>;const a:string=form.choose('a');const b:number=form.choose(1);const c:string=form.focus(1);const d:number=form.inline('id');\n// @ts-expect-error 重载不能变成any\nform.choose(true);\n// @ts-expect-error 参数不能变宽\nform.focus('1');\n// @ts-expect-error 返回值不能变成any\nconst wrong:string=form.inline('id');`)
  const program=ts.createProgram([consumer,declaration],{strict:true,noEmit:true,skipLibCheck:true,types:[],target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler});expect(ts.getPreEmitDiagnostics(program).map(d=>ts.flattenDiagnosticMessageText(d.messageText,'\n'))).toEqual([])
},30000)

it('缓存目录中的配置保留无baseUrl的paths语义，不把同名本地vue.ts当裸包',async()=>{
  const root=project('config-paths-no-base',{
    'src/entry.ts':`import type {Ref}from 'vue';import type {DTO}from '@/dto';export function read(value:Ref<DTO>):DTO{return value.value}`,
    'src/Other.vue':`<script setup lang="ts">const value=1</script><template>{{value}}</template>`,
    'src/dto.ts':`export interface DTO{id:string}`,
    'vue.ts':`export interface IncorrectLocalPackage{wrong:true}`,
  })
  const file=path.join(root,'tsconfig.json');const config=JSON.parse(fs.readFileSync(file,'utf8'));config.compilerOptions.paths={'@/*':['./src/*']};fs.writeFileSync(file,JSON.stringify(config))
  for(const contractOnly of [false,true]){const result=await bundle(root,'./src/entry.ts',contractOnly);expect(result.ok,result.ok?'':result.diagnostics.join('\n')).toBe(true);if(result.ok)expect([...result.files.values()].join('\n')).toContain('id: string')}
  expect(JSON.parse(fs.readFileSync(file,'utf8')).compilerOptions.baseUrl).toBeUndefined()
},30000)

it('无法投影的推导入口立即拒绝，400模块业务图在进入编译器前被截断；显式完整模式仍可检查',async()=>{
  const files:Record<string,string>={
    'src/entry.ts':`import {run} from './engine';export const result=run()`,
    'src/engine.ts':`import * as pages from './barrel';export function run():number{return Object.keys(pages).length}`,
    'src/barrel.ts':Array.from({length:400},(_,i)=>`export {value as value${i}} from './page${i}'`).join('\n'),
  };for(let i=0;i<400;i++)files[`src/page${i}.ts`]=`export const value=${i}`
  const root=project('strict-boundary',files)
  const read=vi.spyOn(fs,'readFileSync')
  try{
    const result=await bundle(root,'./src/entry.ts',true)
    expect(result.ok).toBe(false)
    if(!result.ok)expect(result.diagnostics.join('\n')).toMatch(/entry.ts[\s\S]*无法[\s\S]*implementation/)
    expect(read.mock.calls.filter(([file])=>/src\/(?:page\d+|barrel|engine)\.ts$/.test(String(file)))).toEqual([])
  }finally{read.mockRestore()}
  expect((await bundle(root,'./src/entry.ts')).ok).toBe(true)
},30000)

it('独立ambient环境保留真正引用的全局DTO，不加载未引用模块或模板组件的实现',async()=>{
  const root=project('selective-ambient',{
    'src/Form.vue':`<script setup lang="ts">defineProps<{params:BusinessParams}>()</script><template/>`,
    'src/globals.d.ts':`import type {Id} from './id';declare global {interface BusinessParams {readonly id:Id; disabled?:boolean};const unused:typeof import('./engine').run;}export {};`,
    'src/id.ts':`export type Id = string`,
    'src/components.d.ts':`declare module 'vue'{export interface GlobalComponents {Heavy:typeof import('./Heavy.vue')['default']}}export {};`,
    'src/Heavy.vue':`<script lang="ts">import {run} from './engine';export default {data(){return {value:run()}}}</script>`,
    'src/engine.ts':`export function run(){return Math.random()}`,
    'src/unrelated.d.ts':`export interface Unrelated {value:typeof import('./engine').run}`,
  })
  const read=vi.spyOn(fs,'readFileSync')
  try{
    const result=await bundle(root,'./src/Form.vue',true)
    expect(result.ok,result.ok?'':result.diagnostics.join('\n')).toBe(true)
    expect(read.mock.calls.filter(([file])=>/\/(?:Heavy\.vue|engine\.ts)$/.test(String(file)))).toEqual([])
    if(result.ok)expect([...result.files.values()].join('\n')).toContain('BusinessParams')
  }finally{read.mockRestore()}
},30000)

it('合同显式需要GlobalComponents时保留其依赖，遇到不支持的组件明确拒绝，不能偷偷删掉所需类型',async()=>{
  const root=project('explicit-components',{
    'src/entry.ts':`import type {GlobalComponents} from 'vue';export interface Props {component:GlobalComponents['Heavy']}`,
    'src/components.d.ts':`declare module 'vue'{export interface GlobalComponents {Heavy:typeof import('./Heavy.vue')['default']}}export {};`,
    'src/Heavy.vue':`<script lang="ts">export default {data(){return {value:Math.random()}}}</script>`,
  })
  const result=await bundle(root,'./src/entry.ts',true)
  expect(result.ok).toBe(false)
  if(!result.ok)expect(result.diagnostics.join('\n')).toContain('Heavy.vue')
},30000)

it('合同分析预算主动拒绝大文件，不能截断或自动扩大扫描',async()=>{
  const {createContractBoundary}=await import('../src/dts-contract')
  const boundary=createContractBoundary(projection)
  expect(boundary.read('/src/contracts.d.ts',`export type X = '${'x'.repeat(4*1024*1024)}'`)).toBeUndefined()
  expect([...boundary.errors].join('\n')).toContain('超过合同分析预算')
  expect(boundary.read('/src/next.ts','export const next=1')).toBeUndefined()
})

it('旧Vue工具的存在性探测不误报，只有实际进入类型Program的未投影源码才拒绝',async()=>{
  const root=project('legacy-probe',{
    'src/Form.vue':`<script setup lang="ts">defineProps<{value:import('union').Version}>()</script><template/>`,
    'node_modules/union/package.json':`{"name":"union","types":"index.d.ts"}`,
    'node_modules/union/index.d.ts':`export * from 'javascript-lib'`,
    'node_modules/javascript-lib/package.json':`{"name":"javascript-lib","main":"index.js"}`,
    'node_modules/javascript-lib/index.js':`export const version = Math.random()`,
    'node_modules/@types/javascript-lib/package.json':`{"name":"@types/javascript-lib","types":"index.d.ts"}`,
    'node_modules/@types/javascript-lib/index.d.ts':`export type Version = 'v1'|'v2'`,
  })
  fs.unlinkSync(path.join(root,'node_modules/vue-tsc'))
  fs.symlinkSync(path.resolve(__dirname,'../node_modules/vue-tsc-legacy'),path.join(root,'node_modules/vue-tsc'),'dir')
  const cfg=JSON.parse(fs.readFileSync(path.join(root,'tsconfig.json'),'utf8'));cfg.compilerOptions.allowJs=true;fs.writeFileSync(path.join(root,'tsconfig.json'),JSON.stringify(cfg))
  const result=await bundle(root,'./src/Form.vue',true)
  expect(result.ok,result.ok?'':result.diagnostics.join('\n')).toBe(true)
},30000)

it('合同超时只运行一次固定预算的隔离编译，不自动提堆或完整重试',async()=>{
  const root=project('bounded-timeout',{'src/entry.ts':`export interface Props {id:string}`})
  const run=vi.fn(async(_request:import('../src/dts-vue-session').VueCompileRequest)=>({err:Object.assign(new Error('timeout'),{killed:true,signal:'SIGTERM'}),stdout:'',stderr:''}))
  const result=await generateTypesBundle({root,exposes:[{name:'./Form',import:'./src/entry.ts'}],pluginVersion:'test',contractOnly:true,
    incrementalDir:path.join(root,'node_modules/.fulgurjs-types-budget'),vueCompiler:{run,prime:()=>undefined,dispose:()=>{}}})
  expect(result.ok).toBe(false);expect(run).toHaveBeenCalledTimes(1)
  expect(run.mock.calls[0]![0].timeout).toBe(15000)
  if(!result.ok)expect(result.diagnostics.join('\n')).toContain('超过隔离编译15秒预算')
})

it('只引用混合模块中的具名类型时不受无关推导导出影响；多个类型需求合并，值需求仍严格拒绝',async()=>{
  const root=project('named-type-boundary',{
    'src/entry.ts':`import type {Props as P} from './mixed';export interface Envelope {params:P}`,
    'src/other.ts':`export type {OtherProps} from './mixed'`,
    'src/mixed.ts':`import {run} from './engine';export interface Props {readonly id:string;disabled?:boolean};export interface OtherProps {count:number};const id=run();export function unrelated(){return run()}`,
    'src/engine.ts':`export function run():number{return Math.random()}`,
    'src/value.ts':`export {unrelated} from './mixed'`,
  })
  const result=await generateTypesBundle({root,exposes:[{name:'./Envelope',import:'./src/entry.ts'},{name:'./Other',import:'./src/other.ts'}],pluginVersion:'test',contractOnly:true})
  expect(result.ok,result.ok?'':result.diagnostics.join('\n')).toBe(true)
  if(result.ok){const text=[...result.files.values()].join('\n');expect(text).toContain('readonly id: string');expect(text).toContain('count: number');expect(text).not.toContain('unrelated');expect(text).not.toContain('engine')}
  const value=await generateTypesBundle({root,exposes:[{name:'./Envelope',import:'./src/entry.ts'},{name:'./Value',import:'./src/value.ts'}],pluginVersion:'test',contractOnly:true})
  expect(value.ok).toBe(false);if(!value.ok)expect(value.diagnostics.join('\n')).toContain('mixed.ts')
},30000)


it('间接库模块的实例/接口增强保守保留，不能因外层合同没有直接import该库而丢字段',async()=>{
  const root=project('transitive-augmentation',{
    'src/entry.ts':`import type {Outer} from 'outer-lib';export type Additional = Outer['stamp']`,
    'src/augment.d.ts':`import 'inner-lib';declare module 'inner-lib'{interface Inner {stamp:string}}`,
    'node_modules/outer-lib/package.json':`{"name":"outer-lib","types":"index.d.ts"}`,
    'node_modules/outer-lib/index.d.ts':`export {Inner as Outer} from 'inner-lib'`,
    'node_modules/inner-lib/package.json':`{"name":"inner-lib","types":"index.d.ts"}`,
    'node_modules/inner-lib/index.d.ts':`export interface Inner {id:string}`,
  })
  const result=await bundle(root,'./src/entry.ts',true)
  expect(result.ok,result.ok?'':result.diagnostics.join('\n')).toBe(true)
},30000)


it('增量复用的AST也计入预算，探测到未投影源码实际入图时必须拒绝',async()=>{
  const {createContractBoundary}=await import('../src/dts-contract')
  const boundary=createContractBoundary(projection)
  const file='/src/inferred.ts'
  expect(boundary.read(file,'export const inferred=load()',true)).toBe('')
  expect(boundary.errors.size).toBe(0)
  boundary.validateProgram([{fileName:file,text:''}])
  expect([...boundary.errors].join('\n')).toContain(file)
  const reused=createContractBoundary(projection)
  reused.validateProgram(Array.from({length:4097},(_,i)=>({fileName:`/node_modules/lib${i}.d.ts`,text:''})))
  expect([...reused.errors].join('\n')).toContain('含复用AST')
})

it.each([
  ['named',`export default function Card(p:{readonly id:string}):string{return p.id}`],
  ['anonymous',`export default function(p:{readonly id:string}):string{return p.id}`],
  ['overload',`export default function pick(p:string):string;export default function pick(p:number):number;export default function pick(p:string|number):string|number{return p}`],
  ['class',`export default class Card {constructor(readonly id:string){};value():string{return this.id}}`],
] as const)('默认%s导出的声明在源码读取视图中合法，真实消费方保留精确签名',async(name,source)=>{
  const {buildAmbientDeclarations}=await import('../src/dts-ambient')
  const root=project('default-'+name,{'src/entry.ts':source})
  const full=await bundle(root,'./src/entry.ts');const fast=await bundle(root,'./src/entry.ts',true)
  expect(full.ok,full.ok?'':full.diagnostics.join('\n')).toBe(true);expect(fast.ok,fast.ok?'':fast.diagnostics.join('\n')).toBe(true)
  if(!full.ok||!fast.ok)return
  for(const [alias,result]of [['full',full],['fast',fast]] as const){const generated=buildAmbientDeclarations({alias,index:result.index,source:'test',readFile:f=>result.files.get(f)!});fs.writeFileSync(path.join(root,alias+'.d.ts'),generated.files.get('modules.d.ts')!)}
  const file=path.join(root,'consumer.ts');fs.writeFileSync(file,`import Full from 'full/Form';import Fast from 'fast/Form';const a:typeof Full=Fast;const b:typeof Fast=Full;\n// @ts-expect-error 输入不能变成any\n${name==='class'?`new Fast(123)`:`Fast(${name==='overload'?'true':'{id:123}'})`};`)
  const program=ts.createProgram([file,path.join(root,'full.d.ts'),path.join(root,'fast.d.ts')],{strict:true,noEmit:true,types:[],skipLibCheck:true,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler})
  expect(ts.getPreEmitDiagnostics(program).map(d=>ts.flattenDiagnosticMessageText(d.messageText,'\n'))).toEqual([])
},30000)

it('直接使用公开React模板源码生成合同，默认组件签名和详情参数不能退化',async()=>{
  const {buildAmbientDeclarations}=await import('../src/dts-ambient')
  const source=path.resolve(__dirname,'../../../examples/templates/react-react/remote/src/fulgurjs/exposes')
  const files:Record<string,string>={};for(const file of ['ClickButton.tsx','pages/HomePage.tsx','pages/DetailPage.tsx','utils.ts'])files['src/'+file]=fs.readFileSync(path.join(source,file),'utf8')
  const root=project('public-react-template',files)
  for(const pkg of ['react','@types'])fs.symlinkSync(path.resolve(__dirname,'../node_modules',pkg),path.join(root,'node_modules',pkg),'dir')
  const config=path.join(root,'tsconfig.json');const raw=JSON.parse(fs.readFileSync(config,'utf8'));raw.compilerOptions.jsx='react-jsx';fs.writeFileSync(config,JSON.stringify(raw))
  const result=await generateTypesBundle({root,exposes:[{name:'./Button',import:'./src/ClickButton.tsx'},{name:'./Home',import:'./src/pages/HomePage.tsx'},{name:'./Detail',import:'./src/pages/DetailPage.tsx'}],pluginVersion:'test',contractOnly:true})
  expect(result.ok,result.ok?'':result.diagnostics.join('\n')).toBe(true);if(!result.ok)return
  const ambient=buildAmbientDeclarations({alias:'remote',index:result.index,source:'test',readFile:f=>result.files.get(f)!});fs.writeFileSync(path.join(root,'remote.d.ts'),ambient.files.get('modules.d.ts')!)
  const consumer=path.join(root,'consumer.ts');fs.writeFileSync(consumer,`import Detail from 'remote/Detail';type Props=Parameters<typeof Detail>[0];const good:Props={id:'1',tab:'base'};\n// @ts-expect-error 详情参数仍为string\nconst wrong:Props={id:123};`)
  const program=ts.createProgram([consumer,path.join(root,'remote.d.ts')],{strict:true,noEmit:true,skipLibCheck:true,types:[],target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler})
  expect(ts.getPreEmitDiagnostics(program).map(d=>ts.flattenDiagnosticMessageText(d.messageText,'\n'))).toEqual([])
},30000)
