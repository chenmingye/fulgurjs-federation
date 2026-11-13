// @vitest-environment jsdom
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { compileScript, parse } from 'vue/compiler-sfc'
import * as Vue from 'vue'
import type { Component } from 'vue'
import { expect, it } from 'vitest'

it('真实Vue详情模板在同一组件实例内响应新的路由参数与query属性', async () => {
  const filename = path.resolve(import.meta.dirname, '../../../examples/templates/vue-vue/remote/src/fulgurjs/exposes/pages/DetailPage.vue')
  const { descriptor } = parse(fs.readFileSync(filename, 'utf8'), { filename })
  const compiled = compileScript(descriptor, { id: 'template-detail', inlineTemplate: true })
  const code = ts.transpileModule(compiled.content, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const evaluated = { exports: {} as { default: Component } }
  new Function('require', 'module', 'exports', code)((name: string) => {
    if (name !== 'vue') throw new Error(`意外的模板依赖：${name}`)
    return Vue
  }, evaluated, evaluated.exports)
  const props = Vue.reactive({ id: '7', tab: 'basic' })
  const element = document.createElement('div')
  document.body.append(element)
  const app = Vue.createApp({ setup: () => () => Vue.h(evaluated.exports.default, props) })
  try {
    app.mount(element)
    expect(element.querySelector('[data-testid="demo-detail-id"]')?.textContent).toContain('7')
    props.id = '9'
    props.tab = 'changed'
    await Vue.nextTick()
    expect(element.querySelector('[data-testid="demo-detail-id"]')?.textContent).toContain('9')
    expect(element.querySelector('[data-testid="demo-detail-tab"]')?.textContent).toContain('changed')
  } finally {
    app.unmount()
    element.remove()
  }
})
