import { afterEach, expect, it } from 'vitest'
import { transformSync } from 'esbuild'
import { genRuntimeProxyModule } from '../src/virtual'
import { RUNTIME_VERSION } from '../src/version'

const scope = globalThis as typeof globalThis & { __FULGURJS_RUNTIME__?: unknown }
const previous = scope.__FULGURJS_RUNTIME__
afterEach(() => {
  if (previous === undefined) delete scope.__FULGURJS_RUNTIME__
  else scope.__FULGURJS_RUNTIME__ = previous
})
function evaluateProxy() {
  const code = transformSync(genRuntimeProxyModule(), { format: 'cjs', target: 'es2022' }).code
  const module = { exports: {} }
  new Function('module', 'exports', code)(module, module.exports)
  return module.exports as { version: string; getRuntime: () => unknown; shareScopeMap: unknown }
}
it('开发API的version导出与包版本一致，初始化前不创建运行时', () => {
  delete scope.__FULGURJS_RUNTIME__
  const api = evaluateProxy()
  expect(api.version).toBe(RUNTIME_VERSION)
  expect(scope.__FULGURJS_RUNTIME__).toBeUndefined()
})
it('版本不依赖底层单例的非合同字段，getRuntime仍保留同一冻结实例', () => {
  const runtime = Object.freeze({ shareScopeMap: { default: {} } })
  scope.__FULGURJS_RUNTIME__ = runtime
  const api = evaluateProxy()
  expect(api.version).toBe(RUNTIME_VERSION)
  expect(api.getRuntime()).toBe(runtime)
  expect(api.shareScopeMap).toBe(runtime.shareScopeMap)
  expect(Object.keys(runtime)).toEqual(['shareScopeMap'])
})
