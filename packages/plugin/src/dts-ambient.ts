/**
 * 宿主侧 ambient 声明生成（6.5.0 远程类型自动生成）。
 *
 * 输入：类型 bundle（dts-shared 协议，宿主别名 alias）。
 * 输出两个文件（写入 <dtsDir>/<alias>/）：
 * - modules.d.ts：**global script**（无顶层 import/export）。每个 bundle 声明文件
 *   整体包进 `declare module '<名字>' { … }`：入口文件直接命名 `<alias>/<expose>`，
 *   内部文件命名 `<alias>/__internal/<路径>`；文件间相对说明符重写为这些非相对
 *   ambient 名（TS2439 只禁 ambient 体内**相对** re-export，非相对合法且类型完整
 *   流动——testbed 原型 A0 实证）。生成代码零相对导入，宿主 moduleResolution
 *   （bundler/NodeNext/…）不影响发现。
 * - registry.d.ts：**module** 文件（模块增强）。向包内静态共享声明
 *   '@fulgurjs/federation/internal/registry.js'（types/registry.d.ts）的 FgRemoteTypes
 *   注册 `'<alias>/<expose>': typeof import('<alias>/<expose>')`——三入口与运行时
 *   内核都引用同一份该声明（增强公开入口 /runtime 不生效：再导出会隔断合并，实测），
 *   loadRemote/remoteComponent/createXBridgeApp 从同一注册表获得入口类型
 *   （见 remote-types.ts 的分支冻结说明）。
 *
 * 为什么两个文件：global script 里的 `declare module '<包名>'` 是**声明**（会遮蔽
 * 真包），模块增强必须写在外部模块文件里才生效（增强文件必须含 import/export）。
 */
import type { DtsBundleIndex } from './dts-shared'
import { isSafeBundlePath } from './dts-shared'

export interface AmbientBundleInput {
  /** 宿主配置里该远程的键（宿主别名；同一远程在不同宿主可叫不同名字） */
  alias: string
  index: DtsBundleIndex
  /** 读取 bundle 文件内容（宿主从缓存/下载产物读） */
  readFile: (bundleRel: string) => string
  /** 提供方来源描述（写入文件头与 metadata，便于排查来源） */
  source: string
}

export interface AmbientBundleOutput {
  /** 相对 <dtsDir>/<alias>/ 的文件名 → 内容 */
  files: Map<string, string>
  /** 生成的公开入口模块名（'<alias>/<expose>'） */
  publicModules: string[]
  /** 生成时发现的 bundle 内容问题（不致命：跳过并如实标注） */
  warnings: string[]
}

const RUNTIME_TYPE_MODULE = '@fulgurjs/federation/internal/registry.js'

/**
 * bundle → ambient 声明。纯字符串/AST 级变换（不依赖 typescript 包：重写发生在
 * 括号配对的模块说明符字符串上，声明体原样保留——精度由提供方 emit 保证）。
 */
export function buildAmbientDeclarations(input: AmbientBundleInput): AmbientBundleOutput {
  const { alias, index, readFile, source } = input
  const warnings: string[] = []
  const fileRels = Object.keys(index.files).filter((f) => f !== 'index.json')

  // bundle 相对路径 → ambient 模块名（入口用公开名；内部用 __internal 命名；冲突加序号）
  const ambientOf = new Map<string, string>()
  const used = new Set<string>()
  for (const [expose, meta] of Object.entries(index.exposes)) {
    if (!isSafeBundlePath(meta.declaration)) continue
    const exposeName = expose.replace(/^\.\//, '')
    let name = `${alias}/${exposeName}`
    let n = 2
    while (used.has(name)) name = `${alias}/${exposeName}$${n++}`
    used.add(name)
    ambientOf.set(meta.declaration, name)
  }
  for (const rel of fileRels) {
    if (ambientOf.has(rel)) continue
    const internal = rel.replace(/^files\//, '').replace(/(\.vue)?\.d\.ts$/, '')
    let name = `${alias}/__internal/${internal}`
    let n = 2
    while (used.has(name)) name = `${alias}/__internal/${internal}$${n++}`
    used.add(name)
    ambientOf.set(rel, name)
  }

  const bodies: string[] = []
  const registryEntries: string[] = []
  for (const rel of fileRels) {
    const ambientName = ambientOf.get(rel)
    if (!ambientName) continue
    let text = readFile(rel)
    // 防线：声明内容不得携带本机绝对路径（提供方已拦截，宿主侧再校验一次）
    if (/(?:^|['"(=\s])\/(?:Users|home|private|tmp|var|opt|Applications)\//.test(text)) {
      warnings.push(`声明文件 ${rel} 含本机绝对路径，已跳过该文件（类型可能不完整，请检查提供方声明）。`)
      continue
    }
    // 相对说明符（import/export 语句与 import() 节点）→ 目标 ambient 名
    text = rewriteRelativeSpecifiers(text, rel, (target) => ambientOf.get(target) ?? null, warnings)
    text = stripAmbientModifiers(text)
    const indented = text
      .split('\n')
      .map((line) => (line.length ? `  ${line}` : line))
      .join('\n')
      bodies.push(`declare module ${JSON.stringify(ambientName)} {\n${indented.trimEnd()}\n}`)
  }
  for (const [expose, meta] of Object.entries(index.exposes)) {
    const ambientName = ambientOf.get(meta.declaration)
    if (!ambientName) continue
    registryEntries.push(`    ${JSON.stringify(ambientName)}: typeof import(${JSON.stringify(ambientName)})`)
    void expose
  }

  const header =
    `// 自动生成：fulgurjs-federation 远程类型（remote: ${alias}，来源: ${source}，revision: ${index.revision}）。\n` +
    `// 本文件由插件管理（dev 自动同步 / npx @fulgurjs/federation types），手动修改会被覆盖。\n` +
    `// 外部类型依赖（宿主需可解析）：${index.externals.length > 0 ? index.externals.join(', ') : '无'}。\n`

  const files = new Map<string, string>()
  files.set('modules.d.ts', `${header}${bodies.join('\n\n')}\n`)
  files.set(
    'registry.d.ts',
    [
      `// 自动生成：远程类型注册表（remote: ${alias}，revision: ${index.revision}）。`,
      `// 向插件共享注册表（internal/registry.js 的 FgRemoteTypes）登记本远程全部公开入口；`,
      `// loadRemote / remoteComponent / createVueBridgeApp / createReactBridgeApp 共享该注册表。`,
      `import '${RUNTIME_TYPE_MODULE}'`,
      ``,
      `declare module '${RUNTIME_TYPE_MODULE}' {`,
      `  interface FgRemoteTypes {`,
      ...registryEntries,
      `  }`,
      `}`,
      ``,
    ].join('\n'),
  )
  return { files, publicModules: [...ambientOf.values()].filter((n) => !n.includes('/__internal/')), warnings }
}

/**
 * 文本级相对说明符重写：匹配 import/export 语句的 from "…" / import "…" 模块说明符
 * 与 import('…') 类型节点。目标解析规则与提供方生成端一致：'x/y' → 'x/y.d.ts'、
 * 'x/y.vue' → 'x/y.vue.d.ts'（bundle 内说明符统一无 .d.ts 后缀）。
 * 说明符字符串之外的代码不触碰（引号配对扫描，无嵌套字符串歧义——TS 模块说明符是
 * 简单字符串字面量）。
 */
function rewriteRelativeSpecifiers(
  text: string,
  bundleRel: string,
  resolve: (targetRel: string) => string | null,
  warnings: string[],
): string {
  const dir = bundleRel.includes('/') ? bundleRel.slice(0, bundleRel.lastIndexOf('/')) : ''
  const targetOf = (spec: string): string | null => {
    const joined = dir ? `${dir}/${spec}` : spec
    const norm = pathNormalize(joined)
    const candidates = [norm, `${norm}.d.ts`, norm.endsWith('.vue') ? `${norm}.d.ts` : `${norm}.vue.d.ts`]
    for (const c of candidates) {
      const name = resolve(c)
      if (name) return name
    }
    return null
  }
  // import/export 语句说明符：from '…' / import '…' / require('…')（d.ts 中 import= 声明保留原样由读取端处理）
  let out = text.replace(/(\bfrom\s*)(['"])(\.\.?\/[^'"]+)\2/g, (full, pre: string, q: string, spec: string) => {
    const name = targetOf(spec)
    return name ? `${pre}${q}${name}${q}` : full
  })
  out = out.replace(/(\bimport\s*)(['"])(\.\.?\/[^'"]+)\2/g, (full, pre: string, q: string, spec: string) => {
    const name = targetOf(spec)
    return name ? `${pre}${q}${name}${q}` : full
  })
  out = out.replace(/(\bexport\s*\*\s*from\s*)(['"])(\.\.?\/[^'"]+)\2/g, (full, pre: string, q: string, spec: string) => {
    const name = targetOf(spec)
    return name ? `${pre}${q}${name}${q}` : full
  })
  // import() 类型节点
  out = out.replace(/import\((['"])(\.\.?\/[^'"]+)\1\)/g, (full, q: string, spec: string) => {
    const name = targetOf(spec)
    return name ? `import(${q}${name}${q})` : full
  })
  // 残留相对说明符 = bundle 闭包断裂（提供方 bug 或被篡改）：如实警告
  if (/(?:\bfrom\s*|\bimport\s*|import\()['"]\.\.?\/[^'"]+['"]/.test(out)) {
    warnings.push(`声明文件 ${bundleRel} 仍含未解析的 bundle 内相对导入（已保留原文；该模块类型可能不完整）。`)
  }
  return out
}

function pathNormalize(p: string): string {
  const abs = p.startsWith('/')
  const parts = p.split('/')
  const stack: string[] = []
  for (const part of parts) {
    if (part === '' || part === '.') continue
    if (part === '..') stack.pop()
    else stack.push(part)
  }
  return `${abs ? '/' : ''}${stack.join('/')}`
}

/** 外部 .d.ts 已隐式 ambient；包进模块体时移除重复修饰符，保留字符串和注释。 */
function stripAmbientModifiers(text: string): string {
  return text.replace(
    /\/\*[\s\S]*?\*\/|\/\/[^\r\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\bdeclare\s+(?=(?:const|let|var|function|class|enum|namespace|module)\b)/g,
    (token) => token.startsWith('declare') ? '' : token,
  )
}
