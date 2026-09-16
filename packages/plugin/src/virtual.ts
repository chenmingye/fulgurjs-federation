/**
 * 虚拟模块与产物生成器。
 * - init 模块：同步注册 provides（eager 静态导入）+ remotes + runtimePlugins（dev/prod 同一份代码）
 * - shared facade：把真实包变成"可共享命名空间"（named + default interop）
 * - dev 容器入口（remote 端中间件直出）+ dev provides 虚拟模块
 * - prod 容器入口（rollup 额外输入，输出稳定文件名 remoteEntry）
 */
import type { NormalizedOptions, NormalizedRemote, NormalizedShared } from './options'

function jsonReplacer(_k: string, v: unknown) {
  return v
}

/** shared facade：export * + default interop（CJS 与无 default 包都能工作）——provide/fallback 用的命名空间门面 */
export function genSharedFacade(specifier: string): string {
  return [
    `import * as __fulgur_facade from ${JSON.stringify(specifier)};`,
    `export * from ${JSON.stringify(specifier)};`,
    `export default __fulgur_facade.default ?? __fulgur_facade;`,
    '',
  ].join('\n')
}

/**
 * 预构建协商门面（optimizeDeps 外部化用，仅 dev）：
 * 依赖预构建产物内对 shared 键的导入指向本门面——loadShare 协商到目标实例后转发完整命名空间。
 * ESM 无法动态枚举导出，命名导出按本机安装包 CJS 入口的真实导出在生成期列全
 * （见 index.ts 的 enumerateCjsExports）；宿主实例缺少个别新导出时对应值为 undefined，语义不变。
 */
export function genSharedNsFacade(item: NormalizedShared, loadShareCall: string, exportNames: string[]): string {
  const lines: string[] = [
    `import { loadShare as __fulgur_loadShare, unwrapDefault as __fulgurU } from "virtual:fulgur-runtime";`,
    `const __fulgur_m = await ${loadShareCall};`,
    `const __fulgur_d = __fulgurU(__fulgur_m);`,
    `export default __fulgur_d;`,
  ]
  const seen = new Set<string>(['default'])
  for (const name of exportNames) {
    if (seen.has(name) || !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) continue
    seen.add(name)
    lines.push(`export const ${name} = __fulgur_d[${JSON.stringify(name)}];`)
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
): string {
  const lines: string[] = [
    `import { loadShare as __fulgur_loadShare, unwrapDefault as __fulgurU } from "virtual:fulgur-runtime";`,
    `const __fulgur_m = await ${loadShareCall};`,
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
    lines.push(`export const ${imported} = __fulgur_m.${imported};`)
  }
  lines.push(`export default __fulgurU(__fulgur_m);`)
  lines.push('')
  return lines.join('\n')
}

/** 远程绑定门面：静态 import 远程模块时指向它（内部走 loadRemote） */
export function genRemoteBindingFacade(remoteSpec: string, bindings: string[]): string {
  const lines: string[] = [
    `import { loadRemote as __fulgur_loadRemote, unwrapDefault as __fulgurU } from "virtual:fulgur-runtime";`,
    `const __fulgur_m = await __fulgur_loadRemote(${JSON.stringify(remoteSpec)});`,
  ]
  const seen = new Set<string>()
  for (const bRaw of bindings) {
    if (bRaw === 'default') continue
    // bRaw 可能是 "imported as local"（消费方别名）：门面只需导出 imported 名
    const asMatch = bRaw.match(/^(.*?)\s+as\s+(.+)$/)
    const imported = (asMatch ? asMatch[1] : bRaw).trim()
    if (seen.has(imported)) continue
    seen.add(imported)
    lines.push(`export const ${imported} = __fulgur_m.${imported};`)
  }
  lines.push(`export default __fulgurU(__fulgur_m);`)
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
export function genInitModule(
  options: NormalizedOptions,
  command: 'serve' | 'build',
): string {
  const lines: string[] = []
  lines.push(`import { initSharing, registerShare, registerRemotes, registerPlugins } from "virtual:fulgur-runtime";`)

  const provides = providesRecords(options)
  const eagerShared: NormalizedShared[] = options.shared.filter((s) => s.eager && s.import !== false)
  eagerShared.forEach((s, i) => {
    lines.push(`import * as __fulgur_eager_${i} from "virtual:fulgur-shared:${s.shareKey}";`)
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
      lines.push(`import * as __fulgur_rp_${i} from ${JSON.stringify(p)};`)
    })
    lines.push(
      `registerPlugins([${options.runtimePlugins
        .map((_, i) => `(__fulgur_rp_${i}.default ?? __fulgur_rp_${i})`)
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
        `registerShare(${JSON.stringify(p.shareScope)}, ${JSON.stringify(p.name)}, ${JSON.stringify(p.version)}, () => Promise.resolve(__fulgur_eager_${eagerIdx}), { from: ${JSON.stringify(p.from)}, eager: true, loaded: ${loadedFlag} });`,
      )
    } else {
      lines.push(
        `registerShare(${JSON.stringify(p.shareScope)}, ${JSON.stringify(p.name)}, ${JSON.stringify(p.version)}, () => import("virtual:fulgur-shared:${p.name}"), { from: ${JSON.stringify(p.from)}, eager: false, loaded: ${loadedFlag} });`,
      )
    }
  })

  return `${lines.join('\n')}\n`
}

function manifestUrlFor(r: NormalizedRemote, command: 'serve' | 'build'): string | null {
  const entry = command === 'serve' ? r.devEntry : r.prodEntry
  if (!entry) return null
  try {
    const u = new URL(entry)
    // dev 容器入口 @fulgur-entry.js → @fulgur-manifest.json；prod remoteEntry 同目录 manifest
    if (u.pathname.includes('@fulgur-entry.js')) {
      u.pathname = u.pathname.replace('@fulgur-entry.js', '@fulgur-manifest.json')
    } else {
      u.pathname = u.pathname.replace(/[^/]*$/, '') + 'fulgur-manifest.json'
    }
    return u.href
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
 * dev 容器入口（remote 端 dev server 中间件直出的自包含 JS）。
 * init(shareScopeMap) 按引用收养 scope map 并注册 provides——对齐 webpack 容器协议。
 * 顶层注册自身 remotes：远程页面被宿主加载后可能再消费其他远程（双向联邦/嵌套联邦），
 * 页面级运行时经 globalThis.__FULGUR_RUNTIME__ 单例，跨源模块副本共享同一注册表。
 */
export function genDevRemoteEntry(options: NormalizedOptions, base: string): string {
  const b = base.endsWith('/') ? base : `${base}/`
  const remoteLines = registerRemotesLines(options, 'serve')
  return `import ${JSON.stringify(`${b}@vite/client`)};
import { name as _fulgur_name, exposes, provides } from ${JSON.stringify(`${b}@id/__x00__virtual:fulgur-provides`)};
${remoteLines.length > 0 ? `import { registerRemotes } from ${JSON.stringify(`${b}@id/virtual:fulgur-runtime`)};\n${remoteLines.join('\n')}` : ''}

export const name = _fulgur_name;

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
      `  { shareScope: ${JSON.stringify(p.shareScope)}, name: ${JSON.stringify(p.name)}, version: ${JSON.stringify(p.version)}, eager: ${p.eager}, get: () => import("virtual:fulgur-shared:${p.name}") },`,
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
 * 经 globalThis.__FULGUR_RUNTIME__ 单例与宿主共享同一注册表。
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
      `  { shareScope: ${JSON.stringify(p.shareScope)}, name: ${JSON.stringify(p.name)}, version: ${JSON.stringify(p.version)}, eager: ${p.eager}, get: () => import("virtual:fulgur-shared:${p.name}") },`,
  )
  const remoteLines = registerRemotesLines(options, 'build')
  return [
    ...(remoteLines.length > 0
      ? [`import { registerRemotes } from "virtual:fulgur-runtime";`, ...remoteLines]
      : []),
    `const exposes = {`,
    ...exposes,
    `};`,
    `const provides = [`,
    ...provides,
    `];`,
    `export const name = ${JSON.stringify(options.name)};`,
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

/** dev manifest（remote 端中间件动态返回） */
export function genDevManifest(options: NormalizedOptions, base: string): Record<string, unknown> {
  const b = base.endsWith('/') ? base : `${base}/`
  return {
    id: options.name,
    name: options.name,
    version: options.pkgDependencies?.['fulgur'] ?? '0.0.0',
    devServer: true,
    base: b,
    entry: `${b}@fulgur-entry.js`,
    /** 本地联调时供宿主端 dts 类型直连（见 dts.ts）；远程不在本机时宿主回退 any 桩 */
    fsRoot: options.root,
    exposes: options.exposes.map((e) => ({
      name: e.name,
      src: e.import,
      file: `${b}@fulgur-src/${e.import.replace(/^\.?\//, '')}`,
    })),
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
): Record<string, unknown> {
  return {
    id: options.name,
    name: options.name,
    entry: entryFile,
    exposes: exposeFiles,
    shared: options.shared.map((s) => ({
      name: s.shareKey,
      version: s.version,
      singleton: s.singleton,
      requiredVersion: s.requiredVersion,
      shareScope: s.shareScope,
      eager: s.eager,
    })),
    buildInfo: {
      builtBy: 'fulgur-federation',
      timestamp: Date.now(),
    },
  }
}
