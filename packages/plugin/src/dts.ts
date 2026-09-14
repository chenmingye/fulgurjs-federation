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
    // 容器入口 @unifed-entry.js → 对应 manifest 端点 @unifed-manifest.json
    u.pathname = u.pathname.replace('@unifed-entry.js', '@unifed-manifest.json')
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

export async function generateDevTypes(options: NormalizedOptions, _server: ViteDevServer): Promise<void> {
  const dtsOpt = options.dts === undefined ? true : options.dts
  if (dtsOpt === false) return
  const defaultDir = fs.existsSync(path.join(options.root, 'src')) ? 'src/unifed-types' : 'unifed-types'
  const dir = typeof dtsOpt === 'object' ? (dtsOpt.dir ?? defaultDir) : defaultDir
  const outDir = path.join(options.root, dir)
  fs.mkdirSync(outDir, { recursive: true })

  for (const remote of options.remotes) {
    if (!remote.devEntry || remote.promise) continue
    const manifest = await fetchManifest(remote.devEntry)
    if (!manifest || !manifest.exposes) {
      console.warn(`[unifed] dts: remote "${remote.key}" dev manifest unavailable; type mapping skipped.`)
      continue
    }
    const remoteRoot = manifest.fsRoot
    if (!remoteRoot || !fs.existsSync(remoteRoot)) {
      console.warn(
        `[unifed] dts: remote "${remote.key}" is not on this machine; type mapping skipped (module types fall back to any).`,
      )
      continue
    }

    const lines: string[] = [
      `// 自动生成：vite-plugin-unifed dev 类型直连（remote: ${remote.name}）`,
      `// 重新生成：重启 host dev server`,
    ]
    for (const expose of manifest.exposes ?? []) {
      const abs = path.join(remoteRoot, expose.src.replace(/^\//, ''))
      if (!fs.existsSync(abs)) continue
      const rel = path.relative(outDir, abs).split(path.sep).join('/')
      const importPath = rel.startsWith('.') ? rel : `./${rel}`
      const moduleSpecifier = `${remote.key}/${expose.name.replace(/^\.\//, '')}` // 'remote-a' + './Button' → 'remote-a/Button'
      lines.push('')
      if (abs.endsWith('.vue')) {
        lines.push(`declare module '${moduleSpecifier}' {`)
        lines.push(`  import type { DefineComponent } from 'vue'`)
        lines.push(`  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>`)
        lines.push(`  export default component`)
        lines.push(`  export * from '${importPath}'`)
        lines.push(`}`)
      } else {
        lines.push(`declare module '${moduleSpecifier}' {`)
        lines.push(`  export * from '${importPath}'`)
        if (sourceHasDefaultExport(abs)) lines.push(`  export { default } from '${importPath}'`)
        lines.push(`}`)
      }
    }
    fs.writeFileSync(path.join(outDir, `${remote.key}.d.ts`), `${lines.join('\n')}\n`)
    console.log(
      `[unifed] dts: generated ${dir}/${remote.key}.d.ts (${manifest.exposes?.length ?? 0} exposes). ` +
        `确保 tsconfig include 包含 "${dir}" 以获得源码级类型补全。`,
    )
  }
}
