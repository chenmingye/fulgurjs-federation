/**
 * fulgur-federation 主入口。
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
  RUNTIME_VIRTUAL_ID,
  SHARED_FACADE_PREFIX,
  SHARED_NS_FACADE_PREFIX,
  type NormalizedOptions,
  type FulgurOptions,
} from './options'
import { getFacadeEntry, isTransformableId, transformModule, serializeShareCallForFacade } from './transform'
import {
  genBindingFacade,
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

// 运行时代码由构建脚本生成（src/runtime-code.gen.ts），内联进插件产物，无文件定位问题
import runtimeCode from './runtime-code.gen'
function readRuntimeCode(): string {
  return runtimeCode
}

function normalizeBase(base: string): string {
  if (!base || base === '/') return '/'
  return base.endsWith('/') ? base : `${base}/`
}

/** 预构建外部化桩模块的 esbuild namespace（配合 fulgur-stub: 路径前缀使用） */
const FULGUR_STUB_NAMESPACE = 'fulgur-opt-stub'

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
      `[fulgur] cannot enumerate CJS exports of shared package "${packageName}" for the optimize-deps facade; ` +
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

export function federation(options: FulgurOptions): Plugin[] {
  const warnedUnknownPrefixes = new Set<string>()
  const state: {
    normalized?: NormalizedOptions
    command: 'serve' | 'build'
    base: string
    exposeAbsPaths: Record<string, string>
    exposeFiles: Record<string, ManifestExposeEntry>
    resolvedSharedPaths: Map<string, string | null>
    entryAbsPaths: Set<string>
    entryInitInjected: Set<string>
  } = {
    command: 'serve',
    base: '/',
    exposeAbsPaths: {},
    exposeFiles: {},
    resolvedSharedPaths: new Map(),
    entryAbsPaths: new Set(),
    entryInitInjected: new Set(),
  }

  const pre: Plugin = {
    name: 'fulgur:core',
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
      // avue、dayjs 等）得以正常预构建（esbuild 的 CJS interop 正确保留 default 静态方法），
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
            name: 'fulgur:optimize-shared-external',
            setup(build) {
              const facadeUrlFor = (shareKey: string) =>
                `${devBase}@id/__x00__virtual:fulgur-shared-ns:${shareKey}?import`
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
              b.onResolve({ filter: /fulgur-shared-ns:/ }, (args) => ({ path: args.path, external: true }))
              b.onResolve({ filter }, (args) => {
                // shared 键本身常是预构建入口（include/扫描发现）：入口解析放行走本地预构建，
                // 只有依赖包内部的 import/require 才改道协商门面（esbuild 禁止 entry point external）
                if (args.kind === 'entry-point' || args.kind === 'entry-point-render') return null
                const s = aliasToShare.get(args.path)
                if (!s) return null
                return { path: `fulgur-stub:${s.shareKey}`, namespace: FULGUR_STUB_NAMESPACE }
              })
              // re-export 桩：不能直接 external——esbuild 对 CJS 依赖内部的 require(external)
              // 会生成运行时抛错的动态 require 垫片（"Dynamic require of ... is not supported"）。
              // 改道到 bundled 桩模块后，esbuild 把门面 URL 提升为 chunk 顶部的静态 import，
              // 门面（TLA 协商）先于 chunk 求值完成，CJS require 拿到的命名空间同步可用。
              b.onLoad({ filter: /^fulgur-stub:/, namespace: FULGUR_STUB_NAMESPACE }, (args) => {
                const shareKey = args.path.slice('fulgur-stub:'.length)
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
              `build.target="${String(userTarget)}" does not support top-level await; fulgur requires es2022 or higher.`,
            )
          }
        } else {
          ;(extra as any).build = { target: 'es2022' }
        }
      }

      for (const w of normalized.warnings) console.warn(`[fulgur] ${w}`)
      return extra
    },

    configResolved(resolved) {
      state.base = normalizeBase(resolved.base)
      if ((resolved as unknown as { build?: { ssr?: boolean } }).build?.ssr) {
        console.warn('[fulgur] SSR builds are not supported in this version; plugin hooks disabled.')
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
              `[fulgur] "${source}" uses prefix "${prefix}/", which is not in federation({ remotes }) or shared. ` +
                `If "${prefix}" is a federated remote, add it: remotes: { '${prefix}': '<url>' }. ` +
                `(Ignore this if it is a plain npm package.)`,
            )
          }
        }
      }

      if (bareClean === RUNTIME_VIRTUAL_ID) return RESOLVED.runtime
      if (bareClean === INIT_VIRTUAL_ID) return RESOLVED.init
      if (bareClean === 'virtual:fulgur-provides') return RESOLVED.provides
      if (bareClean === 'virtual:fulgur-remote-entry') return RESOLVED.remoteEntry
      if (bareClean.startsWith(SHARED_NS_FACADE_PREFIX)) {
        return RESOLVED.sharedNsFacade(bareClean.slice(SHARED_NS_FACADE_PREFIX.length)) + query
      }
      if (bareClean.startsWith('virtual:fulgur-cjs-ns:')) {
        return RESOLVED.sharedNsFacade(bareClean.slice('virtual:fulgur-cjs-ns:'.length)) + query
      }
      if (bareClean.startsWith('virtual:fulgur-shared:')) {
        // 绑定门面（?f= 绑定签名）与命名空间门面共用前缀；query 透传
        const body = bareClean.slice('virtual:fulgur-shared:'.length)
        return RESOLVED.sharedFacade(body) + query
      }
      return null
    },

    load(id) {
      const raw = id.startsWith('\0') ? id.slice(1) : id
      const q = raw.indexOf('?')
      const clean = q === -1 ? raw : raw.slice(0, q)
      if (clean === 'virtual:fulgur-runtime') return readRuntimeCode()
      if (clean === 'virtual:fulgur-init' && state.normalized) {
        return genInitModule(state.normalized, state.command)
      }
      if (clean === 'virtual:fulgur-provides' && state.normalized) {
        return genDevProvides(state.normalized)
      }
      if (clean === 'virtual:fulgur-remote-entry' && state.normalized) {
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
        return genSharedNsFacade(item, serializeShareCallForFacade(item), names)
      }
      if (clean.startsWith('virtual:fulgur-shared:') && state.normalized) {
        const body = clean.slice('virtual:fulgur-shared:'.length)
        const f = raw.indexOf('?f=')
        if (f === -1) {
          // 命名空间门面（provide/fallback 用）：本应用自己的副本
          const item = state.normalized.shared.find((x) => x.shareKey === body)
          if (item && item.import !== false) return genSharedFacade(item.import)
          return null
        }
        // 绑定门面：短签名反查绑定集，门面内做 loadShare/loadRemote 协商并转发绑定
        const entry = getFacadeEntry(raw.slice(f + 3))
        if (!entry) return null
        if (entry.remoteName && entry.exposeName) {
          return genRemoteBindingFacade(entry.remoteName + '/' + entry.exposeName, entry.bindings)
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
        const call = '__fulgur_loadShare(' + JSON.stringify(item.shareKey) + ', { ' + opts.join(', ') + ' })'
        return genBindingFacade(item, entry.bindings, call)
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
      if (n.exposes.length > 0) {
        // 解析 exposes 源模块绝对路径（容器入口与 manifest 映射依赖）
        for (const e of n.exposes) {
          const resolved = await this.resolve(e.import, path.join(n.root, 'index.html'))
          if (resolved) {
            state.exposeAbsPaths[e.import] = resolved.id.split('?')[0]
          } else {
            this.error(`[fulgur] expose "${e.import}" could not be resolved from ${n.root}`)
          }
        }
        // emitFile 固定文件名：remoteEntry URL 稳定，CDN 长缓存友好
        this.emitFile({
          type: 'chunk',
          id: 'virtual:fulgur-remote-entry',
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
        fileName: 'fulgur-manifest.json',
        source: JSON.stringify(manifest, null, 2),
      })
    },

    configureServer(server: ViteDevServer) {
      const n = state.normalized
      if (!n) return
      warmResolvedSharedPaths(server)

      // ---- remote 端中间件：容器入口 / manifest（跨 dev-server 协作的服务面）----
      if (n.exposes.length > 0) {
        const baseNorm = state.base
        server.middlewares.use((req, res, next) => {
          const raw = (req.url ?? '').split('?')[0]
          const stripped = raw.startsWith(baseNorm) ? `/${raw.slice(baseNorm.length)}` : raw
          if (stripped === '/@fulgur-entry.js' || stripped === '/@fulgur-manifest.json') {
            res.setHeader('Access-Control-Allow-Origin', '*')
            res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS')
            res.setHeader('Access-Control-Allow-Headers', '*')
            if (req.method === 'OPTIONS') {
              res.statusCode = 204
              res.end()
              return
            }
            if (stripped === '/@fulgur-entry.js') {
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
    },
  }

  // .vue 编译产物处理：vue 插件输出的 JS 仍带 bare import（build）或依赖 URL（dev）
  const post: Plugin = {
    name: 'fulgur:vue-post',
    enforce: 'post',
    async transform(code, id) {
      if (!state.normalized) return null
      // pre 阶段已改写过的模块（build 入口/子请求）不再处理，防双重生成
      if (code.includes('virtual:fulgur-runtime')) return null
      // dev：所有 JS/TS/Vue 模块统一在此改写；build：仅 .vue 主请求（其余已由 pre 处理）
      if (state.command === 'build' && !/\.vue(\?|$)/.test(id)) return null
      if (/type=(style|template)/.test(id)) return null // 样式与模板子请求不走这里

      const clean = id.split('?')[0]
      const isJsLike = /\.(m|c)?[jt]sx?$/.test(clean) || clean.endsWith('.vue')
      if (!isJsLike) return null
      // dev 宿主（无 exposes 或 host+remote 双角色）：自身源码不做 shared 改写（自身 import 即
      // 自身 provide，被消费方协商到的就是这份实例；避免 TLA 改变大型工程循环依赖求值顺序）；
      // 纯 remote（有 exposes、无 remotes）全量改写，含 node_modules——依赖包对 shared 的导入
      // 必须走门面防双运行时；dev 下需配合 optimizeDeps.exclude（预构建产物内联代码无法改写）。
      const devRewriteAll = state.command === 'serve' && state.normalized.devSharedSelf
      if (clean.includes('node_modules') && !id.includes('.vite/deps') && !devRewriteAll) return null

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
      return transformModule(code, id, { options: state.normalized!, remapSpecifier, rewriteShared })
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

  return [pre, post]
}

export default federation
export type { FulgurOptions } from './options'
