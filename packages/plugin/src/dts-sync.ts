/**
 * 宿主远程类型同步（6.5.0 远程类型自动生成）。
 *
 * 流程：远程 manifest → types 描述（index 地址 + revision）→ 下载清单登记的声明
 * 文件（逐文件 sha256 校验、大小/数量上限、路径边界）→ 生成 ambient 声明 →
 * 临时目录原子切换 → 写 metadata.json（生成器身份/来源/代次/文件清单——清理只
 * 处理 metadata 登记过的自有文件，绝不碰用户文件）。
 *
 * 同步只影响类型文件，不阻塞应用运行；失败/离线保留上一代完整声明并如实标注
 * 陈旧状态。dev 由 startRemoteTypesSyncLoop 驱动（启动同步 + 轮询 revision 变化
 * 自动更新 + 服务关闭取消）；CI 用 syncConfiguredRemotes（fulgurjs types 命令）。
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { parseManifest, type FederationManifest } from './manifest'
import { parseDtsIndex, DTS_FILE_MAX_BYTES, DTS_TOTAL_MAX_BYTES, DTS_FILE_COUNT_MAX, isSafeBundlePath, TYPES_SCHEMA_VERSION, type DtsBundleIndex } from './dts-shared'
import { buildAmbientDeclarations } from './dts-ambient'
import { checkTypesDiscovery } from './dts-discovery'

export type DtsSyncStatus =
  | 'synced'        // 完整获取并写入当前 revision
  | 'unchanged'     // 远程 revision 与本地一致，无操作
  | 'stale'         // 清单已变化但新声明获取失败（本地保留上一代，明确陈旧）
  | 'absent'        // 远程未提供类型资源（或主动关闭）
  | 'failed'        // 同步失败（网络/校验/IO），附原因

export interface DtsSyncResult {
  status: DtsSyncStatus
  alias: string
  revision?: string
  /** 人读说明（失败原因/陈旧提示/缺失指引） */
  message: string
  warnings?: string[]
}

/** manifest 的 types 描述（dts 协议在 manifest 上的定位字段） */
export interface ManifestTypesDescriptor {
  schemaVersion: number
  index: string
  revision: string
}

export function readManifestTypes(m: FederationManifest): ManifestTypesDescriptor | null {
  const t = (m as { types?: unknown }).types
  if (t === null || t === undefined) return null
  if (typeof t !== 'object') return null
  const d = t as { schemaVersion?: unknown; index?: unknown; revision?: unknown }
  if (d.schemaVersion !== TYPES_SCHEMA_VERSION) return null
  if (typeof d.index !== 'string' || typeof d.revision !== 'string') return null
  return { schemaVersion: TYPES_SCHEMA_VERSION, index: d.index, revision: d.revision }
}

/** 容器入口 URL → manifest URL（dev: @fulgurjs-entry.js → @fulgurjs-manifest.json；prod: 入口同目录） */
export function manifestUrlFromEntry(entryUrl: string): string | null {
  try {
    const u = new URL(entryUrl)
    if (u.pathname.includes('@fulgurjs-entry.js')) {
      u.pathname = u.pathname.replace('@fulgurjs-entry.js', '@fulgurjs-manifest.json')
      return u.toString()
    }
    u.pathname = `${u.pathname.slice(0, u.pathname.lastIndexOf('/') + 1)}fulgurjs-manifest.json`
    return u.toString()
  } catch {
    return null
  }
}

async function fetchJson(url: string, timeoutMs: number): Promise<unknown> {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`)
  return await res.json() as unknown
}

async function fetchText(url: string, timeoutMs: number): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`)
  return await res.text()
}

/** 本地生成目录的自有文件账本（metadata.json）——清理与代次比对的唯一依据 */
export interface DtsMetadata {
  generator: '@fulgurjs/federation'
  /** 宿主声明转换格式；格式变化时同远程 revision 也需重新生成。 */
  ambientFormat?: number
  alias: string
  source: string
  revision: string
  /** 本生成器写入 <dir>/<alias>/ 的全部文件（相对该目录） */
  files: string[]
  externals: string[]
  syncedAt: number
}

const METADATA_FILE = 'metadata.json'
const AMBIENT_FORMAT = 2

export function readMetadata(dir: string): DtsMetadata | null {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, METADATA_FILE), 'utf8')) as DtsMetadata
    if (raw.generator !== '@fulgurjs/federation' || typeof raw.revision !== 'string' || !Array.isArray(raw.files)) return null
    return raw
  } catch {
    return null
  }
}

/** 只删除 metadata 登记过的自有文件（防误删用户文件）；目录空则移除 */
function cleanupOwnFiles(dir: string, meta: DtsMetadata): void {
  for (const f of meta.files) {
    if (!isSafeBundlePath(f)) continue
    fs.rmSync(path.join(dir, f), { force: true })
  }
  fs.rmSync(path.join(dir, METADATA_FILE), { force: true })
  try {
    if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir)
  } catch { /* 目录非空（用户文件共存）——保留 */ }
}

/** 清扫历史中断残留的 staging/trash 目录（自有前缀，任意时点安全删除） */
function sweepStaleStaging(typesRoot: string, alias: string): void {
  if (!fs.existsSync(typesRoot)) return
  for (const name of fs.readdirSync(typesRoot)) {
    if (name.startsWith(`.fg-staging-${alias}-`) || name.startsWith(`.fg-trash-${alias}-`)) {
      fs.rmSync(path.join(typesRoot, name), { recursive: true, force: true })
    }
  }
}

export interface SyncRemoteTypesInput {
  alias: string
  /** 远程 manifest URL（绝对地址；由 devEntry/prodEntry 推导） */
  manifestUrl: string
  /** 类型输出根（生成到 <typesRoot>/<alias>/；一般是 src/fulgurjs/types） */
  typesRoot: string
  /** 来源描述（进 metadata/文件头） */
  source: string
  /** 下载与网络行为注入（单测） */
  fetchJsonImpl?: (url: string, timeoutMs: number) => Promise<unknown>
  fetchTextImpl?: (url: string, timeoutMs: number) => Promise<string>
  timeoutMs?: number
}

export async function syncRemoteTypes(input: SyncRemoteTypesInput): Promise<DtsSyncResult> {
  const { alias, manifestUrl, typesRoot, source } = input
  const fetchJsonFn = input.fetchJsonImpl ?? fetchJson
  const fetchTextFn = input.fetchTextImpl ?? fetchText
  const timeoutMs = input.timeoutMs ?? 15000
  const dir = path.join(typesRoot, alias)

  let manifest: FederationManifest
  try {
    const parsed = parseManifest(await fetchJsonFn(manifestUrl, timeoutMs))
    if (parsed.unsupportedVersion || !parsed.manifest) {
      return {
        status: 'absent',
        alias,
        message: `远程 ${alias} 的 manifest 协议版本不受支持（${parsed.unsupportedVersion ?? '校验失败'}），类型同步跳过。请对齐宿主与远程的 @fulgurjs/federation 版本。`,
      }
    }
    manifest = parsed.manifest
  } catch (e) {
    const meta = fs.existsSync(dir) ? readMetadata(dir) : null
    return {
      status: 'failed',
      alias,
      revision: meta?.revision,
      message: `远程 ${alias} 的 manifest 获取失败（${(e as Error).message}）。${meta ? `本地保留 revision ${meta.revision} 的声明（陈旧，直到下次成功同步）。` : '尚无本地声明。'}`,
    }
  }

  const types = readManifestTypes(manifest)
  if (!types) {
    const meta = fs.existsSync(dir) ? readMetadata(dir) : null
    if (meta) {
      cleanupOwnFiles(dir, meta)
      return { status: 'absent', alias, message: `远程 ${alias} 不再提供类型资源，已清理本地生成的声明（用户文件不受影响）。` }
    }
    return {
      status: 'absent',
      alias,
      message: `远程 ${alias} 未提供类型资源（旧版本插件或 dts: false）。页面可正常运行；精确类型检查需要远程升级到当前版本并在远程启用 dts。`,
    }
  }

  const indexUrl = new URL(types.index, manifestUrl).toString()
  const existing = fs.existsSync(dir) ? readMetadata(dir) : null
  if (existing && existing.revision === types.revision && existing.ambientFormat === AMBIENT_FORMAT) {
    return { status: 'unchanged', alias, revision: types.revision, message: `远程 ${alias} 类型已是最新（revision ${types.revision}）。` }
  }

  // ---- 下载 + 校验（只取清单登记文件；逐文件 sha256；大小/数量上限；路径边界）----
  let index: DtsBundleIndex
  let indexRaw: Record<string, string>
  try {
    const parsedIndex = parseDtsIndex(await fetchJsonFn(indexUrl, timeoutMs))
    if (!parsedIndex.index) {
      return { status: 'failed', alias, message: `远程 ${alias} 的类型清单校验失败：${parsedIndex.issues.map((x) => `${x.field}: ${x.message}`).join('；')}。已拒绝本次更新（本地声明保持原状）。` }
    }
    index = parsedIndex.index
  } catch (e) {
    return {
      status: 'stale',
      alias,
      revision: existing?.revision,
      message: `远程 ${alias} 的类型清单已变化（revision ${types.revision}）但下载失败（${(e as Error).message}）。本地保留上一代声明（陈旧）；恢复后 dev 自动更新，或重跑 npx @fulgurjs/federation types。`,
    }
  }
  const fileCount = Object.keys(index.files).length
  if (fileCount > DTS_FILE_COUNT_MAX) {
    return { status: 'failed', alias, message: `远程 ${alias} 的类型清单文件数超限（${fileCount} > ${DTS_FILE_COUNT_MAX}）。已拒绝。` }
  }
  indexRaw = {}
  let total = 0
  for (const [rel, digest] of Object.entries(index.files)) {
    if (!isSafeBundlePath(rel)) {
      return { status: 'failed', alias, message: `远程 ${alias} 的类型清单含不安全路径（${rel}），已拒绝下载（防路径逃逸）。` }
    }
    const fileUrl = new URL(rel, new URL('./', indexUrl)).toString()
    let text: string
    try {
      text = await fetchTextFn(fileUrl, timeoutMs)
    } catch (e) {
      return {
        status: 'stale',
        alias,
        revision: existing?.revision,
        message: `远程 ${alias} 的声明文件下载失败（清单 revision ${types.revision}，文件 ${rel}：${(e as Error).message}）。本地保留上一代声明（陈旧）。`,
      }
    }
    const bytes = Buffer.byteLength(text, 'utf8')
    if (bytes > DTS_FILE_MAX_BYTES) {
      return { status: 'failed', alias, message: `远程 ${alias} 的声明文件超限（${rel}：${bytes}B > ${DTS_FILE_MAX_BYTES}B），已拒绝。` }
    }
    total += bytes
    if (total > DTS_TOTAL_MAX_BYTES) {
      return { status: 'failed', alias, message: `远程 ${alias} 的类型资源总量超限（>${DTS_TOTAL_MAX_BYTES}B），已拒绝。` }
    }
    const actual = crypto.createHash('sha256').update(text, 'utf8').digest('hex')
    if (actual !== digest) {
      return { status: 'failed', alias, message: `远程 ${alias} 的声明文件摘要不符（${rel}），已拒绝本次更新（传输损坏或被篡改）。` }
    }
    indexRaw[rel] = text
  }

  // ---- ambient 生成 + 原子切换 ----
  const ambient = buildAmbientDeclarations({ alias, index, readFile: (rel) => indexRaw[rel] ?? '', source })
  // 先清扫历史残留（同前缀的 staging/trash），再建本轮 staging——顺序不能反：
  // sweep 的前缀匹配会命中同前缀的本轮目录
  sweepStaleStaging(typesRoot, alias)
  const staging = path.join(typesRoot, `.fg-staging-${alias}-${process.pid}-${Date.now()}`)
  fs.rmSync(staging, { recursive: true, force: true })
  fs.mkdirSync(staging, { recursive: true })
  const written: string[] = []
  try {
    for (const [name, content] of ambient.files) {
      const dest = path.join(staging, name)
      fs.mkdirSync(path.dirname(dest), { recursive: true })
      fs.writeFileSync(dest, content)
      written.push(name)
    }
    const meta: DtsMetadata = {
      generator: '@fulgurjs/federation',
      ambientFormat: AMBIENT_FORMAT,
      alias,
      source,
      revision: index.revision,
      files: written,
      externals: index.externals,
      syncedAt: Date.now(),
    }
    fs.writeFileSync(path.join(staging, METADATA_FILE), JSON.stringify(meta, null, 2))

    const trash = path.join(typesRoot, `.fg-trash-${alias}-${Date.now()}`)
    let swapped = false
    if (fs.existsSync(dir)) {
      fs.renameSync(dir, trash)
      swapped = true
    }
    try {
      fs.renameSync(staging, dir)
    } catch (e) {
      if (swapped) fs.renameSync(trash, dir)
      throw e
    }
    if (swapped) fs.rmSync(trash, { recursive: true, force: true })
  } catch (e) {
    fs.rmSync(staging, { recursive: true, force: true })
    return { status: 'failed', alias, message: `远程 ${alias} 的类型写入失败（${(e as Error).message}）。本地声明保持原状。` }
  }
  return {
    status: 'synced',
    alias,
    revision: index.revision,
    message: `已同步远程 ${alias} 的类型（revision ${index.revision}，${Object.keys(index.files).length} 个声明文件）。`,
    warnings: ambient.warnings,
  }
}

/** 删除某别名下插件自有生成物（远程被移除/改名时；绝不删除未登记的用户文件） */
export function removeGeneratedTypes(typesRoot: string, alias: string): boolean {
  const dir = path.join(typesRoot, alias)
  if (!fs.existsSync(dir)) return false
  const meta = readMetadata(dir)
  if (!meta) return false // 非本生成器所有（或账本丢失）——不整目录删除
  cleanupOwnFiles(dir, meta)
  sweepStaleStaging(typesRoot, alias)
  return true
}

export interface TypesLoopOptions {
  root: string
  typesRoot: string
  remotes: { key: string; devEntry: string }[]
  pollMs?: number
  log?: (message: string) => void
  warn?: (message: string) => void
  signal?: AbortSignal
}

/**
 * dev 类型同步循环：启动后逐远程同步（远程未就绪有界重试）；之后轮询 manifest
 * revision，变化即更新。单远程单飞（并发触发只跑一次）；signal 中止时停止轮询。
 * 不抛出——所有状态经 log/warn 输出（类型同步失败不阻塞页面服务）。
 */
export function startRemoteTypesSyncLoop(opts: TypesLoopOptions): () => void {
  const pollMs = opts.pollMs ?? 8000
  const controller = new AbortController()
  const outerSignal = opts.signal
  const onOuterAbort = () => controller.abort()
  outerSignal?.addEventListener('abort', onOuterAbort, { once: true })
  const log = opts.log ?? ((m: string) => console.log(m))
  const warn = opts.warn ?? ((m: string) => console.warn(m))
  const inFlight = new Map<string, Promise<void>>()

  const syncOnce = async (alias: string, devEntry: string, announced: Set<string>): Promise<void> => {
    const manifestUrl = manifestUrlFromEntry(devEntry)
    if (!manifestUrl) {
      if (!announced.has(alias)) {
        warn(`[fulgurjs] 类型同步：远程 ${alias} 的 devEntry（${devEntry}）无法推导 manifest 地址，已跳过。`)
        announced.add(alias)
      }
      return
    }
    const result = await syncRemoteTypes({
      alias,
      manifestUrl,
      typesRoot: opts.typesRoot,
      source: devEntry,
    })
    if (result.status === 'synced' || (result.status === 'absent' && !announced.has(alias))) {
      log(`[fulgurjs] 类型同步：${result.message}`)
      announced.add(alias)
    } else if ((result.status === 'failed' || result.status === 'stale') && !announced.has(alias + ':warn')) {
      warn(`[fulgurjs] 类型同步：${result.message}`)
      announced.add(alias + ':warn')
    }
  }

  const run = (announced: Set<string>): void => {
    if (controller.signal.aborted) return
    void (async () => {
      for (const remote of opts.remotes) {
        if (controller.signal.aborted) return
        const prev = inFlight.get(remote.key)
        if (prev) await prev.catch(() => {})
        if (controller.signal.aborted) return
        const p = syncOnce(remote.key, remote.devEntry, announced).finally(() => inFlight.delete(remote.key))
        inFlight.set(remote.key, p)
        await p.catch(() => {})
      }
      if (controller.signal.aborted) return
      const t = setTimeout(() => run(announced), pollMs)
      controller.signal.addEventListener('abort', () => clearTimeout(t), { once: true })
    })()
  }
  // 首次成功同步后做一次发现检查（TYP-006）：目录未被 tsconfig 覆盖时给最小修法；
  // 只诊断不写配置（普通 dev 启动绝不改写用户 tsconfig）
  let discoveryWarned = false
  const checkDiscoveryOnce = (): void => {
    if (discoveryWarned) return
    if (!fs.existsSync(opts.typesRoot)) return
    if (fs.readdirSync(opts.typesRoot).length === 0) return
    discoveryWarned = true
    const d = checkTypesDiscovery(opts.root, opts.typesRoot)
    if (!d.covered) warn(`[fulgurjs] ${d.fixHint ?? ''}`)
  }
  run(new Set())
  setTimeout(checkDiscoveryOnce, 5000)
  return () => {
    controller.abort()
    outerSignal?.removeEventListener('abort', onOuterAbort)
  }
}
