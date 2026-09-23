/**
 * D.2 Tier2 + D.5 DEV 段启动检查：remote dev manifest 探针与
 * virtual:fulgurjs-remote-schema 虚拟模块生成。
 *
 * 单次快连（3s 超时，不阻塞启动）：宿主常先于 remote 启动，失败属常态，
 * 一律 WARN 级列事实（端口是否监听、URL、状态码），不猜对错不阻塞。
 */
import type { NormalizedOptions } from './options'
import { formatFulgurjsDiagnostic, isPortReachable } from './diagnostics'
import { parseManifest, normalizeExposes, type DevFederationManifest } from './manifest'

export interface RemoteSchemaEntry {
  exposes: string[]
  exists: boolean
}

export interface RemoteSchema {
  [remoteKey: string]: RemoteSchemaEntry
}

function manifestUrlOf(devEntry: string): URL | null {
  try {
    const u = new URL(devEntry)
    u.pathname = u.pathname.replace('@fulgurjs-entry.js', '@fulgurjs-manifest.json')
    return u
  } catch {
    return null
  }
}

/**
 * 探测全部 remote：manifest 拉取（DEV-001/002）+ 端口监听（DEV-005）+ 插件版本比对
 * （DEV-006），并产出路由表存在性校验用的 schema。WARN 级不阻塞。
 */
export async function probeRemotesAndBuildSchema(options: NormalizedOptions): Promise<RemoteSchema> {
  const schema: RemoteSchema = {}
  for (const remote of options.remotes) {
    if (!remote.devEntry || remote.promise) {
      schema[remote.key] = { exposes: [], exists: false }
      continue
    }
    const u = manifestUrlOf(remote.devEntry)
    if (!u) {
      schema[remote.key] = { exposes: [], exists: false }
      continue
    }
    try {
      const res = await fetch(u, { signal: AbortSignal.timeout(3000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      // WP4：manifest 经契约模块校验与规范化取 exposes（坏形状不再裸读字段）
      const parsed = parseManifest(await res.json())
      if (parsed.unsupportedVersion) {
        schema[remote.key] = { exposes: [], exists: false }
        console.warn(
          formatFulgurjsDiagnostic({
            code: 'DEV-002',
            symptom: `remote "${remote.key}" 的 manifest schemaVersion=${parsed.unsupportedVersion} 不受支持（本机支持 1）`,
            cause: '宿主与远程的 @fulgurjs/federation 大版本不一致',
            fix: '对齐宿主与远程的 @fulgurjs/federation 版本后重启 dev server',
            details: { remote: remote.key, url: u.href },
          }),
        )
        continue
      }
      if (parsed.issues.length > 0 || !parsed.manifest) {
        schema[remote.key] = { exposes: [], exists: false }
        console.warn(
          formatFulgurjsDiagnostic({
            code: 'DEV-002',
            symptom: `remote "${remote.key}" 的 dev manifest 契约校验失败（${u.href}）`,
            cause: parsed.issues.map((x) => `${x.field}: ${x.message}`).join('；'),
            fix: '核对 remote 的 federation 配置 exposes，并确认 @fulgurjs/federation 版本与宿主一致',
            details: { remote: remote.key, url: u.href, issues: parsed.issues.slice(0, 5) },
          }),
        )
        continue
      }
      const manifest = parsed.manifest as DevFederationManifest
      const exposes: string[] = [...normalizeExposes(manifest).keys()]
      schema[remote.key] = { exposes, exists: true }

      // DEV-002：manifest 可达但 exposes 为空（remote 侧插件/配置问题）
      if (exposes.length === 0) {
        console.warn(
          formatFulgurjsDiagnostic({
            code: 'DEV-002',
            symptom: `remote "${remote.key}" 的 dev manifest 可达但 exposes 为空（${u.href}）`,
            cause: 'remote 侧 federation({ exposes }) 为空，或其插件版本过旧导致 manifest 缺字段',
            fix: '核对 remote 的 federation 配置 exposes，并确认 @fulgurjs/federation 版本与宿主一致',
            details: { remote: remote.key, url: u.href, pluginVersion: manifest.version },
          }),
        )
      }

      // DEV-006：插件版本一致性（dev manifest.version 存在时才可比对）
      const remoteVersion = manifest.version
      if (remoteVersion && remoteVersion !== options.pluginVersion) {
        console.warn(
          formatFulgurjsDiagnostic({
            code: 'DEV-006',
            symptom: `宿主与 remote "${remote.key}" 的 @fulgurjs/federation 版本不一致`,
            cause: `宿主 ${options.pluginVersion} vs 远程 ${remoteVersion}（pnpm tarball 断链/漏升级常见）`,
            fix: '统一升级各应用依赖到同一版本：pnpm add -D @fulgurjs/federation@<version> 并重启 dev server',
            details: { host: options.pluginVersion, remote: remoteVersion },
          }),
        )
      }
    } catch (err) {
      schema[remote.key] = { exposes: [], exists: false }
      // DEV-001：区分「端口无监听」（未启动/错位）与「有监听但 manifest 异常」
      const port = u.port ? Number(u.port) : u.protocol === 'https:' ? 443 : 80
      const portOpen = await isPortReachable(u.hostname, port)
      console.warn(
        formatFulgurjsDiagnostic({
          code: 'DEV-001',
          symptom: `remote "${remote.key}" 的 dev manifest 不可达（${u.href}）——该 remote 的路由存在性校验将跳过`,
          cause: portOpen
            ? '端口有进程监听但 manifest 端点异常：remote dev server 可能以非联邦配置启动，或 base/路径与 remotes[].dev 不一致'
            : '端口无进程监听：remote dev server 未启动，或 remotes[].dev 端口写错（server.origin 错位同款）',
          fix: '启动对应 remote 的 dev server；核对宿主 federation({ remotes }) 的 dev URL 与 remote 实际 VITE_PORT/base',
          details: { remote: remote.key, url: u.href, port, portOpen, error: String((err as Error)?.message ?? err) },
        }),
      )
    }
  }
  return schema
}

/** build 期：远程 manifest 不在本地，诚实降级为空 schema（校验器跳过 R3） */
export function genEmptyRemoteSchemaModule(): string {
  console.info('[fulgurjs] build 期跳过路由 spec 存在性校验（远程 manifest 不在构建机本地；dev 下自动启用）')
  return 'export default {}'
}
