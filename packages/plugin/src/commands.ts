/**
 * `fulgurjs explain` / `fulgurjs check-pages`（§12.2 / §12.3）。
 *
 * explain：只读解析仓库配置，输出某应用的有效联邦形态与加载链解释——应用角色、
 * remotes、公开 exposes、内部 setup、shared 关键设置、页面 spec 映射、
 * devSharedSelf 的最终值及来源。不请求网络、不读取 token、不输出环境变量秘密
 * （与 doctor 的部署态网络体检职责分开）。
 *
 * check-pages：把宿主页面表与远程 manifest（本地构建产物优先，或指定站点 URL）
 * 对照，报告未知 remote、缺失 expose、路由冲突与跳过原因。确定性错误以非零码退出；
 * 「无法验证」（远程不可达）与「确认缺失」严格区分，不把空清单当通过。
 */
import fs from 'node:fs'
import path from 'node:path'
import { loadRepoConfig, type AppConfig, type RepoConfig } from './config'
import { federationOptionsForApp } from './config'
import { validatePages, type PageViolation, type PageRouteLike } from './pages'
import { parseManifest, normalizeExposes, type FederationManifest } from './manifest'

export interface ExplainResult {
  app: string
  role: 'host' | 'remote' | 'dual'
  path: string
  base: string
  port: number
  remotes: Array<{ key: string; dev: string; prod: string }>
  exposes: string[]
  setup?: string
  shared: Array<{ name: string; singleton: boolean; requiredVersion: string | boolean }>
  devSharedSelf: { value: boolean; source: 'explicit' | 'inferred' }
  pages: Array<{ route: string; remote: string; spec: string; title?: string }>
  chain: string[]
}

function roleOf(app: AppConfig): ExplainResult['role'] {
  if (app.host && app.remote) return 'dual'
  return app.host ? 'host' : 'remote'
}

/** 页面 spec 映射（与 createHostPages 的推导规则一致：显式 spec 优先） */
function pageMappings(app: AppConfig): ExplainResult['pages'] {
  const pages = app.host?.pages ?? []
  const prefixes = Object.entries(app.host?.remotePrefixes ?? {}).sort((a, b) => b[0].length - a[0].length)
  const remoteOf = (route: string): string | null => {
    for (const [prefix, name] of prefixes) {
      const p = prefix.endsWith('/') ? prefix : `${prefix}/`
      if (route.startsWith(p) || `${route}/` === p) return name
    }
    return null
  }
  const derive = app.host?.deriveSpec ?? ((route: string): string =>
    route.split('/').filter(Boolean).slice(1).filter((s) => !s.startsWith(':')).join('/'))
  const out: ExplainResult['pages'] = []
  for (const page of pages as PageRouteLike[]) {
    const remote = remoteOf(page.route)
    if (!remote) continue
    const spec = `${remote}/${String(page.spec ?? derive(page.route)).replace(/^[./]+/, '')}`
    out.push({ route: page.route, remote, spec, title: typeof page.title === 'string' ? page.title : undefined })
  }
  return out
}

export async function explainApp(configPath: string, appPathOrName: string): Promise<ExplainResult> {
  const cfg: RepoConfig = await loadRepoConfig(configPath)
  const app = cfg.apps.find((a) => a.path === appPathOrName || a.name === appPathOrName)
  if (!app) {
    throw new Error(
      `[fulgurjs:explain] 应用 "${appPathOrName}" 不在配置中（可用：${cfg.apps.map((a) => a.path).join('、')}）`,
    )
  }
  // federationOptionsForApp 同时完成 remotes 冲突/未知应用的校验（复用同一条校验面）
  const opts = federationOptionsForApp(cfg, appPathOrName)
  const remotes = Object.entries((opts.remotes ?? {}) as Record<string, { dev?: string; prod?: string; external?: string }>).map(
    ([key, v]) => ({ key, dev: String(v.dev ?? v.external ?? ''), prod: String(v.prod ?? v.external ?? '') }),
  )
  const shared = Object.entries((opts.shared ?? {}) as Record<string, { singleton?: boolean; requiredVersion?: string }>).map(
    ([name, v]) => ({ name, singleton: !!v.singleton, requiredVersion: v.requiredVersion ?? false }),
  )
  const chain: string[] = []
  chain.push(app.host
    ? '宿主提供 AppContext（provideAppContext，含 sessionKey）→ 加载 remoteEntry/共享依赖 → 首次 loadRemote 执行该远程可选 setup/onSession → 取得页面模块 → 宿主布局渲染'
    : '被宿主消费：remoteEntry/共享依赖加载 → 宿主首次 loadRemote 本应用模块时执行可选 setup/onSession → 页面模块在宿主布局内渲染')
  if (app.remote?.setup) {
    chain.push(`setup 入口 ${app.remote.setup}：默认导出应用级执行一次；${'onSession'} 按宿主 sessionKey 去重（缺 sessionKey 时报 MFU-013）`)
  } else {
    chain.push('本应用未配置 setup：无初始化生命周期，loadRemote 直接返回模块（普通 expose 语义）')
  }
  return {
    app: app.name,
    role: roleOf(app),
    path: app.path,
    base: app.base,
    port: app.port,
    remotes,
    exposes: Object.keys(app.remote?.exposes ?? {}),
    setup: app.remote?.setup,
    shared,
    devSharedSelf: {
      value: opts.devSharedSelf === true,
      source: app.devSharedSelf === undefined ? 'inferred' : 'explicit',
    },
    pages: pageMappings(app),
    chain,
  }
}

export function formatExplain(r: ExplainResult): string {
  const roleText = r.role === 'dual' ? '宿主+远程（双角色）' : r.role === 'host' ? '宿主' : '远程'
  const L: string[] = []
  L.push(`应用 ${r.app}（${roleText}，目录 ${r.path}，dev 端口 ${r.port}，base ${r.base}）`)
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
    L.push(`页面 spec 映射（${r.pages.length}）：`)
    for (const p of r.pages) L.push(`  ${p.route} → ${p.spec}${p.title ? `（${p.title}）` : ''}`)
  } else {
    L.push('页面 spec 映射：（仓库配置未提供页面表——应用代码页面表为运行时真源）')
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
}

const normSpecKey = (s: string): string => s.replace(/^[./]+/, '').replace(/\/+$/, '')

/** 取某远程的 manifest：本地 dist 优先，其次站点 URL；都不可得返回 undefined（unverified） */
async function fetchRemoteManifest(
  cfg: RepoConfig,
  app: AppConfig,
  opts: { site?: string },
): Promise<{ manifest: FederationManifest; from: string } | undefined> {
  // 1) 本地构建产物：<root>/<appPath>/<deployDir||base 去斜杠>/fulgurjs-manifest.json 或 <appPath>/dist/
  const candidates = [app.deployDir || app.base.replace(/^\/|\/$/g, ''), 'dist']
  for (const dir of candidates) {
    const p = path.join(cfg.root, app.path, dir, 'fulgurjs-manifest.json')
    try {
      const parsed = parseManifest(JSON.parse(fs.readFileSync(p, 'utf8')))
      if (parsed.manifest && !parsed.unsupportedVersion) return { manifest: parsed.manifest, from: p }
    } catch {
      /* 下一候选 */
    }
  }
  // 2) 站点：<site>/<base>/fulgurjs-manifest.json
  if (opts.site) {
    const base = app.base === '/' ? '' : app.base.replace(/\/$/, '')
    const url = `${opts.site.replace(/\/$/, '')}${base}/fulgurjs-manifest.json`
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
      if (res.ok) {
        const parsed = parseManifest(await res.json())
        if (parsed.manifest && !parsed.unsupportedVersion) return { manifest: parsed.manifest, from: url }
      }
    } catch {
      /* unverified */
    }
  }
  return undefined
}

export async function checkPages(
  configPath: string,
  appPathOrName: string,
  opts: { site?: string } = {},
): Promise<CheckPagesResult> {
  const cfg = await loadRepoConfig(configPath)
  const app = cfg.apps.find((a) => a.path === appPathOrName || a.name === appPathOrName)
  if (!app) {
    throw new Error(`[fulgurjs:check-pages] 应用 "${appPathOrName}" 不在配置中（可用：${cfg.apps.map((a) => a.path).join('、')}）`)
  }
  const issues: CheckPagesIssue[] = []
  const pages = (app.host?.pages ?? []) as PageRouteLike[]
  const prefixes = app.host?.remotePrefixes ?? {}

  if (pages.length === 0) {
    issues.push({
      level: 'unverified',
      message:
        '仓库配置未提供页面表（pages 可选，应用代码页面表为运行时真源）——本命令无从核对。\n' +
        '  修法: 在 fulgurjs.config.ts 宿主 host.pages 提供页面表副本，或依赖 dev 期 remoteSchema 探针校验',
    })
    return { app: app.name, checked: 0, issues, failed: false }
  }

  // 路由表内在校验（R1–R5：剥参收敛/遮蔽/重复）
  const violations: PageViolation[] = validatePages(pages, { remotes: prefixes })
  for (const v of violations) {
    issues.push({ level: v.level === 'error' ? 'error' : 'warn', message: v.message })
  }

  // 每个 remote 的 exposes 可得性 → spec 存在性核对
  const remoteNames = [...new Set(Object.values(prefixes))]
  const manifests = new Map<string, { exposes: Set<string>; from: string }>()
  for (const name of remoteNames) {
    const remoteApp = cfg.apps.find((a) => a.name === name)
    if (!remoteApp) {
      issues.push({ level: 'error', message: `路由前缀映射到未知远程 "${name}"——配置 apps 中不存在该容器名` })
      continue
    }
    const got = await fetchRemoteManifest(cfg, remoteApp, opts)
    if (!got) {
      issues.push({
        level: 'unverified',
        message:
          `远程 "${name}" 的 manifest 不可得（本地 dist 与${opts.site ? `站点 ${opts.site}` : '默认 dist 路径'}均未命中）——该远程的 spec 存在性无法核对。\n` +
          `  修法: 先构建该远程（产物含 fulgurjs-manifest.json），或用 --site <URL> 指向已部署站点`,
      })
      continue
    }
    manifests.set(name, { exposes: new Set([...normalizeExposes(got.manifest).keys()].map(normSpecKey)), from: got.from })
  }

  const derive = app.host?.deriveSpec ?? ((r: string): string =>
    r.split('/').filter(Boolean).slice(1).filter((s) => !s.startsWith(':')).join('/'))
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

  // setup 存在性提示（info 级，随结果一并输出）
  return { app: app.name, checked, issues, failed: issues.some((i) => i.level === 'error') }
}

export function formatCheckPages(r: CheckPagesResult): string {
  const L: string[] = []
  const errors = r.issues.filter((i) => i.level === 'error')
  const unverified = r.issues.filter((i) => i.level === 'unverified')
  const warns = r.issues.filter((i) => i.level === 'warn')
  L.push(`[fulgurjs:check-pages] 应用 ${r.app}：核对 ${r.checked} 条页面，error ${errors.length} / warn ${warns.length} / 无法验证 ${unverified.length}`)
  for (const i of [...errors, ...warns, ...unverified]) L.push(`\n[${i.level.toUpperCase()}] ${i.message}`)
  if (r.issues.length === 0) L.push('全部页面 spec 与远程 exposes 一致 ✓')
  return L.join('\n')
}
