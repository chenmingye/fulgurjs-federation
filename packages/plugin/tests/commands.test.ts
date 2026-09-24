/**
 * federationOptionsForApp（§3.4 单配置驱动）与 CLI explain/check-pages（§12.2/§12.3）单测。
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { federationOptionsForApp, defineRepoConfig, type RepoConfig } from '../src/config'
import { explainApp, formatExplain, checkPages, formatCheckPages } from '../src/commands'

const cfg: RepoConfig = defineRepoConfig({
  root: '/repo',
  apps: [
    {
      path: 'apps/host',
      name: 'host-app',
      port: 5173,
      base: '/',
      host: {
        remotePrefixes: { '/remote-a/': 'remote-a' },
        remotes: { 'remote-a': { dev: 'http://localhost:5174/remote-a', prod: '/remote-a' } },
        pages: [{ route: '/remote-a/home', name: 'Home', title: '首页' }],
      },
    },
    {
      path: 'apps/remote-a',
      name: 'remote-a',
      port: 5174,
      base: '/remote-a',
      remote: {
        exposes: { './pages/remote-a/home': './src/views/Home.vue' },
        setup: './src/fulgurjs/setup.ts',
      },
      shared: { vue: { singleton: true } },
    },
    {
      path: 'apps/dual',
      name: 'dual-app',
      port: 5175,
      base: '/dual',
      host: {
        remotePrefixes: { '/remote-a/': 'remote-a' },
        remotes: { 'remote-a': { dev: 'http://localhost:5174/remote-a', prod: '/remote-a' } },
      },
      remote: {
        exposes: { './Form': './src/Form.vue' },
        remotes: { 'remote-a': { dev: 'http://localhost:5174/remote-a', prod: '/remote-a' } },
      },
    },
  ],
})

describe('federationOptionsForApp：转换与校验', () => {
  it('远程应用：name/exposes/setup/shared 逐字段转换；devSharedSelf 推断 true', () => {
    const o = federationOptionsForApp(cfg, 'remote-a')
    expect(o.name).toBe('remote-a')
    expect(o.exposes).toEqual({ './pages/remote-a/home': './src/views/Home.vue' })
    expect(o.setup).toBe('./src/fulgurjs/setup.ts')
    expect(o.shared).toEqual({ vue: { singleton: true } })
    expect(o.devSharedSelf).toBe(true)
  })

  it('按容器名或目录名匹配均可', () => {
    expect(federationOptionsForApp(cfg, 'apps/remote-a').name).toBe('remote-a')
    expect(federationOptionsForApp(cfg, 'remote-a').name).toBe('remote-a')
  })

  it('纯宿主：remotes 转换 + devSharedSelf 推断 false', () => {
    const o = federationOptionsForApp(cfg, 'host-app')
    expect(o.remotes).toEqual({ 'remote-a': { dev: 'http://localhost:5174/remote-a', prod: '/remote-a' } })
    expect(o.exposes).toBeUndefined()
    expect(o.devSharedSelf).toBe(false)
  })

  it('双角色：宿主+反向 remotes 合并；同键不同地址报错（带两边值）', () => {
    const o = federationOptionsForApp(cfg, 'dual-app')
    expect(o.remotes!['remote-a']).toBeDefined()
    expect(o.exposes).toEqual({ './Form': './src/Form.vue' })
    expect(o.devSharedSelf).toBe(true)
    const bad: RepoConfig = {
      ...cfg,
      apps: [
        ...cfg.apps,
        {
          path: 'apps/bad',
          name: 'bad-app',
          port: 5176,
          base: '/bad',
          host: { remotePrefixes: {}, remotes: { 'remote-a': { dev: 'http://x1', prod: '/p1' } } },
          remote: { exposes: { './X': './x.vue' }, remotes: { 'remote-a': { dev: 'http://x2', prod: '/p1' } } },
        },
      ],
    }
    expect(() => federationOptionsForApp(bad, 'bad-app')).toThrow(/remote-a[\s\S]*host\.remotes[\s\S]*remote\.remotes/)
  })

  it('未知应用：报错并列出可用应用', () => {
    expect(() => federationOptionsForApp(cfg, 'nope')).toThrow(/nope[\s\S]*apps\/host[\s\S]*remote-a/)
  })

  it('显式 devSharedSelf 覆盖推断', () => {
    const explicit: RepoConfig = { ...cfg, apps: [{ ...cfg.apps[0]!, devSharedSelf: true }] }
    expect(federationOptionsForApp(explicit, 'host-app').devSharedSelf).toBe(true)
  })
})

// ── explain / check-pages（经临时配置文件走真实 loadRepoConfig）────────────────

function writeTempConfig(content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fulgurjs-cmd-'))
  const p = path.join(dir, 'fulgurjs.config.ts')
  fs.writeFileSync(p, content)
  return p
}

const TEMP_CONFIG = `
import { defineRepoConfig } from ${JSON.stringify(path.resolve('dist/config.js'))}
export default defineRepoConfig({
  root: ${JSON.stringify(process.cwd() + '/..')},
  apps: [
    {
      path: 'fixtures/host-vue', name: 'host-vue', port: 5110, base: '/host-vue',
      host: {
        remotePrefixes: { '/remote-a/': 'remote-a' },
        remotes: { 'remote-a': { dev: 'http://localhost:5101/remote-a', prod: '/remote-a' } },
        pages: [
          { route: '/remote-a/home', name: 'Home', title: '首页' },
          { route: '/remote-a/detail/:id', name: 'Detail', spec: 'pages/remote-a/detail', title: '详情' },
        ],
      },
    },
    {
      path: 'fixtures/remote-a', name: 'remote-a', port: 5101, base: '/remote-a',
      remote: { exposes: { './pages/remote-a/home': './src/views/Home.vue', './pages/remote-a/detail': './src/views/Detail.vue' }, setup: './src/fulgurjs/setup.ts' },
    },
  ],
})
`

describe('fulgurjs explain（§12.2）', () => {
  it('输出角色/remotes/exposes/setup/shared/devSharedSelf 来源/页面映射/加载链', async () => {
    const p = writeTempConfig(TEMP_CONFIG)
    const r = await explainApp(p, 'host-vue')
    expect(r.role).toBe('host')
    expect(r.remotes[0]!.key).toBe('remote-a')
    expect(r.devSharedSelf).toEqual({ value: false, source: 'inferred' })
    expect(r.pages).toHaveLength(2)
    expect(r.pages[1]!.spec).toBe('remote-a/pages/remote-a/detail')
    const text = formatExplain(r)
    expect(text).toContain('宿主')
    expect(text).toContain('加载链')
    const remote = await explainApp(p, 'remote-a')
    expect(remote.setup).toBe('./src/fulgurjs/setup.ts')
    expect(remote.devSharedSelf.value).toBe(true)
    expect(remote.role).toBe('remote')
    expect(remote.chain.join('\n')).toContain('setup')
    fs.rmSync(path.dirname(p), { recursive: true, force: true })
  })

  it('未知应用报可用清单', async () => {
    const p = writeTempConfig(TEMP_CONFIG)
    await expect(explainApp(p, 'nope')).rejects.toThrow(/nope/)
    fs.rmSync(path.dirname(p), { recursive: true, force: true })
  })
})

describe('fulgurjs check-pages（§12.3）', () => {
  function scenario(pagesSnippet: string): { configPath: string; dir: string } {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fulgurjs-cp-'))
    const remoteDist = path.join(dir, 'fixtures/remote-a/dist')
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
import { defineRepoConfig } from ${JSON.stringify(path.resolve('dist/config.js'))}
export default defineRepoConfig({
  root: ${JSON.stringify(dir)},
  apps: [
    {
      path: 'fixtures/host-vue', name: 'host-vue', port: 5110, base: '/host-vue',
      host: {
        remotePrefixes: { '/remote-a/': 'remote-a' },
        remotes: { 'remote-a': { dev: 'http://localhost:5101/remote-a', prod: '/remote-a' } },
        deriveSpec: (route: string) => 'pages/remote-a/' + route.split('/').filter(Boolean).slice(1).filter((s) => !s.startsWith(':')).join('/'),
        pages: ${pagesSnippet},
      },
    },
    {
      path: 'fixtures/remote-a', name: 'remote-a', port: 5101, base: '/remote-a',
      remote: { exposes: { './pages/remote-a/home': './src/views/Home.vue' } },
    },
  ],
})
`,
    )
    return { configPath, dir }
  }

  it('spec 与远程 manifest exposes 一致 → 通过（failed=false，零 error）', async () => {
    const { configPath, dir } = scenario(
      `[
        { route: '/remote-a/home', name: 'Home' },
        { route: '/remote-a/detail/:id', name: 'Detail', spec: 'pages/remote-a/detail' },
      ]`,
    )
    const r = await checkPages(configPath, 'host-vue')
    expect(r.failed).toBe(false)
    expect(r.checked).toBe(2)
    expect(r.issues).toHaveLength(0)
    expect(formatCheckPages(r)).toContain('一致')
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('spec 拼错 → 确定性 error（报告页面/远程/实际 exposes），failed=true 对应 CLI 非零退出', async () => {
    const { configPath, dir } = scenario(
      `[
        { route: '/remote-a/home', name: 'Home' },
        { route: '/remote-a/detail/:id', name: 'Detail', spec: 'pages/WRONG' },
      ]`,
    )
    const r = await checkPages(configPath, 'host-vue')
    expect(r.failed).toBe(true)
    const err = r.issues.find((i) => i.level === 'error' && i.message.includes('pages/WRONG'))
    expect(err!.message).toContain('remote-a')
    expect(err!.message).toContain('pages/remote-a/home')
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('远程 manifest 不可得 → unverified（不算通过也不算失败）', async () => {
    const { configPath, dir } = scenario(`[{ route: '/remote-a/home', name: 'Home' }]`)
    fs.rmSync(path.join(dir, 'fixtures/remote-a/dist'), { recursive: true, force: true })
    const r = await checkPages(configPath, 'host-vue')
    expect(r.failed).toBe(false)
    expect(r.issues.some((i) => i.level === 'unverified' && i.message.includes('manifest 不可得'))).toBe(true)
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('仓库配置无页面表 → unverified 引导（pages 可选，应用代码为运行时真源）', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fulgurjs-cp-'))
    const configPath = path.join(dir, 'fulgurjs.config.ts')
    fs.writeFileSync(
      configPath,
      `
import { defineRepoConfig } from ${JSON.stringify(path.resolve('dist/config.js'))}
export default defineRepoConfig({
  root: ${JSON.stringify(dir)},
  apps: [{ path: 'a', name: 'a', port: 1, base: '/a', host: { remotePrefixes: { '/x/': 'x' }, remotes: {} } }],
})
`,
    )
    const r = await checkPages(configPath, 'a')
    expect(r.failed).toBe(false)
    expect(r.issues[0]!.level).toBe('unverified')
    fs.rmSync(dir, { recursive: true, force: true })
  })
})
