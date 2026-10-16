import { expect, it } from 'vitest'
import path from 'node:path'
import { isTypesInputChange } from '../src/dts-serve'

it('提供方只重生成真实输入，不响应自身临时文件和同步声明', () => {
  const root = path.resolve('provider')
  const output = path.join(root, 'src/fulgurjs/types')
  for (const file of ['src/Form.vue', 'src/contracts.d.ts', 'tsconfig.json', 'src/data.json', 'src/api.mts', 'src/api.cts', 'src/Button.jsx', 'src/Page.tsx']) {
    expect(isTypesInputChange(root, path.join(root, file), output)).toBe(true)
  }
  for (const file of ['.fulgurjs-types-tsconfig-42-unique.json', 'src/fulgurjs/types/remote/metadata.json', 'node_modules/.fulgurjs-types-emit-x/a.d.ts', '.vite/cache.json']) {
    expect(isTypesInputChange(root, path.join(root, file), output)).toBe(false)
  }
  expect(isTypesInputChange(root, path.resolve('other/Form.vue'), output)).toBe(false)
  expect(isTypesInputChange(root, path.dirname(root), output)).toBe(false)
  // 不能把与输出目录名称相似的真实源码误过滤。
  expect(isTypesInputChange(root, path.join(root, 'src/fulgurjs/types-extra.ts'), output)).toBe(true)
  const custom = path.join(root, 'generated/contracts')
  expect(isTypesInputChange(root, path.join(custom, 'registry.d.ts'), custom)).toBe(false)
})

it('验收证据与说明文件不会给进行中的声明生成追加无意义任务', () => {
  const root = path.resolve('provider')
  const output = path.join(root, 'src/fulgurjs/types')
  for (const file of ['README.md', 'logs/typecheck.log', 'evidence/form.png', 'evidence/form.jpg', 'coverage/report.html', 'pnpm-lock.yaml']) {
    expect(isTypesInputChange(root, path.join(root, file), output)).toBe(false)
  }
})
