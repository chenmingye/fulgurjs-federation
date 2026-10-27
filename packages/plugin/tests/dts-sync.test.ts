/**
 * 宿主类型同步引擎测试（注入 fetch；真实临时目录 IO）。
 * 覆盖：完整同步/unchanged/stale/absent/校验拒绝（摘要、越界、超限）/原子切换/
 * 孤儿清理/metadata 账本/并发取消边界。
 */
import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { syncRemoteTypes, removeGeneratedTypes, manifestUrlFromEntry, readMetadata, startRemoteTypesSyncLoop } from '../src/dts-sync'
import { createDevTypesServer } from '../src/dts-serve'
import type { NormalizedOptions } from '../src/options'
import { TYPES_SCHEMA_VERSION } from '../src/dts-shared'

let tmp = ''
beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fg-sync-'))
})
afterAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
})

const sha = (t: string) => crypto.createHash('sha256').update(t, 'utf8').digest('hex')

function makeBundle(exposes: Record<string, string>, extra: Record<string, string> = {}) {
  const files: Record<string, string> = { ...extra }
  for (const [name, content] of Object.entries(exposes)) {
    files[`files/${name}.d.ts`] = content
  }
  const manifest = {
    schemaVersion: TYPES_SCHEMA_VERSION,
    name: 'provider',
    devServer: true,
    base: '/',
    entry: '/@fulgurjs-entry.js',
    types: { schemaVersion: 1, index: './@fulgurjs-types/index.json', revision: 'a1b2c3d4e5f60718' },
    exposes: Object.keys(exposes).map((n) => ({ name: `./${n}`, src: `./src/${n}.ts`, file: `/src/${n}.ts` })),
    shared: [],
    ...extra.manifestOverride,
  }
  const index = {
    schemaVersion: 1,
    generator: '@fulgurjs/federation',
    pluginVersion: '6.5.0',
    revision: 'a1b2c3d4e5f60718',
    exposes: Object.fromEntries(Object.keys(exposes).map((n) => [`./${n}`, { declaration: `files/${n}.d.ts` }])),
    externals: [],
    files: Object.fromEntries(Object.entries(files).map(([k, v]) => [k, sha(v)])),
  }
  return { manifest, index, files }
}

/** 注入 fetch：按 URL 后缀路由（manifest / index / bundle 文件），可注入故障 */
function fetchRouter(bundle: { manifest: unknown; index: unknown; files: Record<string, string> }, opts: { failIndex?: boolean; failFile?: string; tamper?: string } = {}) {
  return {
    json: async (url: string) => {
      if (url.includes('@fulgurjs-manifest.json')) return bundle.manifest
      if (url.includes('@fulgurjs-types/index.json')) {
        if (opts.failIndex) throw new Error('network down')
        return bundle.index
      }
      throw new Error(`unexpected json url ${url}`)
    },
    text: async (url: string) => {
      const rel = decodeURIComponent(url.split('/@fulgurjs-types/')[1] ?? '')
      if (opts.failFile && rel === opts.failFile) throw new Error('network down on file')
      const content = bundle.files[rel]
      if (content === undefined) throw new Error(`404 ${rel}`)
      if (opts.tamper && rel === opts.tamper) return content + ' '
      return content
    },
  }
}

const typesRoot = () => path.join(tmp, 'types')
const manifestUrl = 'http://remote.test/@fulgurjs-manifest.json'

describe('syncRemoteTypes', () => {

  it('完整同步：externals 含 *.vue 时 modules.d.ts 注入 SFC 通配声明（ISS-14 回归）', async () => {
    const bundle = makeBundle({ widget: 'export declare const w: number\n' })
    bundle.index.externals = ['*.vue', 'vue']
    const f = fetchRouter(bundle)
    const result = await syncRemoteTypes({ alias: 'wild', manifestUrl, typesRoot: typesRoot(), source: 'dev-entry', fetchJsonImpl: f.json, fetchTextImpl: f.text })
    expect(result.status).toBe('synced')
    const mod = fs.readFileSync(path.join(typesRoot(), 'wild/modules.d.ts'), 'utf8')
    expect(mod, 'modules.d.ts 应含注入的 SFC 通配声明').toContain("declare module '*.vue'")
  })

  it('完整同步：写入 modules/registry/metadata；revision 与来源入账本', async () => {
    const bundle = makeBundle({ math: 'export declare function sum(a: number, b: number): number\n' })
    const f = fetchRouter(bundle)
    const r = await syncRemoteTypes({ alias: 'lowcode', manifestUrl, typesRoot: typesRoot(), source: 'dev-entry', fetchJsonImpl: f.json, fetchTextImpl: f.text })
    expect(r.status).toBe('synced')
    const dir = path.join(typesRoot(), 'lowcode')
    expect(fs.existsSync(path.join(dir, 'modules.d.ts'))).toBe(true)
    expect(fs.existsSync(path.join(dir, 'registry.d.ts'))).toBe(true)
    const meta = readMetadata(dir)
    expect(meta?.revision).toBe('a1b2c3d4e5f60718')
    expect(meta?.files.sort()).toEqual(['modules.d.ts', 'registry.d.ts'].sort())
    expect((fs.readFileSync(path.join(dir, 'modules.d.ts'), 'utf8'))).toContain('declare module "lowcode/math"')
  })

  it('同 revision 重跑 → unchanged（不重写文件）', async () => {
    const bundle = makeBundle({ math: 'export declare function sum(a: number, b: number): number\n' })
    const f = fetchRouter(bundle)
    const first = await syncRemoteTypes({ alias: 'idem', manifestUrl, typesRoot: typesRoot(), source: 's', fetchJsonImpl: f.json, fetchTextImpl: f.text })
    expect(first.status).toBe('synced')
    const marker = path.join(typesRoot(), 'idem', 'modules.d.ts')
    const before = fs.statSync(marker).mtimeMs
    await new Promise((r2) => setTimeout(r2, 12))
    const second = await syncRemoteTypes({ alias: 'idem', manifestUrl, typesRoot: typesRoot(), source: 's', fetchJsonImpl: f.json, fetchTextImpl: f.text })
    expect(second.status).toBe('unchanged')
    expect(fs.statSync(marker).mtimeMs).toBe(before)
  })

  it('宿主声明格式变更时，同远程 revision 仍重新生成', async () => {
    const bundle = makeBundle({ math: 'declare const value: number; export default value;\n' })
    const f = fetchRouter(bundle)
    const input = { alias: 'format', manifestUrl, typesRoot: typesRoot(), source: 's', fetchJsonImpl: f.json, fetchTextImpl: f.text }
    await syncRemoteTypes(input)
    const dir = path.join(typesRoot(), 'format')
    const metadata = readMetadata(dir)!
    delete metadata.ambientFormat
    fs.writeFileSync(path.join(dir, 'metadata.json'), JSON.stringify(metadata))
    fs.writeFileSync(path.join(dir, 'modules.d.ts'), 'stale declaration')
    expect((await syncRemoteTypes(input)).status).toBe('synced')
    expect(fs.readFileSync(path.join(dir, 'modules.d.ts'), 'utf8')).toContain('const value: number')
    expect((await syncRemoteTypes(input)).status).toBe('unchanged')
  })
  it('提供方启动编译中保留已有声明，未同步过的工程不冒充成功', async () => {
    const bundle = makeBundle({ math: 'export declare const value: number\n' })
    const f = fetchRouter(bundle)
    const input = { alias: 'pending', manifestUrl, typesRoot: typesRoot(), source: 's', fetchJsonImpl: f.json, fetchTextImpl: f.text }
    await syncRemoteTypes(input)
    const before = fs.readFileSync(path.join(typesRoot(), 'pending', 'modules.d.ts'), 'utf8')
    const pending = async () => ({ ...bundle.manifest, types: undefined, typesPending: true })
    const result = await syncRemoteTypes({ ...input, fetchJsonImpl: pending })
    expect(result.status).toBe('stale')
    expect(fs.readFileSync(path.join(typesRoot(), 'pending', 'modules.d.ts'), 'utf8')).toBe(before)
    expect((await syncRemoteTypes({ ...input, alias: 'new-pending', fetchJsonImpl: pending })).status).toBe('failed')
    expect((await syncRemoteTypes(input)).status).toBe('unchanged')
  })

  it('manifest 无 types → absent（本地已有则清理账本内文件，用户文件保留）', async () => {
    const bundle = makeBundle({ math: 'export const x = 1\n' })
    const f = fetchRouter(bundle)
    await syncRemoteTypes({ alias: 'gone', manifestUrl, typesRoot: typesRoot(), source: 's', fetchJsonImpl: f.json, fetchTextImpl: f.text })
    const dir = path.join(typesRoot(), 'gone')
    expect(fs.existsSync(dir)).toBe(true)
    // 用户在同目录放了自己的文件
    fs.writeFileSync(path.join(dir, 'user-defined.d.ts'), 'declare module "user/thing" {}\n')
    const noTypes = JSON.parse(JSON.stringify(bundle.manifest)) as Record<string, unknown>
    delete noTypes.types
    const f2 = fetchRouter({ ...bundle, manifest: noTypes })
    const r = await syncRemoteTypes({ alias: 'gone', manifestUrl, typesRoot: typesRoot(), source: 's', fetchJsonImpl: f2.json, fetchTextImpl: f2.text })
    expect(r.status).toBe('absent')
    // 插件自有文件被清；用户文件保留
    expect(fs.existsSync(path.join(dir, 'modules.d.ts'))).toBe(false)
    expect(fs.existsSync(path.join(dir, 'user-defined.d.ts'))).toBe(true)
    expect(fs.existsSync(path.join(dir, 'metadata.json'))).toBe(false)
  })

  it('清单变化但文件下载失败 → stale（上一代完整保留，不落半套）', async () => {
    const bundle = makeBundle({ math: 'export declare const v1: 1\n' })
    const f = fetchRouter(bundle)
    await syncRemoteTypes({ alias: 'stale', manifestUrl, typesRoot: typesRoot(), source: 's', fetchJsonImpl: f.json, fetchTextImpl: f.text })
    // 远程更新 revision，但文件网络失败
    const bundle2 = makeBundle({ math: 'export declare const v2: 2\n' })
    bundle2.index.revision = 'b1b2c3d4e5f60718'
    bundle2.manifest = { ...(bundle2.manifest as Record<string, unknown>), types: { schemaVersion: 1, index: './@fulgurjs-types/index.json', revision: 'b1b2c3d4e5f60718' } }
    const fFail = fetchRouter(bundle2, { failFile: 'files/math.d.ts' })
    const r = await syncRemoteTypes({ alias: 'stale', manifestUrl, typesRoot: typesRoot(), source: 's', fetchJsonImpl: fFail.json, fetchTextImpl: fFail.text })
    expect(r.status).toBe('stale')
    expect(r.message).toContain('b1b2')
    // 上一代内容仍在（v1 声明完整，非半套）
    expect(fs.readFileSync(path.join(typesRoot(), 'stale', 'modules.d.ts'), 'utf8')).toContain('v1')
    const meta = readMetadata(path.join(typesRoot(), 'stale'))
    expect(meta?.revision).toBe('a1b2c3d4e5f60718')
  })

  it('摘要不符 → failed（拒绝更新）', async () => {
    const bundle = makeBundle({ math: 'export const x = 1\n' })
    const f = fetchRouter(bundle, { tamper: 'files/math.d.ts' })
    const r = await syncRemoteTypes({ alias: 'tamper', manifestUrl, typesRoot: typesRoot(), source: 's', fetchJsonImpl: f.json, fetchTextImpl: f.text })
    expect(r.status).toBe('failed')
    expect(r.message).toContain('摘要不符')
    expect(fs.existsSync(path.join(typesRoot(), 'tamper'))).toBe(false)
  })

  it('清单含越界路径 → failed（拒绝下载）', async () => {
    const bundle = makeBundle({ math: 'export const x = 1\n' })
    const evil = { ...bundle.index, files: { '../escape.d.ts': 'a'.repeat(64), ...bundle.index.files } }
    const f = fetchRouter({ ...bundle, index: evil })
    const r = await syncRemoteTypes({ alias: 'evil', manifestUrl, typesRoot: typesRoot(), source: 's', fetchJsonImpl: f.json, fetchTextImpl: f.text })
    expect(r.status).toBe('failed')
    expect(r.message).toContain('不安全')
  })

  it('manifest 获取失败 → failed（无本地时明确说明）', async () => {
    const f = {
      json: async () => { throw new Error('ECONNREFUSED') },
      text: async () => { throw new Error('unreachable') },
    }
    const r = await syncRemoteTypes({ alias: 'down', manifestUrl, typesRoot: typesRoot(), source: 's', fetchJsonImpl: f.json as never, fetchTextImpl: f.text as never })
    expect(r.status).toBe('failed')
    expect(r.message).toContain('尚无本地声明')
  })

  it('removeGeneratedTypes 只清账本内文件；无账本不动', () => {
    const dir = path.join(typesRoot(), 'owned')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'modules.d.ts'), 'x')
    fs.writeFileSync(path.join(dir, 'user.d.ts'), 'y')
    fs.writeFileSync(path.join(dir, 'metadata.json'), JSON.stringify({
      generator: '@fulgurjs/federation', alias: 'owned', source: 's', revision: 'r',
      files: ['modules.d.ts'], externals: [], syncedAt: 1,
    }))
    expect(removeGeneratedTypes(typesRoot(), 'owned')).toBe(true)
    expect(fs.existsSync(path.join(dir, 'modules.d.ts'))).toBe(false)
    expect(fs.existsSync(path.join(dir, 'user.d.ts'))).toBe(true)
    // 无账本：不动
    const dir2 = path.join(typesRoot(), 'not-owned')
    fs.mkdirSync(dir2, { recursive: true })
    fs.writeFileSync(path.join(dir2, 'anything.d.ts'), 'x')
    expect(removeGeneratedTypes(typesRoot(), 'not-owned')).toBe(false)
    expect(fs.existsSync(path.join(dir2, 'anything.d.ts'))).toBe(true)
  })

  it('上游具名类型迟到：同步后自动恢复本地声明生成，同代次轮询不反复生成', async () => {
    const root = path.join(tmp, 'late-public-contract')
    const output = path.join(root, 'src/fulgurjs/types')
    fs.mkdirSync(path.join(root, 'src'), { recursive: true })
    fs.mkdirSync(path.join(root, 'node_modules'), { recursive: true })
    fs.symlinkSync(path.resolve(__dirname, '../node_modules/typescript'), path.join(root, 'node_modules/typescript'), 'dir')
    fs.writeFileSync(path.join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: {
      target: 'ES2022', module: 'ESNext', moduleResolution: 'bundler', strict: true, skipLibCheck: true, types: [],
    }, include: ['src'] }))
    fs.writeFileSync(path.join(root, 'src/entry.ts'), `import type { Contract } from 'upstream/contract';
export interface Result { value: Contract }`)
    const warnings: string[] = []
    const messages: string[] = []
    const provider = createDevTypesServer({ root, exposes: [{ name: './result', import: './src/entry.ts' }], pluginVersion: 'test' } as NormalizedOptions,
      { warn: message => warnings.push(message), log: message => messages.push(message) })
    let stop: (() => void) | undefined
    let notifications = 0
    let manifestRequests = 0
    const bundle = makeBundle({ contract: 'export interface Contract { readonly id: string }\n' })
    const router = fetchRouter(bundle)
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
      const url = String(input)
      if (url.includes('@fulgurjs-manifest.json')) manifestRequests++
      const isJson = url.endsWith('.json')
      return new Response(isJson ? JSON.stringify(await router.json(url)) : await router.text(url), { status: 200 })
    })
    try {
      await vi.waitFor(() => expect(warnings.join('\n')).toContain('upstream/contract'), { timeout: 10000 })
      expect(provider.revision()).toBeNull()
      stop = startRemoteTypesSyncLoop({ root, typesRoot: output,
        remotes: [{ key: 'upstream', devEntry: 'http://remote.test/@fulgurjs-entry.js' }], pollMs: 20,
        log: () => {}, warn: () => {}, onSynced: () => { notifications++; provider.invalidate() },
      })
      await vi.waitFor(() => expect(provider.revision()).not.toBeNull(), { timeout: 5000 })
      expect(provider.servePath('/@fulgurjs-types/files/entry.d.ts')?.body).toContain('value: Contract')
      await vi.waitFor(() => expect(manifestRequests).toBeGreaterThanOrEqual(3))
      expect(notifications).toBe(1)
      expect(messages.filter(message => message.includes('类型资源已生成'))).toHaveLength(1)
      // 实际新代次会再次通知；失败/陈旧状态不触发重新编译。
      bundle.index.revision = 'b1b2c3d4e5f60718'
      bundle.manifest.types.revision = bundle.index.revision
      await vi.waitFor(() => expect(notifications).toBe(2), { timeout: 5000 })
      await vi.waitFor(() => expect(provider.isGenerating()).toBe(false), { timeout: 10000 })
      const snapshot = notifications
      fetchMock.mockImplementation(async () => { throw new Error('受控断网') })
      await new Promise(resolve => setTimeout(resolve, 70))
      expect(notifications).toBe(snapshot)
      stop()
      const afterStop = notifications
      await new Promise(resolve => setTimeout(resolve, 70))
      expect(notifications).toBe(afterStop)
    } finally {
      stop?.()
      provider.dispose()
      fetchMock.mockRestore()
    }
  }, 15000)

  it('manifestUrlFromEntry：dev 入口换 manifest 端点；prod 入口取同目录', () => {
    expect(manifestUrlFromEntry('http://h:5101/base/@fulgurjs-entry.js')).toBe('http://h:5101/base/@fulgurjs-manifest.json')
    expect(manifestUrlFromEntry('http://h/remote-a/fulgurjs-remoteEntry.js')).toBe('http://h/remote-a/fulgurjs-manifest.json')
    expect(manifestUrlFromEntry('not a url')).toBe(null)
  })
})
