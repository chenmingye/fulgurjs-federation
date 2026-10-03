/**
 * fulgurjs-federation 主入口。
 * 一套 API 两个引擎：serve → 双 dev-server 协作；build → 构建期改写（Rollup/Rolldown）。
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import type { Plugin, ViteDevServer } from 'vite'
import {
  normalizeOptions,
  readInstalledVersion,
  RESOLVED,
  INIT_VIRTUAL_ID,
  RUNTIME_PROXY_VIRTUAL_ID,
  RUNTIME_VIRTUAL_ID,
  SHARED_FACADE_PREFIX,
  SHARED_NS_FACADE_PREFIX,
  type NormalizedOptions,
  type NormalizedShared,
  type FederationOptions,
} from './options'
import {
  getFacadeEntry,
  isTransformableId,
  isPluginProcessedModule,
  transformModule,
  serializeShareCallForFacade,
  isExposeTargetFile,
  rewriteRuntimeEntryImports,
} from './transform'
import {
  genApiFacade,
  genBridgeFacade,
  genBindingFacade,
  genRuntimeProxyModule,
  genBuildRemoteEntry,
  genDevManifest,
  genDevProvides,
  genDevRemoteEntry,
  genInitModule,
  genProdManifest,
  genReactRefreshPublisherScript,
  genReactRefreshShim,
  genRemoteBindingFacade,
  genCjsNsFacade,
  genSharedFacade,
  genSharedNsFacade,
  genBindingFacadeSync,
  genSharedNsFacadeSync,
  genProdRetryHelper,
  REACT_REFRESH_GLOBAL_KEY,
  REACT_REFRESH_SHIM_URL,
  type ManifestExposeEntry,
} from './virtual'
import { generateDevTypes } from './dts'
import { probeRemotesAndBuildSchema, genEmptyRemoteSchemaModule, genRemoteSchemaModule } from './remote-schema'
import { formatFulgurjsDiagnostic, debugLog, redactModulePath } from './diagnostics'
import { corsHeadersFor, isNonLoopbackHost } from './dev-cors'
import { syncViteCacheMarker } from './vite-cache'
import { repairRolldownAsyncMarks } from './async-mark-repair'

// 运行时代码由构建脚本生成（src/runtime-code.gen.ts），内联进插件产物，无文件定位问题
import runtimeCode from './runtime-code.gen'
function readRuntimeCode(): string {
  return runtimeCode
}

function normalizeBase(base: string): string {
  if (!base || base === '/') return '/'
  return base.endsWith('/') ? base : `${base}/`
}

/** 预构建外部化桩模块的 esbuild namespace（配合 fulgurjs-stub: 路径前缀使用） */
const FULGURJS_STUB_NAMESPACE = 'fulgurjs-opt-stub'

/**
 * 枚举本机安装包 CJS 入口的全部命名导出（预构建协商门面的命名导出清单生成用）。
 * ESM 无法动态枚举，必须在 dev server 进程里从真实包取。ESM-only 包（无 CJS 入口）
 * 返回空数组：门面降级为仅 default 导出并保持可用（消费方解构出 undefined 属可容忍降级，非静默失败）。
 */
const nsExportCache = new Map<string, string[]>()
function enumerateCjsExports(packageName: string, appRoot: string): string[] {
  const cached = nsExportCache.get(packageName)
  if (cached) return cached
  let names: string[] = []
  try {
    const appRequire = createRequire(path.join(appRoot, 'package.json'))
    const mod = appRequire(packageName) as Record<string, unknown>
    names = Object.keys(mod)
  } catch {
    console.warn(
      `[fulgurjs] 无法枚举共享依赖 "${packageName}" 的 CJS 导出，预构建门面只会提供默认导出。` +
        `如果业务代码需要具名导出，请将该依赖加入 optimizeDeps.exclude，使其经过联邦转换流程。`,
    )
  }
  nsExportCache.set(packageName, names)
  return names
}

function injectInitScript(html: string, scriptSrc: string): string {
  // 注入到第一个 module script 之前（执行顺序 = 文档顺序）
  const tag = `<script type="module" src="${scriptSrc}"></script>`
  const moduleScriptRe = /<script[^>]+type=["']module["'][^>]*>/
  const m = moduleScriptRe.exec(html)
  if (m) {
    return html.slice(0, m.index) + tag + html.slice(m.index)
  }
  if (html.includes('</head>')) {
    return html.replace('</head>', `${tag}\n</head>`)
  }
  return tag + html
}

/**
 * D6（2026-09-22）：门面/运行时虚拟模块的强制分组与判定。
 * 背景：双向宿主开启 devSharedSelf 后 node_modules 参与门面化；若用户配置 manualChunks
 * 强制分组（对象/函数形式），被分组包（如 vue-vendor 组内的 vue-router）内部对 shared 键
 * 的导入被改写为协商门面，而门面又被 rollup 归入其他强制组（跟随其最大消费方），
 * 形成跨组静态环 → 门面 TLA 的求值顺序错位，运行时 TypeError（协商函数未初始化）。
 * 修复：manualChunks 包装注入——门面/运行时虚拟模块按 shareKey 隔离进插件专属组
 * （fulgurjs-runtime 单独一组作为公共底座；各 shareKey 门面一组，按需下载不拖累首屏）。
 * 门面组对外零静态依赖（virtual.ts 门面动态化：runtime/本体均 await import），
 * 与任何用户分组正交，数学上不可能成环。
 */
const RUNTIME_CHUNK_NAME = 'fulgurjs-runtime'
const REMOTE_FACADE_CHUNK_NAME = 'fulgurjs-remote-facades'
/**
 * V8-FIX（2026-10-01）：shared 本体闭包目录 → 门面同组归并。
 * rolldown（vite 8）会把「loadShare fallback 的动态 import 目标」（shared 本体入口，如
 * node_modules/vue/dist/vue.runtime.esm-bundler.js）拆成独立 chunk，并把入口壳的 re-export
 * 绑定转发改道经门面 chunk（门面 chunk 里持有本体真身符号），构造出
 * 「门面 chunk(TLA await loadShare) ↔ 本体 chunk」的 chunk 级 TLA 循环——浏览器按 ESM
 * 规范死锁（页面空白、零报错、模块图 pending；vue-host 生产页实挂）。
 * 本体闭包与门面同组后转发边消失（入口壳与真身同 chunk，符号直取）。
 * vite5-7（rollup）本就把静态边闭包并进同 chunk，归组是显式化而非行为变更。
 *
 * 20261001 补修轮追加两条（实测死锁修法）：
 * 1) preload-helper 独立成组：vite 的 __vitePreload 助手被 remoteEntry 与 TLA 协商门面
 *    共同静态依赖，rollup 会把它并入门面 chunk——remoteEntry 为取助手对门面形成静态边，
 *    门面顶层 await loadShare 又要等 remoteEntry 自己的 init() 注册共享作用域 →
 *    入口级 TLA 死环（MFU-003 于模块求值期抛出；5.3.2 起 remote-b 双版本场景实测）。
 *    manualChunks 归组不排斥共享模块，故助手必须显式独立成组。
 * 2) provider 门面（无 ?f=）与消费协商门面（?f=）分开成组：provider 加载不再连带触发
 *    另一消费条件的 loadShare，同步壳与 TLA 门面不混排（与 Vite 8 分组对齐）。
 */
function facadeChunkOf(id: string): string | null {
  if (id.includes('preload-helper')) return 'fulgurjs-preload-helper'
  const bare = id.replace(/^\0/, '').split('?')[0]
  if (bare === 'virtual:fulgurjs-runtime' || bare === 'virtual:fulgurjs-runtime-proxy') {
    return RUNTIME_CHUNK_NAME
  }
  if (bare.startsWith('virtual:fulgurjs-shared:')) {
    const body = bare.slice('virtual:fulgurjs-shared:'.length)
    // 远程绑定门面（__remote__/<name>/<expose>）：按 remote 名一组
    if (body.startsWith('__remote__/')) {
      const remoteName = body.slice('__remote__/'.length).split('/')[0] || 'unknown'
      return REMOTE_FACADE_CHUNK_NAME + '-' + remoteName.replace(/[^A-Za-z0-9_-]/g, '_')
    }
    const keyName = (key: string) => key.replace(/[^A-Za-z0-9_-]/g, '_') || 'unknown'
    const shareKey = body.split('?')[0]
    if (id.includes('?f=')) return 'fulgurjs-shared-' + keyName(shareKey)
    return 'fulgurjs-provider-' + keyName(shareKey)
  }
  if (bare.startsWith('virtual:fulgurjs-shared-ns:') || bare.startsWith('virtual:fulgurjs-cjs-ns:')) {
    const prefix = bare.startsWith('virtual:fulgurjs-shared-ns:')
      ? 'virtual:fulgurjs-shared-ns:'
      : 'virtual:fulgurjs-cjs-ns:'
    const shareKey = bare.slice(prefix.length)
    const keyName = shareKey.replace(/[^A-Za-z0-9_-]/g, '_') || 'unknown'
    // CJS 垫片与物理包同组（fulgurjs-provider-<key>）：react-dom 等 CJS 本体内部存在
    // require(<自身包>) 自引用（react-dom-client.production.js 实测），改写后「本体 →
    // 垫片 → 本体」跨 chunk 即 TDZ（rollup const 级 interop：Cannot access '_' before
    // initialization）。同 chunk 后自引用经提升安全解析。
    if (bare.startsWith('virtual:fulgurjs-cjs-ns:')) return 'fulgurjs-provider-' + keyName
    return 'fulgurjs-shared-' + keyName
  }
  return null
}

/**
 * 插件自身包内的模块（adapters/bridge-host 等）豁免用户 manualChunks 分组：
 * 它们静态 import 协商门面（TLA），若被用户组捕获、而该组又包含 shared 物理包
 * （vendor 全量 node_modules 是常见形态），即构成「门面(TLA) →[动态] provider →
 * [静态] vendor →[静态] 门面」的混合环，页面零报错死锁（20261001 mc-fn 场景实测）。
 * 豁免后交给 rollup 自动分块（与无用户分组时的基线形态一致：随最大消费方合并）。
 */
function isOwnPackageModule(id: string): boolean {
  return id.includes('/node_modules/@fulgurjs/federation/')
}

/** 物理提供包目录 → provider 组（整包与 provider 门面/CJS 垫片同 chunk；TDZ/自引用安全） */
function providerChunkOf(id: string, roots: Array<{ root: string; shareKey: string }>): string | undefined {
  if (roots.length === 0) return undefined
  const clean = id.replace(/^\0/, '').split('?')[0]
  const provider = roots.find((p) => clean.startsWith(p.root))
  if (!provider) return undefined
  return 'fulgurjs-provider-' + (provider.shareKey.replace(/[^A-Za-z0-9_-]/g, '_') || 'unknown')
}

/**
 * V8-SYNC-FACADE：同步门面的本体导入目标解析（裸包名 → 绝对 id）。
 * 门面是虚拟模块，proxy/commonjs 载体上下文里裸包名解析不可靠（同 genCjsNsFacade 的教训）；
 * 解析失败保留裸包名（root node_modules 兜底）。
 */
async function resolveSharedImportTarget(
  this: { resolve?: (id: string, importer?: string, opts?: { skipSelf?: boolean }) => Promise<{ id: string } | null> },
  item: NormalizedShared,
  root: string,
): Promise<string> {
  const specifier = item.import
  if (typeof specifier !== 'string') return item.shareKey
  try {
    const resolved = await this.resolve?.(specifier, path.join(root, 'package.json'), { skipSelf: true })
    if (resolved?.id) return resolved.id
  } catch {
    // 解析失败保留裸包名，行为与 CJS 垫片一致
  }
  return specifier
}

export function federation(options: FederationOptions): Plugin[] {
  let remoteSchemaPromise: Promise<string> | null = null
  const state: {
    normalized?: NormalizedOptions
    command: 'serve' | 'build'
    base: string
    exposeAbsPaths: Record<string, string>
    exposeFiles: Record<string, ManifestExposeEntry>
    resolvedSharedPaths: Map<string, string | null>
    entryAbsPaths: Set<string>
    entryInitInjected: Set<string>
    /** D6：manualChunks 包装注入时保存的用户原始配置（对象形式 specifier 待 buildStart 解析） */
    manualChunkSpecsPending?: Array<[group: string, specifier: string]>
    /** D6：对象形式 manualChunks 解析结果（模块 id → 组名），包装函数运行时查表 */
    manualChunkGroups: Map<string, string>
    /** D6：shared 键本体闭包目录（仅 build + devSharedSelf 宿主解析填充） */
    sharedClosureRoots: Array<{ root: string; keys: Set<string> }>
    /** D6：门面形态。dynamic = devSharedSelf 宿主（build）专用：门面对运行时/本体全动态依赖
     * （配合 manualChunks 包装注入与闭包静态化）。static = 其余一切场景，产物与 2.0.0 一致。 */
    facadeDynamic: boolean
    /** Vite 8（rolldown）生产构建：使用原生 codeSplitting 分组隔离提供/协商/CJS 模块 */
    rolldownBuild: boolean
    /** Vite 8：本地提供包的物理目录（providerRoots 归组用，buildStart 填充） */
    providerRoots: Array<{ root: string; shareKey: string }>
    /** WP1：已被本插件改写过的模块 id（含 query 与 clean 两种形态）。这些模块后续再出现
     * 裸 shared specifier = 后置插件（auto-import 等）注入，由 resolveId 期兜底改道。 */
    transformedModules: Set<string>
  } = {
    command: 'serve',
    rolldownBuild: false,
    providerRoots: [],
    base: '/',
    exposeAbsPaths: {},
    exposeFiles: {},
    resolvedSharedPaths: new Map(),
    entryAbsPaths: new Set(),
    entryInitInjected: new Set(),
    manualChunkGroups: new Map(),
    sharedClosureRoots: [],
    facadeDynamic: false,
    transformedModules: new Set(),
  }

  const recordRewritten = (id: string) => {
    state.transformedModules.add(id)
    state.transformedModules.add(id.split('?')[0])
  }

  const pre: Plugin = {
    name: 'fulgurjs:core',
    enforce: 'pre',
    async config(userConfig, env) {
      state.command = env.command
      const root = path.resolve(userConfig.root ?? process.cwd())
      const normalized = normalizeOptions(options, root, env.command)
      state.normalized = normalized
      // Vite 8（rolldown）生产构建：启用原生 codeSplitting 保护组（outputOptions 钩子）
      state.rolldownBuild = env.command === 'build' && Number((readInstalledVersion(root, 'vite') ?? '0').split('.')[0]) >= 8

      const extra: Record<string, unknown> = {}
      // 不干预 optimizeDeps 的 include/exclude：大型工程的预构建分组被额外 include 改动后，
      // 可能出现 chunk 循环求值顺序问题；shared 解析走门面虚拟模块，无需强制预构建

      // dev remote：向依赖预构建注入 shared 键外部化 resolver——CJS/UMD-only 依赖（element-plus、
      // dayjs 等 CJS/UMD 依赖）得以正常预构建（esbuild 的 CJS interop 正确保留 default 静态方法），
      // 而其内部对 shared 键（vue 等）的导入在运行时协商到联邦实例，不内联本地副本形成双运行时。
      // 作用面与改写管线的 devSharedSelf 一致：纯 remote 默认开启，双向宿主显式 devSharedSelf 才开。
      if (env.command === 'serve' && normalized.exposes.length > 0 && normalized.devSharedSelf) {
        const aliasToShare = new Map<string, (typeof normalized.shared)[number]>()
        for (const s of normalized.shared) {
          if (s.import === false) continue
          for (const a of s.aliases) if (!a.includes('/')) aliasToShare.set(a, s)
        }
        if (aliasToShare.size > 0) {
          const escapeRe = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          const filter = new RegExp(`^(${[...aliasToShare.keys()].map(escapeRe).join('|')})$`)
          const devBase = normalizeBase(userConfig.base ?? '/')
          const facadeUrlFor = (shareKey: string) =>
            `${devBase}@id/__x00__virtual:fulgurjs-shared-ns:${shareKey}?import`
          const sharedExternal: { name: string; setup: (build: unknown) => void } = {
            name: 'fulgurjs:optimize-shared-external',
            setup(build) {
              const b = build as {
                onResolve: (
                  opts: { filter: RegExp },
                  cb: (args: { path: string; kind: string }) => { path: string; namespace?: string; external?: boolean } | null,
                ) => void
                onLoad: (
                  opts: { filter: RegExp; namespace: string },
                  cb: (args: { path: string }) => { contents: string; loader: string } | null,
                ) => void
              }
              // 桩内容里的门面 URL（浏览器 URL，非文件系统路径）必须标记 external，
              // esbuild 原样保留为静态 import/export-from，不做文件解析
              b.onResolve({ filter: /fulgurjs-shared-ns:/ }, (args) => ({ path: args.path, external: true }))
              b.onResolve({ filter }, (args) => {
                // shared 键本身常是预构建入口（include/扫描发现）：入口解析放行走本地预构建，
                // 只有依赖包内部的 import/require 才改道协商门面（esbuild 禁止 entry point external）
                if (args.kind === 'entry-point' || args.kind === 'entry-point-render') return null
                const s = aliasToShare.get(args.path)
                if (!s) return null
                return { path: `fulgurjs-stub:${s.shareKey}`, namespace: FULGURJS_STUB_NAMESPACE }
              })
              // re-export 桩：不能直接 external——esbuild 对 CJS 依赖内部的 require(external)
              // 会生成运行时抛错的动态 require 垫片（"Dynamic require of ... is not supported"）。
              // 改道到 bundled 桩模块后，esbuild 把门面 URL 提升为 chunk 顶部的静态 import，
              // 门面（TLA 协商）先于 chunk 求值完成，CJS require 拿到的命名空间同步可用。
              b.onLoad({ filter: /^fulgurjs-stub:/, namespace: FULGURJS_STUB_NAMESPACE }, (args) => {
                const shareKey = args.path.slice('fulgurjs-stub:'.length)
                const url = facadeUrlFor(shareKey)
                return {
                  contents: `export * from ${JSON.stringify(url)};\nexport { default } from ${JSON.stringify(url)};\n`,
                  loader: 'js',
                }
              })
            },
          }
          // D05（Vite ≥ 8 rolldown 预构建器）：esbuildOptions 已废弃，其 esbuild→rolldown
          // 兼容层只执行 onResolve（产出 `<namespace>:fulgurjs-stub:<key>` 形态的虚拟 id）、
          // 不执行 onLoad → UNLOADABLE_DEPENDENCY（react 协商链全断，CI 实测）。rolldown
          // 插件按 rolldownOptions 注入同一外部化语义：resolveId 识别裸键与兼容层两种
          // 虚拟 id 形态，load 产出同款 re-export 桩；门面 URL 标记 external。Vite ≤ 7
          // 不读取 rolldownOptions（仅 esbuildOptions 生效）；Vite ≥ 8 只下发 rolldownOptions
          // （遗留 esbuildOptions 键会触发 vite 的 deprecation warning）。
          const rolldownShared = {
            name: 'fulgurjs:optimize-shared-external',
            resolveId(source: string, _importer: string | undefined, opts: { isEntry?: boolean } = {}) {
              // 桩内容里的门面 URL（浏览器 URL）保持 external，rolldown 原样保留静态 import
              if (source.includes('fulgurjs-shared-ns:')) return { id: source, external: true }
              // 兼容层产出的 namespace 前缀形态：fulgurjs-opt-stub:fulgurjs-stub:<key>
              if (source.startsWith(`${FULGURJS_STUB_NAMESPACE}:fulgurjs-stub:`)) return source.slice(FULGURJS_STUB_NAMESPACE.length + 1)
              if (source.startsWith('fulgurjs-stub:')) return source
              // shared 键本身常是预构建入口（扫描/include 发现）：放行本地预构建，
              // 只有依赖包内部的 import/require 才改道协商门面
              if (opts.isEntry) return null
              const s = aliasToShare.get(source)
              if (!s) return null
              return `fulgurjs-stub:${s.shareKey}`
            },
            load(id: string) {
              if (!id.startsWith('fulgurjs-stub:')) return null
              const url = facadeUrlFor(id.slice('fulgurjs-stub:'.length))
              return `export * from ${JSON.stringify(url)};\nexport { default } from ${JSON.stringify(url)};\n`
            },
          }
          const isVite8Prebundle = Number((readInstalledVersion(root, 'vite') ?? '0').split('.')[0]) >= 8
          ;(extra as Record<string, unknown>).optimizeDeps = {
            ...(isVite8Prebundle ? {} : { esbuildOptions: { plugins: [sharedExternal] } }),
            rolldownOptions: { plugins: [rolldownShared] },
          }
        }
      }

      if (env.command === 'serve') {
        // DEV-009 自动化：插件版本变化时自清本应用 .vite 预构建缓存（用户无需手工 rm）
        syncViteCacheMarker(root, normalized.pluginVersion, (msg) => console.warn(msg))
        // WP5：dev 跨源访问策略统一（devCorsOrigins）——插件端点与 server.cors 同一来源；
        // 用户显式配置的 server.cors 永远优先（不允许插件端点策略绕过用户配置的语义）
        const corsOption =
          normalized.devCorsOrigins && normalized.devCorsOrigins !== '*'
            ? ({ origin: normalized.devCorsOrigins } as Record<string, unknown>)
            : true
        extra.server = {
          ...(userConfig.server ?? {}),
          cors: userConfig.server?.cors ?? corsOption,
        }
        const host = userConfig.server?.host
        if (isNonLoopbackHost(host)) {
          if (!normalized.devCorsOrigins || normalized.devCorsOrigins === '*') {
            console.warn(
              formatFulgurjsDiagnostic({
                code: 'DEV-011',
                symptom: `server.host=${String(host)} 非 loopback 且 dev 跨源策略为通配（*）：任何能访问该机的来源都可拉取本应用联邦端点与源码模块`,
                cause: 'devCorsOrigins 未配置时保持现状兼容（*）；跨机开发暴露面随之扩大',
                fix: `按宿主来源显式收紧：devCorsOrigins: ['http://<host>:<port>', ...]（或确认该机处于可信网络）`,
              }),
            )
          }
          if (normalized.devFsRoot) {
            console.warn(
              formatFulgurjsDiagnostic({
                code: 'DEV-012',
                symptom: `server.host=${String(host)} 非 loopback 且 dev manifest 携带 fsRoot（remote 根目录本机绝对路径）`,
                cause: 'fsRoot 供同机联调的宿主 dts 类型直连；2.x 默认 true 保持现状，下个主版本拟改为显式开启',
                fix: `同机联调无需动作；跨机/不可信网络可 devFsRoot: false（宿主 dts 将降级为 any 桩并有明确提示）`,
              }),
            )
          }
        }
      } else {
        // build：TLA（自动异步边界）需要 es2022+；用户未配置时自动提升
        const userTarget = userConfig.build?.target
        if (userTarget) {
          if (/es20(0\d|1\d|20|21)/.test(String(userTarget))) {
            normalized.warnings.push(
              `build.target="${String(userTarget)}" 不支持顶层 await；fulgurjs 需要 es2022 或更高版本。请调整 build.target。`,
            )
          }
        } else {
          ;(extra as any).build = { target: 'es2022' }
        }

        // WP1（2026-09-23）：后置插件注入的 shared 导入改在 resolveId 期兜底改道（见
        // resolveId 的 transformedModules 分支）——config() 返回 plugins 不会进入 Vite
        // 管线（实测 vite 6/8 均忽略），钩子级 order:'post' 又会排到 vite:build-import-analysis
        // 之后，解析期改道是唯一与注册顺序无关的兜底位置。

        // D6：双向宿主（devSharedSelf）build 下的门面动态化 + manualChunks 包装注入——
        // 门面/运行时虚拟模块隔离进插件专属 chunk，防用户强制分组与门面静态边互锁成环
        // （见 facadeChunkOf 注）。纯 remote（remotes 为空）不启用，产物行为保持 2.0.0（硬约束）。
        if (normalized.remotes.length > 0 && normalized.devSharedSelf) {
          state.facadeDynamic = true
          const userMc = (userConfig.build?.rollupOptions?.output as { manualChunks?: unknown } | undefined)?.manualChunks
          debugLog('facade', {
            stage: 'config',
            facadeDynamic: true,
            manualChunks: Array.isArray(userConfig.build?.rollupOptions?.output) ? 'array' : typeof userMc,
          })
          const userOutput = userConfig.build?.rollupOptions?.output
          if (Array.isArray(userOutput)) {
            console.warn(
              formatFulgurjsDiagnostic({
                code: 'BLD-006',
                symptom: 'build.rollupOptions.output 是数组，fulgurjs 无法自动注入共享门面 chunk 防护',
                cause: 'devSharedSelf 门面化 + manualChunks 强制分组可能形成 chunk 循环依赖（运行时 TypeError：协商函数未初始化）',
                fix: `在每个 output 项的 manualChunks 最前面加分支：if (id.startsWith('virtual:fulgurjs-')) return 'fulgurjs-shared-facades'`,
              }),
            )
          } else {
            const userManualChunks = userOutput?.manualChunks
            if (typeof userManualChunks === 'function') {
              const userFn = userManualChunks
              const wrapped = (id: string, meta: unknown) => {
                const facade = facadeChunkOf(id)
                if (facade) return facade
                if (isOwnPackageModule(id)) return undefined
                return userFn(id, meta as never)
              }
              const extraBuild = ((extra as any).build ??= {})
              extraBuild.rollupOptions = { ...(extraBuild.rollupOptions ?? {}), output: { manualChunks: wrapped } }
            } else if (userManualChunks && typeof userManualChunks === 'object') {
              // 对象形式：specifier → 模块 id 的解析要等 buildStart（rollup 上下文可用），
              // 这里只登记待解析清单；包装函数运行时（归组期，晚于 buildStart）查表
              state.manualChunkSpecsPending = Object.entries(userManualChunks as Record<string, string[]>).flatMap(
                ([group, specs]) => specs.map((s) => [group, s] as [string, string]),
              )
              const wrapped = (id: string): string | undefined => {
                const facade = facadeChunkOf(id)
                if (facade) return facade
                if (isOwnPackageModule(id)) return undefined
                return state.manualChunkGroups.get(id.split('?')[0]) ?? state.manualChunkGroups.get(id)
              }
              const extraBuild = ((extra as any).build ??= {})
              extraBuild.rollupOptions = { ...(extraBuild.rollupOptions ?? {}), output: { manualChunks: wrapped } }
            }
            // 未配置 manualChunks：仅门面动态化生效，不注入包装（自动分包下门面归组交给
            // rollup；配合闭包静态化已无静态互锁边）
          }
        }
      }

      // 5.2.1：宿主（remotes>0）通用隔离——运行时与共享门面进插件专属 chunk。
      // 实证（MES admin + vite-plugin-top-level-await@1.6.0 + rollup 默认归组）：运行时
      // 代码被并入巨型 vendor chunk 后，该插件对含动态 import 的 chunk 全量走 swc 变换，
      // 对联邦运行时的压缩产物 printSync 必崩（missing field type / invalid type null，
      // swc 1.13/1.15 同崩）。隔离后 TLA 插件只需处理小型门面 chunk（既有通过路径），
      // vendor chunk 回到无联邦时的形状。用户已有 manualChunks 时包装复用（同 devSharedSelf）。
      if (normalized.remotes.length > 0 && !state.facadeDynamic) {
        const userOutput = userConfig.build?.rollupOptions?.output as
          | { manualChunks?: unknown }
          | Array<{ manualChunks?: unknown }>
          | undefined
        const wrap = (userFn?: (id: string, meta: unknown) => string | undefined) =>
          (id: string, meta: unknown) => {
            const facade = facadeChunkOf(id)
            if (facade) return facade
            if (isOwnPackageModule(id)) return undefined
            return providerChunkOf(id, state.providerRoots) ?? userFn?.(id, meta)
          }
        const extraBuild = ((extra as any).build ??= {})
        if (Array.isArray(userOutput)) {
          console.warn(
            formatFulgurjsDiagnostic({
              code: 'BLD-006',
              symptom: 'build.rollupOptions.output 是数组，fulgurjs 无法自动注入运行时 chunk 隔离',
              cause: '运行时代码可能被归组进大型 vendor chunk，与按 chunk 全量做 swc 变换的插件（如 vite-plugin-top-level-await）不兼容',
              fix: "在每个 output 项的 manualChunks 最前面加分支：if (id.startsWith('virtual:fulgurjs-')) return 'fulgurjs-runtime'",
            }),
          )
        } else {
          const userManualChunks = userOutput?.manualChunks
          if (typeof userManualChunks === 'function') {
            const extraBuild2 = ((extra as any).build ??= {})
            extraBuild2.rollupOptions = { ...(extraBuild2.rollupOptions ?? {}), output: { manualChunks: wrap(userManualChunks as never) } }
          } else if (userManualChunks && typeof userManualChunks === 'object') {
            // 对象形式（jeecg 系工程常用）：包装为等价函数——插件专属 chunk 判定优先，
            // 其余按「绝对路径包含 /node_modules/<spec 前缀>」匹配回原组名（对象形式的
            // 常见用法是把 npm 包指到命名组；列出的都是包名，路径前缀匹配语义一致）。
            const groups = Object.entries(userManualChunks as Record<string, string[]>).flatMap(
              ([group, specs]) => (Array.isArray(specs) ? specs : []).map((spec) => ({ group, spec })),
            )
            const groupOf = (id: string): string | undefined => {
              for (const { group, spec } of groups) {
                const marker = `/node_modules/${spec.startsWith('@') ? spec : spec.split('/')[0]}/`
                if (id.includes(marker)) return group
              }
              return undefined
            }
            const extraBuild2 = ((extra as any).build ??= {})
            extraBuild2.rollupOptions = {
              ...(extraBuild2.rollupOptions ?? {}),
              output: {
                manualChunks: (id: string, meta: unknown) => {
                  const facade = facadeChunkOf(id)
                  if (facade) return facade
                  if (isOwnPackageModule(id)) return undefined
                  return groupOf(id)
                },
              },
            }
          } else {
            const extraBuild2 = ((extra as any).build ??= {})
            extraBuild2.rollupOptions = { ...(extraBuild2.rollupOptions ?? {}), output: { manualChunks: wrap() } }
          }
        }
      }

      // 5.3.0：远程（exposes>0）build 的 react-dom chunk 隔离。桥接契约在 mount 时动态
      // import('react-dom/client')；rollup 可能把该动态目标与独立入口（main 静态 import
      // react-dom/client）合并进同一个 chunk——经容器加载 expose 会连带执行独立入口的
      // createRoot(document.getElementById(...)) → React #299（容器不存在，桥接轮实测）。
      // 把 react-dom 包隔离进专属 chunk，动态导入目标不再落在独立入口 chunk 上。
      // 与上方宿主隔离组合（宿主规则优先）；用户 manualChunks 优先于本规则（用户把
      // react-dom 显式分组进独立组同样达成隔离）。
      if (normalized.exposes.length > 0) {
        const userOutput3 = userConfig.build?.rollupOptions?.output as
          | { manualChunks?: unknown }
          | Array<{ manualChunks?: unknown }>
          | undefined
        const reactDomChunkOf = (id: string): string | undefined =>
          /[\\/]node_modules[\\/]react-dom[\\/]/.test(id.split('?')[0]) ? 'fulgurjs-provider-react-dom' : undefined
        if (Array.isArray(userOutput3)) {
          console.warn(
            formatFulgurjsDiagnostic({
              code: 'BLD-006',
              symptom: 'build.rollupOptions.output 是数组，fulgurjs 无法自动注入远程 react-dom chunk 隔离',
              cause: 'expose 内动态 import("react-dom/client") 的目标可能被合并进独立入口 chunk，容器加载 expose 时连带执行入口引导代码（React #299：目标容器不存在）',
              fix: "在每个 output 项的 manualChunks 最前面加分支：if (/[/\\\\]node_modules[/\\\\]react-dom[/\\\\]/.test(id)) return 'fulgurjs-remote-react-dom'",
            }),
          )
        } else {
          const extraBuild3 = ((extra as any).build ??= {})
          const previousOutput = (extraBuild3.rollupOptions as { output?: { manualChunks?: unknown } } | undefined)?.output
          const previousMc = previousOutput?.manualChunks as ((id: string, meta: unknown) => string | undefined) | undefined
          const userManualChunks3 = userOutput3?.manualChunks
          const userFn3 =
            typeof userManualChunks3 === 'function'
              ? (userManualChunks3 as (id: string, meta: unknown) => string | undefined)
              : undefined
          const combined = (id: string, meta: unknown): string | undefined => {
            if (isOwnPackageModule(id)) return facadeChunkOf(id) ?? reactDomChunkOf(id) ?? undefined
            const prev = previousMc?.(id, meta)
            if (prev !== undefined) return prev
            const user = userFn3?.(id, meta)
            if (user !== undefined) return user
            // V8-FIX：shared 本体闭包与门面同组（破 rolldown chunk 级 TLA 循环）；
            // react-dom 本体属 react-dom 闭包 → 归 fulgurjs-shared-react-dom 组，
            // 同时满足 5.3.0 的 react-dom chunk 隔离（不再落入独立入口 chunk）
            const provider = providerChunkOf(id, state.providerRoots)
            if (provider) return provider
            const facade = facadeChunkOf(id)
            if (facade) return facade
            return reactDomChunkOf(id)
          }
          extraBuild3.rollupOptions = { ...(extraBuild3.rollupOptions ?? {}), output: { manualChunks: combined } }
        }
      }

      for (const w of normalized.warnings) console.warn(`[fulgurjs] ${w}`)
      return extra
    },

    configResolved(resolved) {
      state.base = normalizeBase(resolved.base)
      if ((resolved as unknown as { build?: { ssr?: boolean } }).build?.ssr) {
        console.warn('[fulgurjs] 当前版本不支持 SSR 构建；联邦插件钩子已停用。请使用客户端构建。')
      }
      // D.5 DEV-003/004：optimizeDeps 与联邦 shared/UMD 依赖的配置矛盾，启动前显式提示
      const n0 = state.normalized
      const optimize = (resolved as unknown as { optimizeDeps?: { include?: string[]; exclude?: string[] } })
        .optimizeDeps
      if (n0 && optimize) {
        const include = optimize.include ?? []
        const exclude = optimize.exclude ?? []
        const excl = (pkg: string) => exclude.some((e) => e === pkg || e.startsWith(pkg + '/') || e.startsWith(pkg + '>'))
        const incl = (pkg: string) => include.some((e) => e === pkg || e.startsWith(pkg + '/') || e.startsWith(pkg + '>'))
        // DEV-003（shared∩exclude）撤回：shared 键由插件外部化机制支持 exclude+shared 组合，
        // 该告警曾在受支持的真实工程配置下误报（2026-09-17 实测），已撤回。代码保留于 diagnostics.ts 码表。
        // DEV-004：已知 UMD-only 依赖不在 include → 预构建内联本地 vue（双实例页面空白）
        const KNOWN_UMD = ['@smallwei/avue']
        for (const pkg of KNOWN_UMD) {
          if (n0.pkgDependencies[pkg] && !incl(pkg) && !excl(pkg)) {
            console.warn(
              formatFulgurjsDiagnostic({
                code: 'DEV-004',
                symptom: `UMD-only 依赖 "${pkg}" 不在 optimizeDeps.include`,
                cause: 'UMD 包只能经预构建消费；不声明会被裸 CJS 服务或内联本地 vue（页面空白/双实例）',
                fix: `加入 optimizeDeps.include: ['${pkg}']`,
                details: { pkg },
              }),
            )
          }
        }
      }
    },

    resolveId(source, importer) {
      // 相对路径 share 键的门面虚拟模块（virtual:fulgurjs-shared:./src/x.ts）内部
      // import 的相对 spec 无法以虚拟 id 为基准解析——统一按应用根解析（provider 门面
      // 与消费门面共用此规则；5.3.2 及之前该场景在 rollup 解析期直接失败，20261001 修复）
      if (
        state.normalized &&
        importer &&
        (importer.includes('virtual:fulgurjs-shared:') || importer.includes('virtual:fulgurjs-shared-ns:')) &&
        /^\.\.?\//.test(source) &&
        !source.startsWith('virtual:fulgurjs-')
      ) {
        const resolved = path.resolve(state.normalized.root, source)
        return resolved + (source.match(/\?[^/]*$/)?.[0] ?? '')
      }
      // 兼容三种形态：裸 specifier / __x00__ URL 编码（dev 生成代码被 importAnalysis 再解析）/ \0 历史形态；query 原样保留
      let s = source
      if (s.startsWith('/@id/')) s = s.slice(5)
      if (s.startsWith('__x00__')) s = '\0' + s.slice(7)
      const q = s.indexOf('?')
      const bare = q === -1 ? s : s.slice(0, q)
      const query = q === -1 ? '' : s.slice(q)
      const bareClean = bare.startsWith('\0') ? bare.slice(1) : bare

      // WP1（2026-09-23）：后置插件注入的 shared 导入解析期兜底改道（与插件注册顺序无关）。
      // 背景：unplugin-auto-import 的 vite 适配器硬编码 enforce:'post'；用户把它注册在
      // federation() 之后时，其注入的 `import { ref } from 'vue'` 晚于本插件全部 transform，
      // 会静态绑定本地 vue 副本 → 与协商实例形成双响应性系统（ref 赋值不触发渲染）。
      // 兜底判据：导入方是「已被本插件改写过的模块」，其最终代码里仍出现裸 shared
      // specifier——正常改写后不会存留，存留者必为后置注入 → 改道协商命名空间门面
      // （全命名空间再导出 + TLA 协商；对本地副本只有动态 fallback 边，不产生静态依赖，
      // 不破坏 devSharedSelf 的 chunk 隔离形态）。
      // 排除项：本插件自己的虚拟模块（提供方语义，shared 导入必须真身解析）、shared
      // 本体闭包内模块（闭包静态化语义）、依赖预构建产物（内部是 URL 不是裸名）、
      // 未被改写过的模块（dev 宿主自身源码不改写 = 自身 provide 语义，不得改道）。
      if (state.normalized && importer) {
        const impClean = importer.split('?')[0]
        const isOurVirtual =
          impClean.startsWith('virtual:fulgurjs-') || impClean.startsWith('\0virtual:fulgurjs-')
        if (
          !isOurVirtual &&
          !impClean.includes('/node_modules/.vite/') &&
          !state.sharedClosureRoots.some((r) => impClean.startsWith(r.root)) &&
          (state.transformedModules.has(importer) || state.transformedModules.has(impClean))
        ) {
          const hit = state.normalized.shared.find((sh) => sh.aliases.includes(bareClean))
          const providerSelf = hit && state.normalized.remotes.length > 0 &&
            state.providerRoots.some((provider) => impClean.startsWith(provider.root) && provider.shareKey === hit.shareKey)
          if (hit && !providerSelf) {
            return RESOLVED.sharedNsFacade(hit.shareKey) + query
          }
        }
      }

      if (bareClean === RUNTIME_VIRTUAL_ID) return RESOLVED.runtime
      if (bareClean === RUNTIME_PROXY_VIRTUAL_ID) return RESOLVED.runtimeProxy
      if (bareClean === INIT_VIRTUAL_ID) return RESOLVED.init
      if (bareClean === 'virtual:fulgurjs-remote-schema') return bareClean
      if (bareClean === 'virtual:fulgurjs-api-facade') return bareClean
      if (bareClean === 'virtual:fulgurjs-api-facade-react') return bareClean
      if (bareClean === 'virtual:fulgurjs-api-facade-bridge') return bareClean
      if (bareClean === 'virtual:fulgurjs-api-facade-bridge-vue') return bareClean
      if (bareClean === 'virtual:fulgurjs-api-facade-bridge-react') return bareClean
      if (bareClean === 'virtual:fulgurjs-provides') return RESOLVED.provides
      if (bareClean === 'virtual:fulgurjs-remote-entry') return RESOLVED.remoteEntry
      // D3：react-refresh 单例 shim（dev）。注册为可解析模块——改写后的根相对导入在
      // importAnalysis 转换期就要解析成功，不注册会直接 Failed to resolve import。
      if (state.command === 'serve') {
        const sourceNorm = source.startsWith(state.base) ? `/${source.slice(state.base.length)}` : source
        if (sourceNorm.split('?')[0] === REACT_REFRESH_SHIM_URL) return '\0virtual:fulgurjs-react-refresh-shim'
      }
      if (bareClean.startsWith(SHARED_NS_FACADE_PREFIX)) {
        return RESOLVED.sharedNsFacade(bareClean.slice(SHARED_NS_FACADE_PREFIX.length)) + query
      }
      if (bareClean.startsWith('virtual:fulgurjs-cjs-ns:')) {
        // CJS require(<shared>) 垫片：保持自身前缀——load 期为它生成同步形态垫片
        // （V8-FIX 2026-10-01：rolldown 拒绝 CJS require TLA 模块，不能复用 TLA 的
        // sharedNsFacade 同体），而非映射到 shared-ns。
        return bareClean + query
      }
      if (bareClean.startsWith('virtual:fulgurjs-shared:')) {
        // 绑定门面（?f= 绑定签名）与命名空间门面共用前缀；query 透传
        const body = bareClean.slice('virtual:fulgurjs-shared:'.length)
        return RESOLVED.sharedFacade(body) + query
      }
      return null
    },

    async load(id) {
      if (id === '\0virtual:fulgurjs-react-refresh-shim') return genReactRefreshShim()
      const raw = id.startsWith('\0') ? id.slice(1) : id
      const q = raw.indexOf('?')
      const clean = q === -1 ? raw : raw.slice(0, q)
      if (clean === 'virtual:fulgurjs-runtime') return readRuntimeCode()
      if (clean === RESOLVED.runtimeProxy || clean === RUNTIME_PROXY_VIRTUAL_ID) return genRuntimeProxyModule()
      if (clean === 'virtual:fulgurjs-init' && state.normalized) {
        return genInitModule(state.normalized, state.command)
      }
      if (clean === 'virtual:fulgurjs-provides' && state.normalized) {
        return genDevProvides(state.normalized)
      }
      if (clean === 'virtual:fulgurjs-api-facade' && state.command === 'serve') {
        return genApiFacade('vue')
      }
      if (clean === 'virtual:fulgurjs-api-facade-react' && state.command === 'serve') {
        return genApiFacade('react')
      }
      if (clean === 'virtual:fulgurjs-api-facade-bridge' && state.command === 'serve') {
        return genBridgeFacade('both')
      }
      if (clean === 'virtual:fulgurjs-api-facade-bridge-vue' && state.command === 'serve') {
        return genBridgeFacade('vue')
      }
      if (clean === 'virtual:fulgurjs-api-facade-bridge-react' && state.command === 'serve') {
        return genBridgeFacade('react')
      }
      if (clean === 'virtual:fulgurjs-remote-schema' && state.normalized) {
        // D.2 Tier2：remote exposes 清单（dev 实测探针产出；build 诚实降级为空）
        if (state.command === 'build') return genEmptyRemoteSchemaModule()
        remoteSchemaPromise ??= probeRemotesAndBuildSchema(state.normalized).then(
          genRemoteSchemaModule,
        )
        return remoteSchemaPromise
      }
      if (clean === 'virtual:fulgurjs-remote-entry' && state.normalized) {
        return genBuildRemoteEntry(state.normalized, state.exposeAbsPaths)
      }
      // CJS require(<shared>) 垫片：同步形态（V8-FIX 2026-10-01）。rolldown（vite 8）对
      // CJS require 含 TLA 的 ESM 在构建期直接拒绝（REQUIRE_TLA），react/react-dom 本体
      // （CJS）互引不能复用 TLA 的 sharedNsFacade 同体；先于 shared-ns 分支匹配。
      // vite5-7 的 rollup commonjs 插件还会为「CJS require ESM 目标」生成
      // <id>?commonjs-proxy 载体：其 load 早于该插件执行而落在本分支（id 去 query 后同前缀），
      // 因此垫片内不能留裸包名 import——proxy 虚拟 id 上下文里 vite resolver 完成不了
      // node 解析（实测 load-fallback ENOENT），本体必须在这里预先解析成绝对 id。
      if (clean.startsWith('virtual:fulgurjs-cjs-ns:') && state.normalized) {
        const body = clean.slice('virtual:fulgurjs-cjs-ns:'.length)
        const item = state.normalized.shared.find((x) => x.shareKey === body)
        if (!item || item.import === false) return null
        const names = enumerateCjsExports(item.import, state.normalized.root)
        if (item.shareKey === 'vue') {
          for (const compat of ['isVue2', 'isVue3', 'Vue2', 'set', 'del']) {
            if (!names.includes(compat)) names.push(compat)
          }
        }
        let importTarget = item.import
        try {
          const resolvedImport = await (this as any).resolve?.(item.import, path.join(state.normalized.root, 'package.json'), { skipSelf: true })
          if (resolvedImport?.id) importTarget = resolvedImport.id
        } catch {
          // 解析失败保留裸包名，行为与命名空间门面一致（root node_modules 兜底可解析）
        }
        return genCjsNsFacade(item, names, importTarget)
      }
      if (clean.startsWith(SHARED_NS_FACADE_PREFIX) && state.normalized) {
        const body = clean.slice(SHARED_NS_FACADE_PREFIX.length)
        const item = state.normalized.shared.find((x) => x.shareKey === body)
        if (!item || item.import === false) return null
        const names = enumerateCjsExports(item.import, state.normalized.root)
        // vue-demi 的 Vue2 兼容导出在依赖预构建里也被指到 'vue'（vite 生态普遍把 vue-demi
        // 解析为 vue）：缺名会让 ESM 命名导入直接致命。vue3 下 isVue2/Vue2 为假值、set/del
        // 仅 Vue2 分支调用——从协商实例取不到即为 undefined，语义正确。
        if (item.shareKey === 'vue') {
          for (const compat of ['isVue2', 'isVue3', 'Vue2', 'set', 'del']) {
            if (!names.includes(compat)) names.push(compat)
          }
        }
        // V8-SYNC-FACADE：rolldown 构建用同步 pin 形态（TLA 会把 await 传播进消费方
        // 初始化包装，循环依赖互等死锁——见 genBindingFacadeSync 注）
        if (state.rolldownBuild) {
          return genSharedNsFacadeSync(item, names, await resolveSharedImportTarget.call(this, item, state.normalized.root))
        }
        return genSharedNsFacade(item, serializeShareCallForFacade(item), names, state.facadeDynamic)
      }
      if (clean.startsWith('virtual:fulgurjs-shared:') && state.normalized) {
        const body = clean.slice('virtual:fulgurjs-shared:'.length)
        const f = raw.indexOf('?f=')
        if (f === -1) {
          // 命名空间门面（provide/fallback 用）：本应用自己的副本。
          // U-7：bare 包枚举式再导出（rolldown 下 export *+TLA 命名绑定全 undefined）；
          // 相对路径 import 不进 require 枚举，回退 export * 形态
          const item = state.normalized.shared.find((x) => x.shareKey === body)
          if (item && item.import !== false) {
            const names = /^(\.|\/)/.test(item.import) ? [] : enumerateCjsExports(item.import, state.normalized.root)
            return genSharedFacade(item.import, names, state.facadeDynamic && !state.rolldownBuild)
          }
          return null
        }
        // 绑定门面：短签名反查绑定集，门面内做 loadShare/loadRemote 协商并转发绑定
        const entry = getFacadeEntry(raw.slice(f + 3))
        if (!entry) return null
        if (entry.remoteName && entry.exposeName) {
          return genRemoteBindingFacade(entry.remoteName + '/' + entry.exposeName, entry.bindings, state.facadeDynamic)
        }
        const item = state.normalized.shared.find((x) => x.shareKey === entry.shareKey)
        if (!item || item.import === false) return null
        // V8-SYNC-FACADE：rolldown 构建用同步 pin 形态（消除插件注入的 TLA 及其在
        // 循环依赖里的互等死锁——见 genBindingFacadeSync 注）
        if (state.rolldownBuild) {
          return genBindingFacadeSync(item, entry.bindings, await resolveSharedImportTarget.call(this, item, state.normalized.root))
        }
        const opts = [
          'shareScope: ' + JSON.stringify(item.shareScope),
          'shareKey: ' + JSON.stringify(item.shareKey),
          ...(item.requiredVersion !== false ? ['requiredVersion: ' + JSON.stringify(item.requiredVersion)] : []),
          ...(item.singleton ? ['singleton: true'] : []),
          ...(item.strictVersion ? ['strictVersion: true'] : []),
          'localVersion: ' + JSON.stringify(item.version),
          'fallback: () => import(' + JSON.stringify(item.import) + ')',
        ]
        const call = '__fulgurjs_loadShare(' + JSON.stringify(item.shareKey) + ', { ' + opts.join(', ') + ' })'
        return genBindingFacade(item, entry.bindings, call, state.facadeDynamic)
      }
      return null
    },

    async transform(code, id) {
      if (!state.normalized) return null
      const clean = id.split('?')[0]
      // build：宿主入口模块顶部内联 init（先于一切应用代码注册 remotes/provides）。
      // 不能用独立虚拟模块：rollup 会摇树剥离其顶层调用；入口自身的顶层调用永不被剥离。
      // 曾尝试 side-effect import，后续恢复内联；新版本构建支持以实际矩阵为准。
      if (state.command === 'build' && state.entryAbsPaths.has(clean) && !state.entryInitInjected.has(clean)) {
        state.entryInitInjected.add(clean)
        const initCode = genInitModule(state.normalized, state.command)
        return { code: `${initCode}\n${code}`, map: null }
      }

      // node_modules 依赖是否进改写管线 = devSharedSelf || 纯 remote，与 dev post 阶段
      // （post.transform 的 devRewriteAll / rewriteShared）共用同一开关："自身源码（含依赖）
      // 参与 shared 协商就放行"。旧判定 isPureRemoteBuild 会把双向联邦（有 exposes 也有
      // remotes，如 bpm expose 组件同时消费 admin 页面）挡在管线外——依赖包（element-plus
      // 等）的 vue 导入不门面化 → prod 内联本地 vue 双实例（'ce' 错误）；dev 侧走
      // devSharedSelf 所以通，两处语义必须一致。
      const isPureRemoteBuild =
        state.normalized.exposes.length > 0 && state.normalized.remotes.length === 0
      const providerCjs = state.command === 'build' && /require\s*\(\s*["']/.test(code) &&
        state.providerRoots.some((provider) => clean.startsWith(provider.root))
      // 纯宿主仍不改写依赖的 ESM/TLA 链；提供包跨键的同步 require 单独放行。
      const allowNodeModules = state.normalized.devSharedSelf || isPureRemoteBuild || providerCjs
      const cjsClosureRoots = state.sharedClosureRoots.length > 0 || isPureRemoteBuild
        ? state.sharedClosureRoots
        : state.providerRoots.map((provider) => ({ root: provider.root, keys: new Set([provider.shareKey]) }))

      if (/\.vue(\?|$)/.test(id)) {
        // prod 构建时 vue 插件将 script 拆为 ?vue&type=script 子请求（源码 import 仍是 bare）：
        // 在 pre 阶段先行改写；其余 .vue 主请求与 template/style 子请求交给 post 阶段。
        // dev 不走这里：dev 的 .vue 全部交给 post 阶段按 dev 角色判定处理（见 post.transform）。
        if (state.command === 'build' && /type=script/.test(id)) {
          return transformModule(code, id, {
            onRewrite: () => recordRewritten(id),
            options: state.normalized,
            rewriteShared: true,
            allowNodeModules,
            cjsRequireRewrite: true,
            sharedClosureRoots: cjsClosureRoots,
          })
        }
        return null
      }
      if (!isTransformableId(id, allowNodeModules)) return null
      return transformModule(code, id, {
        onRewrite: () => {
          debugLog('transform', { stage: 'pre', mode: state.command, module: redactModulePath(id, state.normalized!.root) })
          recordRewritten(id)
        },
        options: state.normalized,
        // build：全量改写；dev：默认仅纯 remote 改写 shared（被宿主消费的组件需协商到宿主实例），
        // 双角色宿主可显式 devSharedSelf: true 参与协商
        rewriteShared: state.command === 'build' || state.normalized.devSharedSelf,
        allowNodeModules,
        cjsRequireRewrite: state.command === 'build',
        sharedClosureRoots: cjsClosureRoots,
      })
    },

    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        if (!state.normalized) return html
        if (state.command === 'serve') {
          // 不带 base：vite dev 的 html 处理会统一解析并补 base（自带 base 会被二次前缀）
          const src = `/@id/__x00__${INIT_VIRTUAL_ID}?import`
          return injectInitScript(html, src)
        }
        // build：捕获入口模块路径，transform 阶段内联 init（见 pre.transform）
        const moduleScriptRe = /<script[^>]+type=["']module["'][^>]*>/g
        const srcRe = /src=["']([^"']+)["']/
        for (const tag of html.match(moduleScriptRe) ?? []) {
          const src = srcRe.exec(tag)?.[1]
          if (!src || src.startsWith('http') || src.startsWith('//')) continue
          const abs = path.resolve(state.normalized.root, src.startsWith('/') ? src.slice(1) : src)
          state.entryAbsPaths.add(abs)
        }
        debugLog('init-entry', { stage: 'capture', count: state.entryAbsPaths.size, entries: [...state.entryAbsPaths].map((p) => redactModulePath(p, state.normalized!.root)) })
        return html
      },
    },

    async buildStart() {
      if (state.command !== 'build' || !state.normalized) return
      const n = state.normalized
      // 收集本地提供包的物理目录（Vite 8 的 outputOptions 保护组与 rollup 侧 manualChunks
      // 包装共用）：整包目录与 provider 门面/CJS 垫片同 chunk——包内自引用（react-dom 的
      // require("react-dom")）不跨 chunk，杜绝 rollup const 级 interop 的 TDZ；jsx-runtime
      // 等兄弟入口会把垫片拖进消费方静态链（早于 TLA 门面求值），该场景由运行时
      // pinLoadedShare 收敛实例（见 runtime/index.ts），不依赖 chunk 顺序。
      state.providerRoots = []
      // commonjs 的 resolve 可能提前 load/transform 本体；在首个异步 resolve 前登记包根，
      // 否则 react-dom 首次变换时尚未登记自身，跨键 require 会永久漏过改写。
      const providerRequire = createRequire(path.join(n.root, 'package.json'))
      for (const item of n.shared) {
        if (item.import === false) continue
        try {
          const file = providerRequire.resolve(item.import).replace(/\\/g, '/')
          const pos = file.lastIndexOf('/node_modules/')
          if (pos < 0) continue
          const parts = file.slice(pos + '/node_modules/'.length).split('/')
          const pkg = parts[0].startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
          state.providerRoots.push({ root: file.slice(0, pos + '/node_modules/'.length) + pkg + '/', shareKey: item.shareKey })
        } catch { /* 别名/相对源码由后续 Vite resolve 补齐。 */ }
      }
      {
        for (const item of n.shared) {
          if (item.import === false) continue
          const resolved = await this.resolve(item.import, path.join(n.root, 'index.html'))
          const file = resolved?.id.replace(/^\0/, '').split('?')[0]
          if (!file) continue
          const marker = '/node_modules/'
          const pos = file.lastIndexOf(marker)
          if (pos === -1) continue
          const parts = file.slice(pos + marker.length).split('/')
          const pkg = parts[0].startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
          const root = file.slice(0, pos + marker.length) + pkg + '/'
          if (!state.providerRoots.some((provider) => provider.root === root && provider.shareKey === item.shareKey)) {
            state.providerRoots.push({ root, shareKey: item.shareKey })
          }
        }
      }
      // D6：对象形式 manualChunks 的 specifier → 模块 id 解析（此阶段 rollup 上下文可用，
      // 走完整解析管线含 alias；归组期调用包装函数时查表）。解析失败的 specifier 丢组并
      // 显式告警——行为降级可见，不静默。
      if (state.manualChunkSpecsPending) {
        for (const [group, specifier] of state.manualChunkSpecsPending) {
          try {
            const r = await this.resolve(specifier, path.join(n.root, 'index.html'))
            if (r?.id) {
              state.manualChunkGroups.set(r.id, group)
              state.manualChunkGroups.set(r.id.split('?')[0], group)
            } else {
              console.warn(
                `[fulgurjs] manualChunks 分组 "${group}" 中的模块 "${specifier}" 无法解析，已回退为自动分包；共享协商门面仍受保护。请检查模块路径。`,
              )
            }
          } catch {
            console.warn(
              `[fulgurjs] manualChunks 分组 "${group}" 中的模块 "${specifier}" 解析失败，已回退为自动分包。请检查模块路径。`,
            )
          }
        }
        state.manualChunkSpecsPending = undefined
      }
      // D6：解析 shared 键本体闭包目录。闭包内模块对 shared 键的导入跳过门面化
      // （transform.ts inSharedClosure），斩断 fallback → 本体 chunk 的 TLA 混合环
      // （详见 transform.ts TransformContext.sharedClosureRoots 注释）。
      if (n.remotes.length > 0 && n.devSharedSelf && state.sharedClosureRoots.length === 0) {
        const rootKeys = new Map<string, Set<string>>()
        const pkgRootOf = (file: string): string | null => {
          const NM = '/node_modules/'
          const i = file.lastIndexOf(NM)
          if (i === -1) return null
          const rest = file.slice(i + NM.length)
          const segs = rest.split('/')
          const pkgDir = segs[0]!.startsWith('@') ? segs.slice(0, 2).join('/') : segs[0]!
          return file.slice(0, i + NM.length) + pkgDir + '/'
        }
        for (const item of n.shared) {
          if (item.import === false) continue
          // 别名包（vue-demi 等转发层）一并纳入闭包：它们是 provide 键的一部分，
          // 且其 `export * from <key>` 无法门面化（ESM 限制），必须静态引用本体。
          // 解析顺序：先从 shared 本体文件解析（pnpm 严格布局下别名包多为传递依赖，
          // 不在应用根 node_modules——如 pinia→vue-demi），失败再从应用根解析。
          const selfFile = await this.resolve(item.import, path.join(n.root, 'index.html')).then(
            (r) => r?.id?.split('?')[0] ?? null,
          ).catch(() => null)
          for (const alias of item.aliases) {
            if (alias.endsWith('/')) continue
            let file: string | null = null
            if (selfFile) {
              // pnpm 布局：从 shared 本体文件出发解析其传递依赖（vue-demi 不在应用根 node_modules）
              try {
                const req = createRequire(selfFile)
                file = req.resolve(`${alias}/package.json`, { paths: [selfFile] }).replace(/\/package\.json$/, '')
              } catch {
                file = null
              }
            }
            if (!file) {
              file = await this.resolve(alias, path.join(n.root, 'index.html')).then(
                (r) => r?.id?.split('?')[0] ?? null,
              ).catch(() => null)
            }
            if (!file) continue
            const root = pkgRootOf(file)
            if (!root) continue
            let keys = rootKeys.get(root)
            if (!keys) rootKeys.set(root, (keys = new Set()))
            keys.add(item.shareKey)
          }
        }
        state.sharedClosureRoots = [...rootKeys.entries()].map(([root, keys]) => ({ root, keys }))
        if (state.sharedClosureRoots.length > 0) {
          debugLog('facade', {
            stage: 'buildStart',
            sharedClosureRoots: state.sharedClosureRoots.length,
            keys: [...new Set(state.sharedClosureRoots.flatMap((r) => [...r.keys]))],
          })
        }
      }
      if (n.exposes.length > 0) {
        // 解析 exposes 源模块绝对路径（容器入口与 manifest 映射依赖）
        for (const e of n.exposes) {
          const resolved = await this.resolve(e.import, path.join(n.root, 'index.html'))
          if (resolved) {
            state.exposeAbsPaths[e.import] = resolved.id.split('?')[0]
          } else {
            this.error(`[fulgurjs] expose "${e.import}" could not be resolved from ${n.root}`)
          }
        }
        // emitFile 固定文件名：remoteEntry URL 稳定，CDN 长缓存友好
        this.emitFile({
          type: 'chunk',
          id: 'virtual:fulgurjs-remote-entry',
          fileName: n.filename.replace(/^\//, ''),
          preserveSignature: 'allow-extension',
        })
      }
    },

    outputOptions(output) {
      if (!state.rolldownBuild) return null
      // 不把 await loadShare 的消费门面和它动态加载的提供模块放进同一 chunk。
      // Rolldown 的递归捕获会重新合并这两类模块，故保护组只捕获明确命中的模块。
      const protectedChunk = (id: string): string | undefined => {
        if (id.includes('preload-helper')) return 'fulgurjs-preload-helper'
        // 插件自身包模块（适配器等，静态 import TLA 门面）单独成组：不被用户
        // codeSplitting/advancedChunks 组捕获，避免与 shared 物理包同组构成混合环
        if (isOwnPackageModule(id)) return 'fulgurjs-internal'
        const clean = id.replace(/^\0/, '').split('?')[0]
        const keyName = (key: string) => key.replace(/[^A-Za-z0-9_-]/g, '_') || 'unknown'
        if (clean.startsWith(SHARED_FACADE_PREFIX) && !id.includes('?f=')) {
          return 'fulgurjs-provider-' + keyName(clean.slice(SHARED_FACADE_PREFIX.length))
        }
        if (clean.startsWith('virtual:fulgurjs-cjs-ns:')) {
          return 'fulgurjs-cjs-' + keyName(clean.slice('virtual:fulgurjs-cjs-ns:'.length))
        }
        const provider = state.providerRoots.find((p) => clean.startsWith(p.root))
        if (provider) return 'fulgurjs-provider-' + keyName(provider.shareKey)
        return facadeChunkOf(id) ?? undefined
      }
      // 保留用户的 codeSplitting / advancedChunks 与 manualChunks 配置。
      const native = output as typeof output & {
        codeSplitting?: boolean | { groups?: Array<{ priority?: number; [key: string]: unknown }>; [key: string]: unknown }
        advancedChunks?: { groups?: Array<{ priority?: number; [key: string]: unknown }>; [key: string]: unknown }
        strictExecutionOrder?: boolean
      }
      if (native.codeSplitting === false || output.inlineDynamicImports || output.preserveModules) {
        this.error('[fulgurjs] Vite 8 联邦构建需要独立的共享提供模块与协商模块。请移除 codeSplitting: false、inlineDynamicImports: true 或 preserveModules: true 后重建。')
      }
      const splitting = typeof native.codeSplitting === 'object' ? native.codeSplitting : native.advancedChunks ?? {}
      const groups = splitting.groups ?? []
      const userGroups: Array<Record<string, unknown>> = [...groups]
      // rolldown 原生规则：codeSplitting 与 manualChunks 并存时忽略 manualChunks——这里
      // 主动把 manualChunks 迁入同一分组表（同 rolldown 自身对单独 manualChunks 的迁移形态：
      // name(id, ctx) 透传 ctx.getModuleInfo），语义不丢失。
      if (output.manualChunks && !splitting.groups) {
        const manual = output.manualChunks
        if (typeof manual === 'function') {
          // name 返回 null/undefined = 本组不捕获该模块，等价 rollup manualChunks 返回 void；
          // 受保护模块由更高优先级的保护组先捕获，这里再挡一层防御性排除。
          userGroups.push({
            name: (id: string, ctx: { getModuleInfo: (id: string) => unknown }) =>
              protectedChunk(id) || isOwnPackageModule(id) ? null : (manual(id, { getModuleInfo: ctx.getModuleInfo } as never) ?? null),
          })
        } else {
          // 对象形式：bare 包按包目录整目录捕获（含 pnpm 嵌套布局），相对/绝对 specifier 按
          // 精确 id 匹配（rollup 对象形式的 specifier 走完整解析，此处为保守近似）
          for (const [name, specs] of Object.entries(manual as Record<string, string[]>)) {
            userGroups.push({
              name,
              test: (id: string) => !protectedChunk(id) && !isOwnPackageModule(id) && specs.some((spec) =>
                id.includes('/node_modules/' + spec + '/') || id === spec,
              ),
            })
          }
        }
      }
      const priority = Math.max(0, ...groups.map((g) => g.priority ?? 0)) + 1
      return {
        ...output,
        manualChunks: undefined,
        advancedChunks: undefined,
        strictExecutionOrder: true,
        codeSplitting: {
          ...splitting,
          groups: [{
            name: (id: string) => protectedChunk(id)!, test: (id: string) => protectedChunk(id) !== undefined,
            priority, minSize: 0, minShareCount: 1, maxSize: Infinity,
            includeDependenciesRecursively: false,
          }, ...userGroups],
        },
      } as typeof output
    },

    // V8-ASYNC-FIX：rolldown（vite 8）在「TLA 协商门面 × 用户代码循环依赖」形态下，
    // 会给循环另一侧的惰性初始化包装漏标 async（await 落在非异步函数 → esbuild 转译/
    // 浏览器解析直接失败，JeecgBoot 实测）。必须在 vite:esbuild-transpile（renderChunk
    // 同名钩子）之前抢修，故 order:'pre'。详见 async-mark-repair.ts。
    renderChunk: {
      order: 'pre',
      handler(code, chunk) {
        if (!state.rolldownBuild || state.command !== 'build') return null
        const result = repairRolldownAsyncMarks(code, chunk.fileName)
        if (!result) return null
        debugLog('v8-async-fix', { stage: 'renderChunk', file: chunk.fileName, repaired: result.repaired })
        return result.code
      },
    },

    generateBundle: {
      order: 'post',
      handler(_opts, bundle) {
        const n = state.normalized
        if (state.command !== 'build' || !n || n.exposes.length === 0 || !n.manifest) return

        // Vite 在 post 阶段补齐 importedCss；样式也可能归属静态依赖 chunk，而非 expose facade。
        const collectStaticCss = (entryFile: string): string[] => {
          const visited = new Set<string>()
          const cssFiles = new Set<string>()
          const visit = (fileName: string) => {
            if (visited.has(fileName)) return
            visited.add(fileName)
            const chunk = bundle[fileName]
            if (!chunk || chunk.type !== 'chunk') return
            const viteMeta = (chunk as unknown as { viteMetadata?: { importedCss?: Set<string> } }).viteMetadata
            for (const css of viteMeta?.importedCss ?? []) cssFiles.add(css)
            for (const importedFile of chunk.imports) visit(importedFile)
          }
          visit(entryFile)
          return [...cssFiles]
        }

        const facadeToChunk: Record<string, { file: string; css: string[] }> = {}
        for (const [fileName, chunk] of Object.entries(bundle)) {
          if (chunk.type !== 'chunk') continue
          const facade = chunk.facadeModuleId?.split('?')[0]
          if (facade) {
            facadeToChunk[facade] = {
              file: fileName,
              css: collectStaticCss(fileName),
            }
          }
        }
        // rolldown（vite 8）分块兜底：expose 模块被并入其他 chunk（无独立 facadeModuleId，
        // 如 expose 目标同时被应用自身静态引用）时，按 chunk.modules 索引反查所在 chunk。
        // rollup（vite 5-7）恒有 facadeModuleId，此索引零命中。
        const moduleToChunk = new Map<string, string>()
        for (const [fileName, chunk] of Object.entries(bundle)) {
          if (chunk.type !== 'chunk') continue
          for (const moduleId of Object.keys((chunk as { modules?: Record<string, unknown> }).modules ?? {})) {
            if (!moduleToChunk.has(moduleId)) moduleToChunk.set(moduleId, fileName)
          }
        }
        for (const e of n.exposes) {
          const abs = state.exposeAbsPaths[e.import]
          const hit = abs ? facadeToChunk[abs] : undefined
          if (hit) {
            state.exposeFiles[e.name] = hit
            continue
          }
          const merged = abs ? moduleToChunk.get(abs) : undefined
          if (merged) {
            state.exposeFiles[e.name] = { file: merged, css: collectStaticCss(merged) }
          }
        }
        const entryChunkName = Object.keys(bundle).find((k) => bundle[k].type === 'chunk' && k === n.filename)
        // 失败重试穿透（prod）：浏览器 module map 缓存 import 失败（同 URL 再 import 直接
        // 拒绝、零网络请求）。rollup 把 expose loader 重写为字面量 import('./assets/x.js')，
        // 此处在产物层把每个字面量 import 改写为 __fgR(url)——helper 自持 per-URL 状态机
        // 并返回模块 Promise：成功永远复用同一 URL（身份/单例保持），失败后的下一次调用
        // 才变更 URL（fulgurjs_retry=N）穿透失败缓存。注意 __fgR 返回的是模块 Promise 而
        // 非 URL 字符串——不能再包一层 import()（5.1.1 回归：import(Promise) →
        // "[object Promise]" 解析失败，全框架 prod 挂）。
        const entryChunk = entryChunkName ? bundle[entryChunkName] : undefined
        // rolldown（vite 8）以反引号渲染字面量 import，rollup 用单/双引号——三种引号都包装
        if (entryChunk && entryChunk.type === 'chunk' && /import\((['"`])[^'"`)]+\1\)/.test(entryChunk.code)) {
          const helper = genProdRetryHelper()
          entryChunk.code = entryChunk.code.replace(
            /import\((['"`])([^'"`)]+)\1\)/g,
            (_m, q: string, u: string) => `__fgR(${q}${u}${q})`,
          )
          // rolldown 专属：expose loader 的 __vite__mapDeps 依赖预载过滤为仅 CSS。
          // vite8 的 <link rel=modulepreload> 会把 JS 依赖写入模块图——网络失败被浏览器
          // 负缓存后，__fgR 只变换入口 URL 无法恢复依赖 URL（实测：解除阻断后 loader
          // retry=2 返回 200，而依赖 chunk 零请求、Promise 永不落定）。去掉 JS 预载后
          // 依赖改由模块图按需拉取（首载多一跳串行），CSS 预载保留（B-17 样式注入语义）。
          // rollup（vite 5–7）无此现象，保持原生预载不动。
          if (state.rolldownBuild) {
            const depsArrayMatch = /__vite__mapDeps=\(i,m=__vite__mapDeps,d=\(m\.f\|\|\(m\.f=(\[[^\]]*\])\)\)\)=>/.exec(entryChunk.code)
            if (depsArrayMatch) {
              try {
                const deps: string[] = JSON.parse(depsArrayMatch[1].replace(/`/g, '"').replace(/'/g, '"'))
                const cssOnly = new Set(deps.map((d, i) => (/\.(css|scss|less)$/.test(d) ? i : -1)).filter((i) => i >= 0))
                entryChunk.code = entryChunk.code.replace(/__vite__mapDeps\(\[([\d,\s]*)\]\)/g, (m, list: string) => {
                  const kept = list.split(',').map((x) => x.trim()).filter(Boolean).map(Number).filter((i) => cssOnly.has(i))
                  return `__vite__mapDeps([${kept.join(',')}])`
                })
                debugLog('manifest', { stage: 'generateBundle', mapDepsCssOnly: true, kept: cssOnly.size, total: deps.length })
              } catch {
                // deps 数组解析失败（产物形态变化）：保持原生预载，行为退回重试仅变换入口 URL
              }
            }
          }
          entryChunk.code = `${helper}\n${entryChunk.code}`
          debugLog('manifest', { stage: 'generateBundle', retryBust: 'remoteEntry loaders wrapped' })
        }
        const manifest = genProdManifest(n, state.exposeFiles, entryChunkName ?? n.filename)
        debugLog('manifest', {
          stage: 'generateBundle',
          exposes: Object.keys(state.exposeFiles).length,
          exposesWithCss: Object.values(state.exposeFiles).filter((e) => e.css.length > 0).length,
        })
        this.emitFile({
          type: 'asset',
          fileName: 'fulgurjs-manifest.json',
          source: JSON.stringify(manifest, null, 2),
        })
      },
    },

    configureServer(server: ViteDevServer): any {
      const n = state.normalized
      if (!n) return
      warmResolvedSharedPaths(server)

      // ---- D.5/W6 DEV-010：冷启动预构建窗口提示（一次性，防"开箱即坏"误判）----
      if (n.exposes.length > 0 || n.remotes.length > 0) {
        console.warn(
          formatFulgurjsDiagnostic({
            code: 'DEV-010',
            symptom: 'dev 冷启动预构建窗口：首次启动或清 node_modules/.vite 后首轮 30~60s 内，联邦模块请求可能出现瞬时 504 / "ce" / Outdated Optimize Dep',
            cause: 'vite 依赖预构建（含 fulgurjs 外部化桩）尚未就绪，属预构建暂态而非回归；首轮结束后自行恢复',
            fix: '先真实打开一次页面预热（等到网络空闲），再做验收断言或人工判断；重复出现才按 DEV-009 清缓存排查',
          }),
        )
      }

      // ---- remote 端中间件：容器入口 / manifest（跨 dev-server 协作的服务面）----
      if (n.exposes.length > 0) {
        const baseNorm = state.base
        server.middlewares.use((req, res, next) => {
          const raw = (req.url ?? '').split('?')[0]
          const stripped = raw.startsWith(baseNorm) ? `/${raw.slice(baseNorm.length)}` : raw
          if (stripped === '/@fulgurjs-entry.js' || stripped === '/@fulgurjs-manifest.json') {
            // WP5：端点 CORS 与 server.cors 同一来源策略（devCorsOrigins；缺省 '*' 保持现状）
            const origin = Array.isArray(req.headers.origin) ? req.headers.origin[0] : req.headers.origin
            for (const [k, v] of Object.entries(corsHeadersFor(origin, n.devCorsOrigins))) {
              res.setHeader(k, v)
            }
            res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS')
            res.setHeader('Access-Control-Allow-Headers', '*')
            if (req.method === 'OPTIONS') {
              res.statusCode = 204
              res.end()
              return
            }
            if (stripped === '/@fulgurjs-entry.js') {
              res.setHeader('Content-Type', 'application/javascript; charset=utf-8')
              res.setHeader('Cache-Control', 'no-cache')
              res.end(genDevRemoteEntry(n, baseNorm))
              return
            }
            res.setHeader('Content-Type', 'application/json; charset=utf-8')
            res.end(JSON.stringify(genDevManifest(n, baseNorm)))
            return
          }
          next()
        })
      }

      // ---- host 端：dev 类型直连 ----
      if (n.remotes.length > 0 && n.dts) {
        server.httpServer?.once('listening', () => {
          void generateDevTypes(n, server)
        })
      }

      // ---- D.5 DEV-001/002/005/006 启动探针（单次快连，WARN 不阻塞）+ schema 缓存 ----
      if (n.remotes.length > 0) {
        server.httpServer?.once('listening', () => {
          // 宽限 5s：宿主常先于 remote 启动，降低假阳性
          setTimeout(() => {
            remoteSchemaPromise ??= probeRemotesAndBuildSchema(n).then(
              genRemoteSchemaModule,
            )
          }, 5000)
        })
      }

      // ---- D.5 DEV-009：联邦虚拟模块 404 拦截（.vite 缓存漂移高频坑的显式指引）----
      // configureServer 返回函数 = 内部中间件之后执行（此时仍未处理的 fulgurjs 相关请求即 404）
      return () => {
        server.middlewares.use((req: any, res: any, next: () => void) => {
          const url = req.url ?? ''
          if (req.method === 'GET' && url.includes('fulgurjs')) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
            res.end(
              formatFulgurjsDiagnostic({
                code: 'DEV-009',
                symptom: `联邦模块请求 404：${url.slice(0, 120)}`,
                cause: 'node_modules/.vite 预构建缓存与当前插件产物不一致（immutable 缓存按 ?f= 签名长期持有，插件 dist 更新后旧签名必 404）',
                fix: 'rm -rf node_modules/.vite 后重启 dev server，并更换全新浏览器 profile（浏览器也持有旧缓存）',
              }),
            )
            return
          }
          next()
        })
      }
    },
  }

  // .vue 编译产物处理：vue 插件输出的 JS 仍带 bare import（build）或依赖 URL（dev）
  const post: Plugin = {
    name: 'fulgurjs:vue-post',
    enforce: 'post',
    async transform(code, id) {
      if (!state.normalized) return null
      const clean = id.split('?')[0]
      const isAppSource = clean.startsWith(state.normalized.root + path.sep) &&
        !clean.includes(`${path.sep}node_modules${path.sep}`) &&
        !clean.includes(`${path.sep}.vite${path.sep}`)
      const entryRewrite = state.command === 'serve' && isAppSource
        ? await rewriteRuntimeEntryImports(code, isExposeTargetFile(clean, state.normalized.root, state.normalized.exposes))
        : null
      if (entryRewrite !== null) code = entryRewrite
      // 原为 D.1 硬报错（DEV-008），0.4.1 起自动化：exposes 目标文件（远程页面）静态导入
      // 虚拟运行时会被远程 dev server 求值，模块求值期拉起第二份副本链、破坏渲染上下文——
      // 改写为惰性单例委托模块（求值期零副作用、调用期转发页面级单例），用户无需再感知
      // 「宿主/远程页面取运行时的不同姿势」。build 无需处理：prod 各副本经 globalThis
      // 单例天然收敛。
      if (
        state.command === 'serve' &&
        code.includes('virtual:fulgurjs-runtime') &&
        !code.includes('virtual:fulgurjs-runtime-proxy') &&
        isExposeTargetFile(clean, state.normalized.root, state.normalized.exposes)
      ) {
        return { code: code.split('virtual:fulgurjs-runtime').join('virtual:fulgurjs-runtime-proxy'), map: null }
      }
      // pre 阶段已改写过的模块（代理化远程页 / 构建入口 init 注入 / 已改写模块）不再处理，
      // 防双重生成。按插件生成物特征精确判定，不能按「含 virtual:fulgurjs-runtime 字样」
      // 一刀切——用户源码本可合法直接导入该虚拟模块（README §2 标准用法），同文件再写
      // 远程动态导入属正常混用，一刀切会让远程导入漏改写（vite:import-analysis 500）。
      // D6（2026-09-23）：build 下此守卫撤到 D6 兜底之后仅对 serve 生效——auto-import 类
      // 后置插件会在 pre 之后向「pre 已处理过」的文件（尤其 .vue script 子请求）注入
      // shared 导入，全量跳过会让这些注入绕过门面化（双响应性系统，lowcode 实测：
      // 产物 201 个 chunk 直接引用本地 vue 碎片）。transformModule 幂等（已门面化的导入
      // 不再匹配、helper 不重复 prepend），build 下重复跑安全；serve 语义不同保持原守卫。
      if (state.command === 'serve' && isPluginProcessedModule(code)) return entryRewrite === null ? null : { code, map: null }
      // dev：所有 JS/TS/Vue 模块统一在此改写；build：.vue 主请求 + D6 兜底（见下）
      if (/type=(style|template)/.test(id)) return entryRewrite === null ? null : { code, map: null } // 样式与模板子请求不走这里
      const isJsLike = /\.(m|c)?[jt]sx?$/.test(clean) || clean.endsWith('.vue')
      if (!isJsLike) return entryRewrite === null ? null : { code, map: null }
      // dev 宿主（无 exposes 或 host+remote 双角色）：自身源码不做 shared 改写（自身 import 即
      // 自身 provide，被消费方协商到的就是这份实例；避免 TLA 改变大型工程循环依赖求值顺序）；
      // 纯 remote（有 exposes、无 remotes）全量改写，含 node_modules——依赖包对 shared 的导入
      // 必须走门面防双运行时；dev 下需配合 optimizeDeps.exclude（预构建产物内联代码无法改写）。
      const devRewriteAll = state.command === 'serve' && state.normalized.devSharedSelf
      const isPureRemoteBuild =
        state.normalized.exposes.length > 0 && state.normalized.remotes.length === 0
      if (state.command === 'serve' && clean.includes('node_modules') && !id.includes('.vite/deps') && !devRewriteAll) {
        return entryRewrite === null ? null : { code, map: null }
      }
      // D6（2026-09-23）：build 下的 post 兜底见 buildFallbackTransform（与 fulgurjs:post-last
      // 共用的共享函数）——auto-import 类后置插件在 pre 之后注入的 shared 导入在此兜底门面化。
      if (state.command === 'build') {
        return buildFallbackTransform(code, id)
      }

      // dev 改写范围 = devSharedSelf（默认：纯 remote 为 true，有 remotes 的宿主为 false，
      // 双向联邦的宿主可显式开启）。宿主自身 import 即自身 provide，其全局状态
      // （pinia/router）已初始化在本地副本上——被消费方协商到的实例本来就是这份；
      // 且不改写可避免巨型工程引入 TLA 与循环依赖求值顺序风险。
      const rewriteShared = state.normalized.devSharedSelf
      const remapSpecifier = (spec: string): string | null => {
        // dev：依赖预构建 URL 映射回包名
        const depMatch = spec.match(/\/node_modules\/\.vite\/deps\/([^/?]+)\.js/)
        if (depMatch) {
          const depName = depMatch[1]
          return state.normalized!.shared.some((s) => s.aliases.includes(depName)) ? depName : null
        }
        // dev：非预构建依赖的真实路径映射（/@fs/ 前缀去掉）
        const cleanSpec = spec.startsWith('/@fs/') ? spec.slice(5) : spec
        const cleanPath = cleanSpec.split('?')[0]
        if (!cleanPath.startsWith('/')) return null
        return state.resolvedSharedPaths.get(cleanPath) ?? null
      }
      const transformed = await transformModule(code, id, {
        onRewrite: () => recordRewritten(id),
        options: state.normalized!,
        remapSpecifier,
        rewriteShared,
        sharedClosureRoots: state.sharedClosureRoots,
      })
      return transformed ?? (entryRewrite === null ? null : { code, map: null })
    },
  }

  // 惰性解析 shared 包真实路径（dev 非预构建依赖的 .vue 映射）
  function warmResolvedSharedPaths(server: ViteDevServer) {
    const n = state.normalized
    if (!n) return
    for (const s of n.shared) {
      if (s.import === false) continue
      void server.pluginContainer
        .resolveId(s.import, path.join(n.root, 'index.html'))
        .then((r) => {
          if (r?.id) state.resolvedSharedPaths.set(r.id.split('?')[0], s.configKey)
        })
        .catch(() => {})
    }
  }

  /**
   * build 下的 post 兜底改写（D6-4 / WP1）：unplugin-auto-import 等后置插件在 pre.transform
   * 之后注入的 `import { ref } from 'vue'` 必须在此补跑门面化，否则静态绑定本地副本、
   * 与协商实例形成双响应性系统（实测：ref 赋值不触发渲染）。
   * 调用方：fulgurjs:vue-post（用户插件数组内）与 fulgurjs:post-last（config() 追加、
   * 必然位于全部用户 post 插件之后——auto-import 的 vite 适配器硬编码 enforce:'post'，
   * 用户把它注册在 federation() 之后时只有 post-last 能捕获）。transformModule 幂等。
   * allowNodeModules 与 pre.transform 同判定（devSharedSelf || 纯 remote）。
   */
  async function buildFallbackTransform(
    code: string,
    id: string,
  ): Promise<{ code: string; map: null } | null> {
    if (/type=(style|template)/.test(id)) return null
    const clean = id.split('?')[0]
    const isJsLike = /\.(m|c)?[jt]sx?$/.test(clean) || clean.endsWith('.vue')
    if (!isJsLike) return null
    const quickCheck = /require\s*\(\s*["']|(?:from|import)\s*["']/.test(code)
    if (!quickCheck) return null
    const n = state.normalized!
    const isPureRemoteBuild = n.exposes.length > 0 && n.remotes.length === 0
    return transformModule(code, id, {
      onRewrite: () => {
        debugLog('transform', { stage: 'post-fallback', mode: 'build', module: redactModulePath(id, n.root) })
        recordRewritten(id)
      },
      options: n,
      rewriteShared: true,
      allowNodeModules: isPureRemoteBuild || n.devSharedSelf,
      sharedClosureRoots: state.sharedClosureRoots,
    })
  }

  // W5/BLD-003 说明：expose 目标必填 props 的启发式扫描（scanExposeRequiredProps，见
  // diagnostics.ts 与单测）在 testbed 实测出现误报——bpm 流程详情页声明必填 id，但宿主
  // 路由以 props 回调（params+query 全量透传）供给，页面完全正常。插件无法感知宿主是否
  // 透传 props，按预授权（排期文档 §4.5 #6）降级为手册 §8 文档化检查项，不自动发射。

  // D3：页面级 react-refresh 单例发布（跨源 Fast Refresh 的宿主侧）。post 阶段执行：
  // @vitejs/plugin-react 的 preamble 注入在 normal 阶段（晚于本插件 pre 钩子），只有
  // post 能看到最终的 preamble 内联脚本。脚本插在 preamble 之后、应用模块之前执行。
  const reactRefreshPublisher: Plugin = {
    name: 'fulgurjs:react-refresh-publisher',
    enforce: 'post',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        if (state.command !== 'serve' || !state.normalized) return html
        if (!html.includes('/@react-refresh')) {
          // 5.3.0 桥接：宿主未装 @vitejs/plugin-react（如 Vue 宿主消费 React 桥接远程）时，
          // 远程 React 模块的 HMR 尾部硬检查 window.$RefreshReg$，未注入 preamble 直接拒绝
          // 求值（"can't detect preamble"）。此处从第一个 http(s) dev 远程的 origin 引入
          // react-refresh：注入 preamble（$RefreshReg$/$RefreshSig$）+ 发布页面级单例
          // （__FULGURJS_REACT_REFRESH__）——Vue 宿主页无本地 renderer，该副本即唯一实例；
          // React 宿主走上方常规分支，不受影响。纯 Vue 场景无 http(s) dev 远程，零注入。
          // 5.3.1 补条件：宿主 shared 含 react/react-dom（即确有消费 React 模块的意图）才注入
          // ——纯 Vue 宿主（remotes 全是 Vue 远程）注入只会让远程 origin 返回 404
          // （Vue 远程无 plugin-react 中间件，每页一条 console error；host-vue fixtures 实测）。
          const hostConsumesReact = state.normalized.shared.some(
            (s) => s.shareKey === 'react' || s.shareKey === 'react-dom',
          )
          if (!hostConsumesReact) return html
          const httpOrigins = state.normalized.remotes
            .map((r) => { try { return new URL(r.devEntry).origin } catch { return null } })
            .filter((o): o is string => o !== null && /^https?:/.test(o ?? ''))
          if (httpOrigins.length === 0) return html
          // 5.4.2 修复（多远程宿主）：首个 http 远程未必是 React 远程（如 Vue 宿主同时挂
          // Vue 子应用与 React 子应用），静态 import 错源会以 MIME 错误告吹、标志也无法设置，
          // 真正消费 React 的远程因此拒绝求值（"can't detect preamble"）。改为：标志与注册器
          // 先同步设置（preamble 语义只要求这两个钩子存在），再用动态 import 容错取真身——
          // 错源远程静默跳过（零 console 噪声），正确实例由远程模块的 shim 自举兜底
          // （genReactRefreshShim）或本脚本命中 React 远程 origin 时直接发布。
          // 5.5.2：多个 http 远程时「选哪个 origin」无法在本机判定（Vue/React 远程外观相同），
          // 猜错虽被 catch 但浏览器仍会记录一条 404 网络噪声——此时直接跳过跨源导入：
          // 同步标志已保证 preamble 硬检查通过，真实 react-refresh 实例由各 React 远程
          // 自带 origin 的 shim 自举并发布页面级单例（JeecgBoot-A 实测：B(5372,Vue)+C(5373,React)
          // 双远程下 A 页 404 噪声归零，React-C 挂载与 HMR 不受影响）。
          const remoteOrigin = httpOrigins.length === 1 ? httpOrigins[0] : null
          if (!remoteOrigin) {
            return (
              `<script type="module">` +
              'window.$RefreshReg$ = () => {};window.$RefreshSig$ = () => (type) => type;window.__vite_plugin_react_preamble_installed__ = true;' +
              `</script>` + html
            )
          }
          return (
            `<script type="module">` +
            'window.$RefreshReg$ = () => {};window.$RefreshSig$ = () => (type) => type;window.__vite_plugin_react_preamble_installed__ = true;' +
            `(async () => { try { const __fulgurjs_rr = await import(${JSON.stringify(`${remoteOrigin}/@react-refresh`)});` +
            `try { __fulgurjs_rr.default?.injectIntoGlobalHook?.(window); } catch {}` +
            `(globalThis).${REACT_REFRESH_GLOBAL_KEY} ??= __fulgurjs_rr; } catch {} })();` +
            `</script>` + html
          )
        }
        const lastRef = html.lastIndexOf('/@react-refresh')
        const scriptEnd = html.indexOf('</script>', lastRef)
        if (scriptEnd === -1) return html
        const out = html.slice(0, scriptEnd + '</script>'.length) + genReactRefreshPublisherScript() + html.slice(scriptEnd + '</script>'.length)
        return out
      },
    },
  }

  // D3 + D4：dev client 双实例兼容（post 阶段，转换一次对所有消费方生效）。
  // 1) react-refresh 导入改写到单例 shim：@vitejs/plugin-react 可能在本插件之前或之后
  //    注入导入，post 阶段保证两种顺序都覆盖；纯字符串替换幂等。
  // 2) vite-error-overlay 构造注册表化（Vite 5.x 双 client 缺陷修复）：Vite 5 客户端
  //    define 有注册守卫，双 client 场景第二份客户端的本地 ErrorOverlay 类未注册，
  //    而未注册的 HTMLElement 子类 new 时按 HTML 规范抛 IllegalConstructor → 远程编译
  //    错误覆盖层无法显示。Vite ≥6 已改为 customElements.get(overlayId) 构造（client
  //    createErrorOverlay 同款修法）；此处把该修法前移到 Vite 5 客户端代码上——第一份
  //    客户端经注册表取到自身注册类（行为不变），第二份取到第一份的注册类（覆盖层可
  //    构造、可见、可关闭）。不改已安装 Vite 源码；不匹配的客户端版本零改动。
  const devClientCompat: Plugin = {
    name: 'fulgurjs:dev-client-compat',
    enforce: 'post',
    transform(code, id) {
      if (state.command !== 'serve' || !state.normalized) return null
      const clean = id.split('?')[0]
      let rewritten = code
      // shim 自身不得参与改写：shim 的 fallback import("/@react-refresh") 若被改成
      // import(shim) 即自引用 + 顶层 await 死锁（5.3.0 桥接轮实测：无 plugin-react 的
      // Vue 宿主消费 React 远程时页面永久挂起）。未改写的 shim 回退远程 origin 的
      // /@react-refresh 真身——Vue 宿主页无本地 renderer，远程副本即唯一实例，语义正确；
      // React 宿主页仍由 publisher 先发布宿主副本，shim 优先读全局单例（D3 行为不变）。
      if (clean !== '\0virtual:fulgurjs-react-refresh-shim' && code.includes('"/@react-refresh"')) {
        rewritten = rewritten
          .split('from "/@react-refresh"')
          .join(`from "${REACT_REFRESH_SHIM_URL}"`)
          .split('import("/@react-refresh")')
          .join(`import("${REACT_REFRESH_SHIM_URL}")`)
      }
      if (clean.includes('vite/dist/client/client') && rewritten.includes('new ErrorOverlay(')) {
        rewritten = rewritten
          .split('new ErrorOverlay(')
          .join('new (customElements.get(overlayId) ?? ErrorOverlay)(')
      }
      if (rewritten === code) return null
      return { code: rewritten, map: null }
    },
  }

  return [pre, post, devClientCompat, reactRefreshPublisher]
}

export default federation
export type { FederationOptions } from './options'
