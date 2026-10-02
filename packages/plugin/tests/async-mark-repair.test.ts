/**
 * V8-ASYNC-FIX：rolldown（vite 8）漏标 async 的初始化包装修复。
 *
 * 破损样本取自 JeecgBoot（vue 3.5 / vite 8.1.4 / rolldown 1.1.5）实机构建：
 * 插件 TLA 协商门面使路由模块初始化异步化后，与用户代码既有循环依赖
 * （electron 工具模块 ⇄ 路由模块）相遇，rolldown 为循环另一侧生成的包装漏标 async。
 */
import { describe, expect, it } from 'vitest'
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

const parse = (input: string): unknown => input

describe('repairRolldownAsyncMarks（V8-ASYNC-FIX）', () => {
  it('正常产物零改动（返回 null，不做任何解析/改写）', () => {
    const ok = [
      'import { n as e } from "./rolldown-runtime-ABC.js";',
      'const m = await loadShare("vue");',
      'export const x = m.default;',
      'var init = __esmMin((async () => { await other(); }));',
    ].join('\n')
    expect(repairRolldownAsyncMarks(ok, parse, 'ok.js')).toBeNull()
  })

  it('无 rolldown-runtime 引用的 chunk 直接跳过', () => {
    const noRuntime = 'var f = () => { await g(); };'
    expect(repairRolldownAsyncMarks(noRuntime, parse, 'plain.js')).toBeNull()
  })

  it('非 async 语法错误不拦截（原样交构建管线报错）', () => {
    const other = 'import x from "./rolldown-runtime-ABC.js";\nvar = broken;'
    expect(repairRolldownAsyncMarks(other, parse, 'other.js')).toBeNull()
  })

  it.each([
    ['esmMin 形态', BROKEN_ESM_MIN],
    ['模块包装形态', BROKEN_MODULE_WRAP],
  ])('%s：签名修复后语法合法且保留 await 时序', (_name, broken) => {
    const result = repairRolldownAsyncMarks(broken, parse, 'router.js')
    expect(result).not.toBeNull()
    expect(result!.repaired).toBeGreaterThanOrEqual(1)
    // 修复点：箭头体首 token 是 await 的包装必须带 async（正确包装的既有形态）
    expect(result!.code).toMatch(/__esmMin\(\(async \(\) => \{|e\(\(async\(\)=>\{/)
    // 非破损的既有 async 包装保持原样（不被二次改写）
    expect(result!.code).not.toContain('async(async')
  })

  it('模块包装形态：破损包装补 async，同 chunk 正确包装不被误改', () => {
    const result = repairRolldownAsyncMarks(BROKEN_MODULE_WRAP, parse, 'router.js')
    expect(result!.code).toContain('b=e((async ()=>{await $()')
    expect(result!.code).toContain('$=e((async()=>{b(),await He()')
  })
})
