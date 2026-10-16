/** 消费方工厂动态加载统一入口时，SDK 不得与消费方合并造成 TLA 自等待。 */
import { expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { federation } from '../src/index'

it('Rollup 将 SDK 与 application 分开，保留动态公开入口和共享门面', async () => {
  const fixture = path.resolve(__dirname, '../../../fixtures/host-vue')
  const root = fs.mkdtempSync(path.join(fixture, '.sdk-isolation-'))
  try {
    // 使用真实发布布局：SDK 位于 node_modules 下；不借源码 alias 掩盖归组分支。
    const sdk = path.join(root, 'node_modules/@fulgurjs/federation')
    fs.mkdirSync(sdk, { recursive: true })
    fs.copyFileSync(path.resolve(__dirname, '../package.json'), path.join(sdk, 'package.json'))
    fs.cpSync(path.resolve(__dirname, '../dist'), path.join(sdk, 'dist'), { recursive: true })
    fs.mkdirSync(path.join(root, 'src'))
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ type: 'module', dependencies: { vue: '^3.5.0' } }))
    fs.writeFileSync(path.join(root, 'index.html'), '<script type="module" src="/src/main.ts"></script>')
    fs.writeFileSync(path.join(root, 'src/main.ts'), "import app from './application'; globalThis.__testApplication = app")
    fs.writeFileSync(path.join(root, 'src/application.ts'), `
      import { defineApplication } from '@fulgurjs/federation/vue';
      export default defineApplication(async () => {
        const { createApp } = await import('vue');
        const { getAppContext } = await import('@fulgurjs/federation/vue');
        globalThis.__testContext = getAppContext();
        return createApp({ render: () => null });
      });
    `)
    const { build } = await import(pathToFileURL(path.join(fixture, 'node_modules/vite/dist/node/index.js')).href)
    const result = await build({
      root, configFile: false, logLevel: 'silent',
      plugins: [federation({ name: 'sdk-isolation', dts: false, remotes: { other: { prod: '/other', dev: 'http://localhost:5999' } }, exposes: { './bridge': './src/application.ts' }, shared: { vue: { singleton: true } } })],
      build: { write: false, target: 'es2022', minify: false, rollupOptions: { treeshake: false } },
    })
    const chunks = (Array.isArray(result) ? result : [result]).flatMap((r: { output: Array<{ type: string; modules?: Record<string, unknown>; fileName: string }> }) => r.output).filter((c: { type: string }) => c.type === 'chunk')
    const appChunk = chunks.find((c: { modules?: Record<string, unknown> }) => Object.keys(c.modules ?? {}).some(id => id.endsWith('/src/application.ts')))
    expect(appChunk).toBeDefined()
    const sdkChunks = chunks.filter((c: { modules?: Record<string, unknown> }) => Object.keys(c.modules ?? {}).some(id => id.includes('/node_modules/@fulgurjs/federation/')))
    expect(sdkChunks.length).toBeGreaterThan(0)
    for (const chunk of sdkChunks) {
      expect(chunk.fileName).not.toBe(appChunk!.fileName)
      expect(chunk.fileName).toContain('fulgurjs-internal-')
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
}, 60000)
