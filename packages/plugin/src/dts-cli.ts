/**
 * `fulgurjs types` 命令（6.5.0 远程类型自动生成）。
 *
 * 一个入口覆盖双角色（同一工程可以既是提供方又是宿主）：
 * 1. 提供方（有 exposes）：本地验证声明 bundle 生成——失败**非零退出**（CI 在
 *    typecheck 前运行的严格门禁；dev/build 不因类型失败中断页面与产物）；
 * 2. 宿主（有 remotes）：按 --mode（dev 默认 / prod）从远程 manifest 同步声明
 *    到本地类型目录（原子写入，失败非零退出，不吞网络/校验错误）；
 * 3. 双角色：先生成（纯本地，不依赖远程在线——不存在互等死锁）再同步。
 *
 * 同步后校验宿主可解析声明的外部类型依赖（externals）——缺失列出具体包与
 * 安装命令（TYP-005），非零退出。`--check` 只核对本地缓存与目标 revision 的
 * 一致性——它不访问网络，不代表远程线上最新已核实（诚实边界，help 同口径）。
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import type { AppConfigLoadResult } from './app-config'
import { loadAppConfig } from './app-config'
import { normalizeOptions } from './options'
import { RUNTIME_VERSION } from './version'
import { generateTypesBundle } from './dts-generate'
import { syncRemoteTypes, manifestUrlFromEntry, readMetadata } from './dts-sync'
import { checkTypesDiscovery } from './dts-discovery'

export interface TypesCommandOptions {
  configPath?: string
  mode?: 'dev' | 'prod'
  /** 相对 prod 地址的站点 origin（--mode prod 时 remotes.prod 形如 '/remote-a' 需要） */
  base?: string
  /** 只校验本地缓存与已记录 revision（不联网；不核实远程最新） */
  check?: boolean
  cwd?: string
}

export interface TypesCommandReport {
  exitCode: number
  lines: string[]
}

/** 宿主类型目录（与插件 dev/build 同一规则：默认 src/fulgurjs/types，无 src 用 .fulgurjs/types） */
export function hostTypesRoot(root: string, dtsDirOverride?: string): string {
  if (dtsDirOverride) return path.resolve(root, dtsDirOverride)
  return path.join(root, fs.existsSync(path.join(root, 'src')) ? 'src/fulgurjs/types' : '.fulgurjs/types')
}

export async function runTypesCommand(opts: TypesCommandOptions): Promise<TypesCommandReport> {
  const cwd = opts.cwd ?? process.cwd()
  const configPath = path.resolve(cwd, opts.configPath ?? 'fulgurjs.config.ts')
  const lines: string[] = []
  let failed = false
  let cfg: AppConfigLoadResult
  try {
    cfg = await loadAppConfig(configPath)
  } catch (e) {
    return { exitCode: 2, lines: [String((e as Error).message ?? e)] }
  }
  const root = path.dirname(configPath)
  const mode = opts.mode ?? 'dev'
  const n = normalizeOptions(cfg.options, root, mode === 'dev' ? 'serve' : 'build')
  const dtsEnabled = n.dts !== false
  if (!dtsEnabled) {
    lines.push(`dts: false——本工程主动关闭远程类型支持，types 命令不执行任何生成或同步。`)
    return { exitCode: 0, lines }
  }
  const typesRoot = hostTypesRoot(root, typeof n.dts === 'object' ? n.dts.dir : undefined)

  // ── 提供方：声明 bundle 生成验证 ──
  const publicExposes = n.exposes.filter((e) => !e.internal)
  if (publicExposes.length > 0) {
    const result = await generateTypesBundle({
      root,
      exposes: publicExposes.map((e) => ({ name: e.name, import: e.import })),
      pluginVersion: RUNTIME_VERSION,
    })
    if (result.ok) {
      lines.push(
        `[provider] 声明 bundle 生成成功：${publicExposes.length} 个公开 exposes → ${result.fileCount} 个声明文件` +
          `（工具 ${result.tool}，revision ${result.index.revision}${result.index.externals.length > 0 ? `，externals: ${result.index.externals.join(', ')}` : ''}）。`,
      )
    } else {
      failed = true
      lines.push(`[provider] TYP-001 声明 bundle 生成失败（类型资源不会发布/生效）：`)
      for (const d of result.diagnostics) lines.push(`  ${d.replaceAll('\n', '\n  ')}`)
    }
  }

  // ── 宿主：远程类型同步 ──
  const syncable = n.remotes.filter((r) => !r.promise && (mode === 'dev' ? r.devEntry : r.prodEntry))
  if (opts.check) {
    // --check：只核对本地账本（不联网；不核实远程最新——见函数头说明）
    for (const remote of n.remotes) {
      const meta = readMetadata(path.join(typesRoot, remote.key))
      if (!meta) {
        failed = true
        lines.push(`[check] 远程 ${remote.key}：本地无已同步类型（先运行 fulgurjs types）。`)
      } else {
        lines.push(`[check] 远程 ${remote.key}：本地 revision ${meta.revision}（来源 ${meta.source}，${meta.files.length} 个文件，${new Date(meta.syncedAt).toLocaleString()} 同步）。`)
      }
    }
    return { exitCode: failed ? 1 : 0, lines }
  }
  if (syncable.length > 0) {
    lines.push(`[consumer] 开始同步 ${syncable.length} 个远程的类型（--mode ${mode}，目录 ${path.relative(root, typesRoot) || typesRoot}）……`)
    const externalsMissing = new Map<string, string[]>()
    for (const remote of syncable) {
      const entry = mode === 'dev' ? remote.devEntry : remote.prodEntry
      const entryUrl = entry.startsWith('/') ? (opts.base ? new URL(entry, opts.base).toString() : entry) : entry
      const manifestUrl = manifestUrlFromEntry(entryUrl)
      if (!manifestUrl) {
        failed = true
        lines.push(`[consumer] 远程 ${remote.key}：地址（${entry}${entry !== entryUrl ? ` → ${entryUrl}` : ''}）无法推导 manifest URL，已跳过。${entry.startsWith('/') && !opts.base ? '--mode prod 的相对地址需要 --base <站点 origin>（如 https://your-site）。' : ''}`)
        continue
      }
      const result = await syncRemoteTypes({
        alias: remote.key,
        manifestUrl,
        typesRoot,
        source: entry,
      })
      lines.push(`[consumer] ${result.status === 'synced' ? '✓' : result.status === 'unchanged' ? '=' : '×'} 远程 ${remote.key}：${result.message}`)
      for (const w of result.warnings ?? []) lines.push(`  警告：${w}`)
      if (result.status === 'failed' || result.status === 'stale') failed = true
      if (result.status === 'absent') {
        // 远程未提供类型：动态字符串仍可运行（unknown 边界），但严格类型验收按设计要求更新提供方——CI 报非零
        failed = true
      }
      const meta = readMetadata(path.join(typesRoot, remote.key))
      if (meta) {
        for (const ext of meta.externals) {
          if (!resolvePackage(root, ext)) {
            const list = externalsMissing.get(ext) ?? []
            list.push(remote.key)
            externalsMissing.set(ext, list)
          }
        }
      }
    }
    if (externalsMissing.size > 0) {
      failed = true
      lines.push(`[consumer] TYP-005 宿主缺少远程声明的外部类型依赖（模板/组件类型会退化为该包不可解析）：`)
      for (const [pkg, remotes] of externalsMissing) {
        lines.push(`  ${pkg}（被 ${remotes.join('、')} 的声明引用）——请安装：npm i -D ${pkg}（或对应包管理器等价命令）`)
      }
    }
  }

  if (publicExposes.length === 0 && syncable.length === 0) {
    lines.push('本工程既无公开 exposes 也无可同步 remotes——没有类型工作可做。')
    return { exitCode: failed ? 1 : 0, lines }
  }

  // ── 发现检查：生成目录必须被应用 tsconfig 覆盖（IDE/tsc 才能看到 ambient 声明）──
  const discovery = checkTypesDiscovery(root, typesRoot)
  if (discovery.covered) {
    lines.push(`[discovery] ✓ 类型目录被应用 tsconfig 覆盖（${discovery.configs.join('、')}）。`)
  } else {
    // 未覆盖：类型文件已写入但检查器看不见——诚实报非零（不把“已生成”当“已生效”）
    failed = true
    lines.push(`[discovery] × ${discovery.fixHint ?? '类型目录未被应用 tsconfig 覆盖。'}`)
  }
  return { exitCode: failed ? 1 : 0, lines }
}

/** 宿主能否解析某包（存在性检查：package.json 可达即视为可解析） */
function resolvePackage(root: string, pkg: string): boolean {
  try {
    createRequire(path.join(root, 'package.json')).resolve(`${pkg}/package.json`)
    return true
  } catch {
    try {
      createRequire(path.join(root, 'package.json')).resolve(pkg)
      return true
    } catch {
      return false
    }
  }
}
