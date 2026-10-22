import { describe, expect, it } from 'vitest'
import { parseAst } from 'vite'
import { tagVueRuntime } from '../src/vue-runtime-evidence'

describe('编译 SFC 的真实导入证据', () => {
  it('保留原组件身份和引用；元数据不枚举，不执行 Vue 导入函数', () => {
    const original = 'import { ref as vueRef } from "vue"; const component = {}; export default component;'
    const transformed = tagVueRuntime(original, parseAst)!
    // Run the transformed module's actual export expression, injecting the imported binding.
    const body = transformed.code.replace('import { ref as vueRef } from "vue";', '').replace('export default ', 'return ')
    const ref = () => { throw new Error('证据收集不得调用 Vue 函数') }
    const result = new Function('vueRef', body)(ref)
    expect(Object.keys(result)).toEqual([])
    expect(result[Symbol.for('fulgurjs.vue-runtime')]).toEqual({ key: 'ref', value: ref })
    expect(tagVueRuntime(transformed.code, parseAst)).toBeNull()
  })

  it('冻结组件、未知语法与非 Vue 导入不破坏原有行为', () => {
    const frozen = 'import { openBlock as block } from "vue"; export default Object.freeze({name:"Frozen"});'
    const transformed = tagVueRuntime(frozen, parseAst)!
    const body = transformed.code.replace('import { openBlock as block } from "vue";', '').replace('export default ', 'return ')
    expect(new Function('block', body)(() => {})).toEqual({ name: 'Frozen' })
    expect(tagVueRuntime('import {ref} from "other-library"; export default {}', parseAst)).toBeNull()
    expect(tagVueRuntime('invalid syntax !', parseAst)).toBeNull()
  })
})

it('生产脚本子请求上的 SFC 默认导出也携带证据', async () => {
  const [{ build }, { federation }, fs, path] = await Promise.all([
    import('vite'), import('../src/index'), import('node:fs'), import('node:path'),
  ])
  const root = fs.mkdtempSync(path.resolve(import.meta.dirname, '../.sfc-evidence-'))
  try {
    fs.writeFileSync(path.join(root, 'package.json'), '{"name":"sfc-evidence","type":"module"}')
    fs.writeFileSync(path.join(root, 'index.html'), '<script type="module" src="/main.js"></script>')
    fs.writeFileSync(path.join(root, 'main.js'), 'import C from "./Probe.vue"; console.log(C)')
    fs.writeFileSync(path.join(root, 'Probe.vue'), '<script setup>/* compiler input */</script>')
    const result = await build({
      root, configFile: false, logLevel: 'silent',
      plugins: [{
        // Reproduce the compiler's real split-module protocol rather than one inline .vue module.
        name: 'split-sfc-compiler-contract',
        load(id) {
          if (id.endsWith('Probe.vue?vue&type=script&setup=true&lang.ts')) {
            return 'import {ref} from "vue"; export default {setup(){return {value:ref(1)}}}'
          }
        },
        transform(_code, id) {
          if (id.endsWith('Probe.vue')) return 'export {default} from "./Probe.vue?vue&type=script&setup=true&lang.ts"'
        },
      }, federation({name:'sfc-evidence', exposes:{'./Probe':'./Probe.vue'}, dts:false})],
      build: { write: false, minify: false, target: 'es2022' },
    })
    const outputs = Array.isArray(result) ? result : [result]
    const chunks = outputs.flatMap(output => 'output' in output ? output.output : [])
    expect(chunks.some(chunk => chunk.type === 'chunk' && chunk.code.includes('fulgurjs.vue-runtime') && chunk.code.includes('Object.defineProperty'))).toBe(true)
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})
