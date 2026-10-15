/** 实际 Vite 生产消费：统一入口的未用桥接实现应裁剪，插件初始化仍应保留。 */
import { afterEach, describe, expect, it } from 'vitest'
import { build } from 'vite'
import { federation } from '../src/index'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }) })
describe('生产按需裁剪', () => {
  it.each(['vue', 'react'] as const)('%s 纯组件不保留完整桥接实现；仍注入正式 runtime 初始化', { timeout: 30000 }, async framework => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fg-tree-build-'))); roots.push(root)
    fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}')
    fs.writeFileSync(path.join(root, 'index.html'), '<script type="module" src="/main.js"></script>')
    const entry = path.resolve(__dirname, '../dist/' + framework + '.js').replace(/\\/g, '/')
    fs.writeFileSync(path.join(root, 'main.js'), `import {remoteComponent} from ${JSON.stringify(entry)}; globalThis.__probe=remoteComponent('remote-a/Button')`)
    const result = await build({
      root, configFile: false, logLevel: 'silent',
      plugins: [federation({ name: 'size-probe', remotes: { 'remote-a': 'http://localhost:5174/remote-a' }, dts: false })],
      build: { write: false, minify: false, rollupOptions: { external: ['vue', 'react', 'react-dom', 'react-dom/client', 'vue-router', 'react-router-dom'] } },
    })
    const outputs = (Array.isArray(result) ? result : [result]).flatMap(r => 'output' in r ? r.output : [])
    const chunks = outputs.filter(o => o.type === 'chunk')
    const code = chunks.map(c => c.code).join('\n')
    expect(code).toContain('__FULGURJS_RUNTIME__')
    expect(code).not.toContain('function createVueBridgeAppWithLoader')
    expect(code).not.toContain('function createReactBridgeAppWithLoader')
    expect(code).not.toContain('function connectVueBridgeRouter')
    expect(code).not.toContain('function createReactBridgeRouter')
    expect(code).toContain('__probe')
    // 使用 chunk 的真实模块贡献守护，避免只依赖 minifier 的符号命名。
    const bridgeBytes = chunks.reduce((sum, chunk) => sum + Object.entries(chunk.modules).filter(([id]) => /\/bridge-(?:host|router)-/.test(id)).reduce((n, [, info]) => n + info.renderedLength, 0), 0)
    expect(bridgeBytes).toBe(0)
  })
})
