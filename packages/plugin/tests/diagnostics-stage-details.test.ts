/**
 * 诊断补强回归（D02/D07/D10/D17）：
 * - MFU-001 的 details.stage 区分 container（容器获取/初始化）与 expose（expose 求值），
 *   失败阶段可机器读取，不把两类失败混成一个通用报错。
 * - doctor --config 的 D02 正向风险：Vue 消费方未声明 shared.vue → WARN（不判 FAIL、
 *   不宣称双实例已证实）；声明后不再告警。
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { registerRemote, loadRemote } from '../src/runtime/index'
import { runSourceDoctor } from '../src/doctor-source'

describe('MFU-001 失败阶段 details.stage', () => {
  it('容器获取失败 → stage=container', async () => {
    registerRemote({
      name: 'stage-container-x',
      entry: '',
      retries: 0,
      timeout: 300,
      promise: async () => { throw new Error('connect ECONNREFUSED 127.0.0.1:5199') },
    })
    await expect(loadRemote('stage-container-x/./M')).rejects.toMatchObject({
      code: 'MFU-001',
      details: { stage: 'container', remote: 'stage-container-x' },
    })
  })

  it('expose 求值失败（container.get 拒绝）→ stage=expose，cause 保留底层异常', async () => {
    const original = new Error('Failed to fetch dynamically imported module http://x/chunk-1.js')
    const container = {
      name: 'stage-expose-x',
      init: async () => {},
      get: async () => { throw original },
    }
    registerRemote({ name: 'stage-expose-x', promise: async () => container, retries: 0, timeout: 1000 })
    const err = await loadRemote('stage-expose-x/./M').catch((e: unknown) => e) as Error & { code?: string; details?: Record<string, unknown> }
    expect(err.code).toBe('MFU-001')
    expect(err.details).toMatchObject({ stage: 'expose', remote: 'stage-expose-x', module: './M' })
    expect(String(err.message)).toContain('chunk-1.js')
  })
})

describe('doctor --config D02：Vue 消费但未声明 shared.vue', () => {
  let root = ''
  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'fg-doctor-d02-'))
  })
  afterAll(() => {
    rmSync(root, { recursive: true, force: true })
  })
  const write = (relative: string, content: string) => {
    const file = join(root, relative)
    mkdirSync(join(file, '..'), { recursive: true })
    writeFileSync(file, content)
    return file
  }
  const scaffoldVueApp = () => {
    write('vite.config.ts', "import { federation } from '@fulgurjs/federation'\nexport default {}\n")
    write('index.html', '<!doctype html><html><body><script type="module" src="/src/main.ts"></script></body></html>')
    write('src/main.ts', "import { createApp } from 'vue'\nimport App from './App.vue'\ncreateApp(App).mount('#app')\n")
    write('src/App.vue', '<template><p>host</p></template>')
  }

  it('有 remotes + 本地使用 vue + shared 未声明 vue → WARN，且不判 FAIL/不宣称双实例', async () => {
    scaffoldVueApp()
    const config = write('fulgurjs.config.ts', "export default { name: 'host', remotes: { r: { dev: 'http://localhost:5101/r', prod: '/r' } } }\n")
    const report = await runSourceDoctor(config)
    const warn = report.checks.find(c => c.item === 'shared.vue')
    expect(warn?.level).toBe('WARN')
    expect(warn?.symptom).toContain('未声明 vue')
    expect(warn?.cause).toContain('尚未证实')
    expect(report.failed).toBe(false)
  })

  it('声明 shared.vue 后不再出现该 WARN', async () => {
    scaffoldVueApp()
    const config = write('fulgurjs.config.ts', "export default { name: 'host', remotes: { r: { dev: 'http://localhost:5101/r', prod: '/r' } }, shared: { vue: { singleton: true } } }\n")
    const report = await runSourceDoctor(config)
    expect(report.checks.find(c => c.item === 'shared.vue' && c.level === 'WARN')).toBeUndefined()
  })

  it('manualChecks 含直渲染空白排查的观测边界说明', async () => {
    scaffoldVueApp()
    const config = write('fulgurjs.config.ts', "export default { name: 'host', remotes: { r: { dev: 'http://localhost:5101/r', prod: '/r' } } }\n")
    const report = await runSourceDoctor(config)
    expect(report.manualChecks.some(m => m.includes('模块导出成功') && m.includes('无 pageerror'))).toBe(true)
  })
})
