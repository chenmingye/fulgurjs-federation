/**
 * 虚拟模块与产物生成器。
 * - init 模块：同步注册 provides（eager 静态导入）+ remotes + runtimePlugins（dev/prod 同一份代码）
 * - shared facade：把真实包变成"可共享命名空间"（named + default interop）
 * - dev 容器入口（remote 端中间件直出）+ dev provides 虚拟模块
 * - prod 容器入口（rollup 额外输入，输出稳定文件名 remoteEntry）
 */
import type { NormalizedOptions, NormalizedRemote, NormalizedShared } from './options'
import { SETUP_CONTAINER_KEY } from './options'
import { MANIFEST_SCHEMA_VERSION, type DevFederationManifest, type ProdFederationManifest } from './manifest'

/** setup 生命周期入口的容器元数据声明行（配置了 setup 时 dev/prod 容器一致携带） */
function setupMetaLine(options: NormalizedOptions): string {
  return options.setup ? `export const ${SETUP_CONTAINER_KEY} = ${JSON.stringify(options.setup.name)};` : ''
}

function jsonReplacer(_k: string, v: unknown) {
  return v
}

/**
 * shared facade：provide/fallback 用的命名空间门面。
 *
 * U-7（2026-09-17 修复）：此前为 `export * from <pkg>`，rolldown 产物下 export * 连同
 * vite-plugin-top-level-await 的 __tla 机制被展开为「let 提升 + then 回调赋值」，命名绑定
 * 全 undefined（provider 注册后 loadShare 拿到的命名空间只有 default）。改为枚举式再导出
 * （同 genSharedNsFacade 形态）：`export const X = ns.X` 是普通绑定赋值，不依赖 rolldown
 * 对 export * 的展开。exportNames 来自 enumerateCjsExports（index.ts）；无法枚举时
 * （ESM-only/相对路径）回退 export * 形态——此时不存在 CJS 命名空间可枚举，TLA 展开风险
 * 由「无 CJS 入口 → 消费方解构命名导出本就不可用」兜底。
 *
 * D6（2026-09-22 修复）：shared 本体的导入从顶层静态 import 改为 TLA 内动态 import。
 * 原因：静态 import 会把「门面 chunk → shared 本体 chunk」固定成静态边；当宿主开启
 * devSharedSelf（node_modules 参与门面化）且用户配置 manualChunks 强制分组时，本体的
 * 被改写消费方（如 vue-router）的门面在门面 chunk、门面又静态依赖本体 chunk →
 * chunk 级循环依赖 → 求值顺序错位 → 运行时 TypeError（协商函数未初始化）。
 * 动态化后门面 chunk 对外零静态依赖（"汇"），与任何 manualChunks 分组正交、无环。
 *
 * D6 补丁（实机死锁）：`export const X = ns.X` 直接转发仍会被 rollup 识别为「纯透传模块」
 * 而内联进本体所在 chunk（导出别名指向本体 chunk），fallback 的动态 import 随之指回本体
 * chunk——与「本体组消费方静态 import 门面 chunk」构成 TLA 混合环，页面死锁在骨架屏
 * （无任何报错）。改为先把动态命名空间**复制成本地对象**再逐名导出：导出值来自本地绑定，
 * rollup 不再内联透传，门面模块保持实体留在门面组。
 */
export function genSharedFacade(specifier: string, exportNames?: string[], dynamic = false): string {
  const names = (exportNames ?? []).filter(
    (n) => n !== 'default' && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(n),
  )
  if (!dynamic) {
    // 2.0.0 静态形态：本体为静态依赖，rollup 拓扑排序保证本体 chunk 先完成求值
    if (names.length === 0) {
      return [
        `import * as __fulgurjs_facade from ${JSON.stringify(specifier)};`,
        `export * from ${JSON.stringify(specifier)};`,
        `export default __fulgurjs_facade.default ?? __fulgurjs_facade;`,
        '',
      ].join('\n')
    }
    return [
      `import * as __fulgurjs_facade from ${JSON.stringify(specifier)};`,
      ...names.map((n) => `export const ${n} = __fulgurjs_facade[${JSON.stringify(n)}];`),
      `export default __fulgurjs_facade.default ?? __fulgurjs_facade;`,
      '',
    ].join('\n')
  }
  if (names.length === 0) {
    return [
      `const __fulgurjs_facade = await import(${JSON.stringify(specifier)});`,
      `export * from ${JSON.stringify(specifier)};`,
      `export default __fulgurjs_facade.default ?? __fulgurjs_facade;`,
      '',
    ].join('\n')
  }
  return [
    `const __fulgurjs_facade = await import(${JSON.stringify(specifier)});`,
    `const __fulgurjs_ns = { ...__fulgurjs_facade };`,
    ...names.map((n) => `export const ${n} = __fulgurjs_ns[${JSON.stringify(n)}];`),
    `export default __fulgurjs_ns.default ?? __fulgurjs_ns;`,
    '',
  ].join('\n')
}

/**
 * 预构建协商门面（optimizeDeps 外部化用，仅 dev）：
 * 依赖预构建产物内对 shared 键的导入指向本门面——loadShare 协商到目标实例后转发完整命名空间。
 * ESM 无法动态枚举导出，命名导出按本机安装包 CJS 入口的真实导出在生成期列全
 * （见 index.ts 的 enumerateCjsExports）；宿主实例缺少个别新导出时对应值为 undefined，语义不变。
 */
export function genSharedNsFacade(
  item: NormalizedShared,
  loadShareCall: string,
  exportNames: string[],
  dynamic = false,
): string {
  const lines: string[] = [
    dynamic
      ? `const { loadShare: __fulgurjs_loadShare, unwrapDefault: __fulgurjsU } = await import("virtual:fulgurjs-runtime");`
      : `import { loadShare as __fulgurjs_loadShare, unwrapDefault as __fulgurjsU } from "virtual:fulgurjs-runtime";`,
    `const __fulgurjs_m = await ${loadShareCall};`,
    `const __fulgurjs_d = __fulgurjsU(__fulgurjs_m);`,
    `export default __fulgurjs_d;`,
  ]
  const seen = new Set<string>(['default'])
  for (const name of exportNames) {
    if (seen.has(name) || !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) continue
    seen.add(name)
    lines.push(`export const ${name} = __fulgurjs_d[${JSON.stringify(name)}];`)
  }
  lines.push('')
  return lines.join('\n')
}

/**
 * 绑定门面：消费方静态 import 直接指向它。
 * 门面内做 loadShare 协商（TLA 集中在这一个虚拟模块里，消费方保持同步求值），
 * 并把消费方请求的绑定逐一转发；default 走 unwrapDefault interop。
 */
export function genBindingFacade(
  item: NormalizedShared,
  bindings: string[],
  loadShareCall: string,
  dynamic = false,
): string {
  const lines: string[] = [
    dynamic
      ? `const { loadShare: __fulgurjs_loadShare, unwrapDefault: __fulgurjsU } = await import("virtual:fulgurjs-runtime");`
      : `import { loadShare as __fulgurjs_loadShare, unwrapDefault as __fulgurjsU } from "virtual:fulgurjs-runtime";`,
    `const __fulgurjs_m = await ${loadShareCall};`,
  ]
  // 门面导出名 = 消费方导入的 imported 名（消费方的 as 别名由其 import 语句自行处理）
  const seen = new Set<string>()
  for (const bRaw of bindings) {
    if (bRaw === 'default') continue
    // bRaw 可能是 "imported as local"（消费方别名）：门面只需导出 imported 名
    const asMatch = bRaw.match(/^(.*?)\s+as\s+(.+)$/)
    const imported = (asMatch ? asMatch[1] : bRaw).trim()
    if (seen.has(imported)) continue
    seen.add(imported)
    lines.push(`export const ${imported} = __fulgurjs_m.${imported};`)
  }
  lines.push(`export default __fulgurjsU(__fulgurjs_m);`)
  lines.push('')
  return lines.join('\n')
}

/** 远程绑定门面：静态 import 远程模块时指向它（内部走 loadRemote） */
export function genRemoteBindingFacade(remoteSpec: string, bindings: string[], dynamic = false): string {
  const lines: string[] = [
    dynamic
      ? `const { loadRemote: __fulgurjs_loadRemote, unwrapDefault: __fulgurjsU } = await import("virtual:fulgurjs-runtime");`
      : `import { loadRemote as __fulgurjs_loadRemote, unwrapDefault: __fulgurjsU } from "virtual:fulgurjs-runtime";`.replace('unwrapDefault: __fulgurjsU', 'unwrapDefault as __fulgurjsU'),
    `const __fulgurjs_m = await __fulgurjs_loadRemote(${JSON.stringify(remoteSpec)});`,
  ]
  const seen = new Set<string>()
  for (const bRaw of bindings) {
    if (bRaw === 'default') continue
    // bRaw 可能是 "imported as local"（消费方别名）：门面只需导出 imported 名
    const asMatch = bRaw.match(/^(.*?)\s+as\s+(.+)$/)
    const imported = (asMatch ? asMatch[1] : bRaw).trim()
    if (seen.has(imported)) continue
    seen.add(imported)
    lines.push(`export const ${imported} = __fulgurjs_m.${imported};`)
  }
  lines.push(`export default __fulgurjsU(__fulgurjs_m);`)
  lines.push('')
  return lines.join('\n')
}

interface ProvideRecord {
  shareScope: string
  name: string
  version: string
  eager: boolean
  from: string
}

function providesRecords(options: NormalizedOptions): ProvideRecord[] {
  return options.shared
    .filter((s) => s.import !== false)
    .map((s) => ({
      shareScope: s.shareScope,
      name: s.shareKey,
      version: s.version,
      eager: s.eager,
      from: options.name,
    }))
}

/**
 * init 模块（host / remote 通用）：
 * 同步执行——注册 share scope、remotes、runtimePlugins、自己的 provides。
 * eager 共享项以静态导入形式出现（webpack eager 语义：总是被下载、初始 chunk 可用）。
 */
/** 构建入口 init 注入的标识（post 阶段防双重生成的精确特征之一） */
export const INIT_MODULE_MARKER = '/* fulgurjs:init */'

export function genInitModule(
  options: NormalizedOptions,
  command: 'serve' | 'build',
): string {
  const lines: string[] = [INIT_MODULE_MARKER]
  lines.push(`import { initSharing, registerShare, registerRemotes, registerPlugins } from "virtual:fulgurjs-runtime";`)

  const provides = providesRecords(options)
  const eagerShared: NormalizedShared[] = options.shared.filter((s) => s.eager && s.import !== false)
  eagerShared.forEach((s, i) => {
    lines.push(`import * as __fulgurjs_eager_${i} from "virtual:fulgurjs-shared:${s.shareKey}";`)
  })

  // dev 宿主（有 remotes 即浏览器直接加载的主应用，是否同时 exposes 不影响）：
  // 自身应用实例已在用本地副本（pinia/router 等全局状态已初始化在本副本上），把 provide
  // 标记为已加载——singleton 协商"已加载优先"时远程必然命中宿主正在用的这份，避免双实例
  // 断链。纯 remote（无 remotes）不标记。
  const isDevHost = command === 'serve' && options.remotes.length > 0
  const loadedFlag = isDevHost ? 'true' : 'false'

  lines.push(`initSharing(${JSON.stringify(options.shareScope)});`)

  if (options.runtimePlugins.length > 0) {
    options.runtimePlugins.forEach((p, i) => {
      lines.push(`import * as __fulgurjs_rp_${i} from ${JSON.stringify(p)};`)
    })
    lines.push(
      `registerPlugins([${options.runtimePlugins
        .map((_, i) => `(__fulgurjs_rp_${i}.default ?? __fulgurjs_rp_${i})`)
        .join(', ')}]);`,
    )
  }

  if (options.remotes.length > 0) {
    lines.push(...registerRemotesLines(options, command))
  }

  provides.forEach((p) => {
    const eagerIdx = eagerShared.findIndex((s) => s.shareKey === p.name && s.shareScope === p.shareScope)
    if (p.eager && eagerIdx !== -1) {
      lines.push(
        `registerShare(${JSON.stringify(p.shareScope)}, ${JSON.stringify(p.name)}, ${JSON.stringify(p.version)}, () => Promise.resolve(__fulgurjs_eager_${eagerIdx}), { from: ${JSON.stringify(p.from)}, eager: true, loaded: ${loadedFlag} });`,
      )
    } else {
      lines.push(
        `registerShare(${JSON.stringify(p.shareScope)}, ${JSON.stringify(p.name)}, ${JSON.stringify(p.version)}, () => import("virtual:fulgurjs-shared:${p.name}"), { from: ${JSON.stringify(p.from)}, eager: false, loaded: ${loadedFlag} });`,
      )
    }
  })

  return `${lines.join('\n')}\n`
}

function manifestUrlFor(r: NormalizedRemote, command: 'serve' | 'build'): string | null {
  const entry = command === 'serve' ? r.devEntry : r.prodEntry
  if (!entry) return null
  try {
    // Production remotes commonly use root-relative paths (for example `/lowcode`).
    // Resolve those against a dummy origin while preserving their path form in generated code.
    const hasScheme = /^[a-z][a-z\d+.-]*:/i.test(entry)
    const isProtocolRelative = entry.startsWith('//')
    const u = new URL(entry, hasScheme ? undefined : 'http://fulgurjs.invalid')
    // dev 容器入口 @fulgurjs-entry.js → @fulgurjs-manifest.json；prod remoteEntry 同目录 manifest
    if (u.pathname.includes('@fulgurjs-entry.js')) {
      u.pathname = u.pathname.replace('@fulgurjs-entry.js', '@fulgurjs-manifest.json')
    } else {
      u.pathname = u.pathname.replace(/[^/]*$/, '') + 'fulgurjs-manifest.json'
    }
    if (hasScheme) return u.href
    if (isProtocolRelative) return `//${u.host}${u.pathname}${u.search}${u.hash}`
    return `${u.pathname}${u.search}${u.hash}`
  } catch {
    return null
  }
}

/** 可序列化 remotes 的注册语句（genInitModule 与 dev 容器入口共用） */
function registerRemotesLines(options: NormalizedOptions, command: 'serve' | 'build'): string[] {
  if (options.remotes.length === 0) return []
  // promise-based remote 无法序列化（函数），由用户在运行时 registerRemote 注册
  const remotesJson = options.remotes
    .filter((r) => !r.promise)
    .map((r: NormalizedRemote) => ({
      name: r.name,
      entry: command === 'serve' ? r.devEntry : r.prodEntry,
      shareScope: r.shareScope,
      timeout: r.timeout,
      retries: r.retries,
      fallback: r.fallback,
      breaker: r.breaker,
      manifestUrl: manifestUrlFor(r, command),
    }))
  if (remotesJson.length === 0) return []
  return [
    `registerRemotes(${JSON.stringify(remotesJson, jsonReplacer).replace(/"manifestUrl":null,?/g, '')});`,
  ]
}

/**
 * 运行时惰性委托模块（dev，expose 目标自动改写用）。
 *
 * 背景（原 DEV-008 硬规则，0.4.1 起自动化）：远程页面静态导入 virtual:fulgurjs-runtime 时，
 * 该导入由远程 dev server 求值——模块求值期会拉起远程自己的运行时副本链。改为委托模块后：
 * - 模块求值期不做任何事（不创建副本、不注册）；
 * - Promise 型 API 在调用期经页面级单例（globalThis.__FULGURJS_RUNTIME__）转发，
 *   动态 import 确保单例已初始化（宿主 init 先行，或独立运行时自建）；
 * - 同步 API（getRuntime/version）直接读全局单例，单例未建时返回 undefined。
 * 用户因此可以在任何文件直接 import { loadRemote } from 'virtual:fulgurjs-runtime'，
 * 无需知道「宿主/远程页面取运行时的不同姿势」。
 */
export function genRuntimeProxyModule(): string {
  const promiseApis = [
    'loadRemote',
    'loadShare',
    'preloadRemote',
    'getContainer',
    'registerRemote',
    'registerRemotes',
    'registerShare',
    'initSharing',
    'registerPlugins',
  ]
  const lines: string[] = [
    `let __fulgurjs_mod_p;`,
    `const __fulgurjs_rt = async () => {`,
    `  __fulgurjs_mod_p ??= import('virtual:fulgurjs-runtime');`,
    `  return await __fulgurjs_mod_p;`,
    `};`,
    ...promiseApis.map((m) => `export const ${m} = (...a) => __fulgurjs_rt().then((m2) => m2.${m}(...a));`),
    // parseSpec 是同步纯函数：promise 转发会把返回值变成 Promise（返回对象上的属性
    // 全部 undefined，3.0.0 门面切换时实测）——同步直读页面级单例（调用期单例必已由
    // init 建立，时序契约同 shareScopeMap）
    `export const parseSpec = (...a) => (globalThis).__FULGURJS_RUNTIME__.parseSpec(...a);`,
    // shareScopeMap：本模块只会在应用代码 import 链里被求值——页面运行期单例必已由 init 建立
    // （时序契约：宿主/远程 init 先于一切联邦模块），故求值期直读 globalThis 安全
    `export const shareScopeMap = (globalThis).__FULGURJS_RUNTIME__?.shareScopeMap;`,
    `export const getRuntime = () => (globalThis).__FULGURJS_RUNTIME__;`,
    `export const unwrapDefault = (ns) =>`,
    `  ns && typeof ns === 'object' && 'default' in ns ? (ns.default !== undefined ? ns.default : ns) : ns;`,
    `export const version = (globalThis).__FULGURJS_RUNTIME__?.version;`,
    `export default { get runtime() { return (globalThis).__FULGURJS_RUNTIME__; } };`,
    ``,
  ]
  return lines.join('\n')
}

/**
 * dev 容器入口（remote 端 dev server 中间件直出的自包含 JS）。
 * init(shareScopeMap) 按引用收养 scope map 并注册 provides——对齐 webpack 容器协议。
 * 顶层注册自身 remotes：远程页面被宿主加载后可能再消费其他远程（双向联邦/嵌套联邦），
 * 页面级运行时经 globalThis.__FULGURJS_RUNTIME__ 单例，跨源模块副本共享同一注册表。
 */
export function genDevRemoteEntry(options: NormalizedOptions, base: string): string {
  const b = base.endsWith('/') ? base : `${base}/`
  const remoteLines = registerRemotesLines(options, 'serve')
  return `import ${JSON.stringify(`${b}@vite/client`)};
import { name as _fulgurjs_name, exposes, provides } from ${JSON.stringify(`${b}@id/__x00__virtual:fulgurjs-provides`)};
${remoteLines.length > 0 ? `import { registerRemotes } from ${JSON.stringify(`${b}@id/virtual:fulgurjs-runtime`)};\n${remoteLines.join('\n')}` : ''}

export const name = _fulgurjs_name;
${setupMetaLine(options)}

export async function init(shareScopeMap) {
  for (const p of provides) {
    const scope = shareScopeMap[p.shareScope] || (shareScopeMap[p.shareScope] = {});
    const byName = scope[p.name] || (scope[p.name] = {});
    if (byName[p.version]) continue; // 已注册版本永不替换
    byName[p.version] = { version: p.version, get: p.get, from: name, eager: p.eager, loaded: false };
  }
}

export async function get(moduleName) {
  const loader = exposes[moduleName];
  if (!loader) {
    const err = new Error('MFU-006: module "' + moduleName + '" is not exposed by remote "' + name + '"');
    err.code = 'MFU-006';
    throw err;
  }
  return loader();
}
`
}

/** dev provides 虚拟模块（走 vite 转换管线，dev URL 会被 importAnalysis 正确补 base/重写） */
export function genDevProvides(options: NormalizedOptions): string {
  const exposes: string[] = []
  for (const e of options.exposes) {
    // 根相对 URL：'/src/x.vue'，importAnalysis 负责解析与补 base
    const devUrl = `/${e.import.replace(/^\.?\//, '')}`
    exposes.push(
      `  ${JSON.stringify(e.name)}: () => import(${JSON.stringify(devUrl)}),`,
    )
  }
  const provides = providesRecords(options).map(
    (p) =>
      `  { shareScope: ${JSON.stringify(p.shareScope)}, name: ${JSON.stringify(p.name)}, version: ${JSON.stringify(p.version)}, eager: ${p.eager}, get: () => import("virtual:fulgurjs-shared:${p.name}") },`,
  )
  return [
    `export const name = ${JSON.stringify(options.name)};`,
    `export const exposes = {`,
    ...exposes,
    `};`,
    `export const provides = [`,
    ...provides,
    `];`,
    '',
  ].join('\n')
}

/**
 * prod 容器入口（作为额外 rollup 输入，emitFile 固定文件名）。
 * exposes 为动态导入 → rollup 自动拆独立 chunk；shared 经 facade 动态导入 → 自动剥离。
 * 顶层注册自身 remotes（与 dev 容器入口 genDevRemoteEntry 同语义）：prod 双向联邦下，
 * 本应用页面被宿主加载后还会 loadRemote 其他 remote（如 bpm 页面消费 admin 的
 * FormRouterPage），而本应用的 registerRemotes 写在自己 index.html 内联 init 里——
 * 联邦模式下宿主从不加载本应用的 index.html，remotes 无人注册 → MFU-008。
 * 经 globalThis.__FULGURJS_RUNTIME__ 单例与宿主共享同一注册表。
 */
export function genBuildRemoteEntry(options: NormalizedOptions, exposeAbsPaths: Record<string, string>): string {
  const exposes: string[] = []
  for (const e of options.exposes) {
    const abs = exposeAbsPaths[e.import]
    if (!abs) continue
    exposes.push(`  ${JSON.stringify(e.name)}: () => import(${JSON.stringify(abs)}),`)
  }
  const provides = providesRecords(options).map(
    (p) =>
      `  { shareScope: ${JSON.stringify(p.shareScope)}, name: ${JSON.stringify(p.name)}, version: ${JSON.stringify(p.version)}, eager: ${p.eager}, get: () => import("virtual:fulgurjs-shared:${p.name}") },`,
  )
  const remoteLines = registerRemotesLines(options, 'build')
  return [
    ...(remoteLines.length > 0
      ? [`import { registerRemotes } from "virtual:fulgurjs-runtime";`, ...remoteLines]
      : []),
    `const exposes = {`,
    ...exposes,
    `};`,
    `const provides = [`,
    ...provides,
    `];`,
    `export const name = ${JSON.stringify(options.name)};`,
    setupMetaLine(options),
    ``,
    `export async function init(shareScopeMap) {`,
    `  for (const p of provides) {`,
    `    const scope = shareScopeMap[p.shareScope] || (shareScopeMap[p.shareScope] = {});`,
    `    const byName = scope[p.name] || (scope[p.name] = {});`,
    `    if (byName[p.version]) continue; // 已注册版本永不替换`,
    `    byName[p.version] = { version: p.version, get: p.get, from: name, eager: p.eager, loaded: false };`,
    `  }`,
    `}`,
    ``,
    `export async function get(moduleName) {`,
    `  const loader = exposes[moduleName];`,
    `  if (!loader) {`,
    `    const err = new Error('MFU-006: module "' + moduleName + '" is not exposed by remote "' + name + '"');`,
    `    err.code = 'MFU-006';`,
    `    throw err;`,
    `  }`,
    `  return loader();`,
    `}`,
    '',
  ].join('\n')
}

/**
 * 开发态 expose 的内部代理门面。应用代码仍写物理 /runtime，transform 后指向此模块。
 * Vue 适配器接收代理 loadRemote，remoteComponent 同步返回组件且不导入第二份内核。
 */
export function genApiFacade(): string {
  return [
    'export {',
    '  loadRemote, loadShare, preloadRemote, getContainer,',
    '  registerRemote, registerRemotes, registerShare, initSharing, registerPlugins,',
    '  parseSpec, getRuntime, shareScopeMap, unwrapDefault, version,',
    '} from "virtual:fulgurjs-runtime-proxy";',
    "export { provideAppContext, getAppContext, requireAppContext, clearAppContext } from '@fulgurjs/federation/internal/context.js';",
    "export { definePages, validatePages } from '@fulgurjs/federation/internal/pages.js';",
    "import { createRemoteComponent, createHostPages as __fulgurjs_chp } from '@fulgurjs/federation/internal/vue-adapter.js';",
    "import { loadRemote as __fulgurjs_loadRemote } from 'virtual:fulgurjs-runtime-proxy';",
    'export const remoteComponent = createRemoteComponent(__fulgurjs_loadRemote);',
    'export const createHostPages = (options) => __fulgurjs_chp(options, __fulgurjs_loadRemote);',
    '',
  ].join('\n')
}

/** dev manifest（remote 端中间件动态返回；契约见 manifest.ts，消费端经 parseManifest 校验） */
export function genDevManifest(options: NormalizedOptions, base: string): DevFederationManifest {
  const b = base.endsWith('/') ? base : `${base}/`
  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    id: options.name,
    name: options.name,
    version: options.pkgDependencies?.['fulgurjs'] ?? '0.0.0',
    devServer: true,
    base: b,
    entry: `${b}@fulgurjs-entry.js`,
    /**
     * 本地联调时供宿主端 dts 类型直连（见 dts.ts）；远程不在本机时宿主回退 any 桩。
     * WP5：devFsRoot: false 时不写入（本机路径不外发）；该字段永不进入 prod manifest。
     */
    ...(options.devFsRoot === false ? {} : { fsRoot: options.root }),
    exposes: options.exposes.map((e) => ({
      name: e.name,
      src: e.import,
      // 真实可请求的模块 URL（dev 容器 get 的 import 同款裸 URL，base 前缀补齐）——
      // preloadRemote 会把该字段注入 <link rel=modulepreload>，必须是浏览器可 200 的地址。
      // 回归：曾写 dts 虚拟路径 /@fulgurjs-src/...（dts 实际只用 fsRoot+src，不用 file），
      // dev 下 preload 全部 404。
      file: `${b}${e.import.replace(/^\.?\//, '')}`,
    })),
    // setup 生命周期入口（内部 expose 键；未配置 setup 时省略）。preloadRemote 据此把
    // setup 资源纳入预载，doctor/explain 据此区分内部资源与公开 exposes。
    ...(options.setup ? { setup: options.setup.name } : {}),
    shared: options.shared.map((s) => ({
      name: s.shareKey,
      version: s.version,
      singleton: s.singleton,
      requiredVersion: s.requiredVersion,
      shareScope: s.shareScope,
      eager: s.eager,
    })),
  }
}

/** prod manifest 资源（build 后写盘，preloadRemote 消费） */
export interface ManifestExposeEntry {
  file: string
  css: string[]
}

export function genProdManifest(
  options: NormalizedOptions,
  exposeFiles: Record<string, ManifestExposeEntry>,
  entryFile: string,
): ProdFederationManifest {
  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    id: options.name,
    name: options.name,
    entry: entryFile,
    exposes: exposeFiles,
    ...(options.setup && exposeFiles[options.setup.name] ? { setup: options.setup.name } : {}),
    shared: options.shared.map((s) => ({
      name: s.shareKey,
      version: s.version,
      singleton: s.singleton,
      requiredVersion: s.requiredVersion,
      shareScope: s.shareScope,
      eager: s.eager,
    })),
    buildInfo: {
      builtBy: 'fulgurjs-federation',
      timestamp: Date.now(),
    },
  }
}
