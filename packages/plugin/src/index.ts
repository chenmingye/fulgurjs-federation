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
  type FederationOptions,
} from './options'
import {
  getFacadeEntry,
  isTransformableId,
  isPluginProcessedModule,
  transformModule,
  serializeShareCallForFacade,
  isExposeTargetFile,
} from './transform'
import {
  genBindingFacade,
  genRuntimeProxyModule,
  genBuildRemoteEntry,
  genDevManifest,
  genDevProvides,
  genDevRemoteEntry,
  genInitModule,
  genProdManifest,
  genRemoteBindingFacade,
  genSharedFacade,
  genSharedNsFacade,
  type ManifestExposeEntry,
} from './virtual'
import { generateDevTypes } from './dts'
import { probeRemotesAndBuildSchema, genEmptyRemoteSchemaModule, type RemoteSchema } from './remote-schema'
import { formatFulgurjsDiagnostic } from './diagnostics'
import { syncViteCacheMarker } from './vite-cache'

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
      `[fulgurjs] cannot enumerate CJS exports of shared package "${packageName}" for the optimize-deps facade; ` +
        `the facade will export default only. If consumers destructure named exports from it, add this package ` +
        `to optimizeDeps.exclude to serve it through the transform pipeline instead.`,
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
function facadeChunkOf(id: string): string | null {
  const bare = id.split('?')[0]
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
    const shareKey = body.split('?')[0]
    return 'fulgurjs-shared-' + (shareKey.replace(/[^A-Za-z0-9_-]/g, '_') || 'unknown')
  }
  if (bare.startsWith('virtual:fulgurjs-shared-ns:') || bare.startsWith('virtual:fulgurjs-cjs-ns:')) {
    const prefix = bare.startsWith('virtual:fulgurjs-shared-ns:')
      ? 'virtual:fulgurjs-shared-ns:'
      : 'virtual:fulgurjs-cjs-ns:'
    const shareKey = bare.slice(prefix.length)
    return 'fulgurjs-shared-' + (shareKey.replace(/[^A-Za-z0-9_-]/g, '_') || 'unknown')
  }
  return null
}

export function federation(options: FederationOptions): Plugin[] {
  const warnedUnknownPrefixes = new Set<string>()
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
  } = {
    command: 'serve',
    base: '/',
    exposeAbsPaths: {},
    exposeFiles: {},
    resolvedSharedPaths: new Map(),
    entryAbsPaths: new Set(),
    entryInitInjected: new Set(),
    manualChunkGroups: new Map(),
    sharedClosureRoots: [],
    facadeDynamic: false,
  }

  const pre: Plugin = {
    name: 'fulgurjs:core',
    enforce: 'pre',
    async config(userConfig, env) {
      state.command = env.command
      const root = path.resolve(userConfig.root ?? process.cwd())
      const normalized = normalizeOptions(options, root, env.command)
      state.normalized = normalized

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
          const sharedExternal: { name: string; setup: (build: unknown) => void } = {
            name: 'fulgurjs:optimize-shared-external',
            setup(build) {
              const facadeUrlFor = (shareKey: string) =>
                `${devBase}@id/__x00__virtual:fulgurjs-shared-ns:${shareKey}?import`
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
          // mergeConfig 会把插件数组拼接在用户已有 esbuildOptions.plugins 之后，无需手动合并
          ;(extra as Record<string, unknown>).optimizeDeps = {
            esbuildOptions: { plugins: [sharedExternal] },
          }
        }
      }

      if (env.command === 'serve') {
        // DEV-009 自动化：插件版本变化时自清本应用 .vite 预构建缓存（用户无需手工 rm）
        syncViteCacheMarker(root, normalized.pluginVersion, (msg) => console.warn(msg))
        // 跨 dev-server 模块加载需要 CORS（对齐双 dev-server 协作引擎）
        extra.server = {
          ...(userConfig.server ?? {}),
          cors: userConfig.server?.cors ?? true,
        }
      } else {
        // build：TLA（自动异步边界）需要 es2022+；用户未配置时自动提升
        const userTarget = userConfig.build?.target
        if (userTarget) {
          if (/es20(0\d|1\d|20|21)/.test(String(userTarget))) {
            normalized.warnings.push(
              `build.target="${String(userTarget)}" does not support top-level await; fulgurjs requires es2022 or higher.`,
            )
          }
        } else {
          ;(extra as any).build = { target: 'es2022' }
        }

        // D6：双向宿主（devSharedSelf）build 下的门面动态化 + manualChunks 包装注入——
        // 门面/运行时虚拟模块隔离进插件专属 chunk，防用户强制分组与门面静态边互锁成环
        // （见 facadeChunkOf 注）。纯 remote（remotes 为空）不启用，产物行为保持 2.0.0（硬约束）。
        if (normalized.remotes.length > 0 && normalized.devSharedSelf) {
          state.facadeDynamic = true
          const userOutput = userConfig.build?.rollupOptions?.output
          if (Array.isArray(userOutput)) {
            console.warn(
              formatFulgurjsDiagnostic({
                code: 'BLD-006',
                symptom: 'build.rollupOptions.output is an array; fulgurjs cannot inject the shared-facade chunk guard automatically',
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

      for (const w of normalized.warnings) console.warn(`[fulgurjs] ${w}`)
      return extra
    },

    configResolved(resolved) {
      state.base = normalizeBase(resolved.base)
      if ((resolved as unknown as { build?: { ssr?: boolean } }).build?.ssr) {
        console.warn('[fulgurjs] SSR builds are not supported in this version; plugin hooks disabled.')
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

    resolveId(source) {
      // 兼容三种形态：裸 specifier / __x00__ URL 编码（dev 生成代码被 importAnalysis 再解析）/ \0 历史形态；query 原样保留
      let s = source
      if (s.startsWith('/@id/')) s = s.slice(5)
      if (s.startsWith('__x00__')) s = '\0' + s.slice(7)
      const q = s.indexOf('?')
      const bare = q === -1 ? s : s.slice(0, q)
      const query = q === -1 ? '' : s.slice(q)
      const bareClean = bare.startsWith('\0') ? bare.slice(1) : bare

      // 高频坑提示：import 'xxx/yyy' 但 xxx 不是已配置的 remote/shared——十有八九是 remotes
      // 键名拼错或漏配。只警告一次/前缀，不打断构建（也可能只是普通 npm 包）。
      const n = state.normalized
      if (n && !bareClean.startsWith('\0') && !bareClean.startsWith('.') && !bareClean.startsWith('/') && !bareClean.startsWith('virtual:')) {
        const slash = bareClean.indexOf('/')
        if (slash > 0) {
          const prefix = bareClean.slice(0, slash)
          const known =
            n.remotes.some((r) => r.key === prefix) ||
            n.shared.some((sh) => sh.aliases.includes(prefix) || sh.aliases.some((a) => a.endsWith('/') && prefix.startsWith(a)))
          if (!known && !warnedUnknownPrefixes.has(prefix)) {
            warnedUnknownPrefixes.add(prefix)
            console.warn(
              `[fulgurjs] "${source}" uses prefix "${prefix}/", which is not in federation({ remotes }) or shared. ` +
                `If "${prefix}" is a federated remote, add it: remotes: { '${prefix}': '<url>' }. ` +
                `(Ignore this if it is a plain npm package.)`,
            )
          }
        }
      }

      if (bareClean === RUNTIME_VIRTUAL_ID) return RESOLVED.runtime
      if (bareClean === RUNTIME_PROXY_VIRTUAL_ID) return RESOLVED.runtimeProxy
      if (bareClean === INIT_VIRTUAL_ID) return RESOLVED.init
      if (bareClean === 'virtual:fulgurjs-remote-schema') return bareClean
      if (bareClean === 'virtual:fulgurjs-provides') return RESOLVED.provides
      if (bareClean === 'virtual:fulgurjs-remote-entry') return RESOLVED.remoteEntry
      if (bareClean.startsWith(SHARED_NS_FACADE_PREFIX)) {
        return RESOLVED.sharedNsFacade(bareClean.slice(SHARED_NS_FACADE_PREFIX.length)) + query
      }
      if (bareClean.startsWith('virtual:fulgurjs-cjs-ns:')) {
        return RESOLVED.sharedNsFacade(bareClean.slice('virtual:fulgurjs-cjs-ns:'.length)) + query
      }
      if (bareClean.startsWith('virtual:fulgurjs-shared:')) {
        // 绑定门面（?f= 绑定签名）与命名空间门面共用前缀；query 透传
        const body = bareClean.slice('virtual:fulgurjs-shared:'.length)
        return RESOLVED.sharedFacade(body) + query
      }
      return null
    },

    load(id) {
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
      if (clean === 'virtual:fulgurjs-remote-schema' && state.normalized) {
        // D.2 Tier2：remote exposes 清单（dev 实测探针产出；build 诚实降级为空）
        if (state.command === 'build') return genEmptyRemoteSchemaModule()
        remoteSchemaPromise ??= probeRemotesAndBuildSchema(state.normalized).then(
          (schema: RemoteSchema) => `export default ${JSON.stringify(schema)}`,
        )
        return remoteSchemaPromise
      }
      if (clean === 'virtual:fulgurjs-remote-entry' && state.normalized) {
        return genBuildRemoteEntry(state.normalized, state.exposeAbsPaths)
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
            return genSharedFacade(item.import, names, state.facadeDynamic)
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
        const opts = [
          'shareScope: ' + JSON.stringify(item.shareScope),
          'shareKey: ' + JSON.stringify(item.shareKey),
          ...(item.requiredVersion !== false ? ['requiredVersion: ' + JSON.stringify(item.requiredVersion)] : []),
          ...(item.singleton ? ['singleton: true'] : []),
          ...(item.strictVersion ? ['strictVersion: true'] : []),
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
      // 不能用独立虚拟模块：rollup 会摇树剥离其顶层调用；入口自身的顶层调用永不被剥离
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
      const allowNodeModules = state.normalized.devSharedSelf || isPureRemoteBuild

      if (/\.vue(\?|$)/.test(id)) {
        // prod 构建时 vue 插件将 script 拆为 ?vue&type=script 子请求（源码 import 仍是 bare）：
        // 在 pre 阶段先行改写；其余 .vue 主请求与 template/style 子请求交给 post 阶段。
        // dev 不走这里：dev 的 .vue 全部交给 post 阶段按 dev 角色判定处理（见 post.transform）。
        if (state.command === 'build' && /type=script/.test(id)) {
          return transformModule(code, id, {
            options: state.normalized,
            rewriteShared: true,
            allowNodeModules,
            cjsRequireRewrite: true,
            sharedClosureRoots: state.sharedClosureRoots,
          })
        }
        return null
      }
      if (!isTransformableId(id, allowNodeModules)) return null
      return transformModule(code, id, {
        options: state.normalized,
        // build：全量改写；dev：默认仅纯 remote 改写 shared（被宿主消费的组件需协商到宿主实例），
        // 双角色宿主可显式 devSharedSelf: true 参与协商
        rewriteShared: state.command === 'build' || state.normalized.devSharedSelf,
        allowNodeModules,
        cjsRequireRewrite: state.command === 'build',
        sharedClosureRoots: state.sharedClosureRoots,
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
        return html
      },
    },

    async buildStart() {
      if (state.command !== 'build' || !state.normalized) return
      const n = state.normalized
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
                `[fulgurjs] manualChunks: could not resolve "${specifier}" for group "${group}"; ` +
                  `those modules will fall back to automatic chunking. (Their shared-negotiation facades are still guarded.)`,
              )
            }
          } catch {
            console.warn(
              `[fulgurjs] manualChunks: resolving "${specifier}" (group "${group}") failed; ` +
                `those modules will fall back to automatic chunking.`,
            )
          }
        }
        state.manualChunkSpecsPending = undefined
      }
      // D6：解析 shared 键本体闭包目录（仅 devSharedSelf 宿主）。闭包内模块对 shared 键的
      // 导入跳过门面化（transform.ts inSharedClosure），斩断 fallback → 本体 chunk 的
      // TLA 混合环（详见 transform.ts TransformContext.sharedClosureRoots 注释）。
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

    async generateBundle(_opts, bundle) {
      const n = state.normalized
      if (state.command !== 'build' || !n || n.exposes.length === 0 || !n.manifest) return

      // 建立 expose 源文件 → 产物 chunk 的映射（facadeModuleId 匹配）
      const facadeToChunk: Record<string, { file: string; css: string[] }> = {}
      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (chunk.type !== 'chunk') continue
        const facade = chunk.facadeModuleId?.split('?')[0]
        if (facade) {
          const viteMeta = (chunk as unknown as { viteMetadata?: { importedCss?: Set<string> } }).viteMetadata
          facadeToChunk[facade] = {
            file: fileName,
            css: viteMeta ? [...(viteMeta.importedCss ?? [])] : [],
          }
        }
      }
      for (const e of n.exposes) {
        const abs = state.exposeAbsPaths[e.import]
        const hit = abs ? facadeToChunk[abs] : undefined
        if (hit) state.exposeFiles[e.name] = hit
      }
      const entryChunkName = Object.keys(bundle).find((k) => bundle[k].type === 'chunk' && k === n.filename)
      const manifest = genProdManifest(n, state.exposeFiles, entryChunkName ?? n.filename)
      this.emitFile({
        type: 'asset',
        fileName: 'fulgurjs-manifest.json',
        source: JSON.stringify(manifest, null, 2),
      })
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
            res.setHeader('Access-Control-Allow-Origin', '*')
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
              (schema: RemoteSchema) => `export default ${JSON.stringify(schema)}`,
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
      if (isPluginProcessedModule(code)) return null
      // dev：所有 JS/TS/Vue 模块统一在此改写；build：.vue 主请求 + D6 兜底（见下）
      if (/type=(style|template)/.test(id)) return null // 样式与模板子请求不走这里
      const isJsLike = /\.(m|c)?[jt]sx?$/.test(clean) || clean.endsWith('.vue')
      if (!isJsLike) return null
      // dev 宿主（无 exposes 或 host+remote 双角色）：自身源码不做 shared 改写（自身 import 即
      // 自身 provide，被消费方协商到的就是这份实例；避免 TLA 改变大型工程循环依赖求值顺序）；
      // 纯 remote（有 exposes、无 remotes）全量改写，含 node_modules——依赖包对 shared 的导入
      // 必须走门面防双运行时；dev 下需配合 optimizeDeps.exclude（预构建产物内联代码无法改写）。
      const devRewriteAll = state.command === 'serve' && state.normalized.devSharedSelf
      const isPureRemoteBuild =
        state.normalized.exposes.length > 0 && state.normalized.remotes.length === 0
      if (state.command === 'serve' && clean.includes('node_modules') && !id.includes('.vite/deps') && !devRewriteAll) {
        return null
      }
      // D6（2026-09-23）：build 下的 post 兜底。unplugin-auto-import 等后置插件向源码注入的
      // `import { ref } from 'vue'` 发生在本插件 pre.transform 之后——pre 看到的文件还没有这行
      // 导入，注入的 shared 导入因此绕过门面化、静态绑定本地副本，形成「协商系统 vs 本地系统」
      // 双响应性并存（实测：同一 hook 的 ref 赋值不触发渲染，另一 hook 的赋值却触发）。
      // post 在所有插件之后跑，此处兜底改写；pre 已改写过的文件由 isPluginProcessedModule 拦下。
      if (state.command === 'build' && !/\.vue(\?|$)/.test(id)) {
        const quickCheck = /require\s*\(\s*["']|(?:from|import)\s*["']/.test(code)
        if (!quickCheck) return null
        const allowNodeModules = isPureRemoteBuild
        return transformModule(code, id, {
          options: state.normalized,
          rewriteShared: true,
          allowNodeModules,
          sharedClosureRoots: state.sharedClosureRoots,
        })
      }

      // dev 改写范围 = devSharedSelf（默认：纯 remote 为 true，有 remotes 的宿主为 false，
      // 双向联邦的宿主可显式开启）。宿主自身 import 即自身 provide，其全局状态
      // （pinia/router）已初始化在本地副本上——被消费方协商到的实例本来就是这份；
      // 且不改写可避免巨型工程引入 TLA 与循环依赖求值顺序风险。
      const rewriteShared = state.command === 'build' || state.normalized.devSharedSelf
      const remapSpecifier = (spec: string): string | null => {
        // build：bare specifier 直接参与匹配
        if (state.normalized!.shared.some((s) => s.aliases.includes(spec))) return spec
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
      return transformModule(code, id, {
        options: state.normalized!,
        remapSpecifier,
        rewriteShared,
        allowNodeModules: state.command === 'build' ? isPureRemoteBuild || state.normalized!.devSharedSelf : undefined,
        sharedClosureRoots: state.sharedClosureRoots,
      })
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

  // W5/BLD-003 说明：expose 目标必填 props 的启发式扫描（scanExposeRequiredProps，见
  // diagnostics.ts 与单测）在 testbed 实测出现误报——bpm 流程详情页声明必填 id，但宿主
  // 路由以 props 回调（params+query 全量透传）供给，页面完全正常。插件无法感知宿主是否
  // 透传 props，按预授权（排期文档 §4.5 #6）降级为手册 §8 文档化检查项，不自动发射。

  return [pre, post]
}

export default federation
export type { FederationOptions } from './options'
