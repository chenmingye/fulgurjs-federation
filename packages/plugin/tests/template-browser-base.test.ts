// @vitest-environment jsdom
/** 从真实模板读取路由base表达式，再用真实框架history验证导航；不复制一份实现来断言自己。 */
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { transferableAbortController } from 'node:util'
import { createRouter, createWebHistory } from 'vue-router'
import { createBrowserRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

// jsdom的DOM Signal与Node原生Request不在同一realm；对齐真实HTTP环境，不替换路由实现。
beforeEach(() => vi.stubGlobal('AbortController', transferableAbortController().constructor))
afterEach(() => vi.unstubAllGlobals())
const root = path.resolve(import.meta.dirname, '../../../examples/templates')
const entries = [
  ['vue-vue/host/src/fulgurjs/host/application.ts', 'vue'],
  ['react-host-vue-remote/vue-remote/src/fulgurjs/exposes/application.ts', 'vue'],
  ['showcase/vue-host/src/fulgurjs/host/application.ts', 'vue'],
  ['showcase/vue-remote/src/fulgurjs/exposes/application.ts', 'vue'],
  ['react-react/host/src/fulgurjs/host/application.tsx', 'react'],
  ['vue-host-react-remote/react-remote/src/fulgurjs/exposes/application.tsx', 'react'],
  ['showcase/react-host/src/fulgurjs/host/application.tsx', 'react'],
  ['showcase/react-host/src/fulgurjs/host/routing.ts', 'react'],
  ['showcase/react-remote/src/fulgurjs/exposes/application.tsx', 'react'],
] as const
function expression(filename: string): string {
  const text = fs.readFileSync(filename, 'utf8')
  const source = ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true, filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  let selected: ts.Expression | undefined
  function walk(node: ts.Node): void {
    if (!selected && ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'createWebHistory') selected = node.arguments[0]
    if (!selected && ts.isPropertyAssignment(node) && node.name.getText(source) === 'basename') selected = node.initializer
    if (!selected && ts.isJsxAttribute(node) && node.name.getText(source) === 'basename' && node.initializer && ts.isJsxExpression(node.initializer)) selected = node.initializer.expression
    ts.forEachChild(node, walk)
  }
  walk(source)
  if (!selected) throw Error(`模板未找到真实路由base：${filename}`)
  if (ts.isIdentifier(selected)) {
    const name = selected.text
    let initializer: ts.Expression | undefined
    function binding(node: ts.Node): void {
      if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) initializer = node.initializer
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)
        && node.importClause.namedBindings.elements.some(item => item.name.text === name)) {
        // 同工程已有routing模块是共享配置的唯一来源，不创建测试替身。
        const dependency = path.resolve(path.dirname(filename), node.moduleSpecifier.text + '.ts')
        const dependencyText = fs.readFileSync(dependency, 'utf8')
        const parsed = ts.createSourceFile(dependency, dependencyText, ts.ScriptTarget.Latest, true)
        const find = (item: ts.Node): void => {
          if (ts.isVariableDeclaration(item) && item.name.getText(parsed) === name && item.initializer) {
            initializer = item.initializer
            selectedText = item.initializer.getText(parsed)
          }
          ts.forEachChild(item, find)
        }
        find(parsed)
      }
      ts.forEachChild(node, binding)
    }
    let selectedText: string | undefined
    binding(source)
    if (selectedText) return selectedText
    if (!initializer) throw Error(`模板base配置无法解析：${name}`)
    return initializer.getText(source)
  }
  return selected.getText(source)
}
for (const [entry, framework] of entries) {
  it.each([
    { asset: '/nested/', route: undefined, expected: '/nested/' },
    { asset: 'https://cdn.example.com/application/', route: undefined, expected: '/application/' },
    { asset: 'https://cdn.example.com/assets/', route: '/console/', expected: '/console/' },
  ])(`${entry}：资源base=$asset，独立路由base=$route`, async ({ asset, route, expected }) => {
    const code = expression(path.join(root, entry)).replace(/import\.meta\.env\b/g, 'env')
    const basename = new Function('env', `return (${code})`)({ BASE_URL: asset, VITE_ROUTER_BASE: route }) as string
    window.history.replaceState(null, '', expected)
    if (framework === 'vue') {
      const history = createWebHistory(basename)
      const router = createRouter({ history, routes: [{ path: '/:rest(.*)*', component: { template: '<div />' } }] })
      try { await router.push('/detail?text=中文#section-1') }
      finally { history.destroy() }
    } else {
      const router = createBrowserRouter([{ path: '*', element: null }], { basename })
      try { await router.navigate('/detail?text=中文#section-1') }
      finally { router.dispose() }
    }
    expect(window.location.pathname).toBe(`${expected.replace(/\/$/, '')}/detail`)
    expect(new URLSearchParams(window.location.search).get('text')).toBe('中文')
    expect(window.location.hash).toBe('#section-1')
  })
}
