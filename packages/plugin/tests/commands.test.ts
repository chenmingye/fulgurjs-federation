/**
 * CLI explain/check-pages（§12.2/§12.3）单测（5.0.0 起仅单项目配置形态；
 * 4.1.0 聚合链 federationOptionsForApp 的转换语义由 options.normalizeOptions 的
 * devSharedSelf 角色推断单测覆盖，见 setup-feature.test.ts）。
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { explainApp, formatExplain, checkPages, formatCheckPages } from '../src/commands'

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
