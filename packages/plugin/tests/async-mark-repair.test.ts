/**
 * V8-ASYNC-FIX：rolldown（vite 8）漏标 async 的初始化包装修复（2026-10-03 重设计版）。
 *
 * 破损样本取自 JeecgBoot（vue 3.5 / vite 8.1.4 / rolldown 1.1.5）实机构建：
 * 顶层 await 沿静态依赖传播进用户代码/依赖库循环依赖时，rolldown 为循环一侧生成的
 * 惰性初始化包装漏标 async。
 *
 * 本套件验证：
 * 1. 语法层：修复后 esbuild（真实 parser）校验通过；非目标语法错误原样放行；
 * 2. 运行语义层：修复产物在 **rolldown 真实运行时助手**（访问器 o，逐字取自
 *    rolldown-runtime chunk）下执行——初始化顺序 / 只初始化一次 / 循环依赖不永久
 *    挂起 / rejection 传播 / 正确 async 包装不被重复修改；
 * 3. 安全层：字符串/注释/正则字面量不被修改；不支持的破损形态（getter）明确失败。
 */
import { describe, expect, it } from 'vitest'
import vm from 'node:vm'
import { repairRolldownAsyncMarks } from '../src/async-mark-repair'

/** rolldown 渲染期的 esbuild 互操作包装形态（renderChunk 输入，Jeecg app-a 实测） */
const BROKEN_ESM_MIN = [
  'import { n as e } from "./rolldown-runtime-ABC.js";',
  'var glob, _PRELOAD_UTILS, $electron;',
  'var init_electron = __esmMin((() => {',
  '  await init_router();',
  '  init_setting();',
  '  $electron = { isElectron: 1 };',
  '}));',
  'var init_router = __esmMin((async () => {',
  '  await loadShare("vue-router");',
  '}));',
].join('\n')

/** rolldown 模块包装形态（minify 前后均实测，Jeecg app-b 实测） */
const BROKEN_MODULE_WRAP = [
  'import { n as e } from "./rolldown-runtime-ABC.js";',
  'var _,v,y,b=e((()=>{await $(),te(),oe(),_=ee(),v=c.ELECTRON_API,y={isElectron:()=>_.isElectronPlatform}})),',
  '$=e((async()=>{b(),await He(),await Ge()}));',
].join('\n')

/** rolldown 真实运行时访问器（rolldown-runtime chunk 逐字摘录，vite 8.3.2 实构建） */
const ROLLDOWN_ACCESSOR = 'var o=(e,t,n)=>()=>{if(n)throw n[0];try{return e&&(t=e(e=0)),t}catch(e){throw n=[e],e}};'

/** __esmMin：与访问器同构的惰性单次初始化（rolldown runtime 同族 helper） */
const ESM_MIN = 'var __esmMin=(fn)=>{let r;const g=()=>(r??=fn());return g};'

interface Sandbox {
  log: string[]
  tick: (n: number) => Promise<void>
  result?: unknown
  err?: unknown
}

/** 在 vm 中以 rolldown 真实助手语义执行代码，冲刷微任务后取回沙箱状态 */
async function runRolldownSemantics(code: string, extra = ''): Promise<Sandbox> {
  const sandbox: Sandbox = {
    log: [],
    tick: async (n: number) => { for (let i = 0; i < n; i++) await Promise.resolve() },
  }
  vm.createContext(sandbox)
  // import 语句仅是 rolldown-runtime 门禁标记；vm 脚本态把 e/访问器映射为运行时助手
  const body = code.replace(/^import[^\n]*$/gm, '')
  vm.runInContext(`${ROLLDOWN_ACCESSOR}${ESM_MIN}var e=o;${extra}\n${body}`, sandbox)
  for (let i = 0; i < 20; i++) await Promise.resolve()
  await new Promise((r) => setTimeout(r, 0))
  for (let i = 0; i < 20; i++) await Promise.resolve()
  return sandbox
}

/** 修复并用 esbuild 真实校验（repair 内部即 esbuild；此处再断言语法合法） */
function repairOk(code: string, name = 'chunk.js') {
  const result = repairRolldownAsyncMarks(code, name)
  if (!result) throw new Error('expected repair to fire, got null')
  return result
}

describe('repairRolldownAsyncMarks（V8-ASYNC-FIX，esbuild 定位引导重设计）', () => {
  it('正常产物零改动（返回 null，不做任何解析/改写）', () => {
    const ok = [
      'import { n as e } from "./rolldown-runtime-ABC.js";',
      'const m = await loadShare("vue");',
      'export const x = m.default;',
      'var init = __esmMin((async () => { await other(); }));',
    ].join('\n')
    expect(repairRolldownAsyncMarks(ok, 'ok.js')).toBeNull()
  })

  it('无 rolldown-runtime 引用的 chunk 直接跳过', () => {
    const noRuntime = 'var f = () => { await g(); };'
    expect(repairRolldownAsyncMarks(noRuntime, 'plain.js')).toBeNull()
  })

  it('非 async 语法错误不拦截（原样交构建管线报错）', () => {
    const other = 'import x from "./rolldown-runtime-ABC.js";\nvar = broken;'
    expect(repairRolldownAsyncMarks(other, 'other.js')).toBeNull()
  })

  it.each([
    ['esmMin 形态', BROKEN_ESM_MIN],
    ['模块包装形态', BROKEN_MODULE_WRAP],
  ])('%s：真实样本修复后语法合法且不改写既有 async 包装', (_name, broken) => {
    const result = repairOk(broken, 'router.js')
    expect(result.repaired).toBeGreaterThanOrEqual(1)
    expect(result.code).toMatch(/__esmMin\(\(async \(\) => \{|e\(\(async\(\)=>\{|e\(\(async \(\)=>\{/)
    // 非破损的既有 async 包装保持原样（不被二次改写）
    expect(result.code).not.toContain('async(async')
    expect(result.code).not.toContain('async async')
  })

  it('运行语义：初始化顺序 / 异步依赖完成前消费者不可用 / 只初始化一次', async () => {
    // dep 先初始化完成，b（破损侧，修复为 async）await dep 后才写模块绑定；
    // 消费方 await b() 后才读到绑定值；重复调用 main/b 各只执行一次
    const code = [
      'var dep = o((async () => { await tick(3); log.push("dep-init"); return { v: 42 }; }));',
      'var boundVal;',
      'var b = o((() => { await dep(); log.push("b-init"); boundVal = "set-by-b"; }));',
      'var main = o((async () => { await b(); log.push("main"); result = boundVal.toUpperCase(); }));',
      'main(); main(); b();',
    ].join('\n')
    const pre = 'import { n as e } from "./rolldown-runtime-ABC.js";\n'
    const repaired = repairOk(pre + code, 'sem.js')
    // 破损形态（b 的箭头体首 token 是 await）被修复；正常 main 不动
    expect(repaired.code).toContain('o((async () => { await dep()')
    const sandbox = await runRolldownSemantics(repaired.code)
    expect(sandbox.log).toEqual(['dep-init', 'b-init', 'main'])
    expect(sandbox.result).toBe('SET-BY-B')
  })

  it('运行语义：循环依赖（一侧不 await 另一侧）不永久挂起', async () => {
    // 真实形态：$ 为 async，体内同步调用 b()；b 体内 await $()——修复后必须完成
    const code = [
      'var b = o((() => { await $(); log.push("b-done"); }));',
      'var $ = o((async () => { b(); await tick(2); log.push("dollar-done"); }));',
      'b();',
    ].join('\n')
    const pre = 'import { n as e } from "./rolldown-runtime-ABC.js";\n'
    const repaired = repairOk(pre + code, 'cycle.js')
    const sandbox = await runRolldownSemantics(repaired.code)
    expect(sandbox.log).toEqual(['dollar-done', 'b-done'])
  })

  it('运行语义：rejection 正确传播到等待方', async () => {
    const code = [
      'var bad = o((async () => { await tick(1); throw new Error("dep-boom"); }));',
      'var b = o((() => { await bad(); log.push("unreachable"); }));',
      'b().then(() => log.push("resolved"), (e) => { log.push("rejected:" + e.message); });',
    ].join('\n')
    const pre = 'import { n as e } from "./rolldown-runtime-ABC.js";\n'
    const repaired = repairOk(pre + code, 'rej.js')
    const sandbox = await runRolldownSemantics(repaired.code)
    expect(sandbox.log).toEqual(['rejected:dep-boom'])
  })

  it('真实构建形态：自重赋值包装 function n(){return(n=e((()=>{await...})))()}', () => {
    const code = [
      'import { n as e } from "./rolldown-runtime-ABC.js";',
      'var dep = e((async () => 1));',
      'function b(){return(b=e((()=>{await dep();te()})))()}',
      'function t2(){return(t2=e((()=>{await dep()})))()}',
      'b();t2();',
    ].join('\n')
    const result = repairOk(code, 'selfreassign.js')
    expect(result.code).toContain('return(b=e((async ()=>{await dep()')
    expect(result.code).toContain('return(t2=e((async ()=>{await dep()})))()}')
  })

  it('await 非首语句（旧签名正则覆盖不到的形态）也能修复', () => {
    const code = [
      'import { n as e } from "./rolldown-runtime-ABC.js";',
      'var dep = e((async () => 1));',
      'var b = e((() => { var q = 1; await dep(); var q2 = q + 1; }));',
      'b();',
    ].join('\n')
    const result = repairOk(code, 'notfirst.js')
    expect(result.code).toContain('e((async () => { var q = 1; await dep()')
  })

  it('字符串 / 注释 / 正则字面量不被修改（旧盲正则会误伤的形态）', () => {
    const code = [
      'import { n as e } from "./rolldown-runtime-ABC.js";',
      'var s1 = "() => { await fake }";',
      "var s2 = 'x => await y';",
      '/* () => { await inBlockComment } */',
      'var re = /}\\{await/;',
      'var dep = e((async () => 1));',
      'var b = e((() => { await dep(); }));',
      'b();',
    ].join('\n')
    const result = repairOk(code, 'strings.js')
    expect(result.repaired).toBe(1)
    expect(result.code).toContain('"() => { await fake }"')
    expect(result.code).toContain("'x => await y'")
    expect(result.code).toContain('/* () => { await inBlockComment } */')
    expect(result.code).toContain('var re = /}\\{await/;')
  })

  it('不支持的破损形态（getter 内 await）明确失败，不产出错误补丁', () => {
    const code = [
      'import { n as e } from "./rolldown-runtime-ABC.js";',
      'var obj = { get x() { await 1; } };',
    ].join('\n')
    expect(() => repairRolldownAsyncMarks(code, 'getter.js')).toThrow(/无法安全定位包裹函数头|无法定位破损 await/)
  })
})
