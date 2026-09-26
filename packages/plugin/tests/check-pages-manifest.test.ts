/**
 * check-pages manifest 来源与远程地址解析回归（4.2.1 复核 §2.2；5.0.0 起仅单项目形态）：
 * - 运行时支持的全部 remote 地址写法（目录 URL / 完整 remoteEntry URL / name@url /
 *   对象 dev+prod+external / 相对+绝对）都必须能推导出 manifest；
 * - 显式 --manifest / --site 指定来源失败时不回退本地旧 dist（unverified；严格模式非零）；
 * - 单项目形态无本地 dist 回退（远程可位于任意仓库）——本地 dist 不作为来源。
 *
 * fetch 用真实本地 HTTP 服务器模拟（不打全局桩——全局 fetch 桩会干扰 vitest
 * 对临时目录 bundle 的模块加载）；不可达来源用 127.0.0.1:1（连接拒绝）。
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { manifestUrlForRemoteAddress, checkPages, formatCheckPages } from '../src/commands'

const MANIFEST_BODY = () => ({
  schemaVersion: 1,
  id: 'remote-a',
  name: 'remote-a',
  entry: 'fulgurjs-remoteEntry.js',
  exposes: { './pages/home': { file: 'home.js' }, './pages/detail': { file: 'detail.js' } },
  shared: [],
})

/** 本地 manifest 服务器：任何路径都返回有效 manifest；用后 Promise 关闭 */
async function startManifestServer(): Promise<{ base: string; close: () => Promise<void> }> {
  const server = http.createServer((_req, res) => {
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify(MANIFEST_BODY()))
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const addr = server.address()
  if (!addr || typeof addr === 'string') throw new Error('manifest server listen failed')
  return { base: `http://127.0.0.1:${addr.port}`, close: (): Promise<void> => new Promise((r) => server.close(() => r())) }
}

/** 不可达站点：127.0.0.1:1（tcpmux，本机必然连接拒绝） */
const DEAD_SITE = 'http://127.0.0.1:1'

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'fulgurjs-cpm-'))
}

/** 单项目宿主 fixture：remotes['remote-a'].prod 由用例注入 */
function writeHostConfig(dir: string, prod: string): string {
  fs.mkdirSync(path.join(dir, 'src/fulgurjs/host'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'src/fulgurjs/host/pages.data.ts'),
    `export const remotePrefixes = { '/remote-a/': 'remote-a' }\n` +
      `export const deriveSpec = (route: string) => 'pages/' + route.replace(/^\\/remote-a\\//, '').split('/').filter((s) => !s.startsWith(':')).join('/')\n` +
      `export const pages = [\n  { route: '/remote-a/home', name: 'Home' },\n  { route: '/remote-a/detail/:id', name: 'Detail', spec: 'pages/detail' },\n]\n`,
  )
  const p = path.join(dir, 'fulgurjs.config.ts')
  fs.writeFileSync(
    p,
    `import type { FederationOptions } from '@fulgurjs/federation'\n` +
      `import { pages, remotePrefixes, deriveSpec } from './src/fulgurjs/host/pages.data'\n` +
      `export default {\n  name: 'host-x',\n  remotes: { 'remote-a': { dev: 'http://localhost:5101/remote-a', prod: ${JSON.stringify(prod)} } },\n} satisfies FederationOptions\n` +
      `export const hostPages = { pages, remotePrefixes, deriveSpec }\n`,
  )
  return p
}

describe('manifestUrlForRemoteAddress：与运行时同语义的地址推导', () => {
  it('目录 URL → 追加 manifest 文件名', () => {
    expect(manifestUrlForRemoteAddress('http://localhost:8662/flowable')).toBe('http://localhost:8662/flowable/fulgurjs-manifest.json')
  })
  it('完整 remoteEntry URL → 同目录 manifest', () => {
    expect(manifestUrlForRemoteAddress('http://localhost:8662/flowable/fulgurjs-remoteEntry.js')).toBe('http://localhost:8662/flowable/fulgurjs-manifest.json')
  })
  it('name@url → 剥容器名前缀（目录 / remoteEntry 两形态）', () => {
    expect(manifestUrlForRemoteAddress('mes-bpm@http://localhost:8662/flowable')).toBe('http://localhost:8662/flowable/fulgurjs-manifest.json')
    expect(manifestUrlForRemoteAddress('mes-bpm@http://localhost:8662/flowable/fulgurjs-remoteEntry.js')).toBe('http://localhost:8662/flowable/fulgurjs-manifest.json')
  })
  it('已是 manifest URL → 原样；尾部斜杠收敛', () => {
    expect(manifestUrlForRemoteAddress('https://cdn.example.com/remote-a/fulgurjs-manifest.json')).toBe('https://cdn.example.com/remote-a/fulgurjs-manifest.json')
    expect(manifestUrlForRemoteAddress('http://localhost:8662/flowable/')).toBe('http://localhost:8662/flowable/fulgurjs-manifest.json')
  })
})

describe('check-pages 单项目形态：prod 地址全形态推导（本地 manifest 服务器）', () => {
  it('目录 URL / remoteEntry URL / name@url 三种绝对 prod 均可核对，来源可见', async () => {
    const { base, close } = await startManifestServer()
    try {
      for (const prod of [`${base}/remote-a`, `${base}/remote-a/fulgurjs-remoteEntry.js`, `remote-a@${base}/remote-a`]) {
        const dir = tmpDir()
        const p = writeHostConfig(dir, prod)
        const r = await checkPages(p)
        expect(r.failed, prod).toBe(false)
        expect(r.checked, prod).toBe(2)
        expect(r.manifestSources![0]).toEqual({ remote: 'remote-a', from: `${base}/remote-a/fulgurjs-manifest.json` })
        expect(formatCheckPages(r)).toContain('fulgurjs-manifest.json')
        fs.rmSync(dir, { recursive: true, force: true })
      }
    } finally {
      await close()
    }
  })

  it('external 单字符串（绝对）与相对 prod + --site 均可推导', async () => {
    const { base, close } = await startManifestServer()
    try {
      // external 单字符串形态：remotes 值直接是地址字符串
      const dir1 = tmpDir()
      const p1 = writeHostConfig(dir1, `${base}/remote-a`)
      fs.writeFileSync(
        p1,
        fs.readFileSync(p1, 'utf8').replace(new RegExp(`\\{ dev: 'http://localhost:5101/remote-a', prod: "[^"]*" \\}`), JSON.stringify(`${base}/remote-a`)),
      )
      const r1 = await checkPages(p1)
      expect(r1.failed).toBe(false)
      expect(r1.manifestSources![0]!.from).toBe(`${base}/remote-a/fulgurjs-manifest.json`)
      fs.rmSync(dir1, { recursive: true, force: true })

      // 相对 prod + 显式 --site
      const dir2 = tmpDir()
      const p2 = writeHostConfig(dir2, '/remote-a')
      const r2 = await checkPages(p2, { site: base })
      expect(r2.failed).toBe(false)
      expect(r2.manifestSources![0]!.from).toBe(`${base}/remote-a/fulgurjs-manifest.json`)
      fs.rmSync(dir2, { recursive: true, force: true })
    } finally {
      await close()
    }
  })

  it('绝对 prod 不可达 → unverified（不回退），--require-verified 判失败', async () => {
    const dir = tmpDir()
    const p = writeHostConfig(dir, `${DEAD_SITE}/remote-a`)
    const r = await checkPages(p, { requireVerified: true })
    expect(r.failed).toBe(false)
    expect(r.checked).toBe(2)
    expect(r.issues.some((i) => i.level === 'unverified')).toBe(true)
    expect(r.unverifiedFailed).toBe(true)
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('相对 prod + --site 不可达 → unverified；无 site → unverified 引导补来源', async () => {
    const dir = tmpDir()
    const p = writeHostConfig(dir, '/remote-a')
    const siteGiven = await checkPages(p, { site: DEAD_SITE, requireVerified: true })
    expect(siteGiven.unverifiedFailed).toBe(true)
    expect(siteGiven.issues.some((i) => i.level === 'unverified' && i.message.includes('--site'))).toBe(true)
    const noSite = await checkPages(p)
    expect(noSite.issues.some((i) => i.level === 'unverified' && i.message.includes('manifest'))).toBe(true)
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('显式 --manifest 命中时不经网络（最高优先级）', async () => {
    const dir = tmpDir()
    const p = writeHostConfig(dir, `${DEAD_SITE}/remote-a`) // prod 指向死地址：若被使用则核对必然失败
    const manifestPath = path.join(dir, 'remote-manifest.json')
    fs.writeFileSync(manifestPath, JSON.stringify(MANIFEST_BODY()))
    const r = await checkPages(p, { manifests: { 'remote-a': manifestPath } })
    expect(r.failed).toBe(false)
    expect(r.manifestSources![0]!.from).toBe(manifestPath)
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('localhost 站点可获取 manifest（Node 18 回环解析回退：::1 失败自动改试 127.0.0.1）', async () => {
    // 服务器只绑 IPv4 回环——Node 18 下 http://localhost 先解析到 ::1 必然拒绝，命中回退后应成功
    const server = http.createServer((_req, res) => {
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify(MANIFEST_BODY()))
    })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    const port = (server.address() as { port: number }).port
    try {
      const dir = tmpDir()
      const p = writeHostConfig(dir, '/remote-a')
      const r = await checkPages(p, { site: `http://localhost:${port}` })
      expect(r.failed).toBe(false)
      expect(r.manifestSources![0]!.from).toMatch(new RegExp(`^http://(localhost|127\\.0\\.0\\.1):${port}/remote-a/fulgurjs-manifest\\.json$`))
      fs.rmSync(dir, { recursive: true, force: true })
    } finally {
      await new Promise<void>((r) => server.close(() => r()))
    }
  })
})

describe('check-pages 单项目形态：无本地 dist 回退（4.2.1 复核主回归的 5.0.0 延续）', () => {
  /** 宿主 fixture + 应用目录内摆一份"像旧 dist"的 manifest 文件——单项目形态不得把它当来源 */
  function hostWithLocalDistLookalike(dir: string): string {
    const p = writeHostConfig(dir, '/remote-a')
    const fakeDist = path.join(dir, 'dist')
    fs.mkdirSync(fakeDist, { recursive: true })
    fs.writeFileSync(path.join(fakeDist, 'fulgurjs-manifest.json'), JSON.stringify(MANIFEST_BODY()))
    return p
  }

  it('应用目录存在本地 dist 形态文件 + --site 不可达 → unverified（不是 dist 通过），严格模式非零', async () => {
    const dir = tmpDir()
    const p = hostWithLocalDistLookalike(dir)
    const r = await checkPages(p, { site: DEAD_SITE, requireVerified: true })
    expect(r.failed).toBe(false)
    expect(r.manifestSources ?? []).toHaveLength(0) // 未命中任何来源——不读本地 dist 形态文件
    expect(r.issues.some((i) => i.level === 'unverified' && i.message.includes('--site'))).toBe(true)
    expect(r.unverifiedFailed).toBe(true)
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('--site 可达 → 使用站点来源', async () => {
    const dir = tmpDir()
    const p = hostWithLocalDistLookalike(dir)
    const { base, close } = await startManifestServer()
    try {
      const r = await checkPages(p, { site: base })
      expect(r.failed).toBe(false)
      expect(r.manifestSources![0]!.from).toBe(`${base}/remote-a/fulgurjs-manifest.json`)
    } finally {
      await close()
    }
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('未指定任何线上来源 → unverified 引导补来源（不再有本地 dist 兜底）', async () => {
    const dir = tmpDir()
    const p = hostWithLocalDistLookalike(dir)
    const r = await checkPages(p)
    expect(r.failed).toBe(false)
    expect(r.manifestSources ?? []).toHaveLength(0)
    expect(r.issues.some((i) => i.level === 'unverified' && i.message.includes('未提供 manifest 来源'))).toBe(true)
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('--manifest 显式不可达 → unverified，不静默换来源', async () => {
    const dir = tmpDir()
    const p = hostWithLocalDistLookalike(dir)
    const r = await checkPages(p, { manifests: { 'remote-a': path.join(dir, 'missing.json') }, requireVerified: true })
    expect(r.manifestSources ?? []).toHaveLength(0)
    expect(r.unverifiedFailed).toBe(true)
    fs.rmSync(dir, { recursive: true, force: true })
  })
})
