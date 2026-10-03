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
    // 2.0.0 静态形态：本体为静态依赖，rollup 拓扑排序保证本体 chunk 先完成求值。
    // __fulgurjs_facadeTag（V8-FIX 2026-10-01）：本地导出标记，阻止 rolldown 把「纯透传
    // 门面」从 loadShare fallback 的动态 import 目标中透传重定向到本体入口。
    // 枚举式命名导出保持 U-7 形态（dev 下 export * 经预构建 react 的互操作会丢绑定，
    // react-dev R02 实测 useState undefined——枚举转发是命名导出的可靠通道）。
    if (names.length === 0) {
      return [
        `export const __fulgurjs_facadeTag = 1;`,
        `import * as __fulgurjs_facade from ${JSON.stringify(specifier)};`,
        `export * from ${JSON.stringify(specifier)};`,
        `export default __fulgurjs_facade.default ?? __fulgurjs_facade;`,
        '',
      ].join('\n')
    }
    return [
      `export const __fulgurjs_facadeTag = 1;`,
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
/** V8-FIX：TLA 门面（await loadShare/loadRemote 的虚拟模块）的 init 前置依赖 id */

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
 * CJS require(<shared>) 垫片（virtual:fulgurjs-cjs-ns:<key>；transform 的 require 重定向目标）。
 *
 * V8-FIX（2026-10-01）：此前与 sharedNsFacade 同体（`await loadShare(...)` 的 TLA 形态）——
 * rolldown（vite 8）对 CJS require 含顶层 await 的 ESM 模块按 Node 语义在构建期直接拒绝
 * （REQUIRE_TLA），react/react-dom 本体（CJS）互引在生产构建即失败。同步形态：
 * - 优先 getLoadedShare 同步取「已协商加载」的实例：宿主先加载时命中宿主实例，
 *   按版本范围、singleton 与 strictVersion 选择已就绪实例；自定义 hook 复用成功快照；
 * - 未就绪时直连本应用本体：与 provide/fallback 的 genSharedFacade 是同一模块
 *   同步 require 不能等待协商；多版本与自定义 hook 下必须另行验收本地 fallback 的实例身份。
 * 本体随垫片静态入图，但垫片只被本应用 CJS 本体链 require——协商命中宿主时该链
 * 的加载关系仍需以最终 chunk 图及运行时实例身份核对。导出面枚举与 sharedNsFacade 相同。
 */
export function genCjsNsFacade(item: NormalizedShared, exportNames: string[], importTarget?: string): string {
  const opts: string[] = [
    `shareScope: ${JSON.stringify(item.shareScope)}`,
    `shareKey: ${JSON.stringify(item.shareKey)}`,
    ...(item.requiredVersion !== false ? [`requiredVersion: ${JSON.stringify(item.requiredVersion)}`] : []),
    ...(item.singleton ? ['singleton: true'] : []),
    ...(item.strictVersion ? ['strictVersion: true'] : []),
    `localVersion: ${JSON.stringify(item.version)}`,
  ]
  const lines: string[] = [
    // loadShareSync（2026-10-03 语义补修）：与异步 loadShare 同一选择器（全注册版本）
    // 与 strictVersion 语义（冲突抛 MFU-003 不吞）、resolveShare 快照/同步决策参与；
    // 旧形态 getLoadedShare 的 readyOnly 过滤会把「已注册未加载」的本地版本排除出
    // 候选集，非 singleton（strictVersion 默认 true）下误判「无满足版本」而拒绝。
    `import { loadShareSync as __fulgurjs_ls, pinLoadedShare as __fulgurjs_pin, unwrapDefault as __fulgurjsU } from "virtual:fulgurjs-runtime";`,
    // importTarget 为 load 期解析出的绝对 id（proxy 虚拟 id 上下文里裸包名无法 node 解析）；
    // 兜底保留裸包名（与命名空间门面同语义，无 proxy 载体时可解析）
    `import * as __fulgurjs_local from ${JSON.stringify(importTarget ?? item.import)};`,
    `const __fulgurjs_r = __fulgurjs_ls(${JSON.stringify(item.shareKey)}, { ${opts.join(', ')} });`,
    // kind=local：空作用域/选中版本==本地版本——登记本地副本，使先于协商门面求值的
    // 垫片（jsx-runtime 拖入 provider chunk 的场景）与后续协商收敛到同一份实例，
    // 杜绝单例双实例。
    `if (__fulgurjs_r.kind !== 'ready') __fulgurjs_pin(${JSON.stringify(item.shareKey)}, { ${opts.join(', ')} }, ${JSON.stringify(item.version)}, __fulgurjs_local);`,
    `const __fulgurjs_m = __fulgurjs_r.kind === 'ready' ? __fulgurjs_r.value : __fulgurjs_local;`,
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

/** shared 项的运行时协商选项（loadShare/getLoadedShare/pinLoadedShare 共用形态） */
function shareOptsLines(item: NormalizedShared): string[] {
  return [
    `shareScope: ${JSON.stringify(item.shareScope)}`,
    `shareKey: ${JSON.stringify(item.shareKey)}`,
    ...(item.requiredVersion !== false ? [`requiredVersion: ${JSON.stringify(item.requiredVersion)}`] : []),
    ...(item.singleton ? ['singleton: true'] : []),
    ...(item.strictVersion ? ['strictVersion: true'] : []),
  ]
}

/**
 * 绑定门面（同步形态，rolldown/vite 8 构建专用；V8-SYNC-FACADE 2026-10-03）。
 *
 * 背景：TLA 形态（await loadShare）在 rolldown 下会把「await」传播进消费方模块的
 * 惰性初始化包装——应用代码/依赖库自身的循环依赖（如 ant-design-vue 的
 * useConfigInject ⇄ theme）随即变成两个 async init 互等，页面零报错死锁
 * （JeecgBoot vite8 生产实测，见 async-mark-repair.ts 与验收报告 §11.1-1）。
 * rollup（vite 5–7）的 chunk 级求值不会产生这种互等，TLA 形态保留。
 *
 * 协商走 runtime 的 loadShareSync（2026-10-03 语义补修：与异步 loadShare 同一选择器
 * 与 strictVersion 语义）：
 * - 选择基于**全部已注册版本**——已注册未加载的本地版本是合法选中对象，其物理实例
 *   就是本门面的本地 import（等价异步路径 await get() 的结果）；
 * - strictVersion 冲突（singleton 收养不满足版本 / 无满足版本）→ 抛 MFU-003，不吞；
 * - resolveShare 按契约参与：成功快照无条件复用；无快照时同步调用 hook（返回 Promise
 *   或选中未就绪的他人版本 → 抛 MFU-004+syncUnsupported，不静默忽略 hook）；
 * - kind=local（选中版本==本地版本，或非 strict 无满足版本走 fallback）→ pin 登记本地
 *   副本，作用域与后续协商收敛同一实例。
 */
export function genBindingFacadeSync(item: NormalizedShared, bindings: string[], importTarget: string): string {
  const opts = shareOptsLines(item)
  const optsWithLocal = [...opts, `localVersion: ${JSON.stringify(item.version)}`]
  const lines: string[] = [
    `import { loadShareSync as __fulgurjs_ls, pinLoadedShare as __fulgurjs_pin, unwrapDefault as __fulgurjsU } from "virtual:fulgurjs-runtime";`,
    `import * as __fulgurjs_local from ${JSON.stringify(importTarget)};`,
    `const __fulgurjs_r = __fulgurjs_ls(${JSON.stringify(item.shareKey)}, { ${optsWithLocal.join(', ')} });`,
    `const __fulgurjs_m = __fulgurjs_r.kind === 'ready' ? __fulgurjs_r.value : __fulgurjs_local;`,
    `if (__fulgurjs_r.kind !== 'ready') __fulgurjs_pin(${JSON.stringify(item.shareKey)}, { ${optsWithLocal.join(', ')} }, ${JSON.stringify(item.version)}, __fulgurjs_local);`,
  ]
  const seen = new Set<string>()
  for (const bRaw of bindings) {
    if (bRaw === 'default') continue
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

/**
 * 命名空间门面（同步形态，rolldown/vite 8 构建专用；V8-SYNC-FACADE）。
 * 协商语义与 genBindingFacadeSync 相同（loadShareSync：全注册版本选择 + strictVersion
 * 拒绝 + resolveShare 快照/同步决策参与），面向 `import * as ns from '<shared>'` 的
 * 命名空间消费。
 */
export function genSharedNsFacadeSync(item: NormalizedShared, exportNames: string[], importTarget: string): string {
  const opts = shareOptsLines(item)
  const optsWithLocal = [...opts, `localVersion: ${JSON.stringify(item.version)}`]
  const lines: string[] = [
    `import { loadShareSync as __fulgurjs_ls, pinLoadedShare as __fulgurjs_pin, unwrapDefault as __fulgurjsU } from "virtual:fulgurjs-runtime";`,
    `import * as __fulgurjs_local from ${JSON.stringify(importTarget)};`,
    `const __fulgurjs_r = __fulgurjs_ls(${JSON.stringify(item.shareKey)}, { ${optsWithLocal.join(', ')} });`,
    `const __fulgurjs_m = __fulgurjs_r.kind === 'ready' ? __fulgurjs_r.value : __fulgurjs_local;`,
    `if (__fulgurjs_r.kind !== 'ready') __fulgurjs_pin(${JSON.stringify(item.shareKey)}, { ${optsWithLocal.join(', ')} }, ${JSON.stringify(item.version)}, __fulgurjs_local);`,
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

/** 序列化精确消费条件，屏障与同步门面共用同一快照键。 */
function prepareSharesCode(options: NormalizedOptions): string {
  const requests = options.shared.map((item) => ({
    name: item.shareKey,
    opts: {
      shareScope: item.shareScope, shareKey: item.shareKey,
      requiredVersion: item.requiredVersion === false ? undefined : item.requiredVersion,
      singleton: item.singleton, strictVersion: item.strictVersion,
      localVersion: item.version,
    },
  }))
  return `await __fulgurjs_prepare(${JSON.stringify(requests)});`
}

/** HTML 入口屏障：应用保持动态边界，协商的 await 不进入消费方循环依赖。 */
export function genAsyncBootstrap(options: NormalizedOptions, entry: string): string {
  return [
    genInitModule(options, 'build'),
    'import { prepareShares as __fulgurjs_prepare } from "virtual:fulgurjs-runtime";',
    prepareSharesCode(options),
    `await import(${JSON.stringify(entry)});`,
  ].join('\n')
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
 * dev react-refresh 单例 shim（D3 跨源 Fast Refresh 修复）。
 *
 * 背景：宿主页消费远程 dev 模块时，远程组件链 import 的是远程 origin 的 /@react-refresh——
 * react-refresh 运行时的 helpersByRendererID / pending 队列是**模块私有状态**，
 * 第二副本里 performReactRefresh 遍历的是自己的空 helpers 表（宿主 renderer 注册在
 * 宿主副本上）→ 更新被 accept 后刷新静默空转（实测复现：WS update 到达、
 * "hot updated" 日志出现、DOM 不更新）。
 *
 * 修复：全页共享单一 react-refresh 实例。宿主 index.html 在 plugin-react preamble 之后
 * 注入发布脚本（globalThis.__FULGURJS_REACT_REFRESH__ = 宿主副本，helpers 已注册）；
 * 远程组件的 react-refresh 导入被改写到本 shim，shim 优先委托页面级单例；
 * standalone 远程页无发布脚本时回退本 origin 的 /@react-refresh 并自发布，行为不变。
 * 仅 dev serve 生效；prod 不含任何 react-refresh 引用。
 */
export const REACT_REFRESH_SHIM_URL = '/@fulgurjs-react-refresh'
export const REACT_REFRESH_GLOBAL_KEY = '__FULGURJS_REACT_REFRESH__'

export function genReactRefreshShim(): string {
  const g = `(globalThis).${REACT_REFRESH_GLOBAL_KEY}`
  return [
    `let __fulgurjs_rr = ${g};`,
    // 5.4.2 修复（多远程宿主）：宿主页的发布脚本可能指向非 React 远程（错源静默失败），
    // 且其兜底标志可能尚未就绪。shim 是 React 模块的必经入口，在此自举 preamble——
    // 先补 $RefreshReg$/$RefreshSig$ 与标志（plugin-react 4/5 硬检查），再委托真身。
    `if (!window.__vite_plugin_react_preamble_installed__) {`,
    `  window.$RefreshReg$ ??= () => {};`,
    `  window.$RefreshSig$ ??= (type) => type;`,
    `  window.__vite_plugin_react_preamble_installed__ = true;`,
    `}`,
    `if (!__fulgurjs_rr) {`,
    `  __fulgurjs_rr = await import("/@react-refresh");`,
    `  try { __fulgurjs_rr.default?.injectIntoGlobalHook?.(window); } catch {}`,
    `  ${g} = __fulgurjs_rr;`,
    `}`,
    `export const register = __fulgurjs_rr.register;`,
    `export const createSignatureFunctionForTransform = __fulgurjs_rr.createSignatureFunctionForTransform;`,
    `export const registerExportsForReactRefresh = __fulgurjs_rr.registerExportsForReactRefresh;`,
    `export const validateRefreshBoundaryAndEnqueueUpdate = __fulgurjs_rr.validateRefreshBoundaryAndEnqueueUpdate;`,
    // plugin-react ≥5 的转换产物经 getRefreshReg(文件路径) 取每文件注册器——必须转发，
    // 缺失时宿主自身 JSX 文件报 "RefreshRuntime.getRefreshReg is not a function"（桥接轮实测）
    `export const getRefreshReg = __fulgurjs_rr.getRefreshReg;`,
    `export const __hmr_import = __fulgurjs_rr.__hmr_import;`,
    `export default __fulgurjs_rr.default ?? { injectIntoGlobalHook: __fulgurjs_rr.injectIntoGlobalHook };`,
    ``,
  ].join('\n')
}

/** dev 宿主 index.html 的 react-refresh 发布脚本（在 plugin-react preamble 之后注入执行） */
export function genReactRefreshPublisherScript(): string {
  return (
    `<script type="module">import * as __fulgurjs_rr from "/@react-refresh";` +
    `(globalThis).${REACT_REFRESH_GLOBAL_KEY} ??= __fulgurjs_rr;</script>`
  )
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
import { prepareShares as __fulgurjs_prepare } from ${JSON.stringify(`${b}@id/virtual:fulgurjs-runtime`)};
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
  ${prepareSharesCode(options)}
  return loader();
}
`
}

/**
 * prod remoteEntry 重试穿透 helper（D04 修正：失败驱动，不再按调用次数 cache-bust）。
 * per-URL promise 状态机：s.n 是当前重试代次（0=原始 URL），s.p 是当前代次 URL 的
 * in-flight 或已定型 Promise。
 * - 成功 → s.p 保持 resolved：后续调用直接复用同一 Promise，模块单实例、零额外请求、
 *   身份严格保持（两个 expose 别名同 chunk 同样经 s.p 去重）；
 * - 失败 → s.p 置空、s.n 递增一次：下一次调用用 fulgurjs_retry=N 新 URL 穿透浏览器
 *   失败缓存。并发调用共享同一 Promise，拒绝处理器每代次只执行一次——并发失败只推进
 *   一代，不会互相覆盖出多个代次 URL（否则不同代次 URL 各自求值会造成模块实例分裂）。
 */
export function genProdRetryHelper(): string {
  return [
    'var __fgS={};',
    'var __fgR=function(u){var s=__fgS[u]||(__fgS[u]={n:0,p:null});',
    'if(!s.p){var url=s.n===0?u:u+(u.indexOf("?")>-1?"&":"?")+"fulgurjs_retry="+s.n;',
    's.p=import(url).then(function(m){return m},function(e){s.p=null;s.n++;throw e});}',
    'return s.p};',
  ].join('')
}

/**
 * dev expose loader 代码：主路径是**真正的字面量** dynamic import——importAnalysis 会把它
 * 重写为与远程内部静态 import 完全一致的 URL 形态（同 URL = 同模块条目；Vue 侧 SharedState
 * 跨端同实例的既有契约）。拼接表达式会被 vite 包成 __vite__injectQuery(..., 'import') 产生
 * `?import` 变体 URL，与内部裸 URL 形成双实例（React Context 跨端共享实测回归），不可用。
 * 失败重试分支用 /* @vite-ignore *\/ 运行时拼接 fulgurjs_retry=<n>：浏览器 module map 缓存
 * import 失败（同 URL 再 import 直接拒绝、零网络请求），必须变更 URL 才能穿透到网络层
 * （与 runtime importEntry 的 entryFailCounts 同款语义）。
 */
function exposeLoaderCode(devUrl: string): string {
  return [
    `(() => { let __fg_n = 0; const __fg_u = ${JSON.stringify(devUrl)}; return () => __fg_n === 0`,
    `  ? import(${JSON.stringify(devUrl)}).catch((e) => { __fg_n = 1; throw e })`,
    `  : import(/* @vite-ignore */ __fg_u + '?fulgurjs_retry=' + (__fg_n++)); })()`,
  ].join('\n')
}

/** dev provides 虚拟模块（走 vite 转换管线，dev URL 会被 importAnalysis 正确补 base/重写） */
export function genDevProvides(options: NormalizedOptions): string {
  const exposes: string[] = []
  for (const e of options.exposes) {
    // 根相对 URL：'/src/x.vue'，importAnalysis 负责解析与补 base
    const devUrl = `/${e.import.replace(/^\.?\//, '')}`
    exposes.push(
      `  ${JSON.stringify(e.name)}: ${exposeLoaderCode(devUrl)},`,
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
    // 字面量 import（rollup 静态分析拆 chunk / 重写产物路径）；失败重试穿透由 index.ts
    // generateBundle 的产物后处理（__fgR 包装）注入——生成期动态拼接会破坏 rollup 静态分析
    exposes.push(`  ${JSON.stringify(e.name)}: () => import(${JSON.stringify(abs)}),`)
  }
  const provides = providesRecords(options).map(
    (p) =>
      `  { shareScope: ${JSON.stringify(p.shareScope)}, name: ${JSON.stringify(p.name)}, version: ${JSON.stringify(p.version)}, eager: ${p.eager}, get: () => import("virtual:fulgurjs-shared:${p.name}") },`,
  )
  const remoteLines = registerRemotesLines(options, 'build')
  return [
    'import { prepareShares as __fulgurjs_prepare } from "virtual:fulgurjs-runtime";',
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
    `  ${prepareSharesCode(options)}`,
    `  return loader();`,
    `}`,
    '',
  ].join('\n')
}

/**
 * 开发态 expose 的内部代理门面。应用代码仍写物理入口（/runtime 或 /react），transform 后指向此模块。
 * 适配器接收代理 loadRemote（页面级单例），不导入第二份内核。
 * framework 决定接入的适配层：vue → remoteComponent/createHostPages/defineBridgeApp（Vue 子应用桥接），
 * react → remoteComponent/useLoadRemote/RemoteErrorBoundary/createReactHostPages/defineBridgeApp。
 */
export function genApiFacade(framework: 'vue' | 'react' = 'vue'): string {
  const head = [
    'export {',
    '  loadRemote, loadShare, preloadRemote, getContainer,',
    '  registerRemote, registerRemotes, registerShare, initSharing, registerPlugins,',
    '  parseSpec, getRuntime, shareScopeMap, unwrapDefault, version,',
    '} from "virtual:fulgurjs-runtime-proxy";',
    "export { provideAppContext, getAppContext, requireAppContext, clearAppContext } from '@fulgurjs/federation/internal/context.js';",
    "export { definePages, validatePages } from '@fulgurjs/federation/internal/pages.js';",
    "import { loadRemote as __fulgurjs_loadRemote } from 'virtual:fulgurjs-runtime-proxy';",
  ]
  const vueBody = [
    "import { createRemoteComponent, createHostPages as __fulgurjs_chp } from '@fulgurjs/federation/internal/vue-adapter.js';",
    "import { defineBridgeApp } from '@fulgurjs/federation/internal/bridge-app-vue.js';",
    'export const remoteComponent = createRemoteComponent(__fulgurjs_loadRemote);',
    'export const createHostPages = (options) => __fulgurjs_chp(options, __fulgurjs_loadRemote);',
    'export { defineBridgeApp };',
  ]
  const reactBody = [
    "import { createRemoteComponent, createUseLoadRemote, RemoteErrorBoundary, createReactHostPages as __fulgurjs_rhp } from '@fulgurjs/federation/internal/react-adapter.js';",
    "import { defineBridgeApp } from '@fulgurjs/federation/internal/bridge-app-react.js';",
    'export const remoteComponent = createRemoteComponent(__fulgurjs_loadRemote);',
    'export const useLoadRemote = createUseLoadRemote(__fulgurjs_loadRemote);',
    'export { RemoteErrorBoundary };',
    'export const createReactHostPages = (options) => __fulgurjs_rhp(options, __fulgurjs_loadRemote);',
    'export { defineBridgeApp };',
  ]
  return [...head, ...(framework === 'react' ? reactBody : vueBody), ''].join('\n')
}

/**
 * 开发态桥接宿主门面（/bridge、/bridge/vue、/bridge/react 的 expose 目标专用——
 * 宿主页非 expose 目标时导入保持原 specifier，直接消费 node_modules 的 dist 壳）。
 * framework 决定绑定哪个宿主适配器；聚合入口绑定两个（加载代价见 §3.1，推荐分离入口）。
 */
export function genBridgeFacade(framework: 'vue' | 'react' | 'both' = 'both'): string {
  const head = [
    "export { provideAppContext, getAppContext, requireAppContext, clearAppContext } from '@fulgurjs/federation/internal/context.js';",
    "import { loadRemote as __fulgurjs_loadRemote } from 'virtual:fulgurjs-runtime-proxy';",
  ]
  const vueBody = [
    "import { createVueBridgeApp as __fulgurjs_cvb } from '@fulgurjs/federation/internal/bridge-host-vue.js';",
    'export const createVueBridgeApp = __fulgurjs_cvb(__fulgurjs_loadRemote);',
  ]
  const reactBody = [
    "import { createReactBridgeApp as __fulgurjs_crb } from '@fulgurjs/federation/internal/bridge-host-react.js';",
    'export const createReactBridgeApp = __fulgurjs_crb(__fulgurjs_loadRemote);',
  ]
  const body = framework === 'vue' ? vueBody : framework === 'react' ? reactBody : [...vueBody, ...reactBody]
  return [...head, ...body, ''].join('\n')
}

/** dev manifest（remote 端中间件动态返回；契约见 manifest.ts，消费端经 parseManifest 校验） */
export function genDevManifest(options: NormalizedOptions, base: string): DevFederationManifest {
  const b = base.endsWith('/') ? base : `${base}/`
  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    id: options.name,
    name: options.name,
    // DEV-006 比对本插件版本（0.5.0 更名遗留：旧键 pkgDependencies['fulgurjs'] 永不命中，恒 0.0.0 误报版本不一致）
    version: options.pluginVersion,
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
