/**
 * @author Jason.chen
 * 已有工程接入计划：扫描 → 可审查差异 → 显式写入。
 *
 * 只自动处理能证明结构的 Vite 配置与最小启动入口。配置函数、业务 Router/store、
 * 权限和登录来源无法可靠推断时输出具体待办，绝不执行应用或套用私有项目补丁。
 * 计划保存修改前内容；写入前重新核对，避免覆盖预览后用户在 IDE 中的编辑。
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { init, parse } from 'es-module-lexer'
import MagicString from 'magic-string'
import { detectFrameworkFromPackageJson, type InitFramework, type InitRole } from './init'

const requireHere = createRequire(import.meta.url)
const OWNER = '// @fulgurjs generated: existing-app integration'
const JOURNAL = '.fulgurjs-init-pending.json'
export interface IntegrationOptions {
  cwd: string
  framework?: InitFramework
  role?: InitRole
  kind?: 'component' | 'app'
  name?: string
  /** 远程键 → URL；调用方显式提供，不猜端口或部署前缀。 */
  remotes?: Record<string, string>
  /** expose 键 → 已有文件；app 提供方自动生成时使用 ./bridge。 */
  exposes?: Record<string, string>
  entry?: string
}
export interface IntegrationEdit { file: string; before: string | null; after: string; reason: string }
export interface IntegrationPlan {
  root: string
  framework: InitFramework | null
  role: InitRole
  kind: 'component' | 'app'
  edits: IntegrationEdit[]
  /** blocking=true 表示不能自动完成，write 拒绝整批计划而非落下半份配置。 */
  tasks: Array<{ file: string; message: string; blocking: boolean }>
  evidence: string[]
  commands: string[]
}

/** 只做语法校验；不运行配置或业务模块。esbuild 留在 Node 运行时解析，不能内联 CJS 到 CLI。 */
async function validateSource(file: string, source: string): Promise<void> {
  const { transform } = requireHere('esbuild') as typeof import('esbuild')
  const loader = /\.tsx$/.test(file) ? 'tsx' : /\.jsx$/.test(file) ? 'jsx' : /\.[cm]?ts$/.test(file) ? 'ts' : 'js'
  await transform(source, { loader, sourcefile: file, format: 'esm', target: 'es2022', logLevel: 'silent' })
}

/** lstat 同时识别失效链接；existsSync 会跟随链接而漏掉 dangling symlink。 */
function rejectSymlink(file: string, label: string): void {
  try {
    if (fs.lstatSync(file).isSymbolicLink()) throw new Error(`不改写符号链接：${label}`)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}

interface Token { value: string; start: number; end: number; literal?: boolean }
/**
 * 自动改写仅支持明确的对象/数组结构。注释、字符串与正则按词法跳过；
 * 含插值的模板暂拒绝改写，不能用匹配括号的正则猜配置结构。语法由 esbuild 复核。
 */
function tokens(source: string): Token[] {
  const out: Token[] = []
  for (let i = 0; i < source.length;) {
    const start = i, c = source[i]
    if (/\s/.test(c)) { i++; continue }
    if (source.startsWith('//', i)) { const end = source.indexOf('\n', i); i = end < 0 ? source.length : end + 1; continue }
    if (source.startsWith('/*', i)) { const end = source.indexOf('*/', i + 2); if (end < 0) throw new Error('注释未闭合'); i = end + 2; continue }
    if (c === '`') {
      i++
      while (i < source.length && source[i] !== '`') {
        if (source[i] === '\\') { i += 2; continue }
        if (source.startsWith('${', i)) throw new Error('含插值模板，请按预览中的接入块手动修改配置')
        i++
      }
      if (i >= source.length) throw new Error('模板未闭合')
      out.push({ value: source.slice(start + 1, i), start, end: ++i, literal: true }); continue
    }
    if (c === '/') {
      const previous = out.at(-1)
      const regex = !previous || (!previous.literal && ['=', ':', ',', '(', '[', '{', '!', '?', '>', 'return'].includes(previous.value))
      if (!regex) throw new Error('斜杠表达式无法确定是正则还是除法，请手动合并配置')
      i++; let inClass = false
      while (i < source.length) {
        const char = source[i++]
        if (char === '\\') { i++; continue }
        if (char === '[') inClass = true
        else if (char === ']') inClass = false
        else if (char === '/' && !inClass) break
      }
      while (i < source.length && /[a-z]/i.test(source[i])) i++
      out.push({ value: source.slice(start, i), start, end: i, literal: true }); continue
    }
    if (c === '"' || c === "'") {
      i++
      while (i < source.length && source[i] !== c) { if (source[i] === '\\') throw new Error('含转义字符串，请人工确认配置'); i++ }
      if (i >= source.length) throw new Error('字符串未闭合')
      i++; out.push({ value: source.slice(start + 1, i - 1), start, end: i, literal: true }); continue
    }
    if (/[\w$]/.test(c)) { while (i < source.length && /[\w$]/.test(source[i])) i++; out.push({ value: source.slice(start, i), start, end: i }); continue }
    if (source.startsWith('...', i)) { out.push({ value: '...', start, end: i + 3 }); i += 3; continue }
    out.push({ value: c, start, end: ++i })
  }
  return out
}
function closeAt(ts: Token[], at: number): number {
  const closes: Record<string, string> = { '{': '}', '[': ']', '(': ')' }
  const stack: string[] = []
  for (let i = at; i < ts.length; i++) {
    const token = ts[i]
    if (token.literal) continue
    if (closes[token.value]) stack.push(closes[token.value])
    else if (['}', ']', ')'].includes(token.value) && stack.pop() !== token.value) throw new Error('无法确认配置括号边界')
    if (!stack.length) return i
  }
  throw new Error('无法确认配置结束位置')
}

/** 仅改 export default { ... } 或 defineConfig({ ... }) 的顶层 plugins 数组。 */
async function wireVite(file: string, source: string): Promise<string> {
  await validateSource(file, source)
  await init
  const [imports] = parse(source)
  const pluginImport = imports.find(item => item.d === -1 && item.n === '@fulgurjs/federation')
  if (pluginImport) throw new Error('已有 federation 导入，需核实它是否已在实际 plugins 中注册；不会重复插入另一套配置')
  const ts = tokens(source)
  if (ts.some(t => !t.literal && ['fulgurjsFederation', 'fulgurjsConfig'].includes(t.value))) throw new Error('接入变量名已被使用，请人工合并配置')
  const exports = ts.map((t, i) => t.value === 'export' && !t.literal && ts[i + 1]?.value === 'default' ? i : -1).filter(i => i >= 0)
  if (exports.length !== 1) throw new Error('需要唯一的 export default 配置')
  let obj = exports[0] + 2
  let outerEnd = -1, expressionEnd = -1
  if (ts[obj]?.value !== '{' && ts[obj + 1]?.value === '(') {
    const call = ts[obj]?.value
    const viteImport = imports.find(item => item.d === -1 && item.n === 'vite')
    const declaration = viteImport ? source.slice(viteImport.ss, viteImport.se) : ''
    const binding = declaration.match(/\bdefineConfig(?:\s+as\s+(\w+))?\b/)
    if (!binding || call !== (binding[1] ?? 'defineConfig')) throw new Error('自定义配置包装器需要手动合并 federation 插件')
    outerEnd = closeAt(ts, obj + 1)
    obj += 2
  }
  if (ts[obj]?.value !== '{') {
    // 支持常见同步箭头配置与 defineConfig 回调；不执行回调，不改返回对象以外的代码。
    if (ts[obj]?.value === 'async') throw new Error('异步配置需手动核实插件注册')
    let arrow = obj
    if (ts[arrow]?.value === '(') arrow = closeAt(ts, arrow) + 1
    else arrow++ // 单参数箭头
    if (ts[arrow]?.value === ':') { arrow++; while (ts[arrow] && ts[arrow].value !== '=') arrow++ }
    if (ts[arrow]?.value !== '=' || ts[arrow + 1]?.value !== '>') throw new Error('配置不是可识别的对象或箭头工厂，请手动合并')
    let body = arrow + 2
    if (ts[body]?.value === '(' && ts[body + 1]?.value === '{') {
      obj = body + 1
      expressionEnd = closeAt(ts, body)
      if (closeAt(ts, obj) + 1 !== expressionEnd) throw new Error('配置不是单个返回对象，请人工合并')
      if (outerEnd < 0) outerEnd = expressionEnd
    } else {
      if (ts[body]?.value !== '{') throw new Error('配置工厂返回变量或复杂表达式，请手动合并')
      const bodyEnd = closeAt(ts, body)
      expressionEnd = bodyEnd
      if (outerEnd < 0) outerEnd = bodyEnd
      let found = -1
      for (let i = body + 1; i < bodyEnd; i++) {
        if (!ts[i].literal && ['if', 'switch', 'try', 'for', 'while', 'function'].includes(ts[i].value)) throw new Error('配置工厂有控制流或局部函数，需要人工确认所有返回分支')
        if (ts[i].value === 'return' && !ts[i].literal) { found = i + 1; break }
        if (!ts[i].literal && ['{', '[', '('].includes(ts[i].value)) i = closeAt(ts, i)
      }
      if (found < 0 || ts[found]?.value !== '{') throw new Error('未找到唯一的直接 return 配置对象')
      obj = found
      const rest = ts.slice(closeAt(ts, obj) + 1, bodyEnd).map(t => t.value).join('')
      if (!['', ';'].includes(rest)) throw new Error('return 后仍有语句，配置工厂需人工确认')
    }
  }
  const end = closeAt(ts, obj)
  if (expressionEnd < 0) expressionEnd = end
  if (outerEnd < 0) outerEnd = end
  else if (outerEnd !== expressionEnd && expressionEnd + 1 !== outerEnd) throw new Error('配置对象后有额外表达式或参数，请手动合并')
  const tail = ts.slice(outerEnd + 1).map(t => t.value).join('')
  if (!['', ';'].includes(tail)) throw new Error('配置后存在包装或附加语句，请人工合并')
  let plugins = -1, pluginsEnd = -1
  for (let i = obj + 1; i < end;) {
    if (ts[i].value === ',') { i++; continue }
    const key = ts[i]
    if (key.value === '...') throw new Error('顶层 spread 可能覆盖 plugins，请人工合并')
    if (ts[i + 1]?.value !== ':') {
      if (!key.literal && /^[A-Za-z_$][\w$]*$/.test(key.value) && [',', '}'].includes(ts[i + 1]?.value)) {
        if (key.value === 'plugins') throw new Error('plugins 使用简写变量，请人工合并')
        i++; continue
      }
      throw new Error('顶层计算属性或方法需人工确认')
    }
    if (key.value === 'plugins') {
      if (plugins >= 0) throw new Error('存在重复 plugins 属性')
      plugins = i + 2
    }
    i += 2
    while (i < end && ts[i].value !== ',') {
      if (!ts[i].literal && ['[', '{', '('].includes(ts[i].value)) i = closeAt(ts, i) + 1
      else i++
    }
    if (key.value === 'plugins') pluginsEnd = i
  }
  const edit = new MagicString(source)
  if (plugins >= 0) {
    if (ts[plugins]?.value === '[') {
      const last = closeAt(ts, plugins)
      const separator = last === plugins + 1 || ts[last - 1].value === ',' ? '' : ','
      edit.appendLeft(ts[last].start, separator + '\n    fulgurjsFederation(fulgurjsConfig),\n  ')
    }
    else {
      // Vite PluginOption 允许嵌套数组/Promise；保留原值为一项，不 spread 未知返回值。
      const finish = ts[pluginsEnd].start
      edit.appendLeft(ts[plugins].start, '[')
      edit.appendLeft(finish, ', fulgurjsFederation(fulgurjsConfig)]')
    }
  } else edit.appendLeft(ts[obj].end, '\n  plugins: [fulgurjsFederation(fulgurjsConfig)],')
  edit.prepend(`${OWNER}\nimport fulgurjsFederation from '@fulgurjs/federation'\nimport fulgurjsConfig from './fulgurjs.config'\n`)
  const result = edit.toString()
  await validateSource(file, result)
  return result
}

/** 常规启动可自动提取；复杂 main 必须先由应用作者把装配收敛为工厂。 */
async function applicationFromEntry(file: string, source: string, framework: InitFramework): Promise<{ application: string; main: string }> {
  await validateSource(file, source)
  // 限定为连续 import 前缀，避免 es-module-lexer 将 TSX 的 JSX 当作 JS 语法解析。
  // 每条 import 再由 lexer 校验；正文必须整体命中下方最小启动白名单。
  await init
  const header = source.match(/^\s*(?:(?:\/\/[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)\s*)*/)?.[0] ?? ''
  let body = source.slice(header.length)
  const declarations: string[] = []
  const importStatements: Array<{ spec: string; code: string }> = []
  while (true) {
    const comment = body.match(/^\s*(?:\/\/[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)/)
    if (comment) { declarations.push(comment[0]); body = body.slice(comment[0].length); continue }
    const match = body.match(/^\s*(import\s+(?:(?:type\s+)?[\w*$ {},\r\n]+?\s+from\s+)?(['"])([^'"\n]+)\2\s*;?)/)
    if (!match) break
    const statement = match[1]
    const [items] = parse(statement)
    if (items.length !== 1 || items[0].d !== -1) throw new Error('入口 import 结构需人工核实')
    const spec = items[0].n!
    if (/router|pinia|vuex|redux|zustand/i.test(spec)) throw new Error('入口依赖业务路由或状态；按 existing-apps 指南将它们在工厂内按实例创建，不自动改写')
    importStatements.push({ spec, code: statement })
    if (spec !== 'react-dom/client') declarations.push(statement)
    body = body.slice(match[0].length)
  }
  body = body.trim()
  let expression: string, target: string
  if (framework === 'vue') {
    const named = declarations.join('\n').match(/import\s*\{\s*createApp\s*\}\s*from\s*['"]vue['"]/)
    const direct = body.match(/^createApp\(\s*([A-Za-z_$][\w$]*)\s*\)\.mount\(\s*(['"])(#[\w-]+)\2\s*\)\s*;?$/)
    const variable = body.match(/^const\s+(\w+)\s*=\s*createApp\(\s*([A-Za-z_$][\w$]*)\s*\)\s*;?\s*\1\.mount\(\s*(['"])(#[\w-]+)\3\s*\)\s*;?$/)
    if (!named || (!direct && !variable)) throw new Error('仅自动提取最小 createApp(App).mount 入口；插件、守卫与异步业务装配请按指南迁入 defineApplication 工厂')
    expression = `createApp(${direct?.[1] ?? variable![2]})`
    target = direct?.[3] ?? variable![4]
  } else {
    const named = importStatements.find(item => item.spec === 'react-dom/client')
    if (!named || !/^import\s*\{\s*createRoot\s*\}\s*from/.test(named.code)) throw new Error('仅自动提取具名 createRoot 导入的入口；其他启动形式请按指南迁移')
    const direct = body.match(/^createRoot\(\s*document\.getElementById\(\s*(['"])([\w-]+)\1\s*\)!?\s*\)\.render\(([\s\S]+)\)\s*;?$/)
    if (!direct) throw new Error('仅自动提取 createRoot(document.getElementById(...)).render(...)；其余入口需人工合并')
    expression = direct[3].trim().replace(/,\s*$/, ''); target = '#' + direct[2]
    // JSX 表达式可用，但不能夹带其他语句；生成后还会经过真实语法校验。
    if (!expression.startsWith('<') || !expression.endsWith('>')) throw new Error('React 根渲染不是明确 JSX 表达式，请人工合并')
  }
  const application = `${OWNER}\n/** 独立启动与桥接共用工厂；每次挂载创建自己的实例。业务插件在工厂内装配，不在模块顶层挂载。 */\n${declarations.join('\n')}\nimport { defineApplication } from '@fulgurjs/federation/${framework}'\n\nexport default defineApplication(() => ${expression})\n`
  const main = `${OWNER}\n${header}// 独立入口使用同一份装配；宿主直接加载 application 的默认导出，不复制启动逻辑。\nimport application from './application'\nvoid application.start(${JSON.stringify(target)}).catch(console.error)\n`
  await validateSource(framework === 'react' ? 'application.tsx' : 'application.ts', application)
  return { application, main }
}

/** 读取计划输入，所有路径限制在当前应用；预览阶段不写文件、不安装依赖。 */
export async function planIntegration(input: IntegrationOptions): Promise<IntegrationPlan> {
  const root = fs.realpathSync(path.resolve(input.cwd))
  const pkgFile = path.join(root, 'package.json')
  const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'))
  const framework = input.framework ?? detectFrameworkFromPackageJson(pkg)
  const plan: IntegrationPlan = { root, framework, role: input.role ?? 'dual', kind: input.kind ?? 'component', edits: [], tasks: [], evidence: [], commands: [] }
  const task = (file: string, message: string, blocking = true) => plan.tasks.push({ file, message, blocking })
  const read = (file: string): string | null => {
    safe(file)
    return fs.existsSync(path.join(root, file)) ? fs.readFileSync(path.join(root, file), 'utf8') : null
  }
  const safe = (file: string): string => {
    const absolute = path.resolve(root, file), relative = path.relative(root, absolute)
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`路径必须在当前应用内：${file}`)
    // symlink 即使指向应用内部也不改写，避免备份/回退时改变链接语义。
    let current = root
    for (const part of relative.split(path.sep)) { current = path.join(current, part); rejectSymlink(current, file) }
    return relative.split(path.sep).join('/')
  }
  const add = (file: string, after: string, reason: string, replace = false) => {
    file = safe(file)
    const before = read(file)
    if (before !== after) {
      if (before !== null && !replace) task(file, '已有不同内容，保留原文件；请人工合并，不覆盖已有接入或业务修改')
      else plan.edits.push({ file, before, after, reason })
    }
  }
  if (fs.existsSync(path.join(root, JOURNAL))) task(JOURNAL, '上次写入被中断；先运行 fulgurjs init --rollback 恢复，再重新预览')
  if (!framework) { task('package.json', '无法唯一判断 Vue/React，请显式指定 --framework vue|react'); return plan }
  plan.evidence.push(`框架：${framework}（${input.framework ? '显式选择' : 'package.json 依赖'}）`, `场景：${plan.kind}；角色：${plan.role}`)
  const deps = { ...pkg.dependencies, ...pkg.devDependencies }
  const manager = typeof pkg.packageManager === 'string' && pkg.packageManager.startsWith('pnpm@') ? 'pnpm' : fs.existsSync(path.join(root, 'pnpm-lock.yaml')) ? 'pnpm' : 'npm'
  if (!deps['@fulgurjs/federation']) task('package.json', `先运行 ${manager === 'pnpm' ? 'pnpm add' : 'npm install'} @fulgurjs/federation；计划不会自行安装或改锁文件`, false)
  const viteFiles = ['vite.config.ts', 'vite.config.mts', 'vite.config.js', 'vite.config.mjs'].filter(f => read(f) !== null)
  const viteFile = viteFiles.length === 1 ? viteFiles[0] : null
  if (!viteFile) task('vite.config', '未找到唯一 Vite 配置（支持 ts/mts/js/mjs）；明确实际配置后手动注册 federation(fulgurjsConfig)')
  else {
    try {
      const code = read(viteFile)!
      if (code.startsWith(OWNER)) plan.evidence.push(`${viteFile}：已有本工具接线，保留原文件；再运行 doctor 核查`)
      else add(viteFile, await wireVite(viteFile, code), '在实际顶层 plugins 数组注册插件，保留原有配置与注释', true)
    } catch (error) { task(viteFile, `${(error as Error).message}。手动接入块：import federation from '@fulgurjs/federation'; import fulgurjsConfig from './fulgurjs.config'; plugins: [...原插件, federation(fulgurjsConfig)]`) }
  }
  const appExt = framework === 'react' ? 'tsx' : 'ts'
  let exposes = input.exposes ?? {}
  if (plan.kind === 'app' && plan.role !== 'consumer') {
    const appFile = `src/application.${appExt}`
    const existing = read(appFile)
    if (existing) {
      if (!existing.startsWith(OWNER) && !/export\s+default\s+defineApplication(?:<[^;]+?>)?\s*\(/.test(existing)) task(appFile, '已有应用装配文件，无法确认默认导出的 defineApplication；保留原代码，先按指南核实装配')
      else { exposes = { ...exposes, './bridge': './' + appFile }; plan.evidence.push(`${appFile}：保留已生成装配`) }
    } else {
      const candidates = input.entry ? [safe(input.entry)] : [`src/main.${framework === 'react' ? 'tsx' : 'ts'}`, `src/main.${framework === 'react' ? 'jsx' : 'js'}`].filter(f => read(f) !== null)
      if (candidates.length !== 1 || read(candidates[0]) === null) task('src/main', '无法定位唯一启动入口，请显式指定 --entry <当前应用内路径>')
      else {
        try {
          const entry = candidates[0], result = await applicationFromEntry(entry, read(entry)!, framework)
          add(appFile, result.application, '将可证明的最小启动逻辑提取为独立/桥接共用工厂')
          add(entry, result.main, '独立入口改为 application.start；挂载责任交给插件', true)
          exposes = { ...exposes, './bridge': './' + appFile }
        } catch (error) { task(candidates[0], `${(error as Error).message}。参考 docs/zh/guide/existing-apps.md；桥接路由必须使用受控 memory，独立模式继续 web history。`) }
      }
    }
  }
  const remoteEntries = Object.entries(input.remotes ?? {})
  if (plan.role === 'provider' && remoteEntries.length) task('角色', '提供/消费同时存在请使用 --role dual；provider 不接受 --remote')
  if (plan.role === 'consumer' && Object.keys(exposes).length) task('角色', '提供/消费同时存在请使用 --role dual；consumer 不接受 --expose')
  for (const [key, url] of remoteEntries) {
    let validURL = false
    try { const parsed = new URL(url); validURL = ['http:', 'https:'].includes(parsed.protocol) && !!parsed.hostname } catch { /* 无效地址在计划里报告 */ }
    if (!/^[A-Za-z0-9_-]+$/.test(key) || !validURL) task('remotes', `--remote 必须为 容器名=http(s)://开发地址，实际：${key}=${url}`)
  }
  for (const [key, file] of Object.entries(exposes)) {
    if (!key.startsWith('./') || !file.startsWith('./')) { task('exposes', `暴露键与路径须以 ./ 开头：${key}=${file}`); continue }
    const relative = safe(file)
    if (read(relative) === null && !plan.edits.some(edit => edit.file === relative)) task(relative, 'expose 指向不存在的文件；选择真实模块或组件，不生成假业务组件')
  }
  const configFile = 'fulgurjs.config.ts'
  const config = read(configFile)
  if (!config) {
    if (plan.role !== 'consumer' && !Object.keys(exposes).length) task(configFile, '提供方必须选择真实暴露文件：--expose ./Button=./src/components/Button.vue；普通函数也可直接暴露')
    if (plan.role !== 'provider' && !remoteEntries.length) task(configFile, '消费方需要真实远程开发地址：--remote remote-a=http://localhost:5174/remote-a；不会猜端口')
    const name = input.name ?? (typeof pkg.name === 'string' ? pkg.name.replace(/^@/, '').replace(/[^A-Za-z0-9_-]/g, '-') : '')
    if (!name || !/^[A-Za-z0-9_-]+$/.test(name)) task(configFile, '请用 --name 指定同一页面内唯一的容器名（字母/数字/下划线/连字符）')
    const shared = framework === 'vue' ? { vue: { singleton: true } } : { react: { singleton: true }, 'react-dom': { singleton: true } }
    const body = { name, ...(Object.keys(exposes).length ? { exposes } : {}), ...(remoteEntries.length ? { remotes: Object.fromEntries(remoteEntries.map(([key, url]) => [key, { dev: url, prod: '/' + key }])) } : {}), shared }
    add(configFile, `${OWNER}\n/** 提供/消费声明；开发地址来自显式输入，生产路径需按实际部署核对。 */\nimport type { FederationOptions } from '@fulgurjs/federation'\n\nexport default ${JSON.stringify(body, null, 2)} satisfies FederationOptions\n`, '生成使用真实文件和显式地址的配置，不增加无关 setup/菜单/会话文件')
  } else {
    plan.evidence.push(`${configFile} 已存在，保留所有者配置，不按命令参数覆盖`)
    if (!config.startsWith(OWNER)) task(configFile, '已有配置需手动核对本次 remotes/exposes，或只使用 init --config/doctor --config 检查')
  }
  if (plan.kind === 'app' && plan.role !== 'provider') {
    const remote = remoteEntries[0]?.[0]
    if (remote) add(`src/fulgurjs/RemoteApplication.${framework === 'react' ? 'tsx' : 'vue'}`, hostView(framework, remote), '生成可放进已有路由的挂载视图；路由和登录上下文由应用明确决定')
    task('宿主路由', '将 RemoteApplication 视图加入已有页面/路由。启用 URL 同步时，按指南绑定宿主导航端口与一个静态挂载前缀；不重复登记子应用菜单。', false)
    task('会话与业务上下文', '有登录需求时明确 token getter/sessionKey、权限与主题归属；没有需求不增加文件。工具不猜凭据，也不复制整个业务 app 的状态。', false)
  } else if (plan.role !== 'provider') {
    task('已有消费页面', '模块用 loadRemote；同框架组件用 remoteComponent，在已有视图渲染并传真实 props；不生成应用工厂、菜单、Provider 或会话文件。', false)
  }
  if (plan.kind === 'app') task('路由与业务装配', '本工具仅自动提取无 Router/store 的最小入口。已有复杂应用按指南返回每次新建的 app/router 或 element/dispose；确保 memory 路由、守卫、主题和权限就绪后再挂载。', false)
  plan.commands.push('npx fulgurjs doctor --config ./fulgurjs.config.ts', '运行本项目有效配置下的类型检查与构建，再验证真实挂载、交互、重进/卸载')
  return plan
}

function hostView(framework: InitFramework, remote: string): string {
  if (framework === 'vue') return `${OWNER.replace('//', '<!--')} -->\n<script setup lang="ts">\n// 把此视图放进已有页面。无登录/URL 同步需求无需增加额外配置。\nimport { createVueBridgeApp } from '@fulgurjs/federation/vue'\nconst RemoteApplication = createVueBridgeApp('${remote}/bridge')\n</script>\n<template><RemoteApplication /></template>\n`
  return `${OWNER}\n// 放进已有页面；需要 URL 同步/登录时显式传 routing/sessionKey/getContext，不猜宿主实现。\nimport { createReactBridgeApp } from '@fulgurjs/federation/react'\nexport default createReactBridgeApp('${remote}/bridge')\n`
}

/**
 * 显式应用已审查计划。排除冲突后再写入；写入前再次核对快照，失败回退已写文件。
 * 失败仅回退仍等于本次输出的文件，保护期间发生的外部编辑；不覆盖已改变的文件。
 */
function targetOf(root: string, relative: string): string {
  const absolute = path.resolve(root, relative)
  if (!absolute.startsWith(root + path.sep)) throw new Error('计划文件越过应用目录')
  let cursor = root
  for (const part of path.relative(root, absolute).split(path.sep)) {
    cursor = path.join(cursor, part)
    rejectSymlink(cursor, relative)
  }
  return absolute
}
function currentSource(file: string): string | null {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null
}
function replaceSource(file: string, content: string, exclusive = false): void {
  // 先完整写临时文件再 rename，进程中断不会留下截断源文件；保留原文件权限。
  const temp = file + `.fulgurjs-${process.pid}.tmp`
  let created = false
  try {
    fs.writeFileSync(temp, content, { flag: 'wx', mode: fs.existsSync(file) ? fs.statSync(file).mode : 0o644 })
    created = true
    if (exclusive) { fs.linkSync(temp, file); fs.unlinkSync(temp) }
    else fs.renameSync(temp, file)
  } finally {
    if (created && fs.existsSync(temp)) fs.unlinkSync(temp)
  }
}
export function applyIntegration(plan: IntegrationPlan): void {
  if (plan.tasks.some(t => t.blocking)) throw new Error('计划包含阻断项，未写入任何文件；先处理所列文件再预览。')
  const root = fs.realpathSync(plan.root)
  for (const edit of plan.edits) {
    const target = targetOf(root, edit.file)
    if (currentSource(target) !== edit.before) throw new Error(`预览后文件已变化：${edit.file}；请重新生成计划。`)
    if (fs.existsSync(target + `.fulgurjs-${process.pid}.tmp`)) throw new Error(`临时文件已存在，保留并请先核查：${edit.file}`)
  }
  if (!plan.edits.length) return
  const journal = targetOf(root, JOURNAL)
  // 独占创建也阻止两个 init --write 同时改同一工程。中断后保留恢复依据。
  const directories = new Set<string>()
  for (const edit of plan.edits) {
    let dir = path.dirname(targetOf(root, edit.file))
    while (dir !== root && !fs.existsSync(dir)) { directories.add(path.relative(root, dir)); dir = path.dirname(dir) }
  }
  fs.writeFileSync(journal, JSON.stringify({ root, pid: process.pid, directories: [...directories], edits: plan.edits }), { flag: 'wx', mode: 0o600 })
  try {
    for (const edit of plan.edits) {
      const file = targetOf(root, edit.file)
      if (currentSource(file) !== edit.before) throw new Error(`写入前文件发生变化：${edit.file}`)
      fs.mkdirSync(path.dirname(file), { recursive: true })
      replaceSource(file, edit.after, edit.before === null)
    }
    fs.unlinkSync(journal)
  } catch (error) {
    try { rollbackIntegration(root) } catch { /* 外部修改无法安全回退时保留 journal，交由用户核对。 */ }
    throw error
  }
}

/** 仅回退仍等于本次输出的文件；中断后的手工编辑不会被覆盖。 */
export function rollbackIntegration(cwd: string): void {
  const root = fs.realpathSync(cwd), journal = targetOf(root, JOURNAL)
  const saved = JSON.parse(fs.readFileSync(journal, 'utf8')) as { root: string; pid?: number; directories?: string[]; edits: IntegrationEdit[] }
  if (saved.root !== root || !Array.isArray(saved.edits)) throw new Error('恢复记录与当前目录不一致，拒绝自动回退')
  for (const edit of saved.edits) {
    if (typeof edit.file !== 'string' || typeof edit.after !== 'string' || (edit.before !== null && typeof edit.before !== 'string')) throw new Error('恢复记录格式无效')
    const value = currentSource(targetOf(root, edit.file))
    if (value !== edit.before && value !== edit.after) throw new Error(`文件有后续编辑，保留内容和恢复记录：${edit.file}；请人工合并后再恢复。`)
  }
  for (const edit of [...saved.edits].reverse()) {
    const file = targetOf(root, edit.file)
    if (currentSource(file) !== edit.before) {
      if (edit.before === null) fs.unlinkSync(file)
      else replaceSource(file, edit.before)
    }
    if (Number.isSafeInteger(saved.pid) && saved.pid! > 0) {
      const temp = file + `.fulgurjs-${saved.pid}.tmp`
      if (fs.existsSync(temp)) fs.unlinkSync(temp)
    }
  }
  for (const dir of [...(saved.directories ?? [])].sort((a, b) => b.length - a.length)) {
    const directory = targetOf(root, dir)
    if (fs.existsSync(directory) && fs.readdirSync(directory).length === 0) fs.rmdirSync(directory)
  }
  fs.unlinkSync(journal)
}

/** 逐文件前后文本是可直接审查的完整差异；JSON 模式保留结构化 before/after。 */
export function formatIntegrationPlan(plan: IntegrationPlan): string {
  const lines = ['[fulgurjs:init] 接入预览（默认不写入、不安装依赖、不执行业务代码）', ...plan.evidence]
  for (const edit of plan.edits) {
    lines.push(`\n--- ${edit.before === null ? '/dev/null' : edit.file}\n+++ ${edit.file}\n原因：${edit.reason}`)
    if (edit.before !== null) lines.push(...edit.before.split('\n').map(line => '- ' + line))
    lines.push(...edit.after.split('\n').map(line => '+ ' + line))
  }
  lines.push('\n待办（不等于浏览器已验收）：', ...plan.tasks.map(t => `${t.blocking ? '阻断' : '人工接线/核查'} ${t.file}：${t.message}`), '\n后续命令：', ...plan.commands)
  return lines.join('\n')
}
