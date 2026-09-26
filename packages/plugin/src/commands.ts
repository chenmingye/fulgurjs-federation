/**
 * `fulgurjs explain` / `fulgurjs check-pages`（§12.2 / §12.3）。
 *
 * 配置形态（唯一）：单项目 fulgurjs.config.ts——默认导出 = federation() 选项；可选具名导出
 * hostPages 供页面契约核对。角色按实际 federation 选项判定（remotes=消费、
 * exposes/setup=提供，两者均有=双角色）；base/端口由 vite.config.ts 管理，不在本命令输出里臆造。
 *
 * check-pages 的 manifest 来源优先级（每个 remote 独立显示实际来源）：
 * 1. --manifest <remote>=<路径|URL>（显式指定，最高优先级，可重复）
 * 2. --site <URL> / 消费方 remotes 的 prod 地址：推导 <prod>/fulgurjs-manifest.json
 * 无本地 dist 回退（远程可位于任意仓库；显式来源不可达 = 无法验证，不假装通过）。
 * 「无法验证」（不可达）与「确认缺失」严格区分；--require-verified 时无法验证也非零退出。
 */
import fs from 'node:fs'
import path from 'node:path'
import { loadAppConfig, roleOfOptions, type AppConfigLoadResult, type HostPagesData } from './app-config'
import { validatePages, type PageViolation, type PageRouteLike } from './pages'
import { parseManifest, normalizeExposes, type FederationManifest } from './manifest'
import type { FederationOptions } from './options'

export interface ExplainResult {
  app: string
  role: 'host' | 'remote' | 'dual'
  path: string
  remotes: Array<{ key: string; dev: string; prod: string }>
  exposes: string[]
  setup?: string
  shared: Array<{ name: string; singleton: boolean; requiredVersion: string | boolean }>
  devSharedSelf: { value: boolean; source: 'explicit' | 'inferred' }
  pages: Array<{ route: string; remote: string; spec: string; title?: string }>
  /** 页面数据来源说明（报告 hostPages 导出是否找到） */
  pagesSource?: string
  chain: string[]
}

function mappingsOf(
  hp: Pick<HostPagesData, 'pages' | 'remotePrefixes' | 'deriveSpec'>,
  deriveFallback: (route: string) => string,
): ExplainResult['pages'] {
  const pages = hp.pages ?? []
  const prefixes = Object.entries(hp.remotePrefixes ?? {}).sort((a, b) => b[0].length - a[0].length)
  const remoteOf = (route: string): string | null => {
    for (const [prefix, name] of prefixes) {
      const p = prefix.endsWith('/') ? prefix : `${prefix}/`
      if (route.startsWith(p) || `${route}/` === p) return name
    }
    return null
  }
  const derive = hp.deriveSpec ?? deriveFallback
  const out: ExplainResult['pages'] = []
  for (const page of pages as PageRouteLike[]) {
    const remote = remoteOf(page.route)
    if (!remote) continue
    const spec = `${remote}/${String(page.spec ?? derive(page.route)).replace(/^[./]+/, '')}`
    out.push({ route: page.route, remote, spec, title: typeof page.title === 'string' ? page.title : undefined })
  }
  return out
}

const DEFAULT_DERIVE = (route: string): string =>
  route.split('/').filter(Boolean).slice(1).filter((s) => !s.startsWith(':')).join('/')

/** federation() 选项的 remotes 归一（string | {dev,prod,external}） */
function remotesOfOptions(options: FederationOptions): ExplainResult['remotes'] {
  return Object.entries(options.remotes ?? {}).map(([key, v]) => {
    const cfg = typeof v === 'string' ? { external: v } : (v as { dev?: string; prod?: string; external?: string })
    return { key, dev: String(cfg.dev ?? cfg.external ?? ''), prod: String(cfg.prod ?? cfg.external ?? '') }
  })
}

/** federation() 选项的 shared 归一（数组 | semver 简写 | hint 对象） */
function sharedOfOptions(options: FederationOptions): ExplainResult['shared'] {
  const shared = options.shared
  if (!shared) return []
  if (Array.isArray(shared)) {
    return shared.map((name) => ({ name, singleton: false, requiredVersion: false as const }))
  }
  return Object.entries(shared).map(([name, v]) => {
    const hint = typeof v === 'string' ? { requiredVersion: v } : (v ?? {})
    return {
      name,
      singleton: !!(hint as { singleton?: boolean }).singleton,
      requiredVersion: (hint as { requiredVersion?: string | false }).requiredVersion ?? false,
    }
  })
}

function chainLines(options: FederationOptions, role: ExplainResult['role']): string[] {
  const chain: string[] = []
  chain.push(role === 'remote'
    ? '被宿主消费：remoteEntry/共享依赖加载 → 宿主首次 loadRemote 本应用模块时执行可选 setup/onSession → 页面模块在宿主布局内渲染'
    : '宿主提供 AppContext（provideAppContext，含 sessionKey）→ 加载 remoteEntry/共享依赖 → 首次 loadRemote 执行该远程可选 setup/onSession → 取得页面模块 → 宿主布局渲染')
  if (options.setup) {
    chain.push(`setup 入口 ${options.setup}：默认导出应用级执行一次；onSession 按宿主 sessionKey 去重（缺 sessionKey 时报 MFU-013）`)
  } else {
    chain.push('本应用未配置 setup：无初始化生命周期，loadRemote 直接返回模块（普通 expose 语义）')
  }
  return chain
}

function explainAppMode(loaded: AppConfigLoadResult): ExplainResult {
  const options = loaded.options!
  const role = roleOfOptions(options)
  const devSharedSelfExplicit = options.devSharedSelf !== undefined
  const devSharedSelfValue = devSharedSelfExplicit ? options.devSharedSelf === true : role !== 'host'
  const hp = loaded.hostPages
  return {
    app: options.name,
    role,
    path: loaded.appRoot,
    remotes: remotesOfOptions(options),
    exposes: Object.keys(options.exposes ?? {}),
    setup: options.setup,
    shared: sharedOfOptions(options),
    devSharedSelf: { value: devSharedSelfValue, source: devSharedSelfExplicit ? 'explicit' : 'inferred' },
    pages: hp ? mappingsOf(hp, DEFAULT_DERIVE) : [],
    pagesSource: hp
      ? `fulgurjs.config.ts 的 hostPages 具名导出（${hp.pages.length} 条；运行时真源为应用内同一数据模块）`
      : '未找到 hostPages 具名导出（纯远程应用无需页面表；宿主若要跑 check-pages 请在 fulgurjs.config.ts 补具名导出 hostPages）',
    chain: chainLines(options, role),
  }
}

export async function explainApp(configPath: string): Promise<ExplainResult> {
  return explainAppMode(await loadAppConfig(configPath))
}

export function formatExplain(r: ExplainResult): string {
  const roleText = r.role === 'dual' ? '宿主+远程（双角色）' : r.role === 'host' ? '宿主' : '远程'
  const L: string[] = []
  L.push(`应用 ${r.app}（${roleText}，单项目配置，目录 ${r.path}；base/dev 端口由 vite.config.ts 管理）`)
  if (r.remotes.length) {
    L.push('消费远程：')
    for (const x of r.remotes) L.push(`  ${x.key} → dev ${x.dev} / prod ${x.prod}`)
  } else {
    L.push('消费远程：（无）')
  }
  L.push(`公开 exposes（${r.exposes.length}）：${r.exposes.join('、') || '（空）'}`)
  L.push(`内部 setup：${r.setup ?? '（未配置——无初始化生命周期）'}`)
  if (r.shared.length) {
    L.push('shared：')
    for (const s of r.shared) {
      L.push(`  ${s.name}${s.singleton ? ' [singleton]' : ''} requiredVersion=${String(s.requiredVersion)}`)
    }
  }
  L.push(`devSharedSelf：${r.devSharedSelf.value}（来源：${r.devSharedSelf.source === 'explicit' ? '显式配置' : '按角色推断——提供 exposes/setup 的应用为 true，纯宿主为 false'}）`)
  if (r.pages.length) {
    L.push(`页面 spec 映射（${r.pages.length}）——来源：${r.pagesSource}：`)
    for (const p of r.pages) L.push(`  ${p.route} → ${p.spec}${p.title ? `（${p.title}）` : ''}`)
  } else {
    L.push(`页面 spec 映射：（无）——来源：${r.pagesSource}`)
  }
  L.push('加载链：')
  for (const c of r.chain) L.push(`  · ${c}`)
  return L.join('\n')
}

// ── check-pages ───────────────────────────────────────────────────────────────

export interface CheckPagesIssue {
  level: 'error' | 'warn' | 'unverified'
  message: string
}

export interface CheckPagesResult {
  app: string
  checked: number
  issues: CheckPagesIssue[]
  /** true = 存在确定性 error（CLI 退出码非零） */
  failed: boolean
  /** --require-verified：unverified 也视为失败（退出码非零） */
  unverifiedFailed?: boolean
  /** 各 remote 的 manifest 实际来源（防旧本地 dist 冒充线上核对） */
  manifestSources?: Array<{ remote: string; from: string }>
}

export interface CheckPagesOptions {
  site?: string
  /** 显式 manifest：<remote 名或 remotePrefixes 值>=<文件路径|URL>，最高优先级 */
  manifests?: Record<string, string>
  /** 严格模式：无法验证也非零退出（CI 门禁） */
  requireVerified?: boolean
}

const normSpecKey = (s: string): string => s.replace(/^[./]+/, '').replace(/\/+$/, '')

function manifestFromFile(p: string): FederationManifest | undefined {
  try {
    const parsed = parseManifest(JSON.parse(fs.readFileSync(p, 'utf8')))
    if (parsed.manifest && !parsed.unsupportedVersion) return parsed.manifest
  } catch {
    /* 下一候选 */
  }
  return undefined
}

async function manifestFromUrlOnce(url: string): Promise<{ manifest: FederationManifest; url: string } | undefined> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (res.ok) {
      const parsed = parseManifest(await res.json())
      if (parsed.manifest && !parsed.unsupportedVersion) return { manifest: parsed.manifest, url }
    }
  } catch {
    /* unverified */
  }
  return undefined
}

/**
 * 抓取 manifest；http://localhost 失败时自动改试 127.0.0.1——
 * Node 18 的 fetch 把 localhost 只解析到 ::1，本机服务通常只监听 IPv4（实测 ECONNREFUSED），
 * 不做该回退会让 CLI 在 Node 18 下对可用站点误报"无法验证"。返回值带实际命中的 URL 供来源报告。
 */
async function manifestFromUrl(url: string): Promise<{ manifest: FederationManifest; url: string } | undefined> {
  const got = await manifestFromUrlOnce(url)
  if (got) return got
  if (/^http:\/\/localhost(?=[:/])/.test(url)) {
    return manifestFromUrlOnce(url.replace(/^http:\/\/localhost(?=[:/])/, 'http://127.0.0.1'))
  }
  return undefined
}

/** name@url 形态剥容器名前缀（运行时支持该写法，CLI 推导 manifest 前先归一化） */
export function stripRemoteNamePrefix(addr: string): string {
  return addr.replace(/^[A-Za-z0-9_.-]+@/, '')
}

/**
 * 由 remote 地址推导 manifest URL（与运行时同语义的宽容解析，CLI 不自维护第二套拼接规则）：
 * `name@url` 剥容器名前缀；`…/fulgurjs-remoteEntry.js` 与 `…/fulgurjs-manifest.json`
 * 取同目录 manifest；其余（目录形态）追加 `/fulgurjs-manifest.json`。
 */
export function manifestUrlForRemoteAddress(addr: string): string {
  const stripped = stripRemoteNamePrefix(addr)
  const clean = stripped.replace(/\/+$/, '')
  if (/fulgurjs-manifest\.json$/.test(clean)) return clean
  if (/fulgurjs-remoteEntry\.js$/.test(clean)) return clean.replace(/fulgurjs-remoteEntry\.js$/, 'fulgurjs-manifest.json')
  return `${clean}/fulgurjs-manifest.json`
}

/** 单项目形态：消费方 remotes 的 prod 地址 → manifest URL（--site 派生或显式 --manifest） */
async function fetchRemoteManifestApp(
  loaded: AppConfigLoadResult & { kind: 'app' },
  options: FederationOptions,
  remoteName: string,
  opts: CheckPagesOptions,
): Promise<{ manifest: FederationManifest; from: string } | undefined> {
  const explicit = opts.manifests?.[remoteName]
  if (explicit) {
    if (/^https?:\/\//.test(explicit)) {
      const got = await manifestFromUrl(explicit)
      return got ? { manifest: got.manifest, from: explicit } : undefined
    }
    const got = manifestFromFile(explicit)
    return got ? { manifest: got, from: explicit } : undefined
  }
  const remoteCfg = (options.remotes ?? {})[remoteName]
  if (!remoteCfg) return undefined
  const cfg = typeof remoteCfg === 'string' ? { external: remoteCfg } : (remoteCfg as { prod?: string; external?: string; dev?: string })
  const prodRaw = cfg.prod ?? cfg.external ?? ''
  if (!prodRaw) return undefined
  const prodBase = stripRemoteNamePrefix(prodRaw)
  if (/^https?:\/\//.test(prodBase)) {
    // 绝对地址兼容全部运行时写法：目录 URL / 完整 remoteEntry URL / name@url——失败即无法验证，不回退
    const url = manifestUrlForRemoteAddress(prodBase)
    const got = await manifestFromUrl(url)
    if (got) return { manifest: got.manifest, from: got.url }
    return undefined
  }
  if (opts.site) {
    const url = manifestUrlForRemoteAddress(`${opts.site.replace(/\/$/, '')}${prodBase.startsWith('/') ? prodBase : `/${prodBase}`}`)
    const got = await manifestFromUrl(url)
    if (got) return { manifest: got.manifest, from: got.url }
    return undefined
  }
  return undefined
}

async function checkPagesApp(
  loaded: AppConfigLoadResult,
  opts: CheckPagesOptions,
): Promise<CheckPagesResult> {
  const options = loaded.options!
  const issues: CheckPagesIssue[] = []
  const hp = loaded.hostPages
  const pages = (hp?.pages ?? []) as PageRouteLike[]
  const prefixes = hp?.remotePrefixes ?? {}

  if (pages.length === 0) {
    issues.push({
      level: 'unverified',
      message:
        'fulgurjs.config.ts 未提供 hostPages 具名导出——无从核对页面契约（纯远程应用属正常，无需页面表）。\n' +
        '  修法: 宿主应用在 fulgurjs.config.ts 加具名导出 hostPages = { pages, remotePrefixes, deriveSpec? }（与运行时 createHostPages 消费同一份数据模块）',
    })
    return { app: options.name, checked: 0, issues, failed: false, unverifiedFailed: !!opts.requireVerified && issues.some((i) => i.level === 'unverified'), manifestSources: [] }
  }

  // 路由表内在校验（R1–R5：剥参收敛/遮蔽/重复）
  const violations: PageViolation[] = validatePages(pages, { remotes: prefixes })
  for (const v of violations) {
    issues.push({ level: v.level === 'error' ? 'error' : 'warn', message: v.message })
  }

  const remoteNames = [...new Set(Object.values(prefixes))]
  const manifests = new Map<string, { exposes: Set<string>; from: string }>()
  const sources: Array<{ remote: string; from: string }> = []
  for (const name of remoteNames) {
    if (!options.remotes || !(name in options.remotes)) {
      issues.push({ level: 'error', message: `路由前缀映射到远程 "${name}"，但本应用 federation({ remotes }) 未消费它——宿主只核对它实际消费的远程` })
      continue
    }
    const got = await fetchRemoteManifestApp(loaded, options, name, opts)
    if (!got) {
      const how = opts.manifests?.[name]
        ? `--manifest ${name}=${opts.manifests[name]} 不可达或非有效 manifest`
        : opts.site
          ? `按 remotes prod 地址与 --site ${opts.site} 推导的 manifest URL 不可达`
          : '未提供 manifest 来源'
      issues.push({
        level: 'unverified',
        message:
          `远程 "${name}" 的 manifest 不可得（${how}）——该远程的 spec 存在性无法核对。\n` +
          `  修法: --manifest ${name}=<已构建产物路径或 https://…/fulgurjs-manifest.json>，或 --site <部署站点>（按 prod 地址推导）`,
      })
      continue
    }
    manifests.set(name, { exposes: new Set([...normalizeExposes(got.manifest).keys()].map(normSpecKey)), from: got.from })
    sources.push({ remote: name, from: got.from })
  }

  const derive = hp?.deriveSpec ?? DEFAULT_DERIVE
  let checked = 0
  for (const page of pages) {
    const prefixHit = Object.entries(prefixes).sort((a, b) => b[0].length - a[0].length).find(
      ([p]) => page.route.startsWith(p.endsWith('/') ? p : `${p}/`) || `${page.route}/` === (p.endsWith('/') ? p : `${p}/`),
    )
    if (!prefixHit) {
      issues.push({ level: 'error', message: `路由 "${page.route}" 不在任何 remotePrefixes 前缀下` })
      continue
    }
    checked++
    const m = manifests.get(prefixHit[1])
    if (!m) continue // unverified 已报告
    const spec = normSpecKey(String(page.spec ?? derive(page.route)))
    if (!m.exposes.has(spec)) {
      issues.push({
        level: 'error',
        message:
          `路由 "${page.route}" 的 spec "${spec}" 不在远程 "${prefixHit[1]}" 的 exposes 清单中（来源 ${m.from}）。\n` +
          `  远程实际 exposes（前 10）：${[...m.exposes].slice(0, 10).join('、') || '（空）'}\n` +
          `  修法: 核对远程 federation({ exposes }) 键名或修正页面表 spec`,
      })
    }
  }

  const failed = issues.some((i) => i.level === 'error')
  const unverified = issues.filter((i) => i.level === 'unverified').length
  return { app: options.name, checked, issues, failed, unverifiedFailed: !!opts.requireVerified && unverified > 0, manifestSources: sources }
}

export async function checkPages(
  configPath: string,
  opts: CheckPagesOptions = {},
): Promise<CheckPagesResult> {
  return checkPagesApp(await loadAppConfig(configPath), opts)
}

export function formatCheckPages(r: CheckPagesResult): string {
  const L: string[] = []
  const errors = r.issues.filter((i) => i.level === 'error')
  const unverified = r.issues.filter((i) => i.level === 'unverified')
  const warns = r.issues.filter((i) => i.level === 'warn')
  L.push(`[fulgurjs:check-pages] 应用 ${r.app}：核对 ${r.checked} 条页面，error ${errors.length} / warn ${warns.length} / 无法验证 ${unverified.length}`)
  if (r.manifestSources?.length) {
    L.push('manifest 来源（优先级：--manifest > --site/prod 推导；显式指定来源失败不回退、以实际命中的来源为准）：')
    for (const s of r.manifestSources) L.push(`  ${s.remote} ← ${s.from}`)
  }
  for (const i of [...errors, ...warns, ...unverified]) L.push(`\n[${i.level.toUpperCase()}] ${i.message}`)
  if (r.issues.length === 0) L.push('全部页面 spec 与远程 exposes 一致 ✓')
  if (r.unverifiedFailed && unverified.length > 0 && errors.length === 0) {
    L.push(`\n--require-verified：存在 ${unverified.length} 项无法验证——按 CI 严格模式判定为未通过（退出码非零）`)
  }
  return L.join('\n')
}
