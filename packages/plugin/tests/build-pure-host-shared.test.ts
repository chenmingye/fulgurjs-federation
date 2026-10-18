/**
 * 纯宿主（remotes>0、无 exposes）+ 用户 manualChunks 的构建回归。
 *
 * 缺陷：build 下曾对纯宿主自身源码也做 shared 门面化，而 node_modules 闸门（allowNodeModules）
 * 只放行 devSharedSelf/纯 remote，于是宿主源码里的 vue 走 TLA 门面、依赖包里的 vue 走本地
 * 副本，会产生两条不同消费路径；本测试只锁定构建与提供方注册合同，
 * 不用具体页面文本异常推断运行时实例身份。修复后纯宿主自身源码
 * 与 dev 一样保持本地 import，产物不应出现消费门面 chunk。
 */
import { describe, expect, it } from 'vitest'
import { build } from 'vite'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { federation } from '../src/index'

const FIXTURE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../fixtures/host-vue')

describe('纯宿主 + manualChunks 构建不产生自身 shared 门面', () => {
  it('宿主源码保持本地 vue import；仅注册共享提供方', { timeout: 120_000 }, async () => {
    const root = fs.mkdtempSync(path.join(FIXTURE, '.pure-host-build-'))
    try {
      fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'pure-host', private: true, type: 'module' }))
      fs.mkdirSync(path.join(root, 'src'), { recursive: true })
      fs.writeFileSync(path.join(root, 'index.html'), '<!doctype html><html><body><div id="app"></div><script type="module" src="/src/main.ts"></script></body></html>')
      fs.writeFileSync(path.join(root, 'src/main.ts'), [
        `import { createApp, ref } from 'vue'`,
        `const app = createApp({ setup() { return () => null } })`,
        `void ref`,
        `void app`,
      ].join('\n'))
      const outDir = path.join(root, 'dist')
      await build({
        root,
        configFile: false,
        logLevel: 'error',
        plugins: [
          federation({
            name: 'pure-host',
            remotes: { 'remote-a': 'http://127.0.0.1:9/remoteEntry.js' },
            shared: { vue: { singleton: true, requiredVersion: '^3.5.0' } },
          }),
        ],
        build: {
          outDir,
          emptyOutDir: true,
          minify: false,
          rollupOptions: { output: { manualChunks: { 'vue-vendor': ['vue'] } } },
        },
      })
      const assetsDir = path.join(outDir, 'assets')
      const files = fs.readdirSync(assetsDir)
      const sharedFacades = files.filter((f) => /^fulgurjs-shared-vue-.*\.js$/.test(f))
      const providers = files.filter((f) => /^fulgurjs-provider-vue-.*\.js$/.test(f))
      expect(sharedFacades.length, `不应有消费门面 chunk：${sharedFacades.join(',')}`).toBe(0)
      expect(providers.length, `提供方 chunk 应唯一：${providers.join(',')}`).toBeLessThanOrEqual(1)
      const mainChunk = files.find((f) => f.endsWith('.js') && !f.startsWith('fulgurjs-'))
      expect(mainChunk).toBeTruthy()
      const main = fs.readFileSync(path.join(assetsDir, mainChunk!), 'utf8')
      expect(main).not.toContain('virtual:fulgurjs-shared:vue')
      // 提供方必须直接返回宿主本地 vue 实例并标记 loaded（否则远程懒加载 fallback 产生第二份 Vue）
      expect(main).toContain('loaded: true')
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})
