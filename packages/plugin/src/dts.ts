/**
 * dev 类型直连：host 的 dev server 启动后，拉取各 remote 的 dev manifest，
 * 为 exposes 生成 declare module 声明，映射到 remote 本机源码（同机联调时获得源码级补全）。
 * remote 未提供可访问源码时生成 any 声明并提示。
 */
import fs from 'node:fs'
import path from 'node:path'
import type { ViteDevServer } from 'vite'
import type { NormalizedOptions } from './options'
import { parseManifest, type DevFederationManifest } from './manifest'

async function fetchManifest(devEntry: string, origin: string, attempts = 30, delayMs = 2000): Promise<DevFederationManifest | null> {
  let manifestUrl: URL
  try {
    const u = new URL(devEntry, origin)
    // 容器入口 @fulgurjs-entry.js → 对应 manifest 端点 @fulgurjs-manifest.json
    u.pathname = u.pathname.replace('@fulgurjs-entry.js', '@fulgurjs-manifest.json')
    manifestUrl = u
  } catch {
    return null
  }
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(manifestUrl, { signal: AbortSignal.timeout(3000) })
      if (res.ok) {
        // WP4：manifest 按契约模块校验（缺 schemaVersion 按 v1 兼容；坏形状/未知版本拒绝消费）
        const parsed = parseManifest(await res.json())
        if (parsed.unsupportedVersion) {
          console.warn(
            `[fulgurjs] 类型生成：远程 manifest 的协议版本为 ${parsed.unsupportedVersion}，当前仅支持版本 1；` +
              `已跳过类型映射。请对齐宿主与远程的 @fulgurjs/federation 版本。`,
          )
          return null
        }
        if (parsed.issues.length > 0) {
          console.warn(
            `[fulgurjs] 类型生成：远程 manifest 契约校验失败（${manifestUrl.href}）：` +
              parsed.issues.map((x) => `${x.field}: ${x.message}`).join('；') +
              `。类型映射跳过。`,
          )
          return null
        }
        // fsRoot 是 dev-only 可选字段：缺失（devFsRoot:false 或旧版本）由 generateDevTypes
        // 给出明确的降级提示，这里不做契约拒绝
        return parsed.manifest as DevFederationManifest
      }
    } catch {
      // remote 可能尚未启动，静默重试
    }
    await new Promise((r) => setTimeout(r, delayMs))
  }
  return null
}

function sourceHasDefaultExport(file: string): boolean {
  try {
    const text = fs.readFileSync(file, 'utf8')
    return /export\s+default\b/.test(text) || /export\s*\{[^}]*\bdefault\b[^}]*\}/.test(text)
  } catch {
    return false
  }
}

/**
 * 源码 re-export 的导入路径：非 .vue 一律去扩展名——TS 默认禁止 `.ts` 后缀导入
 * （allowImportingTsExtensions 才行），带后缀的 `export * from 'x.ts'` 在用户
 * skipLibCheck 下静默解析失败 → 模块类型为空（回归：SharedState 类型直连失效）。
 * .vue 保留扩展名（SFC 必须带后缀才能解析）。
 */
export function sourceImportPath(rel: string): string {
  return rel.startsWith('.') ? rel : `./${rel}`
}

export function stripTsExtension(importPath: string): string {
  return importPath.replace(/\.(mts|cts|ts|tsx)$/, '')
}

/**
 * 枚举 TS 源文件的顶层具名导出（正则面，够声明生成用）。
 * 环境模块（declare module）里的 `export *` 不转发具名导出（TS 实测限制，
 * 回归：SharedState 类型直连为空）——必须显式 `export { names } from`。
 */
export function extractTsExportNames(text: string): string[] {
  const names = new Set<string>()
  const push = (n: string | undefined) => {
    if (n && /^[A-Za-z_$][\w$]*$/.test(n) && n !== 'default') names.add(n)
  }
  for (const m of text.matchAll(/export\s+(?:declare\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/g)) push(m[1])
  for (const m of text.matchAll(/export\s+(?:declare\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/g)) push(m[1])
  for (const m of text.matchAll(/export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) push(m[1])
  for (const m of text.matchAll(/export\s+(?:interface|type|enum)\s+([A-Za-z_$][\w$]*)/g)) push(m[1])
  for (const m of text.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(',')) {
      const seg = part.trim()
      if (!seg) continue
      const typeOnly = /^type\s/.test(seg)
      const base = typeOnly ? seg.replace(/^type\s+/, '') : seg
      const asMatch = base.match(/^([\w$]+)\s+as\s+([\w$]+)$/)
      // export { a as b } → 导出名是别名 b；无别名 → 本名；default 不进具名列表
      if (asMatch) {
        if (asMatch[2] !== 'default') names.add(asMatch[2])
      } else if (base !== 'default') {
        names.add(base)
      }
    }
  }
  return [...names]
}

/**
 * 解析 dts 输出目录：默认统一进 `src/fulgurjs/types`（联邦所有产物集中一个文件夹，
 * src 布局项目 tsconfig include "src/**" 天然覆盖=零配置）；无 src 布局回退根目录
 * `.fulgurjs/types`。`dts: { dir }` 显式覆盖；`dts: false` 返回空串（不生成）。
 * ⚠️ 插件只写 types/ 子目录，src/fulgurjs/exposes/ 等用户代码绝不触碰。
 */
export function resolveDtsDir(dtsOpt: boolean | { dir?: string; mode?: 'source' | 'shim' } | undefined, rootHasSrc: boolean): string {
  if (dtsOpt === false) return ''
  return (typeof dtsOpt === 'object' ? dtsOpt.dir : undefined) ?? (rootHasSrc ? 'src/fulgurjs/types' : '.fulgurjs/types')
}

/** 解析 dts 形态：'source'（默认，跨工程源码直连=补全直达源码）/ 'shim'（宽松占位，IDE 全程干净） */
export function resolveDtsMode(dtsOpt: boolean | { dir?: string; mode?: 'source' | 'shim' } | undefined): 'source' | 'shim' {
  if (dtsOpt === false) return 'source'
  return (typeof dtsOpt === 'object' ? dtsOpt.mode : undefined) ?? 'source'
}

/**
 * shim 形态的单个模块声明块：只读源文件文本枚举导出名（不 re-export 源文件），
 * 生成宽松占位——IDE 不会跟进跨工程源文件，红波浪线根治；代价是无源码级补全/跳转。
 */
export function buildShimModule(abs: string, moduleSpecifier: string): string {
  // WP5：模块名统一合法 TS 字符串序列化（远程提供的 name 不直接拼进声明代码）
  const lines: string[] = [`declare module ${JSON.stringify(moduleSpecifier)} {`]
  if (abs.endsWith('.vue')) {
    lines.push(`  import type { DefineComponent } from 'vue'`)
    lines.push(`  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, any>`)
    lines.push(`  export default component`)
  } else {
    const text = fs.readFileSync(abs, 'utf8')
    for (const name of extractTsExportNames(text)) {
      lines.push(`  export const ${name}: any`)
    }
    if (sourceHasDefaultExport(abs)) {
      lines.push(`  const _default: any`)
      lines.push(`  export default _default`)
    }
    if (!fs.existsSync(abs)) {
      // 源文件不可读（理论上前置已过滤）：宽松 any 模块
      lines.push(`  export const __module: any`)
    }
  }
  lines.push(`}`)
  return lines.join('\n')
}

/** 无源码可读取时，以环境模块简写同时支持默认、具名和副作用导入。 */
function writeAnyModules(outDir: string, remoteKey: string, manifest: DevFederationManifest): void {
  const modules = manifest.exposes
    .filter((expose) => !manifest.setup || expose.name !== manifest.setup)
    .map((expose) => `declare module ${JSON.stringify(`${remoteKey}/${expose.name.replace(/^\.\//, '')}`)};`)
  const file = path.join(outDir, `${remoteKey}.d.ts`)
  if (modules.length === 0) {
    if (fs.existsSync(file)) fs.unlinkSync(file)
    return
  }
  // 覆盖旧源码映射，避免切换为跨机开发后仍引用过期的本机路径。
  fs.writeFileSync(file, ['// 自动生成：远程源码不可访问，模块导出降级为 any。', ...modules, ''].join('\n'))
}


/**
 * 宿主 tsconfig 是否已为 remote 配置 paths（精确轨开关）：compilerOptions.paths 中存在
 * 「<remoteKey>/*」或「<remoteKey>」键即视为已启用。tsconfig 含注释/尾逗号时 JSON.parse
 * 失败则宽松降级为文本匹配（paths 键形态足够特异）。
 */
function hostPathsCovers(root: string, remoteKey: string): boolean {
  // 扫描宿主全部 tsconfig*.json（主配置或任一子上下文配置了该 remote 的 paths 都算启用）
  let files: string[] = []
  try {
    files = fs.readdirSync(root).filter((f) => /^tsconfig[\w.-]*\.json$/i.test(f))
  } catch {
    return false
  }
  for (const f of files) {
    let text: string
    try {
      text = fs.readFileSync(path.join(root, f), 'utf8')
    } catch {
      continue
    }
    // 宽松文本匹配（tsconfig 常含注释/尾逗号，JSON.parse 可能失败）
    const exact = new RegExp(`"${remoteKey}"\\s*:`)
    const wildcard = new RegExp(`"${remoteKey}/\\*"\\s*:`)
    if (exact.test(text) || wildcard.test(text)) return true
    try {
      const cfg = JSON.parse(text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/,\s*([}\]])/g, '$1')) as {
        compilerOptions?: { paths?: Record<string, unknown> }
      }
      const paths = cfg.compilerOptions?.paths
      if (paths && (remoteKey in paths || `${remoteKey}/*` in paths)) return true
    } catch {
      /* 宽松匹配已尝试，继续下一份 */
    }
  }
  return false
}

export async function generateDevTypes(options: NormalizedOptions, server: ViteDevServer): Promise<void> {
  const dtsOpt = options.dts === undefined ? true : options.dts
  if (dtsOpt === false) return
  const mode = resolveDtsMode(dtsOpt)
  const dir = resolveDtsDir(dtsOpt, fs.existsSync(path.join(options.root, 'src')))
  const outDir = path.join(options.root, dir)
  fs.mkdirSync(outDir, { recursive: true })

  const origin = server.config?.server?.origin ?? server.resolvedUrls?.local[0] ??
    `${server.config?.server?.https ? 'https' : 'http'}://localhost:${server.config?.server?.port ?? 5173}`

  for (const remote of options.remotes) {
    if (!remote.devEntry || remote.promise) continue
    const manifest = await fetchManifest(remote.devEntry, origin)
    if (!manifest || !manifest.exposes) {
      console.warn(`[fulgurjs] 类型生成：远程应用 "${remote.key}" 的开发 manifest 不可用，已跳过类型映射。请检查远程开发服务和 manifest 地址。`)
      continue
    }
    const remoteRoot = manifest.fsRoot
    if (!remoteRoot) {
      console.warn(
        `[fulgurjs] 类型生成：远程应用 "${remote.key}" 的 manifest 未携带 fsRoot（可能关闭了 devFsRoot，或远程插件版本过旧）；` +
          `已生成 any 模块声明；不提供源码补全或跳转。同机联调请在远程启用 devFsRoot: true（默认值）并重启开发服务。`,
      )
      writeAnyModules(outDir, remote.key, manifest)
      continue
    }
    // WP5 路径边界：fsRoot 经 realpath 解析后再做包含判定——symlink 指向 root 外同样越界
    let realRoot: string
    try {
      realRoot = fs.realpathSync(remoteRoot)
    } catch {
      console.warn(
        `[fulgurjs] 类型生成：远程应用 "${remote.key}" 的 fsRoot 在本机不可访问，已生成 any 模块声明，不提供源码补全或跳转。请检查项目位置或关闭本机类型直连。`,
      )
      writeAnyModules(outDir, remote.key, manifest)
      continue
    }

    const lines: string[] = [
      `// 自动生成：fulgurjs-federation dev 类型直连（remote: ${remote.name}，mode: ${mode}）`,
      `// 重新生成：重启 host dev server`,
    ]
    // 双轨输出（5.1.0）：本文件是「零配置轨」的 ambient 声明；同名的 remote.d/ 目录是
    // 「精确轨」的转发模块（普通模块文件里的相对 re-export 合法）。TS 语言限制：ambient
    // declare module 内禁止相对 re-export（TS2439，用户工程常规 skipLibCheck 会把该错误
    // 静默吞掉使导出退 any），且模块文件不能声明新外部模块——精确类型只能经 tsconfig
    // paths 解析到转发模块获得（配置见 remote.d/ 内注释）。
    const preciseDir = path.join(outDir, `${remote.key}.d`)
    fs.rmSync(preciseDir, { recursive: true, force: true }) // 重启重建：移除已下线 expose 的残留转发文件
    fs.mkdirSync(preciseDir, { recursive: true })
    const preciseFiles: string[] = []
    let accepted = 0
    for (const expose of manifest.exposes ?? []) {
      // 内部 setup 生命周期入口不生成用户可导入的类型声明（manifest.setup 标识；
      // 用户不直接 loadRemote 该键，其文件也不属于公开 API 面）
      if (manifest.setup && expose.name === manifest.setup) continue
      const skipped = (reason: string) =>
        console.warn(`[fulgurjs] 类型生成：远程应用 "${remote.key}" 的暴露模块 ${JSON.stringify(expose.name)} 已跳过。原因：${reason}。请检查该模块在远程 manifest 中的源文件路径。`)
      // WP5：expose src 只接受相对路径——绝对路径 / 含 .. / 空路径一律拒绝（不可信 manifest 防线）
      const src = expose.src
      if (!src || typeof src !== 'string') {
        skipped('src 缺失')
        continue
      }
      if (src.startsWith('/') || /^[a-z]+:/i.test(src)) {
        skipped(`src 必须是相对路径，当前值为 ${JSON.stringify(src)}`)
        continue
      }
      if (src.split('/').includes('..')) {
        skipped(`src 不得包含 ..，当前值为 ${JSON.stringify(src)}`)
        continue
      }
      const abs = path.join(realRoot, src)
      // 越界判定在读取源码之前完成：realpath 解析 symlink 后 target 必须仍位于 realRoot 内
      let realAbs: string
      try {
        realAbs = fs.realpathSync(abs)
      } catch {
        skipped(`源文件不存在（${src}）`)
        continue
      }
      if (path.relative(realRoot, realAbs).startsWith('..')) {
        skipped(`解析结果越出 fsRoot（${src} → ${realAbs}）`)
        continue
      }
      if (!fs.existsSync(realAbs)) continue
      const rel = path.relative(outDir, realAbs).split(path.sep).join('/')
      const importPath = realAbs.endsWith('.vue') ? sourceImportPath(rel) : stripTsExtension(sourceImportPath(rel))
      // 精确轨转发文件的相对路径按其自身位置计算（expose 含目录层级时转发文件在子目录）
      const preciseFileDir = path.join(outDir, `${remote.key}.d`, path.dirname(expose.name.replace(/^\.\//, '').split('/').map((seg) => seg.replace(/[^A-Za-z0-9_-]/g, '_')).join('/')))
      const relPrecise = path.relative(preciseFileDir, realAbs).split(path.sep).join('/')
      const importPathPrecise = realAbs.endsWith('.vue') ? sourceImportPath(relPrecise) : stripTsExtension(sourceImportPath(relPrecise))
      // WP5：模块名统一合法 TS 字符串序列化（远程提供的 name 不直接拼进声明代码）
      const moduleSpecifier = `${remote.key}/${expose.name.replace(/^\.\//, '')}` // 'remote-a' + './Button' → 'remote-a/Button'
      const moduleLiteral = JSON.stringify(moduleSpecifier)
      const importLiteral = JSON.stringify(importPath)
      lines.push('')
      if (mode === 'shim') {
        lines.push(buildShimModule(realAbs, moduleSpecifier))
        accepted++
        continue
      }
      if (realAbs.endsWith('.vue')) {
        // .vue：宽松形态（宿主 tsc 解析 .vue import 需要自备 shim，不能假设）
        lines.push(`declare module ${moduleLiteral} {`)
        lines.push(`  import type { DefineComponent } from 'vue'`)
        lines.push(`  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>`)
        lines.push(`  export default component`)
        lines.push(`}`)
        // 精确轨：同样宽松（.vue 的精确类型依赖宿主 vue-tsc/shim，非插件可解）。
        // 子路径保留 expose 的目录层级（paths 通配 $1 直接命中）
        const subPath = expose.name.replace(/^\.\//, '').split('/').map((seg) => seg.replace(/[^A-Za-z0-9_-]/g, '_')).join('/')
        const preciseFile = path.join(preciseDir, `${subPath}.ts`)
        fs.mkdirSync(path.dirname(preciseFile), { recursive: true })
        preciseFiles.push(`${subPath}.ts`)
        fs.writeFileSync(
          preciseFile,
          [
            `// 自动生成（精确轨）：.vue expose 为宽松形态（精确类型需宿主 vue-tsc/shim）`,
            `import type { DefineComponent } from 'vue'`,
            `declare const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>`,
            `export default component`,
            ``,
          ].join('\n'),
        )
      } else {
        // .ts/.tsx：零配置轨用带体 ambient（default/具名导出/类型均为 any——可解析）。
        // 不能用简写 `declare module "x";`：简写会拦截同名 paths 解析，精确轨失效
        // （实测 paths 已命中转发文件仍被简写 shadow 成 any）。带体 ambient 不参与
        // resolution 竞争，配置 paths 后转发文件（源码级类型）自然接管。TS 语言限制：
        // 声明文件一旦有顶层 import 即成模块文件、其 declare module 失去全局性（TS2307）；
        // ambient 体内又禁止相对 re-export（TS2439，skipLibCheck 下静默退 any）、嵌套
        // import 的类型不流动——零配置下不存在合法的精确通路，源码级类型经精确轨
        // （remote.d/ 转发模块 + tsconfig paths）获得，见 _paths.d.ts 的启用说明。
        const srcText = fs.readFileSync(realAbs, 'utf8')
        const names = extractTsExportNames(srcText)
        const hasDefault = sourceHasDefaultExport(realAbs)
        lines.push(`declare module ${moduleLiteral} {`)
        if (hasDefault) lines.push(`  const __fg_default: any`, `  export default __fg_default`)
        for (const n of names) lines.push(`  export const ${n}: any`, `  export type ${n} = any`)
        if (!hasDefault && names.length === 0) lines.push(`  // 纯副作用模块（无可枚举导出）`)
        lines.push(`}`)
        // 精确轨：转发模块（普通文件相对 re-export 合法；paths 命中后经此拿到源码级类型）。
        // 子路径保留 expose 的目录层级（paths 通配 * 直接命中）
        const subPath = expose.name.replace(/^\.\//, '').split('/').map((seg) => seg.replace(/[^A-Za-z0-9_-]/g, '_')).join('/')
        // 普通模块（非 ambient）：export * 完整转发类型与值（含 interface/type）。
        // 后缀用 .ts（非 .d.ts）：.d.ts 引用 .tsx 实现文件时 TS 会把导出折叠成
        // namespace（TS2709 无法用作类型），普通源文件参与编译则类型从源符号流动
        const preciseFile = path.join(preciseDir, `${subPath}.ts`)
        fs.mkdirSync(path.dirname(preciseFile), { recursive: true })
        const fwd: string[] = [`// 自动生成（精确轨）：经 tsconfig paths 解析到本文件后获得源码级类型`]
        const preciseImportLiteral = JSON.stringify(importPathPrecise)
        if (names.length > 0 || hasDefault) fwd.push(`export * from ${preciseImportLiteral}`)
        if (hasDefault) fwd.push(`export { default } from ${preciseImportLiteral}`)
        if (fwd.length === 1) fwd.push(`import ${preciseImportLiteral}`) // 副作用模块
        fwd.push('')
        preciseFiles.push(`${subPath}.ts`)
        fs.writeFileSync(preciseFile, fwd.join('\n'))
      }
      accepted++
    }
    // WP5：异常 remote 只跳过自身（continue 已处理）；此处仅在有产出时落盘，杜绝半截声明
    if (accepted > 0) {
      // 智能双轨：宿主 tsconfig 已为该 remote 配置 paths（精确轨已启用）时不写同名
      // ambient——任何同名 ambient（含带体）都会 shadow paths 命中的转发文件（实测：
      // paths 解析成功但类型仍被 ambient 拦成 any），二者的切换开关就是 paths 配置本身
      const pathsEnabled = hostPathsCovers(options.root, remote.key)
      if (pathsEnabled) {
        if (fs.existsSync(path.join(outDir, `${remote.key}.d.ts`))) fs.unlinkSync(path.join(outDir, `${remote.key}.d.ts`))
        console.log(
          `[fulgurjs] 类型生成：检测到宿主 tsconfig 已配置 "${remote.key}/*" 的 paths——精确轨生效，跳过同名 ambient 声明（避免 shadow 转发模块）。`,
        )
      } else {
        fs.writeFileSync(path.join(outDir, `${remote.key}.d.ts`), `${lines.join('\n')}\n`)
      }
      // 精确轨 paths 说明（README 同步）：include 目录不变，加一段 paths 即升级精确类型
      fs.writeFileSync(
        path.join(preciseDir, '_paths.d.ts'),
        [
          `// 精确轨启用方法（把下面片段合入宿主 tsconfig 的 compilerOptions；baseUrl 指向本 tsconfig 所在目录）：`,
          `//   "paths": { "${remote.key}/*": ["${dir}/${remote.key}.d/*"] }`,
          `// 说明：零配置轨（${remote.key}.d.ts 的 ambient 声明）可解析但导出为宽松类型；`,
          `// 配置 paths 后同形态导入解析到本目录的转发模块，获得远程源码级类型精度。`,
          ``,
        ].join('\n'),
      )
    }
    console.log(
      `[fulgurjs] 类型生成：已生成 ${dir}/${remote.key}.d.ts（已收录 ${accepted}/${manifest.exposes?.length ?? 0} 个暴露模块，模式 ${mode}）。` +
        `请确保 tsconfig 的 include 包含 "${dir}"，以获得类型补全。`,
    )
  }
}
