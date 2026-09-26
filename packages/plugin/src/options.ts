/**
 * 配置规范化：webpack ModuleFederationPlugin 配置面 1:1 归一化。
 * 每个 webpack 选项在此有唯一归宿（接受/适配/告警），对齐表见 DESIGN.md §2。
 */
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { RUNTIME_VERSION } from './version'
import { normalizeDevCorsOrigins, type DevCorsOrigins } from './dev-cors'

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
  /** 内部保留 expose（setup 生命周期入口）：进容器/manifest 供运行时与预载消费，不进 dts/doctor 公开清单 */
  internal?: boolean
}

export interface NormalizedOptions {
  name: string
  uniqueName: string
  filename: string
  exposes: NormalizedExpose[]
  /** setup 生命周期入口（内部保留 expose；未配置时 undefined）。同一对象也在 exposes 数组内。 */
  setup?: NormalizedExpose
  remotes: NormalizedRemote[]
  shared: NormalizedShared[]
  shareScope: string
  runtime?: string | false
  runtimeChunk?: boolean | 'single'
  manifest: boolean
  runtimePlugins: string[]
  dts: boolean | { dir?: string; mode?: 'source' | 'shim' }
  root: string
  /** 本插件版本（D.5 DEV-006：宿主/远程版本一致性校验） */
  pluginVersion: string
  /** 包依赖表（推断 requiredVersion / 提供版本用） */
  pkgDependencies: Record<string, string>
  warnings: string[]
  /** dev 下自身源码是否参与 shared 协商改写（devSharedSelf 选项的规范化结果） */
  devSharedSelf: boolean
  /** dev 跨源访问策略（devCorsOrigins 选项的规范化结果：undefined='*' / '*' / 来源数组） */
  devCorsOrigins: DevCorsOrigins
  /** dev manifest 是否携带 fsRoot（devFsRoot 选项，默认 true） */
  devFsRoot: boolean
}

export interface FederationOptions {
  name: string
  filename?: string
  exposes?: Record<string, string | ExposeHint>
  /**
   * 可选远程初始化入口：相对本应用根目录的 TS/JS 模块路径。
   * 模块须默认导出 `setup(context)`（应用级，容器首次加载业务模块前执行一次），
   * 可选具名导出 `onSession(context)`（会话级，按宿主 AppContext.sessionKey 去重执行）。
   * 缺省时无初始化行为（普通 exposes 语义完全不变）。
   */
  setup?: string
  remotes?: Record<string, string | RemoteEntryConfig | (() => Promise<any>)>
  shared?: SharedConfig
  shareScope?: string
  runtime?: string | false
  runtimeChunk?: boolean | 'single'
  manifest?: boolean | Record<string, unknown>
  runtimePlugins?: string[]
  dts?: boolean | { dir?: string; mode?: 'source' | 'shim' }
  /**
   * dev 下自身源码（含依赖，需配合 optimizeDeps.exclude）是否参与 shared 协商改写。
   * 默认：纯 remote（无 remotes）为 true——被宿主消费的组件需协商到宿主实例；
   * 有 remotes 的宿主为 false——自身 import 即自身 provide，避免巨型工程 TLA/循环依赖风险。
   * 双向联邦（宿主同时 expose 组件给更高层消费）显式设 true。
   */
  devSharedSelf?: boolean
  /**
   * dev 跨源访问策略（插件端点 /@fulgurjs-entry.js、/@fulgurjs-manifest.json 与 server.cors
   * 共用同一来源）。缺省 = '*'（现状兼容：端点与 server.cors 全放开）；'*' = 显式全放开（不告警）；
   * 数组 = 来源 allowlist（端点按 Origin 反射匹配，不匹配省略头；server.cors 传 { origin: [...] }，
   * 用户显式配置的 server.cors 永远优先）。
   */
  devCorsOrigins?: string[] | '*'
  /**
   * dev manifest 是否携带 fsRoot（remote 根目录本机绝对路径，宿主 dts 类型直连用）。
   * 默认 true（现状兼容）；false 时不写入 manifest，宿主 dts 降级为 any 桩并给出提示。
   * fsRoot 是 dev-only 字段，永不进入 prod manifest。
   */
  devFsRoot?: boolean
}

export const DEFAULT_FILENAME = 'fulgurjs-remoteEntry.js'
/** setup 生命周期入口的内部保留 expose 键：配置为 expose 同名键即 CFG-012 报错 */
export const SETUP_EXPOSE_KEY = './__fulgurjs_setup__'
/** 容器元数据字段名：dev/prod 容器入口在该字段上声明 setup 模块的内部 expose 键 */
export const SETUP_CONTAINER_KEY = '__fulgurjsSetup'
export const RUNTIME_VIRTUAL_ID = 'virtual:fulgurjs-runtime'
export const RUNTIME_PROXY_VIRTUAL_ID = 'virtual:fulgurjs-runtime-proxy'
export const INIT_VIRTUAL_ID = 'virtual:fulgurjs-init'
export const PROVIDES_VIRTUAL_ID = 'virtual:fulgurjs-provides'
export const REMOTE_ENTRY_VIRTUAL_ID = 'virtual:fulgurjs-remote-entry'
export const SHARED_FACADE_PREFIX = 'virtual:fulgurjs-shared:'
/** 预构建协商门面前缀：optimizeDeps 外部化产物内对 shared 键的导入指向它（完整命名空间语义） */
export const SHARED_NS_FACADE_PREFIX = 'virtual:fulgurjs-shared-ns:'

// 不用 \0 前缀：rollup 对 \0 虚拟模块做无副作用激进摇树，会剥掉 init 的顶层调用
export const RESOLVED = {
  runtime: 'virtual:fulgurjs-runtime',
  runtimeProxy: 'virtual:fulgurjs-runtime-proxy',
  init: 'virtual:fulgurjs-init',
  provides: 'virtual:fulgurjs-provides',
  remoteEntry: 'virtual:fulgurjs-remote-entry',
  sharedFacade: (name: string) => `virtual:fulgurjs-shared:${name}`,
  sharedNsFacade: (name: string) => `virtual:fulgurjs-shared-ns:${name}`,
  /** CJS require(<shared>) 垫片：与 sharedNsFacade 同体，仅 id 形态不同（保持 require 调用语义） */
  cjsNsFacade: (name: string) => `virtual:fulgurjs-cjs-ns:${name}`,
}

function joinUrl(base: string, file: string): string {
  const b = base.endsWith('/') ? base : `${base}/`
  return `${b}${file.replace(/^\//, '')}`
}

/**
 * 解析 remote 地址（webpack `name@url` 语法 + 单地址自动切换）：
 * - `shop@http://host/entry.js` → 自报名 shop（键可重命名）
 * - `http://host:port/base` → dev 拼 `@fulgurjs-entry.js`，prod 拼 filename
 * - 以 .js 结尾 → prod 原样使用；dev 仍按 base 拼 `@fulgurjs-entry.js`
 */
function normalizeRemoteValue(
  key: string,
  value: string | RemoteEntryConfig | (() => Promise<any>),
  filename: string,
  warnings: string[],
): NormalizedRemote {
  if (typeof value === 'function') {
    warnings.push(
      `远程应用 "${key}" 使用动态 Promise 配置，无法直接写入构建产物。请在运行时调用 registerRemote() 注册；配置中的键仍用于改写 import 语法。`,
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
      throw new Error(`远程应用 "${key}" 的地址 "${raw}" 无效：@ 位置错误。请使用 name@url，或直接填写远程地址。`)
    }
  }

  const resolveEntry = (rawUrl: string, mode: 'dev' | 'prod'): string => {
    if (!rawUrl) return ''
    if (/\.js(\?.*)?$/.test(rawUrl)) {
      if (mode === 'prod') return rawUrl
      // dev 下给了完整 remoteEntry 地址：视为用户自管，直接使用
      return rawUrl
    }
    return joinUrl(rawUrl, mode === 'dev' ? '@fulgurjs-entry.js' : filename)
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
        `CFG-008：shared["${configKey}"] 不能同时配置 eager 和 import:false`,
        hint,
        'eager 需要将本地副本打进初始 chunk，而 import:false 表示没有本地副本',
        `shared: { '${configKey}': { eager: true } }  // 或取消 eager：{ '${configKey}': { import: false } }`,
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
        `CFG-008：共享键 "${shareKeyOfHint}" 在作用域 "${shareScopeOfHint}" 中重复声明（配置键 "${dup.configKey}" 与 "${configKey}"）`,
        configKey,
        '每个共享作用域内，同一 shareKey 只能声明一次',
        `合并配置：{ '${shareKeyOfHint}': { singleton: true } }  // 或使用不同的 shareKey`,
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
          `共享依赖 "${configKey}" 无法从 package.json 推断 requiredVersion，暂接受任意版本。建议显式填写版本约束。`,
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
          `共享依赖 "${configKey}" 未找到已安装版本，暂按 0.0.0 注册；仍可使用，但版本选择优先级最低。请检查依赖是否安装或显式填写 shared.version。`,
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
      `[fulgurjs] federation() 配置无效：${what}`,
      `  当前值：${gotText}`,
      `  预期值：${expect}`,
      `  修法示例：${example}`,
    ].join('\n'),
  )
}

/**
 * 5.0.0 删除的配置选项（原因 → 迁移写法）。此前它们"接受但忽略"或"仅接受唯一值"，
 * 会误导使用者以为改动了行为；删除后传入任何值（含历史合法值）都在配置期报 CFG-011。
 */
const REMOVED_OPTIONS: Record<string, string> = {
  remoteType: `// 删除 remoteType（fulgurjs 只产出 ESM module remote，无 script/var 互操作）`,
  library: `// 删除 library（remoteEntry 恒为 ESM，无 UMD/var 输出形态）`,
  automaticAsyncBoundary: `// 删除 automaticAsyncBoundary（TLA 自动异步边界始终开启，无手工 bootstrap 模式）`,
  dataPrefetch: `// 删除 dataPrefetch（preloadRemote() 能力始终可用，无需开关）`,
  usedExports: `// 删除 usedExports（Rollup/Rolldown 原生 tree-shaking 已覆盖）`,
  ignoreUnusedSharedExports: `// 删除 ignoreUnusedSharedExports（Rollup/Rolldown 原生 tree-shaking 已覆盖）`,
}

const REMOVED_OPTION_CAUSES: Record<string, string> = {
  remoteType: '该字段只接受唯一值 "module"，从未产生其他行为',
  library: '该字段从未参与输出——remoteEntry 恒为 ESM',
  automaticAsyncBoundary: '该字段接受任意值且恒为 true（TLA 天然异步边界）',
  dataPrefetch: '该字段接受任意值且恒为 true（预载能力不由此开关控制）',
  usedExports: '该字段是 no-op（打包器原生 tree-shaking 已覆盖）',
  ignoreUnusedSharedExports: '该字段是 no-op（打包器原生 tree-shaking 已覆盖）',
}

/**
 * 配置前置校验：任何配置错误在 vite config 阶段立即以人话报出，
 * 不允许"带着错误配置静默运行、到运行时莫名其妙"。
 */
function validateOptions(options: FederationOptions): void {
  if (options.name === undefined || options.name === null || options.name === '') {
    configError(
      '缺少必填的 name（容器名称，也是页面内的唯一标识）',
      options.name,
      '同一页面的宿主与远程之间唯一的非空字符串',
      `federation({ name: 'my-app', ... })`,
    )
  }
  if (typeof options.name !== 'string' || !/^[a-zA-Z][\w.-]*$/.test(options.name)) {
    configError(
      'name 格式不正确：必须以英文字母开头，不能包含空格或斜杠',
      options.name,
      '例如 "my-app" 或 "host-app"',
      `federation({ name: 'my-app', ... })`,
    )
  }

  // CFG-011（5.0.0 删除的 webpack 兼容/无效选项）：这些字段曾被"接受但忽略/仅接受唯一值"，
  // 现已从类型与归一化中删除——传入即硬报错并给出迁移写法，不静默接受
  // （JS 配置或 as any 绕过类型层时由这里的运行时校验兜底）
  for (const [field, fix] of Object.entries(REMOVED_OPTIONS)) {
    const value = (options as unknown as Record<string, unknown>)[field]
    if (value !== undefined) {
      configError(
        `CFG-011：选项 "${field}" 已在 5.0.0 删除`,
        value,
        REMOVED_OPTION_CAUSES[field],
        fix,
      )
    }
  }

  // CFG-012（setup 配置非法）：路径必须是本应用内可解析的非空字符串，且不得占用内部保留键。
  // 保留键冲突即使用户未配置 setup 也拦截（squatting 内部键会与未来配置冲突）
  for (const key of Object.keys(options.exposes ?? {})) {
    const norm = key.startsWith('./') ? key : `./${key}`
    if (norm === SETUP_EXPOSE_KEY) {
      configError(
        `CFG-012：exposes 键 "${norm}" 已由联邦 setup 入口保留`,
        key,
        `使用其他公开 expose 名称；内部保留键 "${SETUP_EXPOSE_KEY}" 由 setup 选项自动生成`,
        `// 把该 expose 改名，或删除它并把原文件路径配置到 federation({ setup })`,
      )
    }
  }
  if (options.setup !== undefined) {
    if (typeof options.setup !== 'string' || options.setup.trim() === '') {
      configError(
        'CFG-012：setup 必须是相对应用根目录的非空模块路径',
        options.setup,
        '例如 "./src/fulgurjs/setup.ts"（默认导出 setup(context)，可选具名导出 onSession(context)）',
        `federation({ name: 'my-app', setup: './src/fulgurjs/setup.ts', ... })`,
      )
    }
  }

  if (options.exposes !== undefined && typeof options.exposes !== 'object') {
    configError('exposes 必须是对象', options.exposes, '形如 { "./Module": "./src/path" } 的对象', `exposes: { './Button': './src/Button.vue' }`)
  }
  if (options.remotes !== undefined && typeof options.remotes !== 'object') {
    configError('remotes 必须是对象', options.remotes, '形如 { 名称: 地址 | { dev, prod } | 动态加载函数 } 的对象', `remotes: { 'remote-a': 'http://localhost:5101' }`)
  }
  if (options.shared !== undefined && typeof options.shared !== 'object') {
    configError('shared 必须是数组或对象', options.shared, '["vue"] 或 { vue: { singleton: true } }', `shared: { vue: { singleton: true } }`)
  }

  for (const [key, val] of Object.entries(options.exposes ?? {})) {
    const importPath = typeof val === 'string' ? val : (val as ExposeHint)?.import
    if (!importPath || typeof importPath !== 'string') {
      configError(
        `exposes["${key}"].import 缺失`,
        val,
        '源码路径字符串，或 { import: "./src/path" }',
        `exposes: { '${key.startsWith('./') ? key : './' + key}': './src/views/Home.vue' }`,
      )
    }
  }

  for (const [key, val] of Object.entries(options.remotes ?? {})) {
    if (/[/@\s]/.test(key)) {
      configError(
        `remotes 键 "${key}" 包含非法字符（@、/ 或空白字符）`,
        key,
        '作为 import 前缀使用的纯模块名，例如 "remote-a"',
        `remotes: { 'remote-a': '...' }  // then: import X from 'remote-a/Button'`,
      )
    }
    if (typeof val === 'function') continue // promise-based remote，运行时注册
    const cfg = typeof val === 'string' ? { external: val } : (val as RemoteEntryConfig)
    if (typeof val === 'string' && val.trim() === '') {
      configError(`remotes["${key}"] 是空字符串`, val, '远程基础地址或完整入口地址', `remotes: { '${key}': 'http://localhost:5101' }`)
    }
    if (typeof val !== 'string' && typeof cfg !== 'object') {
      configError(`remotes["${key}"] 的值类型不受支持`, val, '字符串、{ dev?, prod?, external? } 对象或动态加载函数', `remotes: { '${key}': { dev: 'http://localhost:5101', prod: '/remote-a' } }`)
    }
    if (!cfg?.external && !cfg?.dev && !cfg?.prod) {
      configError(
        `remotes["${key}"] 没有地址（external、dev、prod 至少填写一个）`,
        val,
        '至少一个地址；只填一个地址时开发与生产共用',
        `remotes: { '${key}': 'http://localhost:5101' }\n  // 或分别填写：{ '${key}': { dev: 'http://localhost:5101', prod: '/${key}' } }`,
      )
    }
    // CFG-009（WP6）：remote 运行参数在配置期校验——坏数值不留到运行时无限循环/永久等待
    if (cfg.timeout !== undefined && (typeof cfg.timeout !== 'number' || !Number.isFinite(cfg.timeout) || cfg.timeout <= 0)) {
      configError(
        `CFG-009：remotes["${key}"].timeout 必须是大于 0 的有限毫秒数`,
        cfg.timeout,
        'e.g. 15000（省略用默认 15s）',
        `remotes: { '${key}': { external: '…', timeout: 15000 } }`,
      )
    }
    if (cfg.retries !== undefined && (typeof cfg.retries !== 'number' || !Number.isInteger(cfg.retries) || cfg.retries < 0 || cfg.retries > 10)) {
      configError(
        `CFG-009：remotes["${key}"].retries 必须是 0 到 10 的整数`,
        cfg.retries,
        'e.g. 2（省略用默认 2；上限 10 防退避风暴）',
        `remotes: { '${key}': { external: '…', retries: 2 } }`,
      )
    }
    const brk = cfg.breaker
    if (brk) {
      if (brk.threshold !== undefined && (typeof brk.threshold !== 'number' || !Number.isFinite(brk.threshold) || brk.threshold <= 0)) {
        configError(
          `CFG-009：remotes["${key}"].breaker.threshold 必须是大于 0 的有限数字`,
          brk.threshold,
          'e.g. 5（连续失败 5 次后熔断）',
          `remotes: { '${key}': { external: '…', breaker: { threshold: 5, resetMs: 30000 } } }`,
        )
      }
      if (brk.resetMs !== undefined && (typeof brk.resetMs !== 'number' || !Number.isFinite(brk.resetMs) || brk.resetMs <= 0)) {
        configError(
          `CFG-009：remotes["${key}"].breaker.resetMs 必须是大于 0 的有限毫秒数`,
          brk.resetMs,
          'e.g. 30000（熔断 30s 后半开）',
          `remotes: { '${key}': { external: '…', breaker: { threshold: 5, resetMs: 30000 } } }`,
        )
      }
    }
    for (const slot of ['dev', 'prod', 'external'] as const) {
      const v = (cfg as RemoteEntryConfig)[slot]
      if (v !== undefined && typeof v !== 'string') {
        configError(`remotes["${key}"].${slot} 必须是字符串`, v, 'URL 字符串', `remotes: { '${key}': { ${slot}: 'http://localhost:5101' } }`)
      }
      // CFG-007（remotes name@ 对象形式误用，2026-09-17 testbed 实踩）：name@ 前缀仅字符串
      // external 语法支持（normalizeRemoteValue 拆名重命名）；对象形式 dev/prod 槽位整串当
      // URL 拼接，产出 "bpm@http://.../@fulgurjs-entry.js" 这类坏地址，运行时表现为无关的
      // MFU-001 加载失败——配置期显式拦截
      if (slot !== 'external') {
        const slotUrl = (cfg as RemoteEntryConfig)[slot]
        if (typeof slotUrl === 'string' && /^[A-Za-z][\w.-]*@/.test(slotUrl)) {
          configError(
            `CFG-007：remotes["${key}"].${slot} 使用了 name@url 前缀；对象写法不支持该前缀，否则会拼出错误地址`,
            slotUrl,
            '不带前缀的 URL（远程名称默认使用键名）；需要改名时改用字符串写法',
            `remotes: { '${key}': 'http://localhost:5101' }  // or: remotes: { '${key}': { dev: 'http://localhost:5101', prod: '/${key}' } }`,
          )
        }
      }
    }
  }
  const corsCheck = normalizeDevCorsOrigins(options.devCorsOrigins)
  if (!corsCheck.ok) {
    configError(
      `CFG-010: devCorsOrigins ${corsCheck.reason}`,
      options.devCorsOrigins,
      `'*'（全放开）或来源 allowlist 数组`,
      `devCorsOrigins: ['http://localhost:5100', 'http://127.0.0.1:5100']`,
    )
  }
  if (options.devFsRoot !== undefined && typeof options.devFsRoot !== 'boolean') {
    configError(
      'devFsRoot 必须是布尔值',
      options.devFsRoot,
      'true（dev manifest 携带 fsRoot，现状默认）或 false（不暴露本机路径）',
      `devFsRoot: false`,
    )
  }
}

export function normalizeOptions(options: FederationOptions, root: string, command: 'serve' | 'build'): NormalizedOptions {
  const warnings: string[] = []
  validateOptions(options)
  if (!options.name) throw new Error('[fulgurjs] 缺少必填配置 name。请在 federation({ name: "应用名" }) 中声明唯一的应用名。')

  const exposes: NormalizedExpose[] = []
  for (const [rawName, val] of Object.entries(options.exposes ?? {})) {
    const name = rawName.startsWith('./') ? rawName : `./${rawName}`
    if (rawName !== name) warnings.push(`暴露模块键 "${rawName}" 已规范化为 "${name}"。建议在 exposes 中直接使用带 ./ 前缀的键。`)
    const hint: ExposeHint = typeof val === 'string' ? { import: val } : val
    exposes.push({ name, import: hint.import, chunkName: hint.name })
  }
  // setup 生命周期入口：内部保留 expose 追加进 exposes（进容器与 manifest，供运行时
  // 在 init 后获取并执行、preload 注入其 CSS；dts/doctor 对 internal 条目按内部资源处理）
  let setup: NormalizedExpose | undefined
  if (options.setup) {
    setup = { name: SETUP_EXPOSE_KEY, import: options.setup, internal: true }
    exposes.push(setup)
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
      warnings.push(`远程名称 "${r.name}" 被多个 remotes 键重复声明；请为每个远程使用唯一名称。`)
    }
    seenNames.set(r.name, r.key)
  }

  // 语义健康检查：既不提供也不消费的联邦配置几乎一定是配错了（如手滑删了 exposes）
  if ((options.exposes === undefined || Object.keys(options.exposes).length === 0) &&
      (options.remotes === undefined || Object.keys(options.remotes).length === 0)) {
    warnings.push(
      'federation() 未配置 exposes 或 remotes，目前只会注册共享依赖。若要提供远程模块，请配置 exposes；若要消费远程应用，请配置 remotes。',
    )
  }
  // remote 应用配了 remotes / host 配了 exposes 属合法（宿主亦可被消费），但 pure remote 没有 exposes 提醒一次
  if (Object.keys(options.exposes ?? {}).length === 0 && Object.keys(options.remotes ?? {}).length > 0) {
    warnings.push(
      `应用 "${options.name}" 配置了 remotes，但没有 exposes，因此是纯宿主；其他应用无法从它加载模块。若希望对外提供模块，请添加 exposes。`,
    )
  }

  return {
    name: options.name,
    uniqueName: options.name,
    filename,
    exposes,
    setup,
    remotes,
    shared,
    shareScope: shareScopeDefault,
    runtime: options.runtime,
    runtimeChunk: options.runtimeChunk,
    manifest: options.manifest === undefined ? true : !!options.manifest,
    runtimePlugins: options.runtimePlugins ?? [],
    dts: options.dts === undefined ? true : options.dts,
    root,
    pluginVersion: RUNTIME_VERSION,
    pkgDependencies,
    warnings,
    // dev 改写开关：纯 remote 与双角色（既 expose 又消费 remote）为 true——被宿主消费的
    // 组件需协商到宿主实例，双向联邦漏配该项曾是已知错误配置（README 要求显式 true，
    // §12.4 后默认推断：仅纯宿主为 false）；显式配置永远优先
    devSharedSelf: options.devSharedSelf ?? (remotes.length === 0 || exposes.length > 0),
    devCorsOrigins: options.devCorsOrigins,
    devFsRoot: options.devFsRoot ?? true,
  }
}

/** 归一化后需要解决的 shared 本地模块 specifier（facade 虚拟模块用） */
export function sharedFacadeSpecifier(s: NormalizedShared): string | false {
  return s.import
}
