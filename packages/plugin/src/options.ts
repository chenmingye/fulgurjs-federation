/**
 * 配置规范化：webpack ModuleFederationPlugin 配置面 1:1 归一化。
 * 每个 webpack 选项在此有唯一归宿（接受/适配/告警），对齐表见 DESIGN.md §2。
 */
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { RUNTIME_VERSION } from './version'

export interface SharedHint {
  /** 放入共享作用域的本地模块；false 表示不提供本地副本 */
  import?: string | false
  /** 用于从 package.json 推断 requiredVersion 的包名 */
  packageName?: string
  /** 期望版本（完整 semver 语法 / false 接受任意） */
  requiredVersion?: string | false
  /** 只允许单实例 */
  singleton?: boolean
  /** 版本无效时抛运行时错误（默认：有本地副本且非 singleton 时为 true，对齐 webpack） */
  strictVersion?: boolean
  /** 在共享作用域中的键（导入名与共享名不同时使用） */
  shareKey?: string
  /** 共享作用域命名空间 */
  shareScope?: string
  /** 同步提供（打进初始 chunk，总是被下载） */
  eager?: boolean
  /** 提供版本显式指定 */
  version?: string
}

export type SharedConfig = string[] | Record<string, string | SharedHint>

export interface ExposeHint {
  import: string
  /** 稳定 chunk 文件名（不写则内部 id，随构建变化） */
  name?: string
}

export interface RemoteEntryConfig {
  external?: string
  shareScope?: string
  /** dev 专用地址（缺省回落 external） */
  dev?: string
  /** prod 专用地址（缺省回落 external） */
  prod?: string
  timeout?: number
  retries?: number
  /** 备用 remoteEntry 地址 */
  fallback?: string[]
  breaker?: { threshold?: number; resetMs?: number }
}

export interface NormalizedShared {
  /** 原始配置键（可能带尾部 /） */
  configKey: string
  /** 共享作用域中的键（shareKey，默认 = 去掉尾部 / 的键或显式 shareKey） */
  shareKey: string
  /** 本地模块 specifier；false 表示不提供 */
  import: string | false
  requiredVersion: string | false
  singleton: boolean
  strictVersion: boolean
  shareScope: string
  eager: boolean
  /** 提供方版本（安装版本或显式 version） */
  version: string
  /** 匹配别名：configKey / import specifier / packageName（vue 插件等注入的 helper import 也走共享） */
  aliases: string[]
}

export interface NormalizedRemote {
  /** 本地引用前缀（remotes 的键） */
  key: string
  /** 远程自报容器名（name@url 的 name；与 key 可以不同——重命名语义） */
  name: string
  shareScope: string
  /** dev 下容器入口 URL */
  devEntry: string
  /** prod 下容器入口 URL */
  prodEntry: string
  timeout?: number
  retries?: number
  fallback?: string[]
  breaker?: { threshold?: number; resetMs?: number }
  /** promise-based remote */
  promise?: boolean
}

export interface NormalizedExpose {
  /** './Button' */
  name: string
  /** 源模块路径 */
  import: string
  /** 稳定 chunk 名（可选） */
  chunkName?: string
}

export interface NormalizedOptions {
  name: string
  uniqueName: string
  filename: string
  exposes: NormalizedExpose[]
  remotes: NormalizedRemote[]
  shared: NormalizedShared[]
  shareScope: string
  remoteType: 'module'
  runtime?: string | false
  runtimeChunk?: boolean | 'single'
  manifest: boolean
  runtimePlugins: string[]
  dts: boolean | { dir?: string }
  root: string
  /** 本插件版本（D.5 DEV-006：宿主/远程版本一致性校验） */
  pluginVersion: string
  /** 包依赖表（推断 requiredVersion / 提供版本用） */
  pkgDependencies: Record<string, string>
  warnings: string[]
  /** dev 下自身源码是否参与 shared 协商改写（devSharedSelf 选项的规范化结果） */
  devSharedSelf: boolean
}

export interface FulgurOptions {
  name: string
  filename?: string
  exposes?: Record<string, string | ExposeHint>
  remotes?: Record<string, string | RemoteEntryConfig | (() => Promise<any>)>
  shared?: SharedConfig
  shareScope?: string
  remoteType?: string
  library?: { type?: string; name?: string }
  runtime?: string | false
  runtimeChunk?: boolean | 'single'
  manifest?: boolean | Record<string, unknown>
  runtimePlugins?: string[]
  dts?: boolean | { dir?: string }
  /** 接受并恒为 true：TLA 天然异步边界，无需手工 bootstrap（比 webpack 更进一步） */
  automaticAsyncBoundary?: boolean
  /** 接受并恒为 true：preloadRemote 能力始终可用 */
  dataPrefetch?: boolean
  /** 接受 no-op：Rollup/Rolldown 原生 tree-shaking 已覆盖 */
  usedExports?: boolean
  ignoreUnusedSharedExports?: boolean
  /**
   * dev 下自身源码（含依赖，需配合 optimizeDeps.exclude）是否参与 shared 协商改写。
   * 默认：纯 remote（无 remotes）为 true——被宿主消费的组件需协商到宿主实例；
   * 有 remotes 的宿主为 false——自身 import 即自身 provide，避免巨型工程 TLA/循环依赖风险。
   * 双向联邦（宿主同时 expose 组件给更高层消费）显式设 true。
   */
  devSharedSelf?: boolean
}

export const DEFAULT_FILENAME = 'fulgur-remoteEntry.js'
export const RUNTIME_VIRTUAL_ID = 'virtual:fulgur-runtime'
export const INIT_VIRTUAL_ID = 'virtual:fulgur-init'
export const PROVIDES_VIRTUAL_ID = 'virtual:fulgur-provides'
export const REMOTE_ENTRY_VIRTUAL_ID = 'virtual:fulgur-remote-entry'
export const SHARED_FACADE_PREFIX = 'virtual:fulgur-shared:'
/** 预构建协商门面前缀：optimizeDeps 外部化产物内对 shared 键的导入指向它（完整命名空间语义） */
export const SHARED_NS_FACADE_PREFIX = 'virtual:fulgur-shared-ns:'

// 不用 \0 前缀：rollup 对 \0 虚拟模块做无副作用激进摇树，会剥掉 init 的顶层调用
export const RESOLVED = {
  runtime: 'virtual:fulgur-runtime',
  init: 'virtual:fulgur-init',
  provides: 'virtual:fulgur-provides',
  remoteEntry: 'virtual:fulgur-remote-entry',
  sharedFacade: (name: string) => `virtual:fulgur-shared:${name}`,
  sharedNsFacade: (name: string) => `virtual:fulgur-shared-ns:${name}`,
  /** CJS require(<shared>) 垫片：与 sharedNsFacade 同体，仅 id 形态不同（保持 require 调用语义） */
  cjsNsFacade: (name: string) => `virtual:fulgur-cjs-ns:${name}`,
}

function joinUrl(base: string, file: string): string {
  const b = base.endsWith('/') ? base : `${base}/`
  return `${b}${file.replace(/^\//, '')}`
}

/**
 * 解析 remote 地址（webpack `name@url` 语法 + 单地址自动切换）：
 * - `shop@http://host/entry.js` → 自报名 shop（键可重命名）
 * - `http://host:port/base` → dev 拼 `@fulgur-entry.js`，prod 拼 filename
 * - 以 .js 结尾 → prod 原样使用；dev 仍按 base 拼 `@fulgur-entry.js`
 */
function normalizeRemoteValue(
  key: string,
  value: string | RemoteEntryConfig | (() => Promise<any>),
  filename: string,
  warnings: string[],
): NormalizedRemote {
  if (typeof value === 'function') {
    warnings.push(
      `remotes["${key}"] is a function (promise-based remote): it cannot be serialized into the bundle; ` +
        `register it at runtime via registerRemote() (same semantics as webpack "promise new Promise"). ` +
        `The key stays in config for import-syntax rewriting.`,
    )
    return {
      key,
      name: key,
      shareScope: 'default',
      devEntry: '',
      prodEntry: '',
      promise: true,
    }
  }
  const cfg: RemoteEntryConfig = typeof value === 'string' ? { external: value } : value
  let raw = cfg.external ?? ''
  let selfName = key
  if (raw) {
    const at = raw.indexOf('@')
    if (at > 0 && at < raw.length - 1 && !/^https?:$/.test(raw.slice(0, at))) {
      selfName = raw.slice(0, at)
      raw = raw.slice(at + 1)
    } else if (at === 0 || at === raw.length - 1) {
      throw new Error(`Invalid remote request "${raw}" for "${key}": misplaced "@".`)
    }
  }

  const resolveEntry = (rawUrl: string, mode: 'dev' | 'prod'): string => {
    if (!rawUrl) return ''
    if (/\.js(\?.*)?$/.test(rawUrl)) {
      if (mode === 'prod') return rawUrl
      // dev 下给了完整 remoteEntry 地址：视为用户自管，直接使用
      return rawUrl
    }
    return joinUrl(rawUrl, mode === 'dev' ? '@fulgur-entry.js' : filename)
  }

  const explicitDev = cfg.dev
  const explicitProd = cfg.prod
  return {
    key,
    name: selfName,
    shareScope: cfg.shareScope || 'default',
    devEntry: resolveEntry(explicitDev || raw, 'dev'),
    prodEntry: resolveEntry(explicitProd || raw, 'prod'),
    timeout: cfg.timeout,
    retries: cfg.retries,
    fallback: cfg.fallback,
    breaker: cfg.breaker,
  }
}

function readPkgDependencies(root: string): Record<string, string> {
  try {
    const pkgPath = path.join(root, 'package.json')
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
    return {
      ...(pkg.dependencies ?? {}),
      ...(pkg.optionalDependencies ?? {}),
      ...(pkg.peerDependencies ?? {}),
      ...(pkg.devDependencies ?? {}),
    }
  } catch {
    return {}
  }
}

/** 从 node_modules 读取某包的真实安装版本（尊重别名/pnpm 布局） */
export function readInstalledVersion(root: string, specifier: string): string | null {
  try {
    const req = createRequire(path.join(root, 'package.json'))
    const pkgJsonPath = req.resolve(`${specifier}/package.json`, { paths: [root] })
    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'))
    return typeof pkg.version === 'string' ? pkg.version : null
  } catch {
    return null
  }
}

/** 归一化 shared：数组 / semver 简写 / 完整 hint 三种形式 + requiredVersion 推断 + strictVersion 默认值 */
function normalizeShared(
  shared: SharedConfig | undefined,
  shareScopeDefault: string,
  pkgDependencies: Record<string, string>,
  root: string,
  warnings: string[],
): NormalizedShared[] {
  if (!shared) return []
  const entries: Array<[string, SharedHint]> = []
  if (Array.isArray(shared)) {
    for (const item of shared) entries.push([item, {}])
  } else {
    for (const [key, val] of Object.entries(shared)) {
      entries.push([key, typeof val === 'string' ? { requiredVersion: val } : (val ?? {})])
    }
  }

  const out: NormalizedShared[] = []
  for (const [configKey, hint] of entries) {
    // CFG-008（shared 非法组合）：eager 依赖本地副本打进初始 chunk，import:false（纯消费）
    // 与 eager 语义互斥；同 shareKey+shareScope 重复声明会让版本裁决与 loaded 标记歧义
    if (hint.eager && hint.import === false) {
      configError(
        `CFG-008: shared["${configKey}"] combines eager with import:false`,
        hint,
        'eager requires a local copy to bundle into the initial chunk',
        `shared: { '${configKey}': { eager: true } }  // or drop eager: { '${configKey}': { import: false } }`,
      )
    }
    const canonical = configKey.endsWith('/') ? configKey.slice(0, -1) : configKey
    const importSpec = hint.import === undefined ? canonical : hint.import
    const lookupName = hint.packageName || canonical

    const shareScopeOfHint = hint.shareScope || shareScopeDefault
    const shareKeyOfHint = hint.shareKey || canonical
    const dup = out.find((s) => s.shareKey === shareKeyOfHint && s.shareScope === shareScopeOfHint)
    if (dup) {
      configError(
        `CFG-008: shared key "${shareKeyOfHint}" is declared twice in share scope "${shareScopeOfHint}" (keys "${dup.configKey}" and "${configKey}")`,
        configKey,
        'one declaration per shareKey per share scope',
        `merge hints: { '${shareKeyOfHint}': { singleton: true } }  // or use distinct shareKey values`,
      )
    }

    // requiredVersion 推断：显式 > 配置简写 > package.json 推断
    let requiredVersion: string | false
    if (hint.requiredVersion !== undefined) {
      requiredVersion = hint.requiredVersion
    } else if (typeof hint.import === 'string' && hint.import !== canonical) {
      requiredVersion = false
    } else {
      const depRange = pkgDependencies[lookupName]
      if (depRange) {
        requiredVersion = depRange
      } else {
        requiredVersion = false
        warnings.push(
          `shared["${configKey}"]: requiredVersion could not be inferred from package.json; accepting any version.`,
        )
      }
    }

    const singleton = hint.singleton ?? false
    // webpack 默认值规则：有本地 fallback 且非 singleton → strictVersion 为 true
    const strictVersion = hint.strictVersion ?? (importSpec !== false && !singleton)

    let version = hint.version ?? ''
    if (!version) {
      const installed = readInstalledVersion(root, importSpec === false ? canonical : importSpec)
      if (installed) {
        version = installed
      } else {
        version = '0.0.0'
        warnings.push(
          `shared["${configKey}"]: installed version not found; registering as 0.0.0 (it will still be consumable but ranked lowest).`,
        )
      }
    }

    // vue-demi 在 vue3 环境是 vue 的纯转发层（pinia 等库经它导入 vue）。
    // 共享 vue 时把 vue-demi 一并视为 vue 的别名：其转发文件含 "export * from 'vue'"
    //（ESM 无法动态转出，无法门面化），别名化后消费方直接改写为 vue 绑定门面，
    // 转发文件不再参与解析。
    const extraAliases =
      canonical === 'vue' || hint.shareKey === 'vue' || hint.packageName === 'vue' ? ['vue-demi'] : []

    out.push({
      configKey,
      shareKey: hint.shareKey || canonical,
      import: importSpec,
      requiredVersion,
      singleton,
      strictVersion,
      shareScope: hint.shareScope || shareScopeDefault,
      eager: hint.eager ?? false,
      version,
      aliases: [
        ...new Set([
          canonical,
          ...(typeof importSpec === 'string' ? [importSpec] : []),
          ...(hint.packageName ? [hint.packageName] : []),
          ...extraAliases,
        ]),
      ],
    })
  }
  return out
}

/** 统一的配置错误格式：问题 + 当前值 + 期望 + 可复制的正确示例 */
function configError(what: string, got: unknown, expect: string, example: string): never {
  const gotText = typeof got === 'string' ? `"${got}"` : JSON.stringify(got)
  throw new Error(
    [
      `[fulgur] Invalid federation() config — ${what}`,
      `  got:      ${gotText}`,
      `  expected: ${expect}`,
      `  example:  ${example}`,
    ].join('\n'),
  )
}

/**
 * 配置前置校验：任何配置错误在 vite config 阶段立即以人话报出，
 * 不允许"带着错误配置静默运行、到运行时莫名其妙"。
 */
function validateOptions(options: FulgurOptions): void {
  if (options.name === undefined || options.name === null || options.name === '') {
    configError(
      '`name` is required (container name, also used as uniqueName)',
      options.name,
      'a non-empty string unique among host/remotes in the same page',
      `federation({ name: 'my-app', ... })`,
    )
  }
  if (typeof options.name !== 'string' || !/^[a-zA-Z][\w.-]*$/.test(options.name)) {
    configError(
      '`name` must match /^[a-zA-Z][\\w.-]*$/ (letters first, no spaces/slashes)',
      options.name,
      'e.g. "my-app", "host-app"',
      `federation({ name: 'my-app', ... })`,
    )
  }

  if (options.exposes !== undefined && typeof options.exposes !== 'object') {
    configError('`exposes` must be an object', options.exposes, 'an object of { "./Module": "./src/path" }', `exposes: { './Button': './src/Button.vue' }`)
  }
  if (options.remotes !== undefined && typeof options.remotes !== 'object') {
    configError('`remotes` must be an object', options.remotes, 'an object of { name: url | { dev, prod } | () => Promise<container> }', `remotes: { 'remote-a': 'http://localhost:5101' }`)
  }
  if (options.shared !== undefined && typeof options.shared !== 'object') {
    configError('`shared` must be an array or an object', options.shared, '["vue"] or { vue: { singleton: true } }', `shared: { vue: { singleton: true } }`)
  }

  for (const [key, val] of Object.entries(options.exposes ?? {})) {
    const importPath = typeof val === 'string' ? val : (val as ExposeHint)?.import
    if (!importPath || typeof importPath !== 'string') {
      configError(
        `exposes["${key}"].import is missing`,
        val,
        'a source path string, or { import: "./src/path" }',
        `exposes: { '${key.startsWith('./') ? key : './' + key}': './src/views/Home.vue' }`,
      )
    }
  }

  for (const [key, val] of Object.entries(options.remotes ?? {})) {
    if (/[/@\s]/.test(key)) {
      configError(
        `remotes key "${key}" contains invalid characters (@, / or whitespace)`,
        key,
        'a bare module-style name used as import prefix, e.g. "remote-a"',
        `remotes: { 'remote-a': '...' }  // then: import X from 'remote-a/Button'`,
      )
    }
    if (typeof val === 'function') continue // promise-based remote，运行时注册
    const cfg = typeof val === 'string' ? { external: val } : (val as RemoteEntryConfig)
    if (typeof val === 'string' && val.trim() === '') {
      configError(`remotes["${key}"] is an empty string`, val, 'a remote base URL or full entry URL', `remotes: { '${key}': 'http://localhost:5101' }`)
    }
    if (typeof val !== 'string' && typeof cfg !== 'object') {
      configError(`remotes["${key}"] has unsupported type`, val, 'string | { dev?, prod?, external? } | () => Promise<container>', `remotes: { '${key}': { dev: 'http://localhost:5101', prod: '/remote-a' } }`)
    }
    if (!cfg?.external && !cfg?.dev && !cfg?.prod) {
      configError(
        `remotes["${key}"] has no address (need one of external / dev / prod)`,
        val,
        'at least one address; with only one URL it is used for both dev and prod',
        `remotes: { '${key}': 'http://localhost:5101' }\n  // or split: { '${key}': { dev: 'http://localhost:5101', prod: '/${key}' } }`,
      )
    }
    for (const slot of ['dev', 'prod', 'external'] as const) {
      const v = (cfg as RemoteEntryConfig)[slot]
      if (v !== undefined && typeof v !== 'string') {
        configError(`remotes["${key}"].${slot} must be a string`, v, 'a URL string', `remotes: { '${key}': { ${slot}: 'http://localhost:5101' } }`)
      }
      // CFG-007（remotes name@ 对象形式误用，2026-09-17 testbed 实踩）：name@ 前缀仅字符串
      // external 语法支持（normalizeRemoteValue 拆名重命名）；对象形式 dev/prod 槽位整串当
      // URL 拼接，产出 "bpm@http://.../@fulgur-entry.js" 这类坏地址，运行时表现为无关的
      // MFU-001 加载失败——配置期显式拦截
      if (slot !== 'external') {
        const slotUrl = (cfg as RemoteEntryConfig)[slot]
        if (typeof slotUrl === 'string' && /^[A-Za-z][\w.-]*@/.test(slotUrl)) {
          configError(
            `CFG-007: remotes["${key}"].${slot} uses the "name@url" prefix, which the object form does not support (it is concatenated verbatim into a broken URL)`,
            slotUrl,
            'a bare URL (the remote self-name defaults to the key), or the plain string form if renaming is needed',
            `remotes: { '${key}': 'http://localhost:5101' }  // or: remotes: { '${key}': { dev: 'http://localhost:5101', prod: '/${key}' } }`,
          )
        }
      }
    }
  }
}

export function normalizeOptions(options: FulgurOptions, root: string, command: 'serve' | 'build'): NormalizedOptions {
  const warnings: string[] = []
  validateOptions(options)
  if (!options.name) throw new Error('[fulgur] option `name` is required.')

  if (options.remoteType && options.remoteType !== 'module') {
    warnings.push(
      `remoteType "${options.remoteType}" requires webpack-host interop (P3 milestone); falling back to "module".`,
    )
  }
  if (options.library?.type && options.library.type !== 'module' && options.library.type !== 'esm') {
    warnings.push(
      `library.type "${options.library.type}" requires webpack-host interop (P3 milestone); falling back to "module".`,
    )
  }
  if (options.automaticAsyncBoundary === false) {
    warnings.push(
      'automaticAsyncBoundary=false has no effect: fulgur uses TLA-based automatic async boundaries (better than webpack manual bootstrap).',
    )
  }

  const exposes: NormalizedExpose[] = []
  for (const [rawName, val] of Object.entries(options.exposes ?? {})) {
    const name = rawName.startsWith('./') ? rawName : `./${rawName}`
    if (rawName !== name) warnings.push(`exposes key "${rawName}" normalized to "${name}".`)
    const hint: ExposeHint = typeof val === 'string' ? { import: val } : val
    exposes.push({ name, import: hint.import, chunkName: hint.name })
  }

  const shareScopeDefault = options.shareScope || 'default'
  const filename = options.filename || DEFAULT_FILENAME
  const pkgDependencies = readPkgDependencies(root)
  const shared = normalizeShared(options.shared, shareScopeDefault, pkgDependencies, root, warnings)

  const remotes: NormalizedRemote[] = []
  for (const [key, value] of Object.entries(options.remotes ?? {})) {
    remotes.push(normalizeRemoteValue(key, value, filename, warnings))
  }
  // 重名冲突检测（uniqueName 语义）
  const seenNames = new Map<string, string>()
  for (const r of remotes) {
    if (seenNames.has(r.name) && seenNames.get(r.name) !== r.key) {
      warnings.push(`remote name "${r.name}" is declared for multiple keys; names must be unique.`)
    }
    seenNames.set(r.name, r.key)
  }

  // 语义健康检查：既不提供也不消费的联邦配置几乎一定是配错了（如手滑删了 exposes）
  if ((options.exposes === undefined || Object.keys(options.exposes).length === 0) &&
      (options.remotes === undefined || Object.keys(options.remotes).length === 0)) {
    warnings.push(
      'federation() has neither `exposes` nor `remotes` — it only sets up shared modules. ' +
        'If you intended a remote, add `exposes: { "./Module": "./src/path" }`; if a host, add `remotes: { ... }`.',
    )
  }
  // remote 应用配了 remotes / host 配了 exposes 属合法（宿主亦可被消费），但 pure remote 没有 exposes 提醒一次
  if (Object.keys(options.exposes ?? {}).length === 0 && Object.keys(options.remotes ?? {}).length > 0) {
    warnings.push(
      `federation({ name: "${options.name}" }) consumes remotes but exposes nothing — this app is a pure host. ` +
        'Files will not be available to other apps; add `exposes` if that is unintended.',
    )
  }

  return {
    name: options.name,
    uniqueName: options.name,
    filename,
    exposes,
    remotes,
    shared,
    shareScope: shareScopeDefault,
    remoteType: 'module',
    runtime: options.runtime,
    runtimeChunk: options.runtimeChunk,
    manifest: options.manifest === undefined ? true : !!options.manifest,
    runtimePlugins: options.runtimePlugins ?? [],
    dts: options.dts === undefined ? true : options.dts,
    root,
    pluginVersion: RUNTIME_VERSION,
    pkgDependencies,
    warnings,
    // dev 改写开关：默认纯 remote 参与 shared 协商，宿主（有 remotes）不参与；可显式覆盖
    devSharedSelf: options.devSharedSelf ?? remotes.length === 0,
  }
}

/** 归一化后需要解决的 shared 本地模块 specifier（facade 虚拟模块用） */
export function sharedFacadeSpecifier(s: NormalizedShared): string | false {
  return s.import
}
