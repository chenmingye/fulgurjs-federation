/**
 * D.2 Tier2 + D.5 DEV 段启动检查：remote dev manifest 探针与
 * virtual:fulgurjs-remote-schema 虚拟模块生成。
 *
 * 单次快连（3s 超时，不阻塞启动）：宿主常先于 remote 启动，失败属常态，
 * 一律 WARN 级列事实（端口是否监听、URL、状态码），不猜对错不阻塞。
 */
import type { NormalizedOptions } from './options'
import { formatFulgurjsDiagnostic, isPortReachable } from './diagnostics'
import { parseManifest, normalizeExposes, manifestUrlFromEntry, type DevFederationManifest } from './manifest'

export interface RemoteSchemaEntry {
  exposes: string[]
  exists: boolean
}

export interface RemoteSchema {
  [remoteKey: string]: RemoteSchemaEntry
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
    const manifestUrl = manifestUrlFromEntry(remote.devEntry)
    const u = manifestUrl ? new URL(manifestUrl) : null
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
            symptom: `远程应用 "${remote.key}" 的 manifest 协议版本为 ${parsed.unsupportedVersion}，当前仅支持版本 1`,
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
            symptom: `远程应用 "${remote.key}" 的开发 manifest 契约校验失败（${u.href}）`,
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
            symptom: `远程应用 "${remote.key}" 的开发 manifest 可达，但 exposes 为空（${u.href}）`,
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
            symptom: `宿主与远程应用 "${remote.key}" 的 @fulgurjs/federation 版本不一致`,
            cause: `宿主为 ${options.pluginVersion}，远程为 ${remoteVersion}（常见于 pnpm 安装源断链或漏升级）`,
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
      if (!portOpen) {
        console.warn(
          formatFulgurjsDiagnostic({
            code: 'DEV-005',
            symptom: `远程应用 "${remote.key}" 的 dev 端口 ${port} 无进程监听（${u.hostname}）`,
            cause: '远程服务未启动，或 remotes[].dev 端口/主机配置错误',
            fix: '启动对应远程服务，核对 remotes[].dev 和实际部署 base',
            details: { remote: remote.key, url: u.href, port, portOpen },
          }),
        )
      }
      console.warn(
        formatFulgurjsDiagnostic({
          code: 'DEV-001',
          symptom: `远程应用 "${remote.key}" 的 manifest 不可达（${u.href}）——将跳过该远程的路由存在性校验`,
          cause: portOpen
            ? '端口有监听但 manifest 不可读：核对同目录 manifest 是否部署、JSON/MIME 与 base 路径'
            : '远程端口无监听或地址错误',
          fix: '核对远程服务、入口同目录 manifest、实际 base、代理与 CORS；生产站不需要另起 dev server',
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
  return genRemoteSchemaModule({})
}

/** dev 的按需请求与启动预热共用同一导出形态。 */
export function genRemoteSchemaModule(schema: RemoteSchema): string {
  return `export const remoteSchema = ${JSON.stringify(schema)}; export default remoteSchema`
}
