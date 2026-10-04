/**
 * CLI explain/check-pages（§12.2/§12.3）单测（5.0.0 起仅单项目配置形态；
 * 4.1.0 聚合链 federationOptionsForApp 的转换语义由 options.normalizeOptions 的
 * devSharedSelf 角色推断单测覆盖，见 setup-feature.test.ts）。
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { explainApp, formatExplain, checkPages, formatCheckPages, bridgeWarningsOf } from '../src/commands'

function writeTempConfig(content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fulgurjs-cmd-'))
  const p = path.join(dir, 'fulgurjs.config.ts')
  fs.writeFileSync(p, content)
  return p
}

/** 单项目宿主 fixture：默认导出 federation() 选项 + hostPages 具名导出 */
const HOST_CONFIG = `
import type { FederationOptions } from '@fulgurjs/federation'
export default {
  name: 'host-vue',
  remotes: { 'remote-a': { dev: 'http://localhost:5101/remote-a', prod: '/remote-a' } },
} satisfies FederationOptions
export const hostPages = {
  remotePrefixes: { '/remote-a/': 'remote-a' },
  pages: [
    { route: '/remote-a/home', name: 'Home', title: '首页' },
    { route: '/remote-a/detail/:id', name: 'Detail', spec: 'pages/remote-a/detail', title: '详情' },
  ],
}
`

const REMOTE_CONFIG = `
import type { FederationOptions } from '@fulgurjs/federation'
export default {
  name: 'remote-a',
  exposes: {
    './pages/remote-a/home': './src/views/Home.vue',
    './pages/remote-a/detail': './src/views/Detail.vue',
  },
  setup: './src/fulgurjs/setup.ts',
} satisfies FederationOptions
`

describe('fulgurjs explain（§12.2，单项目形态）', () => {
  it('宿主：输出角色/remotes/devSharedSelf 推断/页面映射/加载链', async () => {
    const p = writeTempConfig(HOST_CONFIG)
    const r = await explainApp(p)
    expect(r.role).toBe('host')
    expect(r.app).toBe('host-vue')
    expect(r.remotes[0]!.key).toBe('remote-a')
    expect(r.devSharedSelf).toEqual({ value: false, source: 'inferred' })
    expect(r.pages).toHaveLength(2)
    expect(r.pages[1]!.spec).toBe('remote-a/pages/remote-a/detail')
    const text = formatExplain(r)
    expect(text).toContain('宿主')
    expect(text).toContain('加载链')
    fs.rmSync(path.dirname(p), { recursive: true, force: true })
  })

  it('远程：setup 与 devSharedSelf=true 报告；无 hostPages 不报错', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fulgurjs-cmd-'))
    for (const f of ['./src/views/Home.vue', './src/views/Detail.vue', './src/fulgurjs/setup.ts']) {
      fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true })
      fs.writeFileSync(path.join(dir, f), 'export default 1\n')
    }
    fs.writeFileSync(path.join(dir, 'fulgurjs.config.ts'), REMOTE_CONFIG)
    const r = await explainApp(path.join(dir, 'fulgurjs.config.ts'))
    expect(r.setup).toBe('./src/fulgurjs/setup.ts')
    expect(r.devSharedSelf.value).toBe(true)
    expect(r.role).toBe('remote')
    expect(r.chain.join('\n')).toContain('setup')
    fs.rmSync(dir, { recursive: true, force: true })
  })
})

describe('fulgurjs check-pages（§12.3，单项目形态）', () => {
  function scenario(pagesSnippet: string, opts: { dropManifest?: boolean } = {}): { configPath: string; dir: string } {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fulgurjs-cp-'))
    const remoteDist = path.join(dir, 'remote-a-dist')
    fs.mkdirSync(remoteDist, { recursive: true })
    fs.writeFileSync(
      path.join(remoteDist, 'fulgurjs-manifest.json'),
      JSON.stringify({
        schemaVersion: 1,
        id: 'remote-a',
        name: 'remote-a',
        entry: 'fulgurjs-remoteEntry.js',
        exposes: {
          './pages/remote-a/home': { file: 'home.js' },
          './pages/remote-a/detail': { file: 'detail.js' },
        },
        shared: [],
      }),
    )
    const configPath = path.join(dir, 'fulgurjs.config.ts')
    fs.writeFileSync(
      configPath,
      `
import type { FederationOptions } from '@fulgurjs/federation'
export default {
  name: 'host-vue',
  remotes: { 'remote-a': { dev: 'http://localhost:5101/remote-a', prod: '/remote-a' } },
} satisfies FederationOptions
export const hostPages = {
  remotePrefixes: { '/remote-a/': 'remote-a' },
  deriveSpec: (route: string) => 'pages/remote-a/' + route.split('/').filter(Boolean).slice(1).filter((s) => !s.startsWith(':')).join('/'),
  pages: ${pagesSnippet},
}
`,
    )
    if (opts.dropManifest) fs.rmSync(remoteDist, { recursive: true, force: true })
    return { configPath, dir, ...(opts.dropManifest ? {} : { manifest: path.join(remoteDist, 'fulgurjs-manifest.json') }) }
  }

  it('spec 与远程 manifest exposes 一致 → 通过（failed=false，零 error）', async () => {
    const { configPath, dir, manifest } = scenario(
      `[
        { route: '/remote-a/home', name: 'Home' },
        { route: '/remote-a/detail/:id', name: 'Detail', spec: 'pages/remote-a/detail' },
      ]`,
    )
    const r = await checkPages(configPath, { manifests: { 'remote-a': manifest } })
    expect(r.failed).toBe(false)
    expect(r.checked).toBe(2)
    expect(r.issues).toHaveLength(0)
    expect(formatCheckPages(r)).toContain('一致')
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('spec 拼错 → 确定性 error（报告页面/远程/实际 exposes），failed=true 对应 CLI 非零退出', async () => {
    const { configPath, dir, manifest } = scenario(
      `[
        { route: '/remote-a/home', name: 'Home' },
        { route: '/remote-a/detail/:id', name: 'Detail', spec: 'pages/WRONG' },
      ]`,
    )
    const r = await checkPages(configPath, { manifests: { 'remote-a': manifest } })
    expect(r.failed).toBe(true)
    const err = r.issues.find((i) => i.level === 'error' && i.message.includes('pages/WRONG'))
    expect(err!.message).toContain('remote-a')
    expect(err!.message).toContain('pages/remote-a/home')
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('远程 manifest 不可得 → unverified（不算通过也不算失败；不回退本地 dist）', async () => {
    const { configPath, dir } = scenario(`[{ route: '/remote-a/home', name: 'Home' }]`, { dropManifest: true })
    const r = await checkPages(configPath, { manifests: { 'remote-a': path.join(dir, 'nope', 'fulgurjs-manifest.json') } })
    expect(r.failed).toBe(false)
    expect(r.issues.some((i) => i.level === 'unverified' && i.message.includes('manifest 不可得'))).toBe(true)
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('无 hostPages 具名导出 → unverified 引导（纯远程无需页面表）', async () => {
    const p = writeTempConfig(`
import type { FederationOptions } from '@fulgurjs/federation'
export default { name: 'a', remotes: { x: 'http://localhost:1/x' } } satisfies FederationOptions
`)
    const r = await checkPages(p)
    expect(r.failed).toBe(false)
    expect(r.issues[0]!.level).toBe('unverified')
    fs.rmSync(path.dirname(p), { recursive: true, force: true })
  })
})

describe('fulgurjs explain 桥接完备性 WARN（任务 D，纯本地启发式）', () => {
  it('桥接 React 子应用缺 react-dom singleton → WARN 指向 shared 修法', () => {
    const options = {
      name: 'bridge-react-remote',
      exposes: { './bridge': './src/bridge.tsx' },
      shared: { react: { singleton: true }, 'react-dom': { singleton: false } },
    } as never
    const warns = bridgeWarningsOf(options)
    expect(warns).toHaveLength(1)
    expect(warns[0]).toContain('react-dom')
    expect(warns[0]).toContain('singleton: true')
  })

  it('桥接 Vue 子应用 vue 非 singleton → WARN；未声明任何框架 → WARN', () => {
    const noSingleton = bridgeWarningsOf({
      name: 'bridge-vue-remote',
      exposes: { './bridge': './src/bridge.ts' },
      shared: { vue: { singleton: false } },
    } as never)
    expect(noSingleton[0]).toContain('shared.vue')
    const noFramework = bridgeWarningsOf({
      name: 'bridge-remote',
      exposes: { './bridge': './src/bridge.ts' },
    } as never)
    expect(noFramework[0]).toContain('未声明任何框架')
  })

  it('跨框架桥接宿主三键缺 singleton/漏键 → WARN；三键齐备不告警', () => {
    const missing = bridgeWarningsOf({
      name: 'bridge-host',
      remotes: { a: 'http://localhost:1/a' },
      shared: { vue: { singleton: true }, react: { singleton: true } },
    } as never)
    expect(missing[0]).toContain('未共享：react-dom')
    const ok = bridgeWarningsOf({
      name: 'bridge-host',
      remotes: { a: 'http://localhost:1/a' },
      shared: {
        vue: { singleton: true },
        react: { singleton: true },
        'react-dom': { singleton: true },
      },
    } as never)
    expect(ok).toHaveLength(0)
  })

  it('普通单框架配置不告警；explain 输出包含桥接完备性段落', async () => {
    expect(bridgeWarningsOf({ name: 'plain', remotes: { x: 'http://localhost:1/x' }, shared: { vue: { singleton: true } } } as never)).toHaveLength(0)
    const p = writeTempConfig(`
import type { FederationOptions } from '@fulgurjs/federation'
export default {
  name: 'bridge-react-remote',
  exposes: { './bridge': './src/bridge.tsx' },
  shared: { react: { singleton: true } },
} satisfies FederationOptions
`)
    // 配置加载器校验 expose 目标文件存在：补建桥接入口
    fs.mkdirSync(path.join(path.dirname(p), 'src'), { recursive: true })
    fs.writeFileSync(path.join(path.dirname(p), 'src/bridge.tsx'), 'export default {}\n')
    const r = await explainApp(p)
    expect(r.bridgeWarnings?.length).toBe(1)
    expect(formatExplain(r)).toContain('桥接完备性')
    fs.rmSync(path.dirname(p), { recursive: true, force: true })
  })
})
