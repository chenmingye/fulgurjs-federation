/**
 * dev 类型直连：host 的 dev server 启动后，拉取各 remote 的 dev manifest，
 * 为 exposes 生成 declare module 声明，映射到 remote 本机源码（同机联调时获得源码级补全）。
 * remote 不在本机时跳过并提示。
 */
import fs from 'node:fs'
import path from 'node:path'
import type { ViteDevServer } from 'vite'
import type { NormalizedOptions } from './options'

interface DevManifest {
  name: string
  fsRoot?: string
  exposes?: Array<{ name: string; src: string }>
}

async function fetchManifest(devEntry: string, attempts = 30, delayMs = 2000): Promise<DevManifest | null> {
  let manifestUrl: URL
  try {
    const u = new URL(devEntry)
    // 容器入口 @fulgurjs-entry.js → 对应 manifest 端点 @fulgurjs-manifest.json
    u.pathname = u.pathname.replace('@fulgurjs-entry.js', '@fulgurjs-manifest.json')
    manifestUrl = u
  } catch {
    return null
  }
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(manifestUrl, { signal: AbortSignal.timeout(3000) })
      if (res.ok) return (await res.json()) as DevManifest
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
 * 运行时虚拟模块类型垫片：写入宿主类型目录（默认 .fulgurjs/types），被 tsconfig include 后
 * 'virtual:fulgurjs-runtime' 的导入自动获得类型（无需手工往 types 数组加 client 子路径）。
 * 用副作用 import 加载包内 client.d.ts 的 declare module 声明——不用 /// <reference types>：
 * 该指令解析不了 npm 包子路径（实验坐实，import 式全部场景可用）。
 */
export function genRuntimeTypesShim(): string {
  return [
    '// 自动生成：fulgurjs-federation 运行时类型（virtual:fulgurjs-runtime）',
    "import '@fulgurjs/federation/client'",
    'export {}',
    '',
  ].join('\n')
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
  const lines: string[] = [`declare module '${moduleSpecifier}' {`]
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

export async function generateDevTypes(options: NormalizedOptions, _server: ViteDevServer): Promise<void> {
  const dtsOpt = options.dts === undefined ? true : options.dts
  if (dtsOpt === false) return
  const mode = resolveDtsMode(dtsOpt)
  const dir = resolveDtsDir(dtsOpt, fs.existsSync(path.join(options.root, 'src')))
  const outDir = path.join(options.root, dir)
  fs.mkdirSync(outDir, { recursive: true })

  fs.writeFileSync(path.join(outDir, 'fulgurjs-runtime.d.ts'), genRuntimeTypesShim())
  for (const remote of options.remotes) {
    if (!remote.devEntry || remote.promise) continue
    const manifest = await fetchManifest(remote.devEntry)
    if (!manifest || !manifest.exposes) {
      console.warn(`[fulgurjs] dts: remote "${remote.key}" dev manifest unavailable; type mapping skipped.`)
      continue
    }
    const remoteRoot = manifest.fsRoot
    if (!remoteRoot || !fs.existsSync(remoteRoot)) {
      console.warn(
        `[fulgurjs] dts: remote "${remote.key}" is not on this machine; type mapping skipped (module types fall back to any).`,
      )
      continue
    }

    const lines: string[] = [
      `// 自动生成：fulgurjs-federation dev 类型直连（remote: ${remote.name}，mode: ${mode}）`,
      `// 重新生成：重启 host dev server`,
    ]
    for (const expose of manifest.exposes ?? []) {
      const abs = path.join(remoteRoot, expose.src.replace(/^\//, ''))
      if (!fs.existsSync(abs)) continue
      const rel = path.relative(outDir, abs).split(path.sep).join('/')
      const importPath = abs.endsWith('.vue') ? sourceImportPath(rel) : stripTsExtension(sourceImportPath(rel))
      const moduleSpecifier = `${remote.key}/${expose.name.replace(/^\.\//, '')}` // 'remote-a' + './Button' → 'remote-a/Button'
      lines.push('')
      if (mode === 'shim') {
        lines.push(buildShimModule(abs, moduleSpecifier))
        continue
      }
      if (abs.endsWith('.vue')) {
        lines.push(`declare module '${moduleSpecifier}' {`)
        lines.push(`  import type { DefineComponent } from 'vue'`)
        lines.push(`  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>`)
        lines.push(`  export default component`)
        lines.push(`  export * from '${importPath}'`)
        lines.push(`}`)
      } else {
        lines.push(`declare module '${moduleSpecifier}' {`)
        const names = extractTsExportNames(fs.readFileSync(abs, 'utf8'))
        if (names.length > 0) {
          lines.push(`  export { ${names.join(', ')} } from '${importPath}'`)
        } else {
          // 无具名导出可枚举：退回 export *（副作用导入至少可用）
          lines.push(`  export * from '${importPath}'`)
        }
        if (sourceHasDefaultExport(abs)) lines.push(`  export { default } from '${importPath}'`)
        lines.push(`}`)
      }
    }
    fs.writeFileSync(path.join(outDir, `${remote.key}.d.ts`), `${lines.join('\n')}\n`)
    console.log(
      `[fulgurjs] dts: generated ${dir}/${remote.key}.d.ts (${manifest.exposes?.length ?? 0} exposes, mode=${mode}). ` +
        `确保 tsconfig include 包含 "${dir}" 以获得类型补全。`,
    )
  }
}
