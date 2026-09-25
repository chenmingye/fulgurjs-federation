/**
 * 单项目配置契约（4.2.0 默认形态）单测：
 * loadAppConfig（esbuild bundle 加载 + 形状自动识别 + 校验）、roleOfOptions、
 * explain/check-pages 的单项目模式（双角色判定、manifest 来源、--require-verified）。
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { loadAppConfig, roleOfOptions } from '../src/app-config'
import { explainApp, formatExplain, checkPages, formatCheckPages } from '../src/commands'
import type { FederationOptions } from '../src/options'

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'fulgurjs-appcfg-'))
}

/** 单项目 fixture：应用根含 fulgurjs.config.ts + 相对导入的纯数据模块 pages.data.ts */
function writeAppFixture(dir: string, opts: { exposes?: Record<string, string>; extra?: string } = {}): string {
  const dataDir = path.join(dir, 'src/fulgurjs/host')
  fs.mkdirSync(dataDir, { recursive: true })
  fs.writeFileSync(
    path.join(dataDir, 'pages.data.ts'),
    `export const remotePrefixes = { '/remote-a/': 'remote-a' }\n` +
      `export const deriveSpec = (route: string) => 'pages/' + route.replace(/^\\/remote-a\\//, '')\n` +
      `export const pages = [\n  { route: '/remote-a/home', name: 'Home', title: '首页' },\n  { route: '/remote-a/detail/:id', name: 'Detail', spec: 'pages/detail' },\n]\n`,
  )
  fs.mkdirSync(path.join(dir, 'src/views'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'src/views/Home.vue'), '<template><div /></template>\n')
  const exposes = opts.exposes ?? { './pages/remote-a/home': './src/views/Home.vue' }
  fs.writeFileSync(
    path.join(dir, 'fulgurjs.config.ts'),
    `import type { FederationOptions } from '@fulgurjs/federation'\n` +
      `import { pages, remotePrefixes, deriveSpec } from './src/fulgurjs/host/pages.data'\n` +
      (opts.extra ?? '') +
      `export default {\n` +
      `  name: 'my-app',\n` +
      `  exposes: ${JSON.stringify(exposes)},\n` +
      `  remotes: { 'remote-a': { dev: 'http://localhost:5101/remote-a', prod: '/remote-a' } },\n` +
      `  shared: { vue: { singleton: true } },\n` +
      `} satisfies FederationOptions\n` +
      `export const hostPages = { pages, remotePrefixes, deriveSpec }\n`,
  )
  return path.join(dir, 'fulgurjs.config.ts')
}

describe('loadAppConfig：单项目默认形态', () => {
  it('默认导出 = federation() 选项；相对导入的 pages.data 数据模块与 hostPages 具名导出可读', async () => {
    const dir = tmpDir()
    const p = writeAppFixture(dir)
    const r = await loadAppConfig(p)
    expect(r.kind).toBe('app')
    expect(r.appRoot).toBe(dir)
    expect(r.options!.name).toBe('my-app')
    expect(r.options!.exposes).toEqual({ './pages/remote-a/home': './src/views/Home.vue' })
    expect(r.hostPages!.pages).toHaveLength(2)
    expect(r.hostPages!.remotePrefixes).toEqual({ '/remote-a/': 'remote-a' })
    expect(r.hostPages!.deriveSpec!('/remote-a/home')).toBe('pages/home')
    expect(r.hostPages!.deriveSpec!('/remote-a/detail/:id')).toBe('pages/detail/:id')
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('无 hostPages 导出：options 正常加载、hostPages=undefined（纯远程不报错）', async () => {
    const dir = tmpDir()
    fs.mkdirSync(path.join(dir, 'src/views'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'src/views/Home.vue'), '<template><div /></template>\n')
    const p = path.join(dir, 'fulgurjs.config.ts')
    fs.writeFileSync(
      p,
      `import type { FederationOptions } from '@fulgurjs/federation'\n` +
        `export default {\n  name: 'my-app',\n  exposes: { './pages/remote-a/home': './src/views/Home.vue' },\n} satisfies FederationOptions\n`,
    )
    const r = await loadAppConfig(p)
    expect(r.kind).toBe('app')
    expect(r.options!.name).toBe('my-app')
    expect(r.hostPages).toBeUndefined()
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('旧聚合配置自动识别为 repo 形态（兼容）', async () => {
    const dir = tmpDir()
    const p = path.join(dir, 'fulgurjs.config.ts')
    fs.writeFileSync(
      p,
      `import { defineRepoConfig } from ${JSON.stringify(path.resolve('dist/config.js'))}\n` +
        `export default defineRepoConfig({\n  root: ${JSON.stringify(dir)},\n  apps: [{ path: 'a', name: 'a', port: 1, base: '/a', remote: { exposes: { './X': './x.ts' } } }],\n})\n`,
    )
    fs.writeFileSync(path.join(dir, 'x.ts'), 'export default 1\n')
    const r = await loadAppConfig(p)
    expect(r.kind).toBe('repo')
    expect(r.repo!.apps).toHaveLength(1)
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('配置文件缺失：报错带绝对路径', async () => {
    const dir = tmpDir()
    await expect(loadAppConfig(path.join(dir, 'nope.config.ts'))).rejects.toThrow(/配置文件不存在/)
    fs.rmSync(dir, { recursive: true, force: true })
  })
})

describe('loadAppConfig：校验（三段式报错）', () => {
  it('旧角色壳字段 host/remote → 指向拍平修法', async () => {
    const dir = tmpDir()
    const p = writeAppFixture(dir)
    fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace(`  shared: { vue: { singleton: true } },\n`, `  host: { remotePrefixes: {} },\n`))
    await expect(loadAppConfig(p)).rejects.toThrow(/host\/remote 内的字段拍平到顶层/)
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('聚合字段 root/apps 混入单项目文件 → 指向历史兼容章节', async () => {
    const dir = tmpDir()
    const p = writeAppFixture(dir)
    fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace(`  name: 'my-app',\n`, `  name: 'my-app',\n  root: '.',\n`))
    await expect(loadAppConfig(p)).rejects.toThrow(/旧聚合配置（root \+ apps\[\]/)
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('无 name → 报错', async () => {
    const dir = tmpDir()
    const p = writeAppFixture(dir)
    fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace(`  name: 'my-app',\n`, ''))
    await expect(loadAppConfig(p)).rejects.toThrow(/name/)
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('expose 指向不存在文件 → 报错带解析基准', async () => {
    const dir = tmpDir()
    const p = writeAppFixture(dir, { exposes: { './pages/x': './src/views/Missing.vue' } })
    await expect(loadAppConfig(p)).rejects.toThrow(/指向的文件不存在/)
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('expose 用绝对路径 → 报错（不可移植）', async () => {
    const dir = tmpDir()
    const p = writeAppFixture(dir, { exposes: { './pages/x': '/etc/passwd' } })
    await expect(loadAppConfig(p)).rejects.toThrow(/不是本项目内的模块路径/)
    fs.rmSync(dir, { recursive: true, force: true })
  })
})

describe('roleOfOptions：按实际 federation 选项判角色', () => {
  it('只消费 → host；只提供 → remote；既消费又提供 → dual（BPM 形态无需人为写 host 字段）', () => {
    expect(roleOfOptions({ name: 'h', remotes: { a: 'http://x' } })).toBe('host')
    expect(roleOfOptions({ name: 'r', exposes: { './A': './a.ts' } })).toBe('remote')
    expect(roleOfOptions({ name: 'r', setup: './s.ts' })).toBe('remote')
    expect(
      roleOfOptions({ name: 'd', remotes: { a: 'http://x' }, exposes: { './A': './a.ts' } }),
    ).toBe('dual')
  })
})

describe('explain/check-pages：单项目模式', () => {
  it('explain：双角色（remotes+exposes）、页面映射来自 hostPages、加载链', async () => {
    const dir = tmpDir()
    const p = writeAppFixture(dir)
    const r = await explainApp(p)
    expect(r.mode).toBe('app')
    expect(r.role).toBe('dual')
    expect(r.app).toBe('my-app')
    expect(r.remotes[0]!.key).toBe('remote-a')
    expect(r.pages).toHaveLength(2)
    expect(r.pages[1]!.spec).toBe('remote-a/pages/detail')
    expect(r.pagesSource).toContain('hostPages')
    expect(r.chain.join('\n')).toContain('未配置 setup')
    const text = formatExplain(r)
    expect(text).toContain('双角色')
    expect(text).toContain('由 vite.config.ts 管理')
    // --app 与配置 name 不一致 → 显式报错
    await expect(explainApp(p, 'other')).rejects.toThrow(/不一致/)
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('check-pages：--manifest 显式来源命中；spec 拼错非零；来源在结果中可见', async () => {
    const dir = tmpDir()
    const p = writeAppFixture(dir)
    // 远程 manifest 本地产物（由 --manifest 显式指定，不经本地 dist 推导）
    const manifestPath = path.join(dir, 'remote-manifest.json')
    fs.writeFileSync(
      manifestPath,
      JSON.stringify({
        schemaVersion: 1,
        id: 'remote-a',
        name: 'remote-a',
        entry: 'fulgurjs-remoteEntry.js',
        exposes: { './pages/home': { file: 'home.js' }, './pages/detail': { file: 'detail.js' } },
        shared: [],
      }),
    )
    const r = await checkPages(p, undefined, { manifests: { 'remote-a': manifestPath } })
    expect(r.failed).toBe(false)
    expect(r.checked).toBe(2)
    expect(r.manifestSources![0]).toEqual({ remote: 'remote-a', from: manifestPath })
    expect(formatCheckPages(r)).toContain('manifest 来源')

    // spec 改错 → 确定性 error
    const dataPath = path.join(dir, 'src/fulgurjs/host/pages.data.ts')
    fs.writeFileSync(dataPath, fs.readFileSync(dataPath, 'utf8').replace("'pages/detail'", "'pages/WRONG'"))
    const bad = await checkPages(p, undefined, { manifests: { 'remote-a': manifestPath } })
    expect(bad.failed).toBe(true)
    expect(bad.issues.some((i) => i.level === 'error' && i.message.includes('pages/WRONG'))).toBe(true)

    // manifest 来源不可达 → unverified；--require-verified 置失败位
    const unv = await checkPages(p, undefined, { manifests: { 'remote-a': path.join(dir, 'missing.json') } })
    expect(unv.failed).toBe(false)
    expect(unv.issues[0]!.level).toBe('unverified')
    expect(unv.unverifiedFailed).toBe(false)
    const strict = await checkPages(p, undefined, { manifests: { 'remote-a': path.join(dir, 'missing.json') }, requireVerified: true })
    expect(strict.unverifiedFailed).toBe(true)
    // 有验证来源且全部命中时 --require-verified 不得误判失败（4.2.1 回归：开关位误当结果位）
    const strictOk = await checkPages(p, undefined, { manifests: { 'remote-a': manifestPath }, requireVerified: true })
    expect(strictOk.unverifiedFailed).toBe(false)
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('check-pages：前缀映射到未消费的远程 → 确定性 error', async () => {
    const dir = tmpDir()
    const p = writeAppFixture(dir)
    fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace(`  remotes: { 'remote-a': { dev: 'http://localhost:5101/remote-a', prod: '/remote-a' } },\n`, ''))
    const r = await checkPages(p)
    expect(r.failed).toBe(true)
    expect(r.issues[0]!.message).toContain('未消费')
    fs.rmSync(dir, { recursive: true, force: true })
  })
})

describe('类型面：单项目契约可 satisfies FederationOptions', () => {
  it('FederationOptions 从主包类型导出（编译期形状检查的依赖）', () => {
    const cfg: FederationOptions = { name: 'x', exposes: { './A': './a.ts' } }
    expect(cfg.name).toBe('x')
  })
})
