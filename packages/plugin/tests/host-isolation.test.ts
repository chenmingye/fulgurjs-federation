/**
 * 5.2.1 回归：宿主（remotes>0）构建把运行时与共享门面隔离进插件专属 chunk。
 * 覆盖三种用户 manualChunks 形态：函数 / 对象（jeecg 系常用）/ 未配置。
 * 动机：MES admin 实测——运行时代码被默认归组进巨型 vendor chunk 后，
 * vite-plugin-top-level-await 的全 chunk swc 变换在压缩产物上 printSync 崩溃。
 */
import { describe, expect, it } from 'vitest'
import { federation } from '../src/index'

async function buildExtra(options: any, manualChunks?: unknown) {
  const pluginList = federation(options)
  const pre = pluginList[0]
  const extra = await (pre as any).config(
    {
      root: '/x',
      build: manualChunks === undefined ? {} : { rollupOptions: { output: { manualChunks } } },
    },
    { command: 'build' },
  )
  return extra
}

const base = {
  name: 't',
  remotes: { r: { dev: 'http://localhost:5101', prod: '/r' } },
  shared: { vue: { version: '3.5.0' } },
}

describe('5.2.1: 宿主运行时/门面 chunk 隔离', () => {
  it('未配置 manualChunks：注入专属 chunk 函数', async () => {
    const extra = await buildExtra(base)
    const fn = extra.build.rollupOptions.output.manualChunks
    expect(typeof fn).toBe('function')
    expect(fn('virtual:fulgurjs-runtime')).toBe('fulgurjs-runtime')
    expect(fn('virtual:fulgurjs-shared:vue')).toMatch(/^fulgurjs-shared-/)
    expect(fn('/x/src/main.ts')).toBeUndefined()
  })

  it('函数形式 manualChunks：包装后插件判定优先，用户函数兜底', async () => {
    const extra = await buildExtra(base, (id: string) => (id.includes('vendor') ? 'vendor' : undefined))
    const fn = extra.build.rollupOptions.output.manualChunks
    expect(fn('virtual:fulgurjs-runtime')).toBe('fulgurjs-runtime')
    expect(fn('/x/node_modules/foo/vendor-ish.js')).toBe('vendor')
  })

  it('对象形式 manualChunks（jeecg 形态）：包装为等价函数，插件判定优先、包名前缀匹配回原组', async () => {
    const extra = await buildExtra(base, {
      'vue-vendor': ['vue', 'vue-router'],
      'antd-vue-vendor': ['ant-design-vue', '@ant-design/icons-vue'],
    })
    const fn = extra.build.rollupOptions.output.manualChunks
    expect(typeof fn).toBe('function')
    // 插件专属 chunk 优先
    expect(fn('virtual:fulgurjs-runtime')).toBe('fulgurjs-runtime')
    // 包名前缀匹配（非 scoped）
    expect(fn('/x/node_modules/.pnpm/vue@3.5.0/node_modules/vue/dist/vue.runtime.esm-bundler.js')).toBe('vue-vendor')
    // scoped 包
    expect(fn('/x/node_modules/@ant-design/icons-vue/index.js')).toBe('antd-vue-vendor')
    // 未列出模块回退默认分组
    expect(fn('/x/src/pages/Home.vue')).toBeUndefined()
  })
})
