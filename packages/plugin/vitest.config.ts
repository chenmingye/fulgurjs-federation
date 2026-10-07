import { createRequire } from 'node:module'
import { defineConfig } from 'vitest/config'

const require = createRequire(import.meta.url)

export default defineConfig({
  resolve: {
    // 示例源码的回归也使用测试工程的 Vue，不要求 CI 先安装模板依赖。
    alias: [{ find: /^vue$/, replacement: require.resolve('vue') }],
  },
})
